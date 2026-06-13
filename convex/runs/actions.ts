"use node";

import { action, internalAction } from "../_generated/server";
import { v } from "convex/values";
import { api, internal } from "../_generated/api";
import { createFailureAnalysisAgent, failureAnalysisSchema } from "../ai/agents";
import { getWorkspaceModel } from "../ai/model";
import { extractJsonFromAiResponse } from "../ai/parse";
import { aiMaxRetries } from "../ai/aiRateLimit";
import type { Id } from "../_generated/dataModel";
import type { AiConfig } from "../ai/model";
import { validateRunnerSecret } from "../lib/runner";

function stripSecret<T extends { runner_secret: string }>(
  args: T,
): Omit<T, "runner_secret"> {
  const { runner_secret: _, ...rest } = args;
  void _;
  return rest;
}

export const runnerClaimRun = action({
  args: { runner_secret: v.string(), run_id: v.id("runs"), runner_id: v.string() },
  handler: async (ctx, args) => {
    validateRunnerSecret(args.runner_secret);
    await ctx.runMutation(internal.runs.internal.claimRun, {
      run_id: args.run_id,
      runner_id: args.runner_id,
    });
  },
});

export const runnerWriteStepResult = action({
  args: {
    runner_secret: v.string(),
    workspace_id: v.id("workspaces"),
    run_result_id: v.id("run_results"),
    step_number: v.number(),
    command: v.string(),
    locator: v.optional(v.string()),
    status: v.union(v.literal("passed"), v.literal("failed"), v.literal("skipped"), v.literal("healed")),
    error_message: v.optional(v.string()),
    screenshot_file_id: v.optional(v.id("_storage")),
    duration_ms: v.number(),
    heal_reason: v.optional(v.string()),
    heal_confidence: v.optional(v.number()),
    before_screenshot_file_id: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    validateRunnerSecret(args.runner_secret);
    await ctx.runMutation(internal.runs.internal.writeStepResult, stripSecret(args));
  },
});

export const runnerWriteRunResult = action({
  args: {
    runner_secret: v.string(),
    run_result_id: v.id("run_results"),
    status: v.union(v.literal("passed"), v.literal("failed"), v.literal("skipped")),
    duration_ms: v.number(),
    console_log_file_id: v.optional(v.id("_storage")),
    trace_file_id: v.optional(v.id("_storage")),
    video_file_id: v.optional(v.id("_storage")),
    screenshot_file_ids: v.optional(v.array(v.id("_storage"))),
    error_message: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    validateRunnerSecret(args.runner_secret);
    await ctx.runMutation(internal.runs.internal.writeRunResult, stripSecret(args));
  },
});

export const runnerCompleteRun = action({
  args: {
    runner_secret: v.string(),
    run_id: v.id("runs"),
  },
  handler: async (ctx, args) => {
    validateRunnerSecret(args.runner_secret);
    await ctx.runMutation(internal.runs.internal.completeRun, {
      run_id: args.run_id,
    });
    await ctx.runAction(internal.runs.actions.analyzeFailures, {
      run_id: args.run_id,
    });
    await ctx.runAction(internal.runs.actions.autoHealAndRerun, {
      run_id: args.run_id,
    });
  },
});

export const runnerForceCompleteRun = action({
  args: {
    runner_secret: v.string(),
    run_id: v.id("runs"),
    forced_status: v.union(
      v.literal("failed"),
      v.literal("cancelled"),
      v.literal("timed_out"),
    ),
    error_message: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    validateRunnerSecret(args.runner_secret);
    await ctx.runMutation(internal.runs.internal.forceCompleteRun, {
      run_id: args.run_id,
      forced_status: args.forced_status,
      error_message: args.error_message,
    });
    if (args.forced_status === "failed") {
      await ctx.runAction(internal.runs.actions.analyzeFailures, {
        run_id: args.run_id,
      });
    }
  },
});

export const runnerHeartbeat = action({
  args: { runner_secret: v.string(), run_id: v.id("runs") },
  handler: async (ctx, args) => {
    validateRunnerSecret(args.runner_secret);
    await ctx.runMutation(internal.runs.internal.updateRunHeartbeat, { run_id: args.run_id });
  },
});

export const analyzeFailures = internalAction({
  args: { run_id: v.id("runs") },
  handler: async (ctx, args) => {
    const run = await ctx.runQuery(internal.runs.queries.getRunForAnalysis, {
      run_id: args.run_id,
    });
    if (!run) return;

    const failedResults = run.results.filter((r: { status: string }) => r.status === "failed");
    if (failedResults.length === 0) return;

    const config: AiConfig = await ctx.runQuery(
      internal.ai.model.getWorkspaceAiConfigQuery,
      { workspace_id: run.workspace_id },
    );
    const model = getWorkspaceModel(config);
    const agent = createFailureAnalysisAgent(model);

    for (const result of failedResults) {
      try {
        const steps = result.steps
          .map((s: { step_number: number; command: string; locator: string | null; status: string; error_message: string | null }) => `Step ${s.step_number}: ${s.command} ${s.locator ?? ""} [${s.status}]${s.error_message ? ` — ${s.error_message}` : ""}`)
          .join("\n");

        const prompt = `Analyze this failed Playwright test. Respond with ONLY a JSON object (no markdown, no code fences, no explanation) containing: rootCause (string), suggestedFix (string), confidenceScore (0-1 number).

Do NOT use any tools. Respond directly with the JSON object.

Project ID: ${run.project_id}
Test: ${result.test_name}

Test code:
${result.playwright_code ?? "N/A"}

Steps:
${steps}

Error: ${result.error_message ?? "See step errors above"}`;

        const { thread } = await agent.createThread(ctx, {});
        const message = await thread.generateText({ maxRetries: aiMaxRetries, prompt });
        const text = message.text ?? "";

        const parsed = extractJsonFromAiResponse(text, failureAnalysisSchema);
        if (!parsed) {
          console.warn(`[analyzeFailures] Could not parse AI response for test ${result.test_id}: ${text.slice(0, 200)}`);
          continue;
        }

        await ctx.runMutation(internal.runs.internal.storeAiInsight, {
          workspace_id: run.workspace_id,
          test_id: result.test_id as Id<"tests">,
          run_id: args.run_id,
          analysis_text: parsed.rootCause,
          suggested_fix: parsed.suggestedFix,
          confidence_score: parsed.confidenceScore,
        });
      } catch (err) {
        console.error(`[analyzeFailures] Error analyzing test ${result.test_id}:`, err);
      }
    }
  },
});

export const runnerRecordHealingHistory = action({
  args: {
    runner_secret: v.string(),
    workspace_id: v.id("workspaces"),
    test_id: v.id("tests"),
    step_index: v.number(),
    original_instruction: v.string(),
    healed_selector: v.string(),
    healed_description: v.optional(v.string()),
    confidence: v.number(),
    reason: v.optional(v.string()),
    run_id: v.optional(v.id("runs")),
  },
  handler: async (ctx, args) => {
    validateRunnerSecret(args.runner_secret);
    await ctx.runMutation(internal.runs.internal.recordHealingHistory, stripSecret(args));
  },
});

const HEALABLE_PATTERNS = [
  /timeout/i,
  /element.*not found/i,
  /waiting for.*element/i,
  /strict mode violation/i,
  /resolved to \d+ elements/i,
];

function isHealableError(errorMessage: string | null | undefined): boolean {
  if (!errorMessage) return false;
  return HEALABLE_PATTERNS.some((p) => p.test(errorMessage));
}

export const autoHealAndRerun = internalAction({
  args: {
    run_id: v.id("runs"),
  },
  handler: async (ctx, args) => {
    const run = await ctx.runQuery(internal.runs.queries.getRunForAnalysis, {
      run_id: args.run_id,
    });
    if (!run) return;

    if (run.auto_heal_attempted) return;

    const failedResults = run.results.filter(
      (r: { status: string; error_message: string | null }) =>
        r.status === "failed" && isHealableError(r.error_message),
    );

    if (failedResults.length === 0) return;

    console.log(`[autoHealAndRerun] Auto-healing ${failedResults.length} failed test(s) from run ${args.run_id}`);

    await ctx.runMutation(internal.runs.internal.markAutoHealAttempted, {
      run_id: args.run_id,
    });

    const healedTestIds: Id<"tests">[] = [];

    for (const result of failedResults) {
      const errorParts: string[] = [];
      if (result.error_message) errorParts.push(result.error_message);
      const failedStepErrors = result.steps
        .filter((s: { error_message: string | null }) => s.error_message)
        .map((s: { step_number: number; command: string; error_message: string | null }) =>
          `Step ${s.step_number} (${s.command}): ${s.error_message}`)
        .join("\n");
      if (failedStepErrors.length > 0) errorParts.push(failedStepErrors);

      try {
        await ctx.runAction(api.ai.healTest.healTest, {
          test_id: result.test_id as Id<"tests">,
          error_message: errorParts.join("\n") || undefined,
        });

        healedTestIds.push(result.test_id as Id<"tests">);
        console.log(`[autoHealAndRerun] Healed test ${result.test_name}`);
      } catch (err) {
        console.error(`[autoHealAndRerun] Failed to heal test ${result.test_name}:`, err);
      }
    }

    if (healedTestIds.length === 0) {
      console.log(`[autoHealAndRerun] No tests were successfully healed`);
      return;
    }

    const environmentId = run.environment_id;
    if (!environmentId) {
      console.error(`[autoHealAndRerun] No environment found for run, cannot re-run`);
      return;
    }

    const runId = await ctx.runMutation(internal.runs.internal.createAutoHealRerun, {
      original_run_id: args.run_id,
      project_id: run.project_id,
      suite_id: run.suite_id ?? undefined,
      environment_id: environmentId,
      test_ids: healedTestIds,
      workspace_id: run.workspace_id,
    });

    console.log(`[autoHealAndRerun] Created re-run ${runId} with ${healedTestIds.length} healed test(s)`);
  },
});


"use node";

import { action, internalAction } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { createFailureAnalysisAgent, failureAnalysisSchema } from "../ai/agents";
import { getWorkspaceModel } from "../ai/model";
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
    status: v.union(v.literal("passed"), v.literal("failed"), v.literal("skipped")),
    error_message: v.optional(v.string()),
    screenshot_file_id: v.optional(v.id("_storage")),
    duration_ms: v.number(),
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
  },
  handler: async (ctx, args) => {
    validateRunnerSecret(args.runner_secret);
    await ctx.runMutation(internal.runs.internal.forceCompleteRun, {
      run_id: args.run_id,
      forced_status: args.forced_status,
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

        const prompt = `Analyze this failed Playwright test. Respond with a JSON object containing: rootCause (string), suggestedFix (string), confidenceScore (0-1 number).

Test: ${result.test_name}

Test code:
${result.playwright_code ?? "N/A"}

Steps:
${steps}

Error: ${result.error_message ?? "See step errors above"}`;

        const { thread } = await agent.createThread(ctx, {});
        const message = await thread.generateText({ prompt });
        const text = message.text ?? "";

        const parsed = extractFailureAnalysis(text);
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

function extractFailureAnalysis(text: string) {
  const codeFenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  const jsonSource = codeFenceMatch?.[1] ?? text;

  const objectMatch = jsonSource.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/);
  if (!objectMatch) return null;

  try {
    return failureAnalysisSchema.parse(JSON.parse(objectMatch[0]));
  } catch {
    return null;
  }
}

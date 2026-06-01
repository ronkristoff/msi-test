"use node";

import { action } from "../_generated/server";
import type { ActionCtx } from "../_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { createHealAgent, extractPlaywrightCode, deriveTestName } from "./agents";
import { classifyAiError } from "./errors";
import { buildAuthPromptContext } from "./authContext";
import { computeDiff } from "./diff";
import { getLiveSnapshot, extractTargetUrl, interactAndCapture, extractInteractionsFromTestCode } from "./browserClient";

export const healTest = action({
  args: {
    test_id: v.id("tests"),
    error_message: v.optional(v.string()),
    user_hint: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ testId: string; newName: string }> => {
    await ctx.runMutation(internal.tests.mutations.setTestHealing, {
      test_id: args.test_id,
    });

    try {
      return await healTestInner(ctx, args);
    } finally {
      const current = await ctx.runQuery(internal.tests.queries.getTestInternal, {
        test_id: args.test_id,
      });
      if (current?.status === "healing") {
        await ctx.runMutation(internal.tests.mutations.setTestDraft, {
          test_id: args.test_id,
        });
      }
    }
  },
});

async function healTestInner(ctx: ActionCtx, args: { test_id: Id<"tests">; error_message?: string; user_hint?: string }): Promise<{ testId: string; newName: string }> {
    const test = await ctx.runQuery(internal.tests.queries.getTestInternal, {
      test_id: args.test_id,
    });

    if (!test) {
      throw new ConvexError("Test not found");
    }

    const suite = await ctx.runQuery(api.suites.queries.getSuite, {
      suite_id: test.suite_id,
    });

    if (!suite) {
      throw new ConvexError("Suite not found");
    }

    const project = await ctx.runQuery(internal.projects.queries.getProjectForAi, {
      project_id: suite.project_id,
    });

    if (!project) {
      throw new ConvexError("Project not found");
    }

    let errorMessage = args.error_message;
    if (!errorMessage) {
      const failure = await ctx.runQuery(api.runs.queries.getLatestFailureForTest, {
        test_id: args.test_id,
      });
      if (!failure) {
        throw new ConvexError("No failure found for this test");
      }
      errorMessage = [failure.error_message, failure.step_errors].filter(Boolean).join("\n");
    }

    let pagesContext = "";
    const explorations = await ctx.runQuery(api.explorations.queries.getExplorationsByProject, {
      project_id: suite.project_id,
    });
    if (explorations.length > 0) {
      const latest = explorations[0];
      if (latest.captured_pages && latest.captured_pages.length > 0) {
        pagesContext = latest.captured_pages
          .slice(0, 5)
          .map((page, i) => `Page ${i + 1}: ${page.title} (${page.url})\n${page.structure_text.slice(0, 2000)}`)
          .join("\n\n");
      }
    }

    const targetUrl = extractTargetUrl(test.playwright_code, project.app_url);
    const authConfig = {
      auth_mode: (project as Record<string, unknown>).explore_auth_mode as string ?? "none",
      login_url: (project as Record<string, unknown>).explore_login_url as string | undefined,
      username: (project as Record<string, unknown>).explore_username as string | undefined,
      password: (project as Record<string, unknown>).explore_password as string | undefined,
      cookie_name: (project as Record<string, unknown>).explore_cookie_name as string | undefined,
      cookie_value: (project as Record<string, unknown>).explore_cookie_value as string | undefined,
      app_url: project.app_url,
    };

    const liveSnapshot = await getLiveSnapshot({
      projectId: suite.project_id,
      url: targetUrl,
      authConfig,
    });

    let interactionSnapshots: string[] = [];
    if (liveSnapshot) {
      const interactions = extractInteractionsFromTestCode(test.playwright_code, liveSnapshot.snapshot);
      if (interactions.length > 0) {
        const stepResults = await interactAndCapture({
          projectId: suite.project_id,
          url: targetUrl,
          authConfig,
          actions: interactions,
        });
        if (stepResults && stepResults.length > 1) {
          interactionSnapshots = stepResults
            .slice(1)
            .map((s, i) => `--- After interaction ${i + 1} ---\nURL: ${s.url}\nTitle: ${s.title}\n${s.snapshot}`);
        }
      }
    }

    const aiConfig = await ctx.runQuery(internal.ai.model.getWorkspaceAiConfigQuery, {
      workspace_id: project.workspace_id,
    });

    let responseText = "";
    try {
      const agent = createHealAgent(
        (await import("./model")).getWorkspaceModel(aiConfig),
      );
      const { thread } = await agent.createThread(ctx, {
        title: `AI Heal — ${test.name}`,
      });
      const result = await thread.generateText({
        prompt: `Fix this Playwright test that failed during execution.

Project: ${project.name}
URL: ${project.app_url}
${buildAuthPromptContext(project)}

Test name: ${test.name}

Failing test code:
\`\`\`typescript
${test.playwright_code}
\`\`\`

Error from test run:
${errorMessage}
${liveSnapshot ? `\nLive DOM Context (current page state — use these real elements and values):\nURL: ${liveSnapshot.url}\nTitle: ${liveSnapshot.title}\n${liveSnapshot.snapshot}` : pagesContext ? `\nPage context (for reference — use actual locators and text values shown here):\n${pagesContext}` : ""}
${interactionSnapshots.length > 0 ? `\nCaptured interaction states (elements visible after clicking/filling on the live page):\n${interactionSnapshots.join("\n\n")}` : ""}
${args.user_hint ? `\nUser feedback about this test failure:\n${args.user_hint}` : ""}

Fix the test based on the error. Rules:

For ALL errors:
- Preserve the test structure and flow as much as possible
- Keep it as a single test() call — no test.describe() or beforeEach()
- Navigate to ${project.app_url} using page.goto() at the start
- Use semantic locators first (getByRole, getByLabel, getByPlaceholder, getByText), then getByTestId
- NEVER use raw CSS selectors
- Use web-first assertions: await expect(locator).toBeVisible(), toHaveText(), toContainText(), toHaveURL()
- Prefer toContainText() over toHaveText() for partial matches — it's more resilient
- Never use waitForTimeout(), arbitrary sleeps, or waitForLoadState('networkidle')
- Wrap the test in a single markdown code fence with language "typescript"

CRITICAL — Only use locators for elements that exist in the snapshots above. If you cannot see an element (dialog, form field, button) in ANY of the provided snapshots, do NOT invent or guess a locator for it. If a step cannot be verified, remove that assertion rather than guessing.

For text/value mismatch errors:
- Use the RECEIVED value (not the expected one) — the received value is what the page actually shows
- If a locator is wrong, check the page context for the correct selector

For TimeoutError (element not found within timeout):
- Check the snapshots — if the element doesn't appear in any snapshot, the test may be testing a feature that requires specific user actions first. Simplify the test to only assert what's visible in the snapshots.
- If the element IS in an interaction snapshot, use the exact locator from that snapshot
- After login or any navigation, add await page.waitForLoadState('domcontentloaded') before interacting with new content
- After page.goto(), add await expect(locator).toBeVisible({ timeout: 15000 }) before clicking anything

For assertion failures (visible/enabled/text mismatch):
- Fix ONLY the broken assertion. Use the actual received value from the error.
- If the error shows an element is not visible, it may need a longer timeout or a scroll-into-view first

For form submissions and mutations (clicking Create/Save/Submit buttons):
- Wrap the submission in a retry loop — the backend may intermittently timeout (e.g. Convex 1s function limit).
- Pattern: click submit, check if dialog closes (success) or stays open (failure). If still open, retry up to 3 times.
- Example:
  for (let attempt = 0; attempt < 3; attempt++) {
    await submitBtn.click();
    const closed = await expect(dialog).toBeHidden({ timeout: 10000 }).then(() => true).catch(() => false);
    if (closed) break;
  }
  await expect(dialog).toBeHidden({ timeout: 5000 });
- Use this pattern whenever a form submit button is clicked and the test then verifies the result.`,
      });
      responseText = result.text;
    } catch (err: unknown) {
      await ctx.runMutation(internal.tests.mutations.setTestDraft, {
        test_id: args.test_id,
      });
      classifyAiError(err);
    }

    const code = extractPlaywrightCode(responseText);

    if (!code) {
      await ctx.runMutation(internal.tests.mutations.setTestDraft, {
        test_id: args.test_id,
      });
      throw new ConvexError(
        `AI did not generate a valid Playwright test for healing. Response length: ${responseText.length}. First 500 chars: ${responseText.slice(0, 500)}`,
      );
    }

    const newName = deriveTestName(code) ?? test.name;
    const diff = computeDiff(test.playwright_code, code);

    await ctx.runMutation(api.tests.mutations.updateTestCode, {
      test_id: args.test_id,
      playwright_code: code,
      name: newName,
      status: "draft",
      last_healed_at: Date.now(),
      last_healed_diff: diff || undefined,
    });

    return { testId: args.test_id, newName };
}

export const healAllFailed = action({
  args: {
    run_id: v.id("runs"),
  },
  handler: async (ctx, args) => {
    const run = await ctx.runQuery(api.runs.queries.getRunDetail, {
      run_id: args.run_id,
    });

    if (!run) {
      throw new ConvexError("Run not found");
    }

    const failedResults = run.results.filter((r) => r.status === "failed");

    if (failedResults.length === 0) {
      throw new ConvexError("No failed tests in this run");
    }

    const healed: { testId: string; testName: string; success: boolean; error?: string }[] = [];

    for (const result of failedResults) {
      const errorParts: string[] = [];
      if (result.error_message) errorParts.push(result.error_message);
      const failedStepErrors = result.steps
        .filter((s) => s.error_message)
        .map((s) => `Step ${s.step_number} (${s.command}): ${s.error_message}`);
      if (failedStepErrors.length > 0) errorParts.push(failedStepErrors.join("\n"));

      try {
        const healedResult = await ctx.runAction(api.ai.healTest.healTest, {
          test_id: result.test_id as Id<"tests">,
          error_message: errorParts.join("\n") || undefined,
        });
        healed.push({ testId: healedResult.testId, testName: result.test_name, success: true });
      } catch (err) {
        healed.push({
          testId: result.test_id,
          testName: result.test_name,
          success: false,
          error: err instanceof Error ? err.message : "Healing failed",
        });
      }
    }

    return healed;
  },
});

"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { createTestGenerationAgent, extractPlaywrightCode, deriveTestName } from "./agents";
import { classifyAiError } from "./errors";

export const healTest = action({
  args: {
    test_id: v.id("tests"),
    error_message: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ testId: string; newName: string }> => {
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

    const project = await ctx.runQuery(api.projects.queries.getProject, {
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

    const aiConfig = await ctx.runQuery(internal.ai.model.getWorkspaceAiConfigQuery, {
      workspace_id: project.workspace_id,
    });

    let responseText: string;
    try {
      const agent = createTestGenerationAgent(
        (await import("./model")).getWorkspaceModel(aiConfig),
      );
      const { thread } = await agent.createThread(ctx, {
        title: `AI Heal — ${test.name}`,
      });
      const result = await thread.generateText({
        prompt: `Fix this Playwright test that failed during execution.

Project: ${project.name}
URL: ${project.app_url}

Test name: ${test.name}

Failing test code:
\`\`\`typescript
${test.playwright_code}
\`\`\`

Error from test run:
${errorMessage}
${pagesContext ? `\nPage context (for reference — use actual locators and text values shown here):\n${pagesContext}` : ""}

Fix the test based on the error. The error shows the ACTUAL received value — use that exact value in the corrected assertion. Rules:
- Fix ONLY the broken assertion/interaction. Preserve the test structure and flow.
- If the error shows a text mismatch, use the RECEIVED value (not the expected one) — the received value is what the page actually shows.
- If a locator is wrong, check the page context for the correct selector.
- Keep it as a single test() call — no test.describe() or beforeEach()
- Navigate to ${project.app_url} using page.goto() at the start
- Use semantic locators first (getByRole, getByLabel, getByPlaceholder, getByText), then getByTestId
- NEVER use raw CSS selectors
- Use web-first assertions: await expect(locator).toBeVisible(), toHaveText(), toContainText(), toHaveURL()
- Prefer toContainText() over toHaveText() for partial matches — it's more resilient
- Never use waitForTimeout() or arbitrary sleeps
- Wrap the test in a single markdown code fence with language "typescript"`,
      });
      responseText = result.text;
    } catch (err: unknown) {
      classifyAiError(err);
    }

    const code = extractPlaywrightCode(responseText);

    if (!code) {
      throw new ConvexError("AI did not generate a valid Playwright test for healing.");
    }

    const newName = deriveTestName(code) ?? test.name;

    await ctx.runMutation(api.tests.mutations.updateTestCode, {
      test_id: args.test_id,
      playwright_code: code,
      name: newName,
      status: "draft",
    });

    return { testId: args.test_id, newName };
  },
});

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

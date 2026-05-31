"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { createTestGenerationAgent, extractMultipleTests, deriveTestName } from "./agents";
import { createAiError, classifyAiError } from "./errors";
import { markSuiteFailed, markSuiteReady } from "./suiteStatus";
import { buildAuthPromptContext } from "./authContext";
import { ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";

export const generateNlTests = action({
  args: {
    project_id: v.id("projects"),
    prompt: v.string(),
    suite_id: v.id("suites"),
  },
  handler: async (ctx, args) => {
    if (!args.prompt.trim()) {
      await markSuiteFailed(ctx, args.suite_id, "Prompt cannot be empty");
      throw new ConvexError("Prompt cannot be empty");
    }

    const project = await ctx.runQuery(internal.projects.queries.getProjectForAi, {
      project_id: args.project_id,
    });

    if (!project) {
      await markSuiteFailed(ctx, args.suite_id, "Project not found");
      throw new ConvexError("Project not found");
    }

    console.log(`[generateNlTests] project auth: mode=${(project as Record<string, unknown>).explore_auth_mode}, username=${(project as Record<string, unknown>).explore_username ?? "(none)"}`);

    const aiConfig = await ctx.runQuery(internal.ai.model.getWorkspaceAiConfigQuery, {
      workspace_id: project.workspace_id,
    });

    let prdContext = "";
    if (project.prd_text) {
      prdContext = `\n\nProduct Requirements:\n${project.prd_text}`;
    } else if (project.prd_file_id) {
      const blob = await ctx.storage.get(project.prd_file_id);
      if (blob) {
        prdContext = `\n\nProduct Requirements:\n${await blob.text()}`;
      }
    }

    let responseText: string;
    try {
      const agent = createTestGenerationAgent(
        (await import("./model")).getWorkspaceModel(aiConfig),
      );
      const { thread } = await agent.createThread(ctx, {
        title: `NL Generation — ${project.name}`,
      });
      const result = await thread.generateText({
        prompt: `Generate Playwright tests from the following test description.

Project: ${project.name}
URL: ${project.app_url}
${buildAuthPromptContext(project)}${prdContext}

Test Description:
${args.prompt}

Generate complete, runnable Playwright tests. Each test must be in its own markdown code fence with the "typescript" language tag. Each code fence must contain exactly ONE top-level test() call — do NOT use test.describe(), test.beforeEach(), or test.afterEach(). Each test should navigate to ${project.app_url} using page.goto() at the start.

Locator strategy (priority order):
1. Semantic locators first: getByRole, getByLabel, getByPlaceholder, getByText
2. getByTestId for data-test/data-testid attributes
3. NEVER use raw CSS selectors or XPath

Assertion rules:
- Use web-first assertions: await expect(locator).toBeVisible(), toHaveText(), toContainText(), toHaveURL()
- Never use waitForTimeout() or arbitrary sleeps

Only interact with elements and assert on values explicitly described — do NOT invent or guess selectors.`,
      });
      responseText = result.text;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "AI generation failed";
      await markSuiteFailed(ctx, args.suite_id, msg);
      classifyAiError(err);
      return;
    }

    const testBlocks = extractMultipleTests(responseText);

    if (testBlocks.length === 0) {
      await markSuiteFailed(ctx, args.suite_id, "AI did not generate any valid Playwright tests.");
      throw createAiError("malformed_response", "AI did not generate any valid Playwright tests.");
    }

    const testIds: string[] = [];
    for (let i = 0; i < testBlocks.length; i++) {
      const testName = deriveTestName(testBlocks[i], i);
      const testId: string = await ctx.runMutation(internal.tests.mutations.createTestFromGeneration, {
        suite_id: args.suite_id as Id<"suites">,
        name: testName,
        playwright_code: testBlocks[i],
        source_type: "natural_language",
        description: args.prompt,
      });
      testIds.push(testId);
    }

    await markSuiteReady(ctx, args.suite_id);

    return { suiteId: args.suite_id, testIds, testNameCount: testIds.length };
  },
});

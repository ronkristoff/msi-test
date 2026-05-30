"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
import { internal, api } from "../_generated/api";
import { createTestGenerationAgent, extractMultipleTests, deriveTestName } from "./agents";
import { createAiError, classifyAiError } from "./errors";
import { ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";

export const generatePrdTests = action({
  args: {
    project_id: v.id("projects"),
    prd_text: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const project = await ctx.runQuery(api.projects.queries.getProject, {
      project_id: args.project_id,
    });

    if (!project) {
      throw new ConvexError("Project not found");
    }

    let prdContent = args.prd_text ?? project.prd_text ?? "";

    if (!prdContent && project.prd_file_id) {
      const blob = await ctx.storage.get(project.prd_file_id);
      if (blob) {
        prdContent = await blob.text();
      }
    }

    if (!prdContent.trim()) {
      throw new ConvexError("No PRD content found. Add PRD text or upload a file to the project.");
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
        title: `PRD Generation — ${project.name}`,
      });
      const result = await thread.generateText({
        prompt: `Generate Playwright tests for the following application.

Project: ${project.name}
URL: ${project.app_url}

Product Requirements:
${prdContent}

Generate complete, runnable Playwright tests. Each test must be in its own markdown code fence with the "typescript" language tag. Each code fence must contain exactly ONE top-level test() call — do NOT use test.describe(), test.beforeEach(), or test.afterEach(). Each test should navigate to ${project.app_url} using page.goto() at the start.

Locator strategy (priority order):
1. Semantic locators first: getByRole, getByLabel, getByPlaceholder, getByText
2. getByTestId for data-test/data-testid attributes
3. NEVER use raw CSS selectors or XPath

Assertion rules:
- Use web-first assertions: await expect(locator).toBeVisible(), toHaveText(), toContainText(), toHaveURL()
- Never use waitForTimeout() or arbitrary sleeps

Only interact with elements and assert on values explicitly described in the requirements — do NOT invent or guess selectors.`,
      });
      responseText = result.text;
    } catch (err: unknown) {
      classifyAiError(err);
    }

    const testBlocks = extractMultipleTests(responseText);

    if (testBlocks.length === 0) {
      throw createAiError("malformed_response", "AI did not generate any valid Playwright tests.");
    }

    const now = new Date();
    const month = now.toLocaleString("en-US", { month: "short" });
    const day = now.getDate();
    const suiteName = `PRD Tests — ${month} ${day}`;

    const suiteId: string = await ctx.runMutation(api.suites.mutations.createSuite, {
      project_id: args.project_id,
      name: suiteName,
      description: `Auto-generated from PRD for ${project.name}`,
      source_type: "prd",
    });

    const testIds: string[] = [];
    for (let i = 0; i < testBlocks.length; i++) {
      const testName = deriveTestName(testBlocks[i], i);
      const testId: string = await ctx.runMutation(internal.tests.mutations.createTestFromGeneration, {
        suite_id: suiteId as Id<"suites">,
        name: testName,
        playwright_code: testBlocks[i],
        source_type: "prd",
      });
      testIds.push(testId);
    }

    return { suiteId, testIds, testNameCount: testIds.length };
  },
});

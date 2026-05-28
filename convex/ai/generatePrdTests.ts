"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
import { internal, api } from "../_generated/api";
import { createTestGenerationAgent, extractMultipleTests, deriveTestName } from "./agents";
import { createAiError } from "./errors";
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

Generate complete, runnable Playwright tests. Each test should be in its own markdown code fence with the "typescript" language tag. Each test should be self-contained with its own imports.`,
      });
      responseText = result.text;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("401") || msg.includes("Unauthorized")) {
        throw createAiError("invalid_api_key", "Invalid API key. Check your workspace AI settings.");
      }
      if (msg.includes("429") || msg.includes("rate")) {
        throw createAiError("rate_limit", "Rate limit exceeded. Please wait and try again.");
      }
      if (msg.includes("timeout") || msg.includes("Timed out")) {
        throw createAiError("timeout", "AI request timed out. Please try again.");
      }
      throw createAiError("malformed_response", msg);
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

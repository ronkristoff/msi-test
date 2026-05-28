"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
import { internal, api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { createTestGenerationAgent, extractPlaywrightCode, deriveTestName } from "./agents";
import { createAiError, classifyAiError } from "./errors";
import { ConvexError } from "convex/values";

export const regenerateTest = action({
  args: {
    test_id: v.id("tests"),
  },
  handler: async (ctx, args): Promise<{ testId: string; newName: string }> => {
    const test: {
      suite_id: Id<"suites">;
      name: string;
      playwright_code: string;
    } | null = await ctx.runQuery(internal.tests.queries.getTestInternal, {
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

    const aiConfig = await ctx.runQuery(internal.ai.model.getWorkspaceAiConfigQuery, {
      workspace_id: project.workspace_id,
    });

    let responseText: string;
    try {
      const agent = createTestGenerationAgent(
        (await import("./model")).getWorkspaceModel(aiConfig),
      );
      const { thread } = await agent.createThread(ctx, {
        title: `Regenerate — ${test.name}`,
      });
      const result = await thread.generateText({
        prompt: `Regenerate the following Playwright test with improved code.

Project: ${project.name}
URL: ${project.app_url}

Existing test name: ${test.name}
Existing test code:
\`\`\`typescript
${test.playwright_code}
\`\`\`

Generate an improved version of this test as a single Playwright test in a markdown code fence with the "typescript" language tag. The test should be self-contained with its own imports.`,
      });
      responseText = result.text;
    } catch (err: unknown) {
      classifyAiError(err);
    }

    const code = extractPlaywrightCode(responseText);

    if (!code) {
      throw createAiError("malformed_response", "AI did not generate a valid Playwright test.");
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

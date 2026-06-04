"use node";

import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { buildNlGenerationPrompt, buildNlFormatRetryPrompt, createTestGenerationAgent, extractMultipleTests } from "./agents";
import { buildAuthPromptContext } from "./authContext";
import { type SnapshotData } from "./snapshotFormatter";
import { buildSnapshotContext, buildRetryContext } from "./workflowShared";
import { getWorkspaceModel } from "./model";
import { aiMaxRetries } from "./aiRateLimit";

export const generateTestsAction = internalAction({
  args: {
    project_id: v.id("projects"),
    prompt: v.string(),
    snapshot: v.optional(v.any()),
    login_snapshot: v.optional(v.any()),
    workspace_id: v.id("workspaces"),
    validation_error: v.optional(v.string()),
    failure_snapshot: v.optional(v.string()),
    previous_code: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const project = await ctx.runQuery(internal.projects.queries.getProjectForAi, {
      project_id: args.project_id,
    });
    if (!project) return { testBlocks: [] as string[] };

    const aiConfig = await ctx.runQuery(internal.ai.model.getWorkspaceAiConfigQuery, {
      workspace_id: args.workspace_id,
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

    const authContext = buildAuthPromptContext(project);
    const snapshotContext = buildSnapshotContext(
      args.snapshot ? [args.snapshot as SnapshotData] : [],
      args.login_snapshot as SnapshotData | undefined,
    );
    const retryContext = buildRetryContext(
      args.validation_error,
      args.failure_snapshot,
      args.previous_code,
    );

    const promptOpts = { projectName: project.name, appUrl: project.app_url, authContext, prdContext, snapshotContext, prompt: args.prompt };

    const agent = createTestGenerationAgent(getWorkspaceModel(aiConfig));
    const { thread } = await agent.createThread(ctx, { title: `NL Generation — ${project.name}` });
    const result = await thread.generateText({
      maxRetries: aiMaxRetries,
      prompt: buildNlGenerationPrompt({ ...promptOpts, retryContext }),
    });

    let testBlocks = extractMultipleTests(result.text);

    if (testBlocks.length === 0) {
      const retryAgent = createTestGenerationAgent(getWorkspaceModel(aiConfig));
      const { thread: retryThread } = await retryAgent.createThread(ctx, { title: `NL Generation Retry — ${project.name}` });
      const retryResult = await retryThread.generateText({
        maxRetries: aiMaxRetries,
        prompt: buildNlFormatRetryPrompt(promptOpts),
      });
      testBlocks = extractMultipleTests(retryResult.text);
    }

    return { testBlocks };
  },
});

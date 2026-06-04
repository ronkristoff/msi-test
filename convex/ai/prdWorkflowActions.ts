"use node";

import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { buildPrdGenerationPrompt, buildPrdFormatRetryPrompt, createTestGenerationAgent, extractMultipleTests } from "./agents";
import { buildAuthPromptContext } from "./authContext";
import { type SnapshotData } from "./snapshotFormatter";
import { buildSnapshotContext, buildRetryContext } from "./workflowShared";
import { aiMaxRetries } from "./aiRateLimit";
import { getWorkspaceModel } from "./model";

export const readPrdFile = internalAction({
  args: {
    file_id: v.string(),
  },
  handler: async (ctx, args) => {
    const blob = await ctx.storage.get(args.file_id as Id<"_storage">);
    if (!blob) return null;
    return blob.text();
  },
});

export const generateTestsAction = internalAction({
  args: {
    project_id: v.id("projects"),
    workspace_id: v.id("workspaces"),
    prd_text: v.string(),
    snapshots: v.optional(v.array(v.object({
      url: v.string(),
      data: v.any(),
    }))),
    login_snapshot: v.optional(v.any()),
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

    const authContext = buildAuthPromptContext(project);
    const snapshotContext = buildSnapshotContext(
      args.snapshots?.map((s) => s.data as SnapshotData) ?? [],
      args.login_snapshot as SnapshotData | undefined,
    );
    const retryContext = buildRetryContext(
      args.validation_error,
      args.failure_snapshot,
      args.previous_code,
    );

    const prompt = buildPrdGenerationPrompt({
      projectName: project.name,
      appUrl: project.app_url,
      authContext,
      prdText: args.prd_text,
      snapshotContext,
      retryContext,
    });

    const agent = createTestGenerationAgent(getWorkspaceModel(aiConfig));
    const { thread } = await agent.createThread(ctx, { title: `PRD Generation — ${project.name}` });
    const result = await thread.generateText({ maxRetries: aiMaxRetries, prompt });

    let testBlocks = extractMultipleTests(result.text);

    if (testBlocks.length === 0) {
      const retryAgent = createTestGenerationAgent(getWorkspaceModel(aiConfig));
      const { thread: retryThread } = await retryAgent.createThread(ctx, { title: `PRD Generation Retry — ${project.name}` });
      const retryResult = await retryThread.generateText({
        maxRetries: aiMaxRetries,
        prompt: buildPrdFormatRetryPrompt({
          projectName: project.name,
          appUrl: project.app_url,
          authContext,
          prdText: args.prd_text,
          snapshotContext,
        }),
      });
      testBlocks = extractMultipleTests(retryResult.text);
    }

    return { testBlocks };
  },
});

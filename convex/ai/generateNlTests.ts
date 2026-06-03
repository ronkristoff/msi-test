"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { start, type WorkflowId } from "@convex-dev/workflow";
import { ConvexError } from "convex/values";

export const generateNlTests = action({
  args: {
    project_id: v.id("projects"),
    prompt: v.string(),
    suite_id: v.id("suites"),
  },
  handler: async (ctx, args) => {
    if (!args.prompt.trim()) {
      await ctx.runMutation(internal.suites.mutations.updateSuiteStatus, {
        suite_id: args.suite_id,
        status: "failed",
        generation_error: "Prompt cannot be empty",
      });
      throw new ConvexError("Prompt cannot be empty");
    }

    const project = await ctx.runQuery(internal.projects.queries.getProjectForAi, {
      project_id: args.project_id,
    });

    if (!project) {
      await ctx.runMutation(internal.suites.mutations.updateSuiteStatus, {
        suite_id: args.suite_id,
        status: "failed",
        generation_error: "Project not found",
      });
      throw new ConvexError("Project not found");
    }

    const workflowId: WorkflowId = await start(
      ctx,
      internal.ai.nlWorkflow.nlTestGenerationWorkflow,
      {
        project_id: args.project_id,
        prompt: args.prompt,
        suite_id: args.suite_id,
      },
    );

    return { suiteId: args.suite_id, workflowId };
  },
});

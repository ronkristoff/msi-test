"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { start, type WorkflowId } from "@convex-dev/workflow";
import { ConvexError } from "convex/values";

export const generatePrdTests = action({
  args: {
    project_id: v.id("projects"),
    suite_id: v.id("suites"),
    prd_text: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
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
      internal.ai.prdWorkflow.prdTestGenerationWorkflow,
      {
        project_id: args.project_id,
        suite_id: args.suite_id,
        prd_text: args.prd_text,
      },
    );

    return { suiteId: args.suite_id, workflowId };
  },
});

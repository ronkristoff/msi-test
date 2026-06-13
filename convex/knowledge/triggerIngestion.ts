"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { start } from "@convex-dev/workflow";
import { ConvexError } from "convex/values";
import { requireAuth, getOwnerId } from "../lib/requireAuth";

export const triggerIngestion = action({
  args: {
    project_id: v.id("projects"),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const userId = getOwnerId(user);

    const membership = await ctx.runQuery(
      internal.knowledge.internal._getMembershipForUser,
      { user_id: userId },
    );
    if (!membership) {
      throw new ConvexError("Not authenticated");
    }

    const project = await ctx.runQuery(
      internal.knowledge.internal._getProjectForIngestion,
      { project_id: args.project_id },
    );

    if (!project) {
      throw new ConvexError("Project not found");
    }

    if (!project.repo_url || !project.encrypted_pat) {
      throw new ConvexError("Project has no connected repository. Connect a GitHub repo first.");
    }

    if (project.kb_status !== "none" && project.kb_status !== "error") {
      throw new ConvexError("Knowledge base is already building or ready. Cancel the current ingestion first.");
    }

    const kbId = await ctx.runMutation(
      internal.knowledge.internal._createKnowledgeBase,
      {
        workspace_id: project.workspace_id,
        project_id: args.project_id,
      },
    );

    await ctx.runMutation(internal.knowledge.internal._updateKbStatus, {
      knowledge_base_id: kbId,
      project_id: args.project_id,
      status: "building",
      progress_message: "Starting ingestion...",
    });

    let workflowId: string;
    try {
      workflowId = await start(
        ctx,
        internal.knowledge.ingestionWorkflow.ingestionWorkflow,
        {
          project_id: args.project_id,
          knowledge_base_id: kbId,
        },
      );
    } catch (err) {
      await ctx.runMutation(internal.knowledge.internal._updateKbStatus, {
        knowledge_base_id: kbId,
        project_id: args.project_id,
        status: "error",
        error_message: "Failed to start ingestion workflow",
      });
      throw err;
    }

    return { knowledgeBaseId: kbId, workflowId };
  },
});

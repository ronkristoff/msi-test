import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { getOwnedEntityMessage, getOwnerId } from "../lib/requireAuth";
import { getWorkspaceModel } from "../ai/model";
import { createAnalystChatAgent } from "./agents";

export const createThread = mutation({
  args: { project_id: v.id("projects") },
  handler: async (ctx, args) => {
    const { user, workspace } = await getOwnedEntityMessage(
      ctx,
      args.project_id,
      "projects",
      "Project not found",
    );
    const userId = getOwnerId(user);

    if (!workspace.ai_config) {
      throw new ConvexError(
        "Chat failed: workspace AI config not found. Check workspace settings.",
      );
    }

    const model = getWorkspaceModel(workspace.ai_config);
    const agent = createAnalystChatAgent(model);
    const { threadId } = await agent.createThread(ctx, { userId });

    try {
      await ctx.db.insert("chat_threads", {
        thread_id: threadId,
        workspace_id: workspace._id,
        project_id: args.project_id,
        title: "New Chat",
        created_by_user_id: userId,
        last_message_at: Date.now(),
      });
    } catch (error) {
      console.error("Failed to insert chat_threads join, cleaning up agent thread:", error);
      await agent.deleteThreadAsync(ctx, { threadId }).catch(() => {});
      throw error;
    }

    return { threadId };
  },
});

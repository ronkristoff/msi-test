import { internalQuery, internalMutation } from "../_generated/server";
import { v } from "convex/values";
import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { getOptionalMemberWorkspace } from "../lib/requireAuth";

export async function verifyThreadOwnership(
  ctx: QueryCtx | MutationCtx,
  threadId: string,
  workspaceId: Id<"workspaces">,
): Promise<Doc<"chat_threads"> | null> {
  const join = await ctx.db
    .query("chat_threads")
    .withIndex("by_thread_id", (q) => q.eq("thread_id", threadId))
    .unique();
  if (!join) return null;
  if (join.workspace_id !== workspaceId) return null;
  return join;
}

export const _getThreadOwnership = internalQuery({
  args: { thread_id: v.string() },
  handler: async (ctx, args) => {
    const membership = await getOptionalMemberWorkspace(ctx);
    if (!membership) return null;
    const join = await verifyThreadOwnership(
      ctx,
      args.thread_id,
      membership.workspace._id,
    );
    if (!join) return null;
    return {
      thread_id: join.thread_id,
      workspace_id: join.workspace_id,
      project_id: join.project_id,
      title: join.title,
      user_id: membership.user._id,
    };
  },
});

export const _getChatWorkspaceConfig = internalQuery({
  args: { workspace_id: v.id("workspaces") },
  handler: async (ctx, args) => {
    const workspace = await ctx.db.get(args.workspace_id);
    if (!workspace) return null;
    return { ai_config: workspace.ai_config };
  },
});

export const _updateThreadTitle = internalMutation({
  args: {
    thread_id: v.string(),
    title: v.string(),
    last_message_at: v.number(),
  },
  handler: async (ctx, args) => {
    const join = await ctx.db
      .query("chat_threads")
      .withIndex("by_thread_id", (q) => q.eq("thread_id", args.thread_id))
      .unique();
    if (!join) return;
    await ctx.db.patch(join._id, {
      title: args.title,
      last_message_at: args.last_message_at,
    });
  },
});

export const _updateThreadTitleIfNew = internalMutation({
  args: {
    thread_id: v.string(),
    title: v.string(),
    last_message_at: v.number(),
  },
  handler: async (ctx, args) => {
    const join = await ctx.db
      .query("chat_threads")
      .withIndex("by_thread_id", (q) => q.eq("thread_id", args.thread_id))
      .unique();
    if (!join) return false;
    if (join.title !== "New Chat") return false;
    await ctx.db.patch(join._id, {
      title: args.title,
      last_message_at: args.last_message_at,
    });
    return true;
  },
});

export const _updateThreadLastMessageAt = internalMutation({
  args: {
    thread_id: v.string(),
    last_message_at: v.number(),
  },
  handler: async (ctx, args) => {
    const join = await ctx.db
      .query("chat_threads")
      .withIndex("by_thread_id", (q) => q.eq("thread_id", args.thread_id))
      .unique();
    if (!join) return;
    await ctx.db.patch(join._id, {
      last_message_at: args.last_message_at,
    });
  },
});

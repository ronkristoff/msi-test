import { internalQuery, internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
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

const storedStoryValidator = v.object({
  title: v.string(),
  user_story: v.object({
    as_a: v.string(),
    i_want: v.string(),
    so_that: v.string(),
  }),
  acceptance_criteria: v.array(v.string()),
  affected_components: v.object({
    modules: v.array(v.string()),
    apis: v.array(v.string()),
    data_models: v.array(v.string()),
  }),
  technical_context: v.optional(v.string()),
});

export const _storeUserStories = internalMutation({
  args: {
    thread_id: v.string(),
    workspace_id: v.id("workspaces"),
    project_id: v.id("projects"),
    stories: v.array(storedStoryValidator),
  },
  handler: async (ctx, args) => {
    const stored_ids: Id<"user_stories">[] = [];
    const generated_at = Date.now();
    for (const story of args.stories) {
      if (story.acceptance_criteria.length === 0) {
        throw new ConvexError({
          type: "validation_error",
          message:
            "Story cannot have empty acceptance_criteria (at least one criterion required).",
        });
      }
      const id = await ctx.db.insert("user_stories", {
        workspace_id: args.workspace_id,
        project_id: args.project_id,
        thread_id: args.thread_id,
        title: story.title,
        user_story: story.user_story,
        acceptance_criteria: story.acceptance_criteria,
        affected_components: story.affected_components,
        technical_context: story.technical_context,
        status: "draft",
        generated_at,
      });
      stored_ids.push(id);
    }
    return { stored_ids };
  },
});

import { query } from "../_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import type { FunctionArgs } from "convex/server";
import {
  listUIMessages,
  syncStreams,
  vStreamArgs,
} from "@convex-dev/agent";
import { components } from "../_generated/api";
import { getMemberWorkspace, getOptionalOwnedEntity } from "../lib/requireAuth";
import { verifyThreadOwnership } from "./internal";
import { extractMessageText, truncatePreview } from "./preview";

type ListMessagesArgs = FunctionArgs<
  typeof components.agent.messages.listMessagesByThreadId
>;

export const listThreadMessages = query({
  args: {
    threadId: v.string(),
    paginationOpts: paginationOptsValidator,
    streamArgs: v.optional(vStreamArgs),
  },
  handler: async (ctx, args) => {
    const membership = await getMemberWorkspace(ctx);
    const join = await verifyThreadOwnership(
      ctx,
      args.threadId,
      membership.workspace._id,
    );
    if (!join) {
      throw new ConvexError("Thread not found");
    }

    const paginated = await listUIMessages(ctx, components.agent, {
      threadId: args.threadId,
      paginationOpts: args.paginationOpts,
    });
    const streams = await syncStreams(ctx, components.agent, {
      threadId: args.threadId,
      streamArgs: args.streamArgs,
    });

    return { ...paginated, streams };
  },
});

export const listThreads = query({
  args: { project_id: v.id("projects") },
  handler: async (ctx, args) => {
    const result = await getOptionalOwnedEntity(
      ctx,
      args.project_id,
      "projects",
    );
    if (!result) return null;

    const threads = await ctx.db
      .query("chat_threads")
      .withIndex("by_project_id_and_last_message_at", (q) =>
        q.eq("project_id", args.project_id),
      )
      .order("desc")
      .take(50);

    const previews = await Promise.all(
      threads.map(async (t) => {
        try {
          const latest = await ctx.runQuery(
            components.agent.messages.listMessagesByThreadId,
            {
              threadId: t.thread_id as ListMessagesArgs["threadId"],
              excludeToolMessages: true,
              order: "desc",
              paginationOpts: { numItems: 1, cursor: null, id: undefined },
            },
          );
          const lastMsg = latest.page[0];
          if (!lastMsg) return null;
          const text = extractMessageText(lastMsg);
          return text === null ? null : truncatePreview(text);
        } catch (err) {
          ctx.logger?.warn("chat.listThreads: preview fetch failed", {
            threadId: t.thread_id,
            error: err instanceof Error ? err.message : String(err),
          });
          return null;
        }
      }),
    );

    return threads.map((t, i) => ({
      thread_id: t.thread_id,
      title: t.title,
      last_message_at: t.last_message_at ?? null,
      _creationTime: t._creationTime,
      last_message_preview: previews[i] ?? null,
    }));
  },
});

export const getThread = query({
  args: { thread_id: v.string() },
  handler: async (ctx, args) => {
    const membership = await getMemberWorkspace(ctx);
    const join = await verifyThreadOwnership(
      ctx,
      args.thread_id,
      membership.workspace._id,
    );
    if (!join) return null;
    return {
      title: join.title,
      last_message_at: join.last_message_at ?? null,
    };
  },
});

"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { internal, api } from "../_generated/api";
import { generateText } from "ai";
import { getWorkspaceModel } from "../ai/model";
import { createAnalystChatAgent } from "./agents";
import { buildRagSystemPrompt } from "./ragContext";
import { CHAT_RAG_RESULT_LIMIT } from "../lib/constraints";
import { isRateLimitError } from "@convex-dev/rate-limiter";
import {
  getErrorStatusCode,
  getErrorMessage,
} from "../knowledge/embeddingActions";

const MAX_PROMPT_LENGTH = 32000;

function buildChatErrorMessage(error: unknown): string {
  const statusCode = getErrorStatusCode(error);

  if (statusCode === 401 || statusCode === 403) {
    return "Chat failed: authentication error. Check workspace AI config.";
  }
  if (statusCode === 404) {
    return "Chat failed: model not available.";
  }
  return "Chat failed: an unexpected error occurred. Please try again.";
}

const TITLE_MAX_LENGTH = 80;

function sanitizeTitle(raw: string): string {
  const trimmed = raw.trim().replace(/\s+/g, " ");
  if (!trimmed) return "New Chat";
  const chars = Array.from(trimmed);
  return chars.length > TITLE_MAX_LENGTH
    ? chars.slice(0, TITLE_MAX_LENGTH).join("")
    : trimmed;
}

function validatePrompt(prompt: string): string {
  const trimmed = prompt.trim();
  if (!trimmed) {
    throw new ConvexError("Prompt cannot be empty.");
  }
  if (trimmed.length > MAX_PROMPT_LENGTH) {
    throw new ConvexError(`Prompt exceeds maximum length of ${MAX_PROMPT_LENGTH} characters.`);
  }
  return trimmed;
}

export const streamMessage = action({
  args: {
    threadId: v.string(),
    prompt: v.string(),
  },
  handler: async (ctx, args) => {
    const prompt = validatePrompt(args.prompt);

    const ownership = await ctx.runQuery(
      internal.chat.internal._getThreadOwnership,
      { thread_id: args.threadId },
    );
    if (!ownership) {
      throw new ConvexError("Thread not found");
    }

    const configResult = await ctx.runQuery(
      internal.chat.internal._getChatWorkspaceConfig,
      { workspace_id: ownership.workspace_id },
    );
    if (!configResult?.ai_config) {
      throw new ConvexError(
        "Chat failed: workspace AI config not found. Check workspace settings.",
      );
    }

    let ragText: string | null = null;
    try {
      const ragResult = await ctx.runAction(
        api.knowledge.queries.searchProjectRag,
        {
          project_id: ownership.project_id,
          query_string: prompt,
          limit: CHAT_RAG_RESULT_LIMIT,
        },
      );
      ragText = ragResult?.text ?? null;
    } catch (error: unknown) {
      if (isRateLimitError(error)) {
        throw new ConvexError(
          "You're sending messages too quickly. Please wait a moment and try again.",
        );
      }
      console.error("Chat RAG search error:", error);
    }

    const system = buildRagSystemPrompt(ragText);

    const model = getWorkspaceModel(configResult.ai_config);
    const agent = createAnalystChatAgent(model);

    const { thread } = await agent.continueThread(ctx, {
      threadId: args.threadId,
      userId: ownership.user_id,
    });

    const isFirstMessage = ownership.title === "New Chat";

    try {
      await thread.streamText(
        { prompt },
        { ...(system ? { system } : {}), saveStreamDeltas: true },
      );
    } catch (error: unknown) {
      console.error("Chat streamText error:", error);
      await ctx.runMutation(
        internal.chat.internal._updateThreadLastMessageAt,
        { thread_id: args.threadId, last_message_at: Date.now() },
      ).catch(() => {});
      throw new ConvexError(buildChatErrorMessage(error));
    }

    const now = Date.now();

    if (isFirstMessage) {
      let titled = false;
      try {
        const titleResult = await generateText({
          model,
          system:
            "Summarize the user's question in at most 6 words. Reply with ONLY a short title, no quotes, no punctuation at the end.",
          prompt,
        });
        const title = sanitizeTitle(titleResult.text);

        titled = await ctx.runMutation(
          internal.chat.internal._updateThreadTitleIfNew,
          { thread_id: args.threadId, title, last_message_at: now },
        );

        if (titled) {
          await agent.updateThreadMetadata(ctx, {
            threadId: args.threadId,
            patch: { title },
          });
        }
      } catch (error: unknown) {
        console.error("Chat auto-title error:", error);
      }

      if (!titled) {
        await ctx.runMutation(
          internal.chat.internal._updateThreadLastMessageAt,
          { thread_id: args.threadId, last_message_at: now },
        ).catch(() => {});
      }
    } else {
      try {
        await ctx.runMutation(
          internal.chat.internal._updateThreadLastMessageAt,
          { thread_id: args.threadId, last_message_at: now },
        );
      } catch (error: unknown) {
        console.error("Chat last_message_at update error:", error);
      }
    }

    return { threadId: args.threadId };
  },
});

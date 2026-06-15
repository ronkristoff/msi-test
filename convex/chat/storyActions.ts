"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { internal, api } from "../_generated/api";
import { NoObjectGeneratedError } from "ai";
import { getWorkspaceModel } from "../ai/model";
import { createStoryGenerationAgent } from "./storyAgent";
import { buildStoryGenerationPrompt } from "./storyPrompts";
import { persistUserStories } from "./storyPersistence";
import {
  storyGenerationSchema,
  type UserStory,
  type StoryGenerationResult,
  type BmadContext,
} from "./storySchema";
import { CHAT_RAG_RESULT_LIMIT, EMBEDDING_MAX_QUERY_LENGTH } from "../lib/constraints";
import { isRateLimitError } from "@convex-dev/rate-limiter";
import { getErrorStatusCode } from "../knowledge/embeddingActions";

const MAX_FEATURE_REQUEST_LENGTH = 32000;

function buildStoryErrorMessage(error: unknown): string {
  if (NoObjectGeneratedError.isInstance(error)) {
    return "Story generation failed: AI returned malformed stories. Please retry.";
  }

  const statusCode = getErrorStatusCode(error);

  if (statusCode === 401 || statusCode === 403) {
    return "Story generation failed: authentication error. Check workspace AI config.";
  }
  if (statusCode === 404) {
    return "Story generation failed: model not available.";
  }
  return "Story generation failed: an unexpected error occurred. Please try again.";
}

function validateFeatureRequest(prompt: string): string {
  const trimmed = prompt.trim();
  if (!trimmed) {
    throw new ConvexError("Feature request cannot be empty.");
  }
  if (trimmed.length > MAX_FEATURE_REQUEST_LENGTH) {
    throw new ConvexError(
      `Feature request exceeds maximum length of ${MAX_FEATURE_REQUEST_LENGTH} characters.`,
    );
  }
  return trimmed;
}

export const generateStories = action({
  args: {
    threadId: v.string(),
    featureRequest: v.string(),
  },
  handler: async (ctx, args) => {
    const featureRequest = validateFeatureRequest(args.featureRequest);

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
        "Story generation failed: workspace AI config not found. Check workspace settings.",
      );
    }

    const kb = await ctx.runQuery(api.knowledge.queries.getKnowledgeBase, {
      project_id: ownership.project_id,
    });
    if (!kb || kb.status !== "ready") {
      throw new ConvexError("Knowledge Base is not ready. Build the KB first.");
    }

    let ragText: string | null = null;
    let grounded = false;
    try {
      const ragResult = await ctx.runAction(
        api.knowledge.queries.searchProjectRag,
        {
          project_id: ownership.project_id,
          query_string: featureRequest.slice(0, EMBEDDING_MAX_QUERY_LENGTH),
          limit: CHAT_RAG_RESULT_LIMIT,
        },
      );
      ragText = ragResult?.text ?? null;
      if (ragText) grounded = true;
    } catch (error: unknown) {
      if (isRateLimitError(error)) {
        throw new ConvexError(
          "You're sending messages too quickly. Please wait a moment and try again.",
        );
      }
      console.error("Story generation RAG search error:", error);
    }

    let bmadContext: BmadContext | null = null;
    if (kb.bmad_detected) {
      try {
        const bmadData = await ctx.runQuery(
          internal.knowledge.internal._getBmadMetadata,
          {
            knowledge_base_id: kb._id,
            workspace_id: ownership.workspace_id,
          },
        );
        if (bmadData) {
          type Entry = { key: string; content: string };
          bmadContext = {
            prd_sections: (bmadData.prd_sections as Entry[]).map((e) => ({
              key: e.key,
              content: e.content,
            })),
            adrs: (bmadData.adrs as Entry[]).map((e) => ({
              key: e.key,
              content: e.content,
            })),
            conventions: (bmadData.conventions as Entry[]).map((e) => ({
              key: e.key,
              content: e.content,
            })),
            domain_terms: (bmadData.domain_terms as Entry[]).map((e) => ({
              key: e.key,
              content: e.content,
            })),
          };
        }
      } catch (error: unknown) {
        console.error("Story generation BMAD metadata fetch error:", error);
      }
    }

    const system = buildStoryGenerationPrompt(ragText, bmadContext);

    let stories: UserStory[];
    let generationNote: string | undefined;
    try {
      const model = getWorkspaceModel(configResult.ai_config);
      const agent = createStoryGenerationAgent(model);

      const { thread } = await agent.continueThread(ctx, {
        threadId: args.threadId,
        userId: ownership.user_id,
      });

      const result = await thread.generateObject({
        schema: storyGenerationSchema,
        prompt: featureRequest,
        ...(system ? { system } : {}),
      });
      const typed = result.object as StoryGenerationResult;
      stories = typed.stories;
      generationNote = typed.generation_note;
    } catch (error: unknown) {
      console.error("Story generation generateObject error:", error);
      await ctx.runMutation(
        internal.chat.internal._updateThreadLastMessageAt,
        { thread_id: args.threadId, last_message_at: Date.now() },
      ).catch((mutationError) => {
        console.error("Story generation last_message_at update error (failure path):", mutationError);
      });
      throw new ConvexError(buildStoryErrorMessage(error));
    }

    try {
      await persistUserStories(ctx, {
        thread_id: args.threadId,
        workspace_id: ownership.workspace_id,
        project_id: ownership.project_id,
        stories,
      });
    } catch (error: unknown) {
      console.error("Story generation storeUserStories error:", error);
      await ctx.runMutation(
        internal.chat.internal._updateThreadLastMessageAt,
        { thread_id: args.threadId, last_message_at: Date.now() },
      ).catch((mutationError) => {
        console.error("Story generation last_message_at update error (store failure path):", mutationError);
      });
      throw new ConvexError(
        "Stories generated but could not be saved. Please retry.",
      );
    }

    try {
      await ctx.runMutation(
        internal.chat.internal._updateThreadLastMessageAt,
        { thread_id: args.threadId, last_message_at: Date.now() },
      );
    } catch (error: unknown) {
      console.error("Story generation last_message_at update error:", error);
    }

    return { threadId: args.threadId, stories, generationNote, grounded };
  },
});

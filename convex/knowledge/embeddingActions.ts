"use node";

import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { internal } from "../_generated/api";
import {
  createProjectRag,
  getProjectNamespace,
  getChunkKey,
  buildFilterValues,
} from "./rag";
import {
  EMBEDDING_BATCH_SIZE,
  EMBEDDING_RATE_LIMIT_BACKOFF_MS,
} from "../lib/constraints";

type ChunkData = {
  _id: string;
  file_path: string;
  chunk_index: number;
  language?: string;
  directory: string;
  content: string;
};

export function getErrorStatusCode(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const err = error as {
    statusCode?: number;
    responseStatus?: number;
    status?: number;
  };
  return err.statusCode ?? err.responseStatus ?? err.status;
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return "Unknown error";
}

export function buildEmbeddingErrorMessage(error: unknown): string {
  const statusCode = getErrorStatusCode(error);
  const message = getErrorMessage(error);

  if (statusCode === 401 || statusCode === 403) {
    return "Embedding API authentication failed. Check AI provider config.";
  }
  if (statusCode === 404) {
    return "Embedding model not available. Verify your AI provider supports text-embedding-3-small.";
  }
  return `Embedding API error: ${message}`;
}

export function isRateLimitError(error: unknown): boolean {
  return getErrorStatusCode(error) === 429;
}

export function isFatalError(error: unknown): boolean {
  const statusCode = getErrorStatusCode(error);
  return statusCode === 401 || statusCode === 403 || statusCode === 404;
}

export const embedChunks = internalAction({
  args: {
    project_id: v.id("projects"),
    knowledge_base_id: v.id("knowledge_bases"),
    workspace_id: v.id("workspaces"),
  },
  handler: async (ctx, args) => {
    const chunks: ChunkData[] = await ctx.runQuery(
      internal.knowledge.internal._getChunksForEmbedding,
      { knowledge_base_id: args.knowledge_base_id },
    );

    if (chunks.length === 0) {
      return { totalEmbedded: 0, totalSkipped: 0 };
    }

    const workspace = await ctx.runQuery(
      internal.knowledge.internal._getWorkspaceAiConfig,
      { workspace_id: args.workspace_id },
    );

    if (!workspace?.ai_config) {
      throw new ConvexError("Workspace AI config not found");
    }

    const rag = createProjectRag({
      endpoint_url: workspace.ai_config.endpoint_url,
      api_key: workspace.ai_config.api_key,
    });
    const namespace = getProjectNamespace(args.project_id);

    let totalEmbedded = 0;
    let totalSkipped = 0;

    const batches: ChunkData[][] = [];
    for (let i = 0; i < chunks.length; i += EMBEDDING_BATCH_SIZE) {
      batches.push(chunks.slice(i, i + EMBEDDING_BATCH_SIZE));
    }

    for (const batch of batches) {
      for (const chunk of batch) {
        let embedded = false;

        for (let attempt = 0; attempt < 2 && !embedded; attempt++) {
          try {
            await rag.add(ctx, {
              namespace,
              key: getChunkKey(chunk.file_path, chunk.chunk_index),
              text: chunk.content,
              filterValues: buildFilterValues({
                file_path: chunk.file_path,
                chunk_index: chunk.chunk_index,
                language: chunk.language,
                directory: chunk.directory,
              }),
            });
            embedded = true;
            totalEmbedded++;
          } catch (error: unknown) {
            if (isFatalError(error)) {
              throw new ConvexError(buildEmbeddingErrorMessage(error));
            }
            if (isRateLimitError(error) && attempt === 0) {
              await new Promise((resolve) =>
                setTimeout(resolve, EMBEDDING_RATE_LIMIT_BACKOFF_MS),
              );
              continue;
            }
            totalSkipped++;
            break;
          }
        }
      }

      await ctx.runMutation(
        internal.knowledge.internal._updateKbStatus,
        {
          knowledge_base_id: args.knowledge_base_id,
          project_id: args.project_id,
          status: "building",
          progress_message: `Embedding: ${totalEmbedded}/${chunks.length} chunks${totalSkipped > 0 ? ` (${totalSkipped} skipped)` : ""}...`,
        },
      );
    }

    if (totalEmbedded === 0) {
      throw new ConvexError(
        "No chunks were embedded. Check AI provider configuration.",
      );
    }

    return { totalEmbedded, totalSkipped };
  },
});

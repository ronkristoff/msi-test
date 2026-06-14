"use node";

import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { internal } from "../_generated/api";
import { decryptPat } from "./crypto";
import {
  parseOwnerRepo,
  fetchFileTree,
  filterFiles,
  fetchFileContent,
} from "./github";
import { chunkFile } from "./chunking";
import { detectBmadFiles } from "./bmadParsing";
import {
  GITHUB_DEFAULT_BRANCH,
  GITHUB_FILE_BATCH_SIZE,
  MAX_FILE_SIZE_BYTES,
} from "../lib/constraints";

export const decryptAndFetchTree = internalAction({
  args: {
    project_id: v.id("projects"),
    repo_url: v.string(),
    encrypted_pat: v.string(),
    knowledge_base_id: v.id("knowledge_bases"),
  },
  handler: async (ctx, args) => {
    const encryptionKey = process.env.ENCRYPTION_KEY;
    if (!encryptionKey) {
      throw new ConvexError("Encryption key not configured");
    }

    const pat = decryptPat(args.encrypted_pat, encryptionKey);
    const { owner, repo } = parseOwnerRepo(args.repo_url);

    const { tree, truncated } = await fetchFileTree(owner, repo, pat, GITHUB_DEFAULT_BRANCH);

    const bmadFiles = detectBmadFiles(tree).map((entry) => ({
      path: entry.path,
      size: entry.size,
    }));

    const filtered = filterFiles(tree);

    const files = filtered.map((entry) => ({
      path: entry.path,
      size: entry.size ?? 0,
    }));

    return { files, truncated, bmadFiles };
  },
});

export const fetchAndChunkFiles = internalAction({
  args: {
    project_id: v.id("projects"),
    knowledge_base_id: v.id("knowledge_bases"),
    workspace_id: v.id("workspaces"),
    repo_url: v.string(),
    encrypted_pat: v.string(),
    files: v.array(
      v.object({
        path: v.string(),
        size: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const encryptionKey = process.env.ENCRYPTION_KEY;
    if (!encryptionKey) {
      throw new ConvexError("Encryption key not configured");
    }

    const pat = decryptPat(args.encrypted_pat, encryptionKey);
    const { owner, repo } = parseOwnerRepo(args.repo_url);

    await ctx.runMutation(internal.knowledge.internal._deleteChunksByKb, {
      knowledge_base_id: args.knowledge_base_id,
    });

    let totalFiles = 0;
    let totalSize = 0;
    let chunkCount = 0;
    let skippedFiles = 0;

    for (let i = 0; i < args.files.length; i++) {
      const file = args.files[i];

      if (file.size > MAX_FILE_SIZE_BYTES) {
        skippedFiles++;
        continue;
      }

      if (i > 0 && i % GITHUB_FILE_BATCH_SIZE === 0) {
        await ctx.runMutation(internal.knowledge.internal._updateKbStatus, {
          knowledge_base_id: args.knowledge_base_id,
          project_id: args.project_id,
          status: "building",
          progress_message: `Processed ${i} of ${args.files.length} files...`,
        });
      }

      const content = await fetchFileContent(
        owner,
        repo,
        GITHUB_DEFAULT_BRANCH,
        file.path,
        pat,
      );

      if (content === null) {
        skippedFiles++;
        continue;
      }

      totalFiles++;
      totalSize += new TextEncoder().encode(content).byteLength;

      const chunks = chunkFile(file.path, content);
      chunkCount += chunks.length;

      if (chunks.length > 0) {
        await ctx.runMutation(internal.knowledge.internal._insertChunks, {
          chunks: chunks.map((chunk) => ({
            workspace_id: args.workspace_id,
            knowledge_base_id: args.knowledge_base_id,
            project_id: args.project_id,
            file_path: chunk.file_path,
            directory: chunk.directory,
            content: chunk.content,
            chunk_index: chunk.chunk_index,
            language: chunk.language,
            char_count: chunk.char_count,
          })),
        });
      }
    }

    return { totalFiles, totalSize, chunkCount, skippedFiles };
  },
});

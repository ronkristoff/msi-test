"use node";

import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { internal } from "../_generated/api";
import { decryptPat } from "./crypto";
import { parseOwnerRepo, fetchFileContent } from "./github";
import {
  categorizeBmadFile,
  parsePrd,
  parseAdr,
  parseProjectContext,
  parseContextMd,
  type BmadMetadataEntry,
} from "./bmadParsing";
import { GITHUB_DEFAULT_BRANCH } from "../lib/constraints";

const MAX_BMAD_ENTRIES = 200;
const MAX_BMAD_FILE_SIZE = 100 * 1024;

export const detectAndParseBmad = internalAction({
  args: {
    project_id: v.id("projects"),
    knowledge_base_id: v.id("knowledge_bases"),
    workspace_id: v.id("workspaces"),
    repo_url: v.string(),
    encrypted_pat: v.string(),
    bmad_files: v.array(
      v.object({
        path: v.string(),
        size: v.optional(v.number()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    if (args.bmad_files.length === 0) {
      await ctx.runMutation(internal.knowledge.internal._setBmadDetected, {
        knowledge_base_id: args.knowledge_base_id,
        detected: false,
      });
      return { detected: false, entryCount: 0 };
    }

    const encryptionKey = process.env.ENCRYPTION_KEY;
    if (!encryptionKey) {
      throw new ConvexError("Encryption key not configured");
    }

    const pat = decryptPat(args.encrypted_pat, encryptionKey);
    const { owner, repo } = parseOwnerRepo(args.repo_url);

    const entries: BmadMetadataEntry[] = [];

    for (const file of args.bmad_files) {
      if (entries.length >= MAX_BMAD_ENTRIES) break;

      const fileType = categorizeBmadFile(file.path);
      if (fileType === "agents_md" || fileType === "other") continue;

      if (file.size !== undefined && file.size > MAX_BMAD_FILE_SIZE) continue;

      let content: string;
      try {
        content = await fetchFileContent(
          owner,
          repo,
          GITHUB_DEFAULT_BRANCH,
          file.path,
          pat,
        );
      } catch {
        continue;
      }
      if (!content) continue;

      let parsed: BmadMetadataEntry[] = [];

      try {
        switch (fileType) {
          case "prd":
            parsed = parsePrd(content, file.path);
            break;
          case "adr": {
            const adr = parseAdr(content, file.path);
            parsed = adr ? [adr] : [];
            break;
          }
          case "project_context":
            parsed = parseProjectContext(content, file.path);
            break;
          case "context_md":
            parsed = parseContextMd(content, file.path);
            break;
          default:
            continue;
        }
      } catch {
        continue;
      }

      for (const entry of parsed) {
        if (entries.length >= MAX_BMAD_ENTRIES) break;
        entries.push(entry);
      }
    }

    if (entries.length === 0) {
      await ctx.runMutation(internal.knowledge.internal._setBmadDetected, {
        knowledge_base_id: args.knowledge_base_id,
        detected: false,
      });
      return { detected: false, entryCount: 0 };
    }

    await ctx.runMutation(internal.knowledge.internal._deleteBmadMetadataByKb, {
      knowledge_base_id: args.knowledge_base_id,
    });

    await ctx.runMutation(internal.knowledge.internal._storeBmadMetadata, {
      kb_id: args.knowledge_base_id,
      workspace_id: args.workspace_id,
      entries,
    });

    await ctx.runMutation(internal.knowledge.internal._setBmadDetected, {
      knowledge_base_id: args.knowledge_base_id,
      detected: true,
    });

    return { detected: true, entryCount: entries.length };
  },
});

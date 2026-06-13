"use node";
import { action } from "../_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { internal } from "../_generated/api";
import { validateRepoUrl, validatePatLength } from "../lib/validation";
import { encryptPat } from "./crypto";

export const updateProjectRepo = action({
  args: {
    project_id: v.id("projects"),
    repo_url: v.string(),
    pat: v.string(),
  },
  handler: async (ctx, args) => {
    const repoUrl = validateRepoUrl(args.repo_url);
    validatePatLength(args.pat);

    const encryptionKey = process.env.ENCRYPTION_KEY;
    if (!encryptionKey) {
      throw new ConvexError("Encryption key not configured");
    }

    const encryptedPat = encryptPat(args.pat, encryptionKey);

    await ctx.runMutation(internal.knowledge.internal._patchProjectRepo, {
      project_id: args.project_id,
      repo_url: repoUrl,
      encrypted_pat: encryptedPat,
      kb_status: "none" as const,
    });
  },
});

export const removeProjectRepo = action({
  args: {
    project_id: v.id("projects"),
  },
  handler: async (ctx, args) => {
    await ctx.runMutation(internal.knowledge.internal._clearProjectRepo, {
      project_id: args.project_id,
    });
  },
});

"use node";

import { action } from "../_generated/server";
import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import {
  OLD_RD_MAX_FILE_SIZE,
  OLD_RD_ALLOWED_EXTENSIONS,
} from "../lib/constraints";
import { extractTextFromBuffer, getFileExtension } from "./extract";

const MAX_EXTRACTED_TEXT_BYTES = 800_000;

export const uploadOldRd = action({
  args: {
    project_id: v.id("projects"),
    file_id: v.id("_storage"),
    filename: v.string(),
  },
  handler: async (ctx, args) => {
    const project = await ctx.runQuery(
      internal.knowledge.queries._getProjectForOldRd,
      { project_id: args.project_id },
    );

    const metadata = await ctx.runQuery(
      internal.knowledge.queries._getFileMetadata,
      { file_id: args.file_id },
    );
    if (!metadata) throw new ConvexError("File not found");
    if ((metadata.size ?? 0) > OLD_RD_MAX_FILE_SIZE) {
      throw new ConvexError(
        `File too large. Maximum size is ${OLD_RD_MAX_FILE_SIZE / 1024 / 1024}MB`,
      );
    }

    const extension = getFileExtension(args.filename);
    if (!OLD_RD_ALLOWED_EXTENSIONS.includes(extension)) {
      throw new ConvexError(
        `Unsupported file type: ${extension}. Allowed: ${OLD_RD_ALLOWED_EXTENSIONS.join(", ")}`,
      );
    }

    const blob = await ctx.storage.get(args.file_id);
    if (!blob) throw new ConvexError("File not found in storage");
    const buffer = Buffer.from(await blob.arrayBuffer());
    const text = await extractTextFromBuffer(buffer, extension);

    if (Buffer.byteLength(text, "utf-8") > MAX_EXTRACTED_TEXT_BYTES) {
      throw new ConvexError(
        `Extracted text is too large (${Math.round(Buffer.byteLength(text, "utf-8") / 1024)}KB). Maximum is ${Math.round(MAX_EXTRACTED_TEXT_BYTES / 1024)}KB.`,
      );
    }

    await ctx.runMutation(internal.knowledge.internal._patchOldRd, {
      project_id: args.project_id,
      old_rd_extracted_text: text,
      old_rd_file_id: args.file_id,
    });

    if (project?.old_rd_file_id) {
      try {
        await ctx.storage.delete(project.old_rd_file_id);
      } catch {}
    }
  },
});

export const removeOldRd = action({
  args: {
    project_id: v.id("projects"),
  },
  handler: async (ctx, args) => {
    const project = await ctx.runQuery(
      internal.knowledge.queries._getProjectForOldRd,
      { project_id: args.project_id },
    );

    await ctx.runMutation(internal.knowledge.internal._clearOldRd, {
      project_id: args.project_id,
    });

    if (project?.old_rd_file_id) {
      try {
        await ctx.storage.delete(project.old_rd_file_id);
      } catch {}
    }
  },
});

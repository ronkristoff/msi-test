import { query, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { getOptionalOwnedEntity, getOwnedEntity } from "../lib/requireAuth";
import { OLD_RD_PREVIEW_LENGTH } from "../lib/constraints";

type FileMetadata = {
  _id: string;
  _creationTime: number;
  contentType?: string;
  sha256: string;
  size: number;
};

export const getProjectRepo = query({
  args: {
    project_id: v.id("projects"),
  },
  handler: async (ctx, args) => {
    const result = await getOptionalOwnedEntity(ctx, args.project_id, "projects");
    if (!result) return null;
    const { entity: project } = result;
    return {
      repo_url: project.repo_url ?? null,
      kb_status: project.kb_status ?? null,
    };
  },
});

export const _getProjectForOldRd = internalQuery({
  args: {
    project_id: v.id("projects"),
  },
  handler: async (ctx, args) => {
    const { entity: project } = await getOwnedEntity(ctx, args.project_id, "projects");
    return {
      old_rd_file_id: project.old_rd_file_id ?? null,
    };
  },
});

export const _getFileMetadata = internalQuery({
  args: {
    file_id: v.id("_storage"),
  },
  handler: async (ctx, args): Promise<FileMetadata | null> => {
    return await ctx.db.system.get("_storage", args.file_id);
  },
});

export const getOldRd = query({
  args: {
    project_id: v.id("projects"),
  },
  handler: async (ctx, args) => {
    const result = await getOptionalOwnedEntity(ctx, args.project_id, "projects");
    if (!result) return null;
    const { entity: project } = result;
    if (!project.old_rd_file_id) return null;
    return {
      file_id: project.old_rd_file_id,
      extracted_text_preview: (project.old_rd_extracted_text ?? "").slice(
        0,
        OLD_RD_PREVIEW_LENGTH,
      ),
      has_old_rd: true,
    };
  },
});

export const getIngestionProgress = query({
  args: {
    project_id: v.id("projects"),
  },
  handler: async (ctx, args) => {
    const result = await getOptionalOwnedEntity(ctx, args.project_id, "projects");
    if (!result) return null;

    const kb = await ctx.db
      .query("knowledge_bases")
      .withIndex("by_project_id", (q) => q.eq("project_id", args.project_id))
      .order("desc")
      .first();

    if (!kb) return null;
    if (kb.workspace_id !== result.entity.workspace_id) return null;

    return {
      kb_status: result.entity.kb_status ?? null,
      status: kb.status,
      progress_message: kb.progress_message ?? null,
      error_message: kb.error_message ?? null,
      total_files: kb.total_files ?? 0,
      total_size_bytes: kb.total_size_bytes ?? 0,
    };
  },
});

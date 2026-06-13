import { internalMutation, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { getOwnedEntity } from "../lib/requireAuth";
import type { Doc, Id } from "../_generated/dataModel";
import { ConvexError } from "convex/values";
import { MAX_EMBEDDING_CHUNKS } from "../lib/constraints";

export const _patchProjectRepo = internalMutation({
  args: {
    project_id: v.id("projects"),
    repo_url: v.string(),
    encrypted_pat: v.string(),
    kb_status: v.union(
      v.literal("none"),
      v.literal("building"),
      v.literal("ready"),
      v.literal("error"),
    ),
  },
  handler: async (ctx, args) => {
    await getOwnedEntity(ctx, args.project_id, "projects");
    await ctx.db.patch(args.project_id, {
      repo_url: args.repo_url,
      encrypted_pat: args.encrypted_pat,
      kb_status: args.kb_status,
    });
  },
});

export const _clearProjectRepo = internalMutation({
  args: {
    project_id: v.id("projects"),
  },
  handler: async (ctx, args) => {
    await getOwnedEntity(ctx, args.project_id, "projects");
    await ctx.db.patch(args.project_id, {
      repo_url: undefined,
      encrypted_pat: undefined,
      kb_status: "none",
    });
  },
});

export const _patchOldRd = internalMutation({
  args: {
    project_id: v.id("projects"),
    old_rd_extracted_text: v.string(),
    old_rd_file_id: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    await getOwnedEntity(ctx, args.project_id, "projects");
    await ctx.db.patch(args.project_id, {
      old_rd_extracted_text: args.old_rd_extracted_text,
      old_rd_file_id: args.old_rd_file_id,
    });
  },
});

export const _clearOldRd = internalMutation({
  args: {
    project_id: v.id("projects"),
  },
  handler: async (ctx, args) => {
    await getOwnedEntity(ctx, args.project_id, "projects");
    await ctx.db.patch(args.project_id, {
      old_rd_extracted_text: undefined,
      old_rd_file_id: undefined,
    });
  },
});

export const _createKnowledgeBase = internalMutation({
  args: {
    workspace_id: v.id("workspaces"),
    project_id: v.id("projects"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("knowledge_bases", {
      workspace_id: args.workspace_id,
      project_id: args.project_id,
      status: "building",
    });
  },
});

export const _updateKbStatus = internalMutation({
  args: {
    knowledge_base_id: v.id("knowledge_bases"),
    project_id: v.id("projects"),
    status: v.union(v.literal("building"), v.literal("ready"), v.literal("error")),
    progress_message: v.optional(v.string()),
    error_message: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const kb = await ctx.db.get(args.knowledge_base_id);
    if (!kb) {
      throw new ConvexError("Knowledge base not found");
    }
    await ctx.db.patch(args.knowledge_base_id, {
      status: args.status,
      progress_message: args.progress_message,
      error_message: args.error_message,
    });
    await ctx.db.patch(args.project_id, {
      kb_status: args.status,
    });
  },
});

export const _deleteChunksByKb = internalMutation({
  args: {
    knowledge_base_id: v.id("knowledge_bases"),
  },
  handler: async (ctx, args) => {
    let deletedCount = 0;
    const BATCH_SIZE = 100;
    let hasMore = true;

    while (hasMore) {
      const chunks = await ctx.db
        .query("code_chunks")
        .withIndex("by_knowledge_base_id", (q) =>
          q.eq("knowledge_base_id", args.knowledge_base_id),
        )
        .take(BATCH_SIZE);

      if (chunks.length === 0) {
        hasMore = false;
        break;
      }

      for (const chunk of chunks) {
        await ctx.db.delete(chunk._id);
        deletedCount++;
      }

      if (chunks.length < BATCH_SIZE) {
        hasMore = false;
      }
    }

    return deletedCount;
  },
});

export const _insertChunks = internalMutation({
  args: {
    chunks: v.array(
      v.object({
        workspace_id: v.id("workspaces"),
        knowledge_base_id: v.id("knowledge_bases"),
        project_id: v.id("projects"),
        file_path: v.string(),
        directory: v.string(),
        content: v.string(),
        chunk_index: v.number(),
        language: v.optional(v.string()),
        char_count: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const ids: Id<"code_chunks">[] = [];
    for (const chunk of args.chunks) {
      const id = await ctx.db.insert("code_chunks", chunk);
      ids.push(id);
    }
    return ids;
  },
});

export const _updateKbStats = internalMutation({
  args: {
    knowledge_base_id: v.id("knowledge_bases"),
    total_files: v.number(),
    total_size_bytes: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.knowledge_base_id, {
      total_files: args.total_files,
      total_size_bytes: args.total_size_bytes,
    });
  },
});

export const _getProjectForIngestion = internalQuery({
  args: {
    project_id: v.id("projects"),
  },
  handler: async (ctx, args) => {
    const project: Doc<"projects"> | null = await ctx.db.get(args.project_id);
    if (!project) return null;
    return {
      project_id: project._id,
      workspace_id: project.workspace_id,
      repo_url: project.repo_url ?? null,
      encrypted_pat: project.encrypted_pat ?? null,
      kb_status: project.kb_status ?? "none",
    };
  },
});

export const _getKnowledgeBaseForProject = internalQuery({
  args: {
    project_id: v.id("projects"),
  },
  handler: async (ctx, args) => {
    const kb = await ctx.db
      .query("knowledge_bases")
      .withIndex("by_project_id", (q) => q.eq("project_id", args.project_id))
      .first();
    return kb;
  },
});

export const _getMembershipForUser = internalQuery({
  args: {
    user_id: v.string(),
  },
  handler: async (ctx, args) => {
    const membership = await ctx.db
      .query("workspace_members")
      .withIndex("by_user_id", (q) => q.eq("user_id", args.user_id))
      .first();
    if (!membership) return null;
    const workspace = await ctx.db.get(membership.workspace_id);
    if (!workspace) return null;
    return {
      user_id: membership.user_id,
      workspace_id: workspace._id,
      role: membership.role,
    };
  },
});

export const _setLastSyncedAt = internalMutation({
  args: {
    knowledge_base_id: v.id("knowledge_bases"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.knowledge_base_id, {
      last_synced_at: Date.now(),
    });
  },
});

export const _getChunksForEmbedding = internalQuery({
  args: {
    knowledge_base_id: v.id("knowledge_bases"),
  },
  handler: async (ctx, args) => {
    return ctx.db
      .query("code_chunks")
      .withIndex("by_knowledge_base_id", (q) =>
        q.eq("knowledge_base_id", args.knowledge_base_id),
      )
      .take(MAX_EMBEDDING_CHUNKS);
  },
});

export const _getWorkspaceAiConfig = internalQuery({
  args: {
    workspace_id: v.id("workspaces"),
  },
  handler: async (ctx, args) => {
    const workspace = await ctx.db.get(args.workspace_id);
    if (!workspace) return null;
    return {
      ai_config: workspace.ai_config,
    };
  },
});

export const _handleIngestionComplete = internalMutation({
  args: {
    workflowId: v.string(),
    context: v.object({
      knowledge_base_id: v.id("knowledge_bases"),
      project_id: v.id("projects"),
    }),
    result: v.union(
      v.object({
        kind: v.literal("success"),
        returnValue: v.any(),
      }),
      v.object({
        kind: v.literal("failed"),
        error: v.string(),
      }),
      v.object({
        kind: v.literal("canceled"),
      }),
    ),
  },
  handler: async (ctx, args) => {
    if (args.result.kind !== "failed") return;

    const kb = await ctx.db.get(args.context.knowledge_base_id);
    if (!kb) return;
    if (kb.status !== "building") return;

    await ctx.db.patch(args.context.knowledge_base_id, {
      status: "error",
      error_message: args.result.error || "Ingestion workflow failed",
      progress_message: undefined,
    });
    await ctx.db.patch(args.context.project_id, {
      kb_status: "error",
    });
  },
});

export const _storeArchitectureSummary = internalMutation({
  args: {
    knowledge_base_id: v.id("knowledge_bases"),
    architecture_summary: v.string(),
    tech_stack: v.array(v.string()),
    folder_structure: v.string(),
    architecture_type: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.knowledge_base_id, {
      architecture_summary: args.architecture_summary,
      tech_stack: args.tech_stack,
      folder_structure: args.folder_structure,
      architecture_type: args.architecture_type,
    });
  },
});

export const _storeModules = internalMutation({
  args: {
    knowledge_base_id: v.id("knowledge_bases"),
    workspace_id: v.id("workspaces"),
    modules: v.array(
      v.object({
        name: v.string(),
        description: v.optional(v.string()),
        file_count: v.optional(v.number()),
        files: v.optional(v.array(v.string())),
        apis: v.optional(v.any()),
        data_models: v.optional(v.any()),
        user_flows: v.optional(v.any()),
        dependencies: v.optional(v.array(v.string())),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const ids: Id<"kb_modules">[] = [];
    for (const mod of args.modules) {
      const id = await ctx.db.insert("kb_modules", {
        knowledge_base_id: args.knowledge_base_id,
        workspace_id: args.workspace_id,
        ...mod,
      });
      ids.push(id);
    }
    return ids;
  },
});

export const _deleteModulesByKb = internalMutation({
  args: {
    knowledge_base_id: v.id("knowledge_bases"),
  },
  handler: async (ctx, args) => {
    let deletedCount = 0;
    const BATCH_SIZE = 100;
    let hasMore = true;

    while (hasMore) {
      const modules = await ctx.db
        .query("kb_modules")
        .withIndex("by_knowledge_base_id", (q) =>
          q.eq("knowledge_base_id", args.knowledge_base_id),
        )
        .take(BATCH_SIZE);

      if (modules.length === 0) {
        hasMore = false;
        break;
      }

      for (const mod of modules) {
        await ctx.db.delete(mod._id);
        deletedCount++;
      }

      if (modules.length < BATCH_SIZE) {
        hasMore = false;
      }
    }

    return deletedCount;
  },
});

export const _getChunksForExtraction = internalQuery({
  args: {
    knowledge_base_id: v.id("knowledge_bases"),
  },
  handler: async (ctx, args) => {
    const chunks = await ctx.db
      .query("code_chunks")
      .withIndex("by_knowledge_base_id", (q) =>
        q.eq("knowledge_base_id", args.knowledge_base_id),
      )
      .take(MAX_EMBEDDING_CHUNKS);

    const seen = new Set<string>();
    return chunks.filter((c) => {
      if (seen.has(c.file_path)) return false;
      seen.add(c.file_path);
      return true;
    });
  },
});

export const _getKbForExtraction = internalQuery({
  args: {
    knowledge_base_id: v.id("knowledge_bases"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.knowledge_base_id);
  },
});

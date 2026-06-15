import { internalMutation, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { getOwnedEntity, requireAuth, getOwnerId } from "../lib/requireAuth";
import type { Doc, Id } from "../_generated/dataModel";
import { ConvexError } from "convex/values";
import { MAX_EMBEDDING_CHUNKS, RD_ERROR_MESSAGE_MAX_LENGTH, DRIFT_ERROR_MESSAGE_MAX_LENGTH } from "../lib/constraints";
import { driftItemValidator, rdSectionValidator } from "../lib/validation";

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
      old_rd_extracted_text: project.old_rd_extracted_text ?? null,
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
      .order("desc")
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

export const _getAuthMembership = internalQuery({
  args: {},
  handler: async (ctx) => {
    const user = await requireAuth(ctx);
    const userId = getOwnerId(user);
    const membership = await ctx.db
      .query("workspace_members")
      .withIndex("by_user_id", (q) => q.eq("user_id", userId))
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

export const _resetKbForResync = internalMutation({
  args: {
    knowledge_base_id: v.id("knowledge_bases"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.knowledge_base_id, {
      architecture_summary: undefined,
      tech_stack: undefined,
      folder_structure: undefined,
      architecture_type: undefined,
      total_files: undefined,
      total_size_bytes: undefined,
      error_message: undefined,
      progress_message: undefined,
      bmad_detected: undefined,
      bmad_parsed_at: undefined,
    });
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

export const _storeBmadMetadata = internalMutation({
  args: {
    kb_id: v.id("knowledge_bases"),
    workspace_id: v.id("workspaces"),
    entries: v.array(
      v.object({
        type: v.union(
          v.literal("prd_section"),
          v.literal("adr"),
          v.literal("convention"),
          v.literal("domain_term"),
        ),
        key: v.string(),
        content: v.string(),
        source_path: v.string(),
        metadata: v.optional(v.any()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const ids: Id<"kb_bmad_metadata">[] = [];
    for (const entry of args.entries) {
      const id = await ctx.db.insert("kb_bmad_metadata", {
        kb_id: args.kb_id,
        workspace_id: args.workspace_id,
        ...entry,
      });
      ids.push(id);
    }
    return ids;
  },
});

export const _deleteBmadMetadataByKb = internalMutation({
  args: {
    knowledge_base_id: v.id("knowledge_bases"),
  },
  handler: async (ctx, args) => {
    let deletedCount = 0;
    const BATCH_SIZE = 100;
    let hasMore = true;

    while (hasMore) {
      const items = await ctx.db
        .query("kb_bmad_metadata")
        .withIndex("by_kb_id", (q) => q.eq("kb_id", args.knowledge_base_id))
        .take(BATCH_SIZE);

      if (items.length === 0) {
        hasMore = false;
        break;
      }

      for (const item of items) {
        await ctx.db.delete(item._id);
        deletedCount++;
      }

      if (items.length < BATCH_SIZE) {
        hasMore = false;
      }
    }

    return deletedCount;
  },
});

export const _setBmadDetected = internalMutation({
  args: {
    knowledge_base_id: v.id("knowledge_bases"),
    detected: v.boolean(),
  },
  handler: async (ctx, args) => {
    const patch: Record<string, unknown> = {
      bmad_detected: args.detected,
    };
    if (args.detected) {
      patch.bmad_parsed_at = Date.now();
    } else {
      patch.bmad_parsed_at = undefined;
    }
    await ctx.db.patch(args.knowledge_base_id, patch);
  },
});

export const _getBmadMetadataForExtraction = internalQuery({
  args: {
    knowledge_base_id: v.id("knowledge_bases"),
  },
  handler: async (ctx, args) => {
    const kb = await ctx.db.get(args.knowledge_base_id);
    if (!kb || !kb.bmad_detected) {
      return { detected: false, prdSections: "", adrs: "" };
    }

    const prdEntries = await ctx.db
      .query("kb_bmad_metadata")
      .withIndex("by_kb_id_and_type", (q) =>
        q.eq("kb_id", args.knowledge_base_id).eq("type", "prd_section"),
      )
      .collect();

    const adrEntries = await ctx.db
      .query("kb_bmad_metadata")
      .withIndex("by_kb_id_and_type", (q) =>
        q.eq("kb_id", args.knowledge_base_id).eq("type", "adr"),
      )
      .collect();

    const MAX_CONTEXT_CHARS = 20000;
    let prdSections = "";
    for (const e of prdEntries) {
      const chunk = `### ${e.key}\n${e.content}`;
      if ((prdSections + chunk).length > MAX_CONTEXT_CHARS) break;
      prdSections += (prdSections ? "\n\n" : "") + chunk;
    }

    let adrs = "";
    for (const e of adrEntries) {
      const meta = e.metadata as { title?: string; status?: string };
      const chunk = `- **${e.key}**: ${meta?.title ?? e.key} (${meta?.status ?? "Unknown"})\n${e.content}`;
      if ((adrs + chunk).length > MAX_CONTEXT_CHARS) break;
      adrs += (adrs ? "\n\n" : "") + chunk;
    }

    return { detected: true, prdSections, adrs };
  },
});

export const _getBmadMetadata = internalQuery({
  args: {
    knowledge_base_id: v.id("knowledge_bases"),
    workspace_id: v.id("workspaces"),
  },
  handler: async (ctx, args) => {
    const kb = await ctx.db.get(args.knowledge_base_id);
    if (!kb) return null;
    if (kb.workspace_id !== args.workspace_id) return null;

    const [prd_sections, adrs, conventions, domain_terms] = await Promise.all([
      ctx.db
        .query("kb_bmad_metadata")
        .withIndex("by_kb_id_and_type", (q) =>
          q.eq("kb_id", args.knowledge_base_id).eq("type", "prd_section"),
        )
        .collect(),
      ctx.db
        .query("kb_bmad_metadata")
        .withIndex("by_kb_id_and_type", (q) =>
          q.eq("kb_id", args.knowledge_base_id).eq("type", "adr"),
        )
        .collect(),
      ctx.db
        .query("kb_bmad_metadata")
        .withIndex("by_kb_id_and_type", (q) =>
          q.eq("kb_id", args.knowledge_base_id).eq("type", "convention"),
        )
        .collect(),
      ctx.db
        .query("kb_bmad_metadata")
        .withIndex("by_kb_id_and_type", (q) =>
          q.eq("kb_id", args.knowledge_base_id).eq("type", "domain_term"),
        )
        .collect(),
    ]);

    return { prd_sections, adrs, conventions, domain_terms };
  },
});

export const _storeBaselineRd = internalMutation({
  args: {
    project_id: v.id("projects"),
    workspace_id: v.id("workspaces"),
    knowledge_base_id: v.id("knowledge_bases"),
    sections: v.array(rdSectionValidator),
  },
  handler: async (ctx, args) => {
    const latest = await ctx.db
      .query("baseline_rds")
      .withIndex("by_project_id_and_version", (q) =>
        q.eq("project_id", args.project_id),
      )
      .order("desc")
      .first();
    const version = (latest?.version ?? 0) + 1;
    const _id = await ctx.db.insert("baseline_rds", {
      workspace_id: args.workspace_id,
      project_id: args.project_id,
      knowledge_base_id: args.knowledge_base_id,
      version,
      status: "draft",
      sections: args.sections,
      generated_at: Date.now(),
    });
    return { _id, version };
  },
});

export const _archiveBaselineRd = internalMutation({
  args: {
    project_id: v.id("projects"),
  },
  handler: async (ctx, args) => {
    let archivedCount = 0;
    let hasMore = true;
    while (hasMore) {
      const rds = await ctx.db
        .query("baseline_rds")
        .withIndex("by_project_id", (q) =>
          q.eq("project_id", args.project_id),
        )
        .filter((q) => q.neq(q.field("status"), "archived"))
        .take(100);

      if (rds.length === 0) {
        hasMore = false;
        break;
      }

      for (const rd of rds) {
        await ctx.db.patch(rd._id, { status: "archived" });
        archivedCount++;
      }

      hasMore = rds.length === 100;
    }
    return archivedCount;
  },
});

export const _getLatestRdVersion = internalQuery({
  args: {
    project_id: v.id("projects"),
  },
  handler: async (ctx, args) => {
    const latest = await ctx.db
      .query("baseline_rds")
      .withIndex("by_project_id_and_version", (q) =>
        q.eq("project_id", args.project_id),
      )
      .order("desc")
      .first();

    return latest?.version ?? 0;
  },
});

export const _getKbForBaselineRd = internalQuery({
  args: {
    knowledge_base_id: v.id("knowledge_bases"),
  },
  handler: async (ctx, args) => {
    const kb = await ctx.db.get(args.knowledge_base_id);
    if (!kb) return null;

    const project = await ctx.db.get(kb.project_id);

    const modules = await ctx.db
      .query("kb_modules")
      .withIndex("by_knowledge_base_id", (q) =>
        q.eq("knowledge_base_id", args.knowledge_base_id),
      )
      .take(200);

    return {
      knowledge_base_id: kb._id,
      workspace_id: kb.workspace_id,
      project_id: kb.project_id,
      architecture_summary: kb.architecture_summary ?? null,
      tech_stack: kb.tech_stack ?? null,
      architecture_type: kb.architecture_type ?? null,
      folder_structure: kb.folder_structure ?? null,
      bmad_detected: kb.bmad_detected ?? false,
      total_files: kb.total_files ?? 0,
      total_size_bytes: kb.total_size_bytes ?? 0,
      old_rd_extracted_text: project?.old_rd_extracted_text ?? null,
      modules: modules.map((m) => ({
        name: m.name,
        description: m.description,
        apis: m.apis,
        data_models: m.data_models,
        user_flows: m.user_flows,
      })),
    };
  },
});

export const _logBaselineRdFailure = internalMutation({
  args: {
    project_id: v.id("projects"),
    workspace_id: v.id("workspaces"),
    knowledge_base_id: v.id("knowledge_bases"),
    error_message: v.string(),
  },
  handler: async (ctx, args) => {
    const truncated = args.error_message.slice(0, RD_ERROR_MESSAGE_MAX_LENGTH);
    const latest = await ctx.db
      .query("baseline_rds")
      .withIndex("by_project_id_and_version", (q) =>
        q.eq("project_id", args.project_id),
      )
      .order("desc")
      .first();
    const version = (latest?.version ?? 0) + 1;
    const _id = await ctx.db.insert("baseline_rds", {
      workspace_id: args.workspace_id,
      project_id: args.project_id,
      knowledge_base_id: args.knowledge_base_id,
      version,
      status: "failed",
      sections: [],
      rd_generation_error: truncated,
      generated_at: Date.now(),
    });
    return { _id, version };
  },
});

export const _storeDriftReport = internalMutation({
  args: {
    project_id: v.id("projects"),
    workspace_id: v.id("workspaces"),
    knowledge_base_id: v.id("knowledge_bases"),
    baseline_rd_id: v.id("baseline_rds"),
    baseline_rd_version: v.optional(v.number()),
    bmad_detected: v.boolean(),
    items: v.array(driftItemValidator),
  },
  handler: async (ctx, args) => {
    const latest = await ctx.db
      .query("drift_reports")
      .withIndex("by_project_id_and_version", (q) =>
        q.eq("project_id", args.project_id),
      )
      .order("desc")
      .first();
    const version = (latest?.version ?? 0) + 1;
    const _id = await ctx.db.insert("drift_reports", {
      workspace_id: args.workspace_id,
      project_id: args.project_id,
      knowledge_base_id: args.knowledge_base_id,
      baseline_rd_id: args.baseline_rd_id,
      baseline_rd_version: args.baseline_rd_version,
      version,
      status: "draft",
      items: args.items,
      bmad_detected: args.bmad_detected,
      generated_at: Date.now(),
    });
    return { _id, version };
  },
});

export const _archiveDriftReport = internalMutation({
  args: {
    project_id: v.id("projects"),
  },
  handler: async (ctx, args) => {
    let archivedCount = 0;
    let hasMore = true;
    while (hasMore) {
      const reports = await ctx.db
        .query("drift_reports")
        .withIndex("by_project_id", (q) =>
          q.eq("project_id", args.project_id),
        )
        .filter((q) => q.neq(q.field("status"), "archived"))
        .take(100);

      if (reports.length === 0) {
        hasMore = false;
        break;
      }

      for (const report of reports) {
        await ctx.db.patch(report._id, { status: "archived" });
        archivedCount++;
      }

      hasMore = reports.length === 100;
    }
    return archivedCount;
  },
});

export const _getLatestDriftVersion = internalQuery({
  args: {
    project_id: v.id("projects"),
  },
  handler: async (ctx, args) => {
    const latest = await ctx.db
      .query("drift_reports")
      .withIndex("by_project_id_and_version", (q) =>
        q.eq("project_id", args.project_id),
      )
      .order("desc")
      .first();
    return latest?.version ?? 0;
  },
});

export const _logDriftReportFailure = internalMutation({
  args: {
    project_id: v.id("projects"),
    workspace_id: v.id("workspaces"),
    knowledge_base_id: v.id("knowledge_bases"),
    baseline_rd_id: v.id("baseline_rds"),
    bmad_detected: v.boolean(),
    error_message: v.string(),
  },
  handler: async (ctx, args) => {
    const truncated = args.error_message.slice(0, DRIFT_ERROR_MESSAGE_MAX_LENGTH);
    const latest = await ctx.db
      .query("drift_reports")
      .withIndex("by_project_id_and_version", (q) =>
        q.eq("project_id", args.project_id),
      )
      .order("desc")
      .first();
    const version = (latest?.version ?? 0) + 1;
    const _id = await ctx.db.insert("drift_reports", {
      workspace_id: args.workspace_id,
      project_id: args.project_id,
      knowledge_base_id: args.knowledge_base_id,
      baseline_rd_id: args.baseline_rd_id,
      version,
      status: "failed",
      items: [],
      bmad_detected: args.bmad_detected,
      generation_error: truncated,
      generated_at: Date.now(),
    });
    return { _id, version };
  },
});

export const _getBmadMetadataForDrift = internalQuery({
  args: {
    knowledge_base_id: v.id("knowledge_bases"),
  },
  handler: async (ctx, args) => {
    const kb = await ctx.db.get(args.knowledge_base_id);
    if (!kb || !kb.bmad_detected) {
      return { detected: false, prdSections: "", adrs: "", conventions: "" };
    }

    const [prdEntries, adrEntries, conventionEntries] = await Promise.all([
      ctx.db
        .query("kb_bmad_metadata")
        .withIndex("by_kb_id_and_type", (q) =>
          q.eq("kb_id", args.knowledge_base_id).eq("type", "prd_section"),
        )
        .collect(),
      ctx.db
        .query("kb_bmad_metadata")
        .withIndex("by_kb_id_and_type", (q) =>
          q.eq("kb_id", args.knowledge_base_id).eq("type", "adr"),
        )
        .collect(),
      ctx.db
        .query("kb_bmad_metadata")
        .withIndex("by_kb_id_and_type", (q) =>
          q.eq("kb_id", args.knowledge_base_id).eq("type", "convention"),
        )
        .collect(),
    ]);

    const MAX_CONTEXT_CHARS = 20000;

    let prdSections = "";
    for (const e of prdEntries) {
      const chunk = `### ${e.key}\n${e.content}`;
      if ((prdSections + chunk).length > MAX_CONTEXT_CHARS) break;
      prdSections += (prdSections ? "\n\n" : "") + chunk;
    }

    let adrs = "";
    for (const e of adrEntries) {
      const meta = e.metadata as { title?: string; status?: string };
      const chunk = `- **${e.key}**: ${meta?.title ?? e.key} (${meta?.status ?? "Unknown"})\n${e.content}`;
      if ((adrs + chunk).length > MAX_CONTEXT_CHARS) break;
      adrs += (adrs ? "\n\n" : "") + chunk;
    }

    let conventions = "";
    for (const e of conventionEntries) {
      const chunk = `### ${e.key}\n${e.content}`;
      if ((conventions + chunk).length > MAX_CONTEXT_CHARS) break;
      conventions += (conventions ? "\n\n" : "") + chunk;
    }

    return { detected: true, prdSections, adrs, conventions };
  },
});

export const _getKbForDriftReport = internalQuery({
  args: {
    knowledge_base_id: v.id("knowledge_bases"),
    baseline_rd_id: v.id("baseline_rds"),
  },
  handler: async (ctx, args) => {
    const kb = await ctx.db.get(args.knowledge_base_id);
    if (!kb) return null;

    const project = await ctx.db.get(kb.project_id);
    if (!project) return null;

    const baselineRd: Doc<"baseline_rds"> | null = await ctx.db.get(
      args.baseline_rd_id,
    );

    let baselineRdShape:
      | { sections: { id: string; title: string; content: string }[]; version: number }
      | null = null;
    if (
      baselineRd &&
      baselineRd.project_id === kb.project_id &&
      baselineRd.status !== "archived" &&
      baselineRd.status !== "failed"
    ) {
      baselineRdShape = {
        sections: baselineRd.sections.map((s) => ({
          id: s.id,
          title: s.title,
          content: s.content,
        })),
        version: baselineRd.version,
      };
    }

    return {
      knowledge_base_id: kb._id,
      workspace_id: kb.workspace_id,
      project_id: kb.project_id,
      old_rd_extracted_text: project.old_rd_extracted_text ?? null,
      baseline_rd: baselineRdShape,
      bmad_detected: kb.bmad_detected ?? false,
      architecture_summary: kb.architecture_summary ?? null,
      tech_stack: kb.tech_stack ?? null,
      architecture_type: kb.architecture_type ?? null,
      folder_structure: kb.folder_structure ?? null,
      total_files: kb.total_files ?? 0,
      total_size_bytes: kb.total_size_bytes ?? 0,
    };
  },
});

export const _getLatestBaselineRdForDrift = internalQuery({
  args: {
    project_id: v.id("projects"),
  },
  handler: async (ctx, args) => {
    const rds = await ctx.db
      .query("baseline_rds")
      .withIndex("by_project_id_and_version", (q) =>
        q.eq("project_id", args.project_id),
      )
      .order("desc")
      .take(10);
    const rd = rds.find((r) => r.status !== "archived" && r.status !== "failed");
    if (!rd) return null;
    return { _id: rd._id, project_id: rd.project_id };
  },
});

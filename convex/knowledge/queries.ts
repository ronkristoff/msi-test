import { query, internalQuery, action } from "../_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { getOptionalOwnedEntity, getOwnedEntity, getOptionalMemberWorkspace } from "../lib/requireAuth";
import {
  OLD_RD_PREVIEW_LENGTH,
  EMBEDDING_MAX_QUERY_LENGTH,
  EMBEDDING_SEARCH_MIN_LIMIT,
  EMBEDDING_SEARCH_MAX_LIMIT,
} from "../lib/constraints";
import { createProjectRag, getProjectNamespace } from "./rag";
import { internal } from "../_generated/api";

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

export const getKnowledgeBase = query({
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

    return kb;
  },
});

export const getModules = query({
  args: {
    knowledge_base_id: v.id("knowledge_bases"),
  },
  handler: async (ctx, args) => {
    const memberWorkspace = await getOptionalMemberWorkspace(ctx);
    if (!memberWorkspace) return null;

    const kb = await ctx.db.get(args.knowledge_base_id);
    if (!kb) return null;
    if (kb.workspace_id !== memberWorkspace.workspace._id) return null;

    const modules = await ctx.db
      .query("kb_modules")
      .withIndex("by_knowledge_base_id", (q) =>
        q.eq("knowledge_base_id", args.knowledge_base_id),
      )
      .collect();

    return modules.map((m) => ({
      _id: m._id,
      name: m.name,
      description: m.description ?? null,
      file_count: m.file_count ?? 0,
      dependencies: m.dependencies ?? [],
    }));
  },
});

export const getBaselineRd = query({
  args: {
    project_id: v.id("projects"),
  },
  handler: async (ctx, args) => {
    const memberWorkspace = await getOptionalMemberWorkspace(ctx);
    if (!memberWorkspace) return null;

    const project = await ctx.db.get(args.project_id);
    if (!project) return null;
    if (project.workspace_id !== memberWorkspace.workspace._id) return null;

    const rds = await ctx.db
      .query("baseline_rds")
      .withIndex("by_project_id_and_version", (q) =>
        q.eq("project_id", args.project_id),
      )
      .order("desc")
      .take(10);

    const rd = rds.find((r) => r.status !== "archived" && r.status !== "failed");
    if (!rd) return null;

    return {
      _id: rd._id,
      _creationTime: rd._creationTime,
      project_id: rd.project_id,
      knowledge_base_id: rd.knowledge_base_id,
      version: rd.version,
      status: rd.status,
      sections: rd.sections,
      generated_at: rd.generated_at,
      updated_at: rd.updated_at,
    };
  },
});

export const getModule = query({
  args: {
    module_id: v.id("kb_modules"),
  },
  handler: async (ctx, args) => {
    const memberWorkspace = await getOptionalMemberWorkspace(ctx);
    if (!memberWorkspace) return null;

    const mod = await ctx.db.get(args.module_id);
    if (!mod) return null;
    if (mod.workspace_id !== memberWorkspace.workspace._id) return null;

    return mod;
  },
});

export const getBmadMetadata = query({
  args: {
    knowledge_base_id: v.id("knowledge_bases"),
  },
  handler: async (ctx, args) => {
    const memberWorkspace = await getOptionalMemberWorkspace(ctx);
    if (!memberWorkspace) return null;

    const kb = await ctx.db.get(args.knowledge_base_id);
    if (!kb || kb.workspace_id !== memberWorkspace.workspace._id) return null;

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

export const _getProjectWorkspaceForSearch = internalQuery({
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
      workspace_id: result.entity.workspace_id,
      kb_status: kb.status,
    };
  },
});

export const searchProjectRag = action({
  args: {
    project_id: v.id("projects"),
    query_string: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    if (!args.query_string || args.query_string.length > EMBEDDING_MAX_QUERY_LENGTH) {
      throw new ConvexError(
        `Query must be between 1 and ${EMBEDDING_MAX_QUERY_LENGTH} characters.`,
      );
    }

    const clampedLimit = Math.max(
      EMBEDDING_SEARCH_MIN_LIMIT,
      Math.min(args.limit ?? 10, EMBEDDING_SEARCH_MAX_LIMIT),
    );

    const projectInfo = await ctx.runQuery(
      internal.knowledge.queries._getProjectWorkspaceForSearch,
      { project_id: args.project_id },
    );

    if (!projectInfo || projectInfo.kb_status !== "ready") {
      return null;
    }

    const workspace = await ctx.runQuery(
      internal.knowledge.internal._getWorkspaceAiConfig,
      { workspace_id: projectInfo.workspace_id },
    );

    if (!workspace?.ai_config) {
      return null;
    }

    const rag = createProjectRag({
      endpoint_url: workspace.ai_config.endpoint_url,
      api_key: workspace.ai_config.api_key,
    });
    const namespace = getProjectNamespace(args.project_id);

    try {
      const { results, text } = await rag.search(ctx, {
        namespace,
        query: args.query_string,
        limit: clampedLimit,
      });

      return { results, text };
    } catch {
      throw new ConvexError(
        "Search failed. The AI provider may be unavailable. Check your workspace AI configuration.",
      );
    }
  },
});

import { query, internalQuery, action } from "../_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { getOptionalOwnedEntity, getOwnedEntity, getOptionalMemberWorkspace } from "../lib/requireAuth";
import type { Id } from "../_generated/dataModel";
import {
  OLD_RD_PREVIEW_LENGTH,
  EMBEDDING_MAX_QUERY_LENGTH,
  EMBEDDING_SEARCH_MIN_LIMIT,
  EMBEDDING_SEARCH_MAX_LIMIT,
  CHAT_RAG_RATE_LIMIT_PER_MINUTE,
} from "../lib/constraints";
import { createProjectRag, getProjectNamespace } from "./rag";
import { components, internal } from "../_generated/api";
import { RateLimiter, MINUTE } from "@convex-dev/rate-limiter";

type FileMetadata = {
  _id: string;
  _creationTime: number;
  contentType?: string;
  sha256: string;
  size: number;
};

const rateLimiter = new RateLimiter(components.rateLimiter, {
  ragSearchPerWorkspace: {
    kind: "fixed window",
    rate: CHAT_RAG_RATE_LIMIT_PER_MINUTE,
    period: MINUTE,
  },
});

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

export type StaleTestResult = {
  _id: Id<"tests">;
  name: string;
  suite_id: Id<"suites">;
  suite_name: string;
  module_name: string;
  reason: "changed" | "removed";
};

export const getStaleTests = query({
  args: {
    project_id: v.id("projects"),
  },
  handler: async (ctx, args): Promise<StaleTestResult[]> => {
    const owned = await getOptionalOwnedEntity(ctx, args.project_id, "projects");
    if (!owned) return [];

    const kb = await ctx.db
      .query("knowledge_bases")
      .withIndex("by_project_id", (q) => q.eq("project_id", args.project_id))
      .order("desc")
      .first();
    if (!kb || kb.status !== "ready" || !kb.module_diff) return [];

    const flagEntries: Array<{ name: string; reason: "changed" | "removed" }> = [
      ...kb.module_diff.removed.map((name) => ({ name, reason: "removed" as const })),
      ...kb.module_diff.changed.map((name) => ({ name, reason: "changed" as const })),
    ];
    if (flagEntries.length === 0) return [];

    const flagMap = new Map<string, "changed" | "removed">();
    for (const e of flagEntries) {
      const key = e.name.trim().toLowerCase();
      if (!flagMap.has(key)) flagMap.set(key, e.reason);
    }
    if (flagMap.size === 0) return [];

    const explorations = await ctx.db
      .query("explorations")
      .withIndex("by_project_id", (q) => q.eq("project_id", args.project_id))
      .collect();

    const matchingExplorations = new Map<
      string,
      { module_name: string; reason: "changed" | "removed" }
    >();
    for (const expl of explorations) {
      const scenarios = expl.proposed_scenarios ?? [];
      for (const scenario of scenarios) {
        if (!scenario.kb_module) continue;
        const key = scenario.kb_module.trim().toLowerCase();
        const reason = flagMap.get(key);
        if (reason) {
          const existing = matchingExplorations.get(expl._id);
          if (!existing) {
            matchingExplorations.set(expl._id, {
              module_name: scenario.kb_module,
              reason,
            });
          }
          break;
        }
      }
    }
    if (matchingExplorations.size === 0) return [];

    const allSuites = await ctx.db
      .query("suites")
      .withIndex("by_project_id", (q) => q.eq("project_id", args.project_id))
      .collect();

    const matchingSuites: Array<{
      _id: Id<"suites">;
      name: string;
      match: { module_name: string; reason: "changed" | "removed" };
    }> = [];
    for (const suite of allSuites) {
      if (!suite.exploration_id) continue;
      const match = matchingExplorations.get(suite.exploration_id);
      if (!match) continue;
      matchingSuites.push({ _id: suite._id, name: suite.name, match });
    }
    if (matchingSuites.length === 0) return [];

    const allTests = await ctx.db
      .query("tests")
      .withIndex("by_workspace_id", (q) => q.eq("workspace_id", owned.workspace._id))
      .collect();

    const testsBySuite = new Map<Id<"suites">, typeof allTests>();
    for (const test of allTests) {
      const list = testsBySuite.get(test.suite_id);
      if (list) {
        list.push(test);
      } else {
        testsBySuite.set(test.suite_id, [test]);
      }
    }

    const results = new Map<string, StaleTestResult>();
    for (const suite of matchingSuites) {
      const suiteTests = testsBySuite.get(suite._id);
      if (!suiteTests) continue;
      for (const test of suiteTests) {
        if (results.has(test._id)) continue;
        results.set(test._id, {
          _id: test._id,
          name: test.name,
          suite_id: suite._id,
          suite_name: suite.name,
          module_name: suite.match.module_name,
          reason: suite.match.reason,
        });
      }
    }

    return Array.from(results.values());
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

export const getDriftReport = query({
  args: {
    project_id: v.id("projects"),
  },
  handler: async (ctx, args) => {
    const memberWorkspace = await getOptionalMemberWorkspace(ctx);
    if (!memberWorkspace) return null;

    const project = await ctx.db.get(args.project_id);
    if (!project) return null;
    if (project.workspace_id !== memberWorkspace.workspace._id) return null;

    const reports = await ctx.db
      .query("drift_reports")
      .withIndex("by_project_id_and_version", (q) =>
        q.eq("project_id", args.project_id),
      )
      .order("desc")
      .take(10);

    const report = reports.find((r) => r.status !== "archived");
    if (!report) return null;

    return {
      _id: report._id,
      _creationTime: report._creationTime,
      project_id: report.project_id,
      knowledge_base_id: report.knowledge_base_id,
      baseline_rd_id: report.baseline_rd_id,
      baseline_rd_version: report.baseline_rd_version,
      version: report.version,
      status: report.status,
      items: report.items,
      bmad_detected: report.bmad_detected,
      generation_error: report.generation_error,
      generated_at: report.generated_at,
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

    await rateLimiter.limit(ctx, "ragSearchPerWorkspace", {
      key: projectInfo.workspace_id,
      throws: true,
    });

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

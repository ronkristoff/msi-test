import type { QueryCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";

export async function readExistingTestsLogic(
  ctx: QueryCtx,
  suiteId: Id<"suites">,
): Promise<Array<{ name: string; playwright_code: string }>> {
  const tests = await ctx.db
    .query("tests")
    .withIndex("by_suite_id", (q) => q.eq("suite_id", suiteId))
    .collect();
  return tests.map((t) => ({ name: t.name, playwright_code: t.playwright_code ?? "" }));
}

export async function readProjectContextLogic(
  ctx: QueryCtx,
  projectId: Id<"projects">,
): Promise<{ name: string; app_url: string; prd_text?: string } | null> {
  const project = await ctx.db.get(projectId);
  if (!project) return null;
  return { name: project.name, app_url: project.app_url, prd_text: project.prd_text };
}

export interface ReadKnowledgeBaseResult {
  architecture_summary: string | null;
  tech_stack: string[] | null;
  architecture_type: string | null;
  modules: Array<{
    name: string;
    description: string | null;
    file_count: number;
    dependencies: string[];
    apis: unknown;
    data_models: unknown;
    user_flows: unknown;
  }>;
}

export async function readKnowledgeBaseLogic(
  ctx: QueryCtx,
  projectId: Id<"projects">,
): Promise<ReadKnowledgeBaseResult | null> {
  const kb = await ctx.db
    .query("knowledge_bases")
    .withIndex("by_project_id", (q) => q.eq("project_id", projectId))
    .order("desc")
    .first();
  if (!kb || kb.status !== "ready") return null;

  const modules = await ctx.db
    .query("kb_modules")
    .withIndex("by_knowledge_base_id", (q) => q.eq("knowledge_base_id", kb._id))
    .collect();

  return {
    architecture_summary: kb.architecture_summary ?? null,
    tech_stack: kb.tech_stack ?? null,
    architecture_type: kb.architecture_type ?? null,
    modules: modules.map((m) => ({
      name: m.name,
      description: m.description ?? null,
      file_count: m.file_count ?? 0,
      dependencies: m.dependencies ?? [],
      apis: m.apis ?? null,
      data_models: m.data_models ?? null,
      user_flows: m.user_flows ?? null,
    })),
  };
}

export async function readTestCodeLogic(
  ctx: QueryCtx,
  testId: Id<"tests">,
): Promise<{ name: string; playwright_code: string } | null> {
  const test = await ctx.db.get(testId);
  if (!test) return null;
  return { name: test.name, playwright_code: test.playwright_code ?? "" };
}

export interface ReadBaselineRdResult {
  version: number;
  status: "draft" | "approved";
  sections: Array<{
    id: string;
    title: string;
    content: string;
    confidence: number;
    divergence_note?: string;
    bmad_alignment?: {
      prd_section_title: string;
      agreement: "agree" | "diverge" | "partial";
    };
  }>;
}

export async function readBaselineRdLogic(
  ctx: QueryCtx,
  projectId: Id<"projects">,
): Promise<ReadBaselineRdResult | null> {
  const rds = await ctx.db
    .query("baseline_rds")
    .withIndex("by_project_id_and_version", (q) => q.eq("project_id", projectId))
    .order("desc")
    .take(10);
  const rd = rds.find((r) => r.status !== "archived" && r.status !== "failed");
  if (!rd) return null;
  return {
    version: rd.version,
    status: rd.status as ReadBaselineRdResult["status"],
    sections: rd.sections.map((s) => ({
      id: s.id,
      title: s.title,
      content: s.content,
      confidence: s.confidence,
      divergence_note: s.divergence_note,
      bmad_alignment: s.bmad_alignment,
    })),
  };
}

export function readPreviousExplorationsLogic(): [] {
  return [];
}

export function readRecentFailuresLogic(): [] {
  return [];
}

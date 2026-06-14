import type { convexTest } from "convex-test";
import type { Id } from "./_generated/dataModel";

type TestCtx = ReturnType<typeof convexTest>;

export async function seedWorkspace(t: TestCtx, ownerId = "user1") {
  return t.run(async (ctx) => {
    const workspaceId = await ctx.db.insert("workspaces", {
      name: "Test WS",
      owner_id: ownerId,
      ai_config: { endpoint_url: "https://api.example.com", api_key: "key123", model_name: "gpt-4" },
    });
    await ctx.db.insert("workspace_members", {
      workspace_id: workspaceId,
      user_id: ownerId,
      role: "owner",
      invited_at: Date.now(),
      user_name: ownerId,
    });
    return workspaceId;
  });
}

export async function seedProject(t: TestCtx, workspaceId: string) {
  return t.run(async (ctx) => {
    return ctx.db.insert("projects", {
      workspace_id: workspaceId,
      name: "Test Project",
      app_url: "https://example.com",
    });
  });
}

export async function seedProjectWithRepo(
  t: TestCtx,
  workspaceId: string,
  overrides?: { repo_url?: string; encrypted_pat?: string; kb_status?: string },
) {
  return t.run(async (ctx) => {
    return ctx.db.insert("projects", {
      workspace_id: workspaceId,
      name: "Test Project",
      app_url: "https://example.com",
      repo_url: overrides?.repo_url,
      encrypted_pat: overrides?.encrypted_pat,
      kb_status: overrides?.kb_status as "none" | "building" | "ready" | "error" | undefined,
    });
  });
}

export async function seedSuite(t: TestCtx, workspaceId: string, overrides?: { name?: string; status?: "generating" | "ready" | "failed"; triggered_by?: string; generation_error?: string; source_type?: "manual" | "prd" | "natural_language" | "url_exploration" }) {
  return t.run(async (ctx) => {
    const projectId = await ctx.db.insert("projects", {
      workspace_id: workspaceId,
      name: "Test Project",
      app_url: "https://example.com",
    });
    const suiteId = await ctx.db.insert("suites", {
      workspace_id: workspaceId,
      project_id: projectId,
      name: overrides?.name ?? "Test Suite",
      source_type: overrides?.source_type ?? "manual",
      status: overrides?.status,
      triggered_by: overrides?.triggered_by,
      generation_error: overrides?.generation_error,
      ...(overrides?.status === "generating"
        ? { locked_by: overrides.triggered_by ?? "user1", locked_at: Date.now(), locked_reason: "generating" as const }
        : {}),
    });
    return { projectId, suiteId };
  });
}

type TestOverrides = Partial<{
  name: string;
  status: "draft" | "approved";
  source_type: "prd" | "url_exploration" | "natural_language";
  execution_type: "playwright" | "stagehand";
  steps: { instruction: string; assertion_code?: string; expected_outcome?: string }[];
}>;

export async function seedTestDoc(t: TestCtx, workspaceId: string, overrides?: TestOverrides) {
  return t.run(async (ctx) => {
    const projectId = await ctx.db.insert("projects", {
      workspace_id: workspaceId,
      name: "Test Project",
      app_url: "https://example.com",
    });
    const suiteId = await ctx.db.insert("suites", {
      workspace_id: workspaceId,
      project_id: projectId,
      name: "Test Suite",
      source_type: "manual",
    });
    const testId = await ctx.db.insert("tests", {
      workspace_id: workspaceId,
      suite_id: suiteId,
      name: overrides?.name ?? "Test Case",
      playwright_code: overrides?.execution_type === "stagehand" && overrides?.steps ? undefined : "import { test } from '@playwright/test';\ntest('example', async ({ page }) => {});",
      execution_type: overrides?.execution_type,
      steps: overrides?.steps,
      source_type: overrides?.source_type ?? "prd",
      status: overrides?.status ?? "draft",
    });
    return { projectId, suiteId, testId };
  });
}

export async function seedEnvironment(
  t: TestCtx,
  workspaceId: string,
  projectId: string,
  overrides?: Partial<{ name: string; base_url: string }>,
) {
  return t.run(async (ctx) => {
    return ctx.db.insert("environments", {
      workspace_id: workspaceId as Id<"workspaces">,
      project_id: projectId as Id<"projects">,
      name: overrides?.name ?? "Staging",
      base_url: overrides?.base_url ?? "https://staging.example.com",
    });
  });
}

export async function seedKnowledgeBase(
  t: TestCtx,
  workspaceId: string,
  projectId: string,
  overrides?: Partial<{
    status: "building" | "ready" | "error";
    progress_message: string;
    error_message: string;
    total_files: number;
    total_size_bytes: number;
    architecture_summary: string;
    tech_stack: string[];
    folder_structure: string;
    architecture_type: string;
    last_synced_at: number;
    bmad_detected: boolean;
  }>,
) {
  return t.run(async (ctx) => {
    return ctx.db.insert("knowledge_bases", {
      workspace_id: workspaceId as Id<"workspaces">,
      project_id: projectId as Id<"projects">,
      status: overrides?.status ?? "building",
      progress_message: overrides?.progress_message,
      error_message: overrides?.error_message,
      total_files: overrides?.total_files,
      total_size_bytes: overrides?.total_size_bytes,
      architecture_summary: overrides?.architecture_summary,
      tech_stack: overrides?.tech_stack,
      folder_structure: overrides?.folder_structure,
      architecture_type: overrides?.architecture_type,
      last_synced_at: overrides?.last_synced_at,
      bmad_detected: overrides?.bmad_detected,
    });
  });
}

export async function seedModule(
  t: TestCtx,
  workspaceId: string,
  knowledgeBaseId: string,
  overrides?: Partial<{
    name: string;
    description: string;
    file_count: number;
    files: string[];
    dependencies: string[];
    apis: unknown;
    data_models: unknown;
    user_flows: unknown;
  }>,
) {
  return t.run(async (ctx) => {
    return ctx.db.insert("kb_modules", {
      workspace_id: workspaceId as Id<"workspaces">,
      knowledge_base_id: knowledgeBaseId as Id<"knowledge_bases">,
      name: overrides?.name ?? "Test Module",
      description: overrides?.description,
      file_count: overrides?.file_count,
      files: overrides?.files,
      dependencies: overrides?.dependencies,
      apis: overrides?.apis,
      data_models: overrides?.data_models,
      user_flows: overrides?.user_flows,
    });
  });
}

type BaselineRdOverrides = Partial<{
  version: number;
  status: "draft" | "approved" | "archived" | "failed";
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
  rd_generation_error: string;
  generated_at: number;
  updated_at: number;
}>;

const DEFAULT_BASELINE_RD_SECTIONS = [
  { id: "overview", title: "Overview", content: "Default overview.", confidence: 0.7 },
  { id: "tech-stack", title: "Tech Stack", content: "Default tech stack.", confidence: 0.7 },
  { id: "modules", title: "Modules", content: "Default modules.", confidence: 0.7 },
  { id: "api-surface", title: "API Surface", content: "Default API surface.", confidence: 0.7 },
  { id: "data-model", title: "Data Model", content: "Default data model.", confidence: 0.7 },
  { id: "user-flows", title: "User Flows", content: "Default user flows.", confidence: 0.7 },
];

export async function seedBaselineRd(
  t: TestCtx,
  workspaceId: string,
  projectId: string,
  knowledgeBaseId: string,
  overrides?: BaselineRdOverrides,
) {
  return t.run(async (ctx) => {
    return ctx.db.insert("baseline_rds", {
      workspace_id: workspaceId as Id<"workspaces">,
      project_id: projectId as Id<"projects">,
      knowledge_base_id: knowledgeBaseId as Id<"knowledge_bases">,
      version: overrides?.version ?? 1,
      status: overrides?.status ?? "draft",
      sections: overrides?.sections ?? DEFAULT_BASELINE_RD_SECTIONS,
      rd_generation_error: overrides?.rd_generation_error,
      generated_at: overrides?.generated_at ?? Date.now(),
      updated_at: overrides?.updated_at,
    });
  });
}

type DriftReportOverrides = Partial<{
  version: number;
  baseline_rd_version: number;
  status: "draft" | "archived" | "failed";
  items: Array<{
    dimension: "old-rd-vs-code" | "bmad-prd-vs-code" | "bmad-conventions-vs-code" | "adr-drift";
    category: "added" | "removed" | "changed";
    severity: "breaking" | "significant" | "incremental";
    title: string;
    description: string;
    rd_section_id?: string;
    evidence?: string;
    old_rd_reference?: string;
  }>;
  bmad_detected: boolean;
  generation_error: string;
  generated_at: number;
}>;

const DEFAULT_DRIFT_ITEMS = [
  {
    dimension: "old-rd-vs-code" as const,
    category: "added" as const,
    severity: "incremental" as const,
    title: "Default drift item",
    description: "Default drift description.",
    rd_section_id: "overview",
  },
];

export async function seedDriftReport(
  t: TestCtx,
  workspaceId: string,
  projectId: string,
  knowledgeBaseId: string,
  baselineRdId: string,
  overrides?: DriftReportOverrides,
) {
  return t.run(async (ctx) => {
    return ctx.db.insert("drift_reports", {
      workspace_id: workspaceId as Id<"workspaces">,
      project_id: projectId as Id<"projects">,
      knowledge_base_id: knowledgeBaseId as Id<"knowledge_bases">,
      baseline_rd_id: baselineRdId as Id<"baseline_rds">,
      baseline_rd_version: overrides?.baseline_rd_version,
      version: overrides?.version ?? 1,
      status: overrides?.status ?? "draft",
      items: overrides?.items ?? DEFAULT_DRIFT_ITEMS,
      bmad_detected: overrides?.bmad_detected ?? false,
      generation_error: overrides?.generation_error,
      generated_at: overrides?.generated_at ?? Date.now(),
    });
  });
}

export async function seedBmadMetadata(
  t: TestCtx,
  workspaceId: string,
  kbId: string,
  entries: Array<{
    type: "prd_section" | "adr" | "convention" | "domain_term";
    key: string;
    content: string;
    source_path: string;
    metadata?: unknown;
  }>,
) {
  const ids: string[] = [];
  for (const entry of entries) {
    const id = await t.run(async (ctx) => {
      return ctx.db.insert("kb_bmad_metadata", {
        workspace_id: workspaceId as Id<"workspaces">,
        kb_id: kbId as Id<"knowledge_bases">,
        type: entry.type,
        key: entry.key,
        content: entry.content,
        source_path: entry.source_path,
        metadata: entry.metadata ?? null,
      });
    });
    ids.push(id);
  }
  return ids;
}

export async function seedSchedule(
  t: TestCtx,
  workspaceId: string,
  suiteId: string,
  envId: string,
  overrides?: Partial<{
    name: string;
    cadence_seconds: number;
    enabled: boolean;
    next_run_at: number;
    last_run_at: number;
  }>,
) {
  return t.run(async (ctx) => {
    return ctx.db.insert("schedules", {
      workspace_id: workspaceId as Id<"workspaces">,
      name: overrides?.name ?? "Test Schedule",
      suite_id: suiteId as Id<"suites">,
      environment_id: envId as Id<"environments">,
      cadence: { seconds: overrides?.cadence_seconds ?? 3600 },
      enabled: overrides?.enabled ?? true,
      next_run_at: overrides?.next_run_at,
      last_run_at: overrides?.last_run_at,
      created_by: "user1",
    });
  });
}

type RunOverrides = Partial<{
  status: "running" | "passed" | "failed" | "cancelled" | "timed_out";
  trigger_type: "manual" | "ci" | "scheduled" | "rerun";
  runner_id: string;
  environment_id: string;
  branch: string;
  duration_ms: number;
  pass_count: number;
  fail_count: number;
  skip_count: number;
  schedule_id: string;
}>;

export async function seedRun(
  t: TestCtx,
  workspaceId: string,
  projectId: string,
  suiteId: string | null,
  testId: string | null,
  overrides?: RunOverrides,
) {
  return t.run(async (ctx) => {
    return ctx.db.insert("runs", {
      workspace_id: workspaceId as Id<"workspaces">,
      project_id: projectId as Id<"projects">,
      suite_id: suiteId ? (suiteId as Id<"suites">) : undefined,
      test_id: testId ? (testId as Id<"tests">) : undefined,
      trigger_type: overrides?.trigger_type ?? "manual",
      schedule_id: overrides?.schedule_id
        ? (overrides.schedule_id as Id<"schedules">)
        : undefined,
      status: overrides?.status ?? "running",
      runner_id: overrides?.runner_id,
      environment_id: overrides?.environment_id
        ? (overrides.environment_id as Id<"environments">)
        : undefined,
      branch: overrides?.branch,
      duration_ms: overrides?.duration_ms,
      pass_count: overrides?.pass_count,
      fail_count: overrides?.fail_count,
      skip_count: overrides?.skip_count,
    });
  });
}

export async function seedRunResult(
  t: TestCtx,
  workspaceId: string,
  runId: string,
  testId: string,
  overrides?: Partial<{
    status: "passed" | "failed" | "skipped";
    duration_ms: number;
  }>,
) {
  return t.run(async (ctx) => {
    return ctx.db.insert("run_results", {
      workspace_id: workspaceId as Id<"workspaces">,
      run_id: runId as Id<"runs">,
      test_id: testId as Id<"tests">,
      status: overrides?.status ?? "passed",
      duration_ms: overrides?.duration_ms ?? 0,
      retries: 0,
    });
  });
}

export async function seedFullRunWithTests(t: TestCtx, ownerId = "user1") {
  const workspaceId = await seedWorkspace(t, ownerId);
  const { projectId, suiteId, testId } = await seedTestDoc(t, workspaceId, {
    status: "approved",
  });
  const envId = await seedEnvironment(t, workspaceId, projectId);
  const runId = await seedRun(t, workspaceId, projectId, suiteId, null, {
    environment_id: envId,
  });
  const runResultId = await seedRunResult(t, workspaceId, runId, testId);
  return { workspaceId, projectId, suiteId, testId, envId, runId, runResultId };
}

export async function seedFullStack(t: TestCtx, ownerId = "user1") {
  const workspaceId = await seedWorkspace(t, ownerId);
  const { projectId, suiteId, testId } = await seedTestDoc(t, workspaceId);
  return { workspaceId, projectId, suiteId, testId };
}

type AIInsightOverrides = Partial<{
  type: "root_cause" | "flakiness_cluster";
  analysis_text: string;
  suggested_fix: string;
  confidence_score: number;
}>;

export async function seedAIInsight(
  t: TestCtx,
  workspaceId: string,
  testId: string,
  runId: string,
  overrides?: AIInsightOverrides,
) {
  return t.run(async (ctx) => {
    return ctx.db.insert("ai_insights", {
      workspace_id: workspaceId as Id<"workspaces">,
      test_id: testId as Id<"tests">,
      run_id: runId as Id<"runs">,
      type: overrides?.type ?? "root_cause",
      analysis_text: overrides?.analysis_text ?? "Element not visible",
      suggested_fix: overrides?.suggested_fix,
      confidence_score: overrides?.confidence_score ?? 0.85,
    });
  });
}

type ExplorationOverrides = Partial<{
  status: "pending" | "capturing" | "captured" | "analyzing" | "analyzed" | "completed" | "failed";
  url: string;
  runner_id: string;
  progress_message: string;
  pages_captured: number;
  interactive: boolean;
}>;

export async function seedExploration(
  t: TestCtx,
  workspaceId: string,
  projectId: string,
  overrides?: ExplorationOverrides,
) {
  return t.run(async (ctx) => {
    return ctx.db.insert("explorations", {
      workspace_id: workspaceId as Id<"workspaces">,
      project_id: projectId as Id<"projects">,
      url: overrides?.url ?? "https://example.com",
      status: overrides?.status ?? "pending",
      runner_id: overrides?.runner_id,
      progress_message: overrides?.progress_message,
      pages_captured: overrides?.pages_captured,
      interactive: overrides?.interactive,
    });
  });
}

export async function seedRunWithTwoTests(t: TestCtx) {
  const workspaceId = await seedWorkspace(t);
  const projectId = await seedProject(t, workspaceId);
  const suiteId = await t.run(async (ctx) => {
    return ctx.db.insert("suites", {
      workspace_id: workspaceId,
      project_id: projectId,
      name: "Test Suite",
      source_type: "manual",
    });
  });
  const testId1 = await t.run(async (ctx) => {
    return ctx.db.insert("tests", {
      workspace_id: workspaceId,
      suite_id: suiteId,
      name: "Test 1",
      playwright_code: "test('t1', async ({ page }) => {});",
      source_type: "prd",
      status: "approved",
    });
  });
  const testId2 = await t.run(async (ctx) => {
    return ctx.db.insert("tests", {
      workspace_id: workspaceId,
      suite_id: suiteId,
      name: "Test 2",
      playwright_code: "test('t2', async ({ page }) => {});",
      source_type: "prd",
      status: "approved",
    });
  });
  const runId = await seedRun(t, workspaceId, projectId, suiteId, null);
  return { workspaceId, projectId, suiteId, testId1, testId2, runId };
}

export async function seedChatThread(
  t: TestCtx,
  workspaceId: string,
  projectId: string,
  threadId: string,
  overrides?: Partial<{ title: string; created_by_user_id: string; last_message_at: number }>,
) {
  return t.run(async (ctx) => {
    return ctx.db.insert("chat_threads", {
      thread_id: threadId,
      workspace_id: workspaceId as Id<"workspaces">,
      project_id: projectId as Id<"projects">,
      title: overrides?.title ?? "New Chat",
      created_by_user_id: overrides?.created_by_user_id ?? "user1",
      last_message_at: overrides?.last_message_at,
    });
  });
}

export async function seedStagehandTest(
  t: TestCtx,
  workspaceId: string,
  overrides?: Partial<{
    name: string;
    steps: { instruction: string; assertion_code?: string; expected_outcome?: string }[];
    status: "draft" | "approved";
  }>,
) {
  return t.run(async (ctx) => {
    const projectId = await ctx.db.insert("projects", {
      workspace_id: workspaceId,
      name: "Test Project",
      app_url: "https://example.com",
    });
    const suiteId = await ctx.db.insert("suites", {
      workspace_id: workspaceId,
      project_id: projectId,
      name: "Test Suite",
      source_type: "manual",
    });
    const steps = overrides?.steps ?? [
      { instruction: "Navigate to /login", expected_outcome: "Login page is visible" },
      { instruction: "Enter credentials and submit", assertion_code: "expect(await page.textContent('.status')).toBe('ok')" },
    ];
    const testId = await ctx.db.insert("tests", {
      workspace_id: workspaceId,
      suite_id: suiteId,
      name: overrides?.name ?? "Stagehand Test",
      execution_type: "stagehand" as const,
      steps,
      source_type: "prd",
      status: overrides?.status ?? "draft",
    });
    return { projectId, suiteId, testId };
  });
}

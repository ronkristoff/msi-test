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
      playwright_code: "import { test } from '@playwright/test';\ntest('example', async ({ page }) => {});",
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

type RunOverrides = Partial<{
  status: "running" | "passed" | "failed" | "cancelled" | "timed_out";
  trigger_type: "manual" | "ci" | "rerun";
  runner_id: string;
  environment_id: string;
  branch: string;
  duration_ms: number;
  pass_count: number;
  fail_count: number;
  skip_count: number;
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

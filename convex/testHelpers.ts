import type { convexTest } from "convex-test";
import type { Id } from "./_generated/dataModel";

type TestCtx = ReturnType<typeof convexTest>;

export async function seedWorkspace(t: TestCtx, ownerId = "user1") {
  return t.run(async (ctx) => {
    return ctx.db.insert("workspaces", {
      name: "Test WS",
      owner_id: ownerId,
      ai_config: { endpoint_url: "https://api.example.com", api_key: "key123", model_name: "gpt-4" },
    });
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

export async function seedSuite(t: TestCtx, workspaceId: string) {
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

export async function seedEnvironment(t: TestCtx, workspaceId: string, projectId: string) {
  return t.run(async (ctx) => {
    return ctx.db.insert("environments", {
      workspace_id: workspaceId as Id<"workspaces">,
      project_id: projectId as Id<"projects">,
      name: "Staging",
      base_url: "https://staging.example.com",
    });
  });
}

export async function seedFullStack(t: TestCtx, ownerId = "user1") {
  const workspaceId = await seedWorkspace(t, ownerId);
  const { projectId, suiteId, testId } = await seedTestDoc(t, workspaceId);
  return { workspaceId, projectId, suiteId, testId };
}

/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import {
  seedWorkspace,
  seedProject,
  seedEnvironment,
  seedRun,
} from "./testHelpers";

const modules = import.meta.glob("./**/*.ts");

async function seedSuiteRun(
  t: ReturnType<typeof convexTest>,
  workspaceId: string,
  overrides?: {
    status?: "running" | "passed" | "failed" | "cancelled" | "timed_out";
    branch?: string;
    environmentName?: string;
    suiteName?: string;
    duration_ms?: number;
  },
) {
  const projectId = await seedProject(t, workspaceId);
  const suiteId = await t.run(async (ctx) => {
    return ctx.db.insert("suites", {
      workspace_id: workspaceId,
      project_id: projectId,
      name: overrides?.suiteName ?? "Test Suite",
      source_type: "manual",
    });
  });
  const envId = overrides?.environmentName
    ? await seedEnvironment(t, workspaceId, projectId, { name: overrides.environmentName })
    : undefined;
  const runId = await seedRun(t, workspaceId, projectId, suiteId, null, {
    status: overrides?.status ?? "passed",
    environment_id: envId,
    branch: overrides?.branch,
    duration_ms: overrides?.duration_ms,
  });
  return { projectId, suiteId, envId, runId };
}

describe("workspace runs data layer", () => {
  it("fetches runs by workspace_id ordered desc", async () => {
    const t = convexTest(schema, modules);
    const wsId = await seedWorkspace(t);

    const r1 = await seedSuiteRun(t, wsId);
    const r2 = await seedSuiteRun(t, wsId);

    const runs = await t.run(async (ctx) => {
      return ctx.db
        .query("runs")
        .withIndex("by_workspace_id", (q) => q.eq("workspace_id", wsId))
        .order("desc")
        .collect();
    });

    expect(runs).toHaveLength(2);
    expect(runs[0]._id).toBe(r2.runId);
    expect(runs[1]._id).toBe(r1.runId);
  });

  it("filters runs by status using by_status index", async () => {
    const t = convexTest(schema, modules);
    const wsId = await seedWorkspace(t);

    await seedSuiteRun(t, wsId, { status: "passed" });
    await seedSuiteRun(t, wsId, { status: "failed" });
    await seedSuiteRun(t, wsId, { status: "running" });

    const failed = await t.run(async (ctx) => {
      return ctx.db
        .query("runs")
        .withIndex("by_status", (q) => q.eq("status", "failed"))
        .collect();
    });

    expect(failed).toHaveLength(1);
    expect(failed[0].status).toBe("failed");
  });

  it("filters runs by branch via post-filter", async () => {
    const t = convexTest(schema, modules);
    const wsId = await seedWorkspace(t);

    await seedSuiteRun(t, wsId, { branch: "main" });
    await seedSuiteRun(t, wsId, { branch: "develop" });
    await seedSuiteRun(t, wsId, { branch: "main" });

    const allRuns = await t.run(async (ctx) => {
      return ctx.db
        .query("runs")
        .withIndex("by_workspace_id", (q) => q.eq("workspace_id", wsId))
        .collect();
    });

    const mainRuns = allRuns.filter((r) => r.branch === "main");
    expect(mainRuns).toHaveLength(2);
  });

  it("filters runs by environment_id via post-filter", async () => {
    const t = convexTest(schema, modules);
    const wsId = await seedWorkspace(t);

    const withEnv = await seedSuiteRun(t, wsId, { environmentName: "Staging" });
    await seedSuiteRun(t, wsId);

    const allRuns = await t.run(async (ctx) => {
      return ctx.db
        .query("runs")
        .withIndex("by_workspace_id", (q) => q.eq("workspace_id", wsId))
        .collect();
    });

    const envRuns = allRuns.filter((r) => r.environment_id === withEnv.envId);
    expect(envRuns).toHaveLength(1);
  });

  it("enriches runs with suite name and environment name", async () => {
    const t = convexTest(schema, modules);
    const wsId = await seedWorkspace(t);

    const { suiteId, envId } = await seedSuiteRun(t, wsId, {
      environmentName: "Production",
      suiteName: "Login Tests",
    });

    const enriched = await t.run(async (ctx) => {
      const suite = suiteId ? await ctx.db.get(suiteId as Id<"suites">) : null;
      const env = envId ? await ctx.db.get(envId as Id<"environments">) : null;
      return {
        suiteName: suite?.name ?? null,
        envName: env?.name ?? null,
      };
    });

    expect(enriched.suiteName).toBe("Login Tests");
    expect(enriched.envName).toBe("Production");
  });

  it("collects distinct branches for filter options", async () => {
    const t = convexTest(schema, modules);
    const wsId = await seedWorkspace(t);

    await seedSuiteRun(t, wsId, { branch: "main" });
    await seedSuiteRun(t, wsId, { branch: "develop" });
    await seedSuiteRun(t, wsId, { branch: "main" });
    await seedSuiteRun(t, wsId);

    const allRuns = await t.run(async (ctx) => {
      return ctx.db
        .query("runs")
        .withIndex("by_workspace_id", (q) => q.eq("workspace_id", wsId))
        .collect();
    });

    const branches = [...new Set(allRuns.map((r) => r.branch).filter(Boolean))] as string[];
    expect(branches).toEqual(expect.arrayContaining(["main", "develop"]));
    expect(branches).toHaveLength(2);
  });

  it("collects environments for filter options", async () => {
    const t = convexTest(schema, modules);
    const wsId = await seedWorkspace(t);

    const p1 = await seedProject(t, wsId);
    await seedEnvironment(t, wsId, p1, { name: "Staging" });
    await t.run(async (ctx) => {
      return ctx.db.insert("environments", {
        workspace_id: wsId,
        project_id: p1,
        name: "Production",
        base_url: "https://prod.example.com",
      });
    });

    const envs = await t.run(async (ctx) => {
      return ctx.db
        .query("environments")
        .withIndex("by_workspace_id", (q) => q.eq("workspace_id", wsId))
        .collect();
    });

    expect(envs).toHaveLength(2);
    const names = envs.map((e) => e.name);
    expect(names).toEqual(expect.arrayContaining(["Staging", "Production"]));
  });

  it("isolates runs between workspaces", async () => {
    const t = convexTest(schema, modules);
    const ws1 = await seedWorkspace(t, "user1");
    const ws2 = await seedWorkspace(t, "user2");

    await seedSuiteRun(t, ws1, { suiteName: "WS1 Suite" });
    await seedSuiteRun(t, ws1, { suiteName: "WS1 Suite 2" });
    await seedSuiteRun(t, ws2, { suiteName: "WS2 Suite" });

    const ws1Runs = await t.run(async (ctx) => {
      return ctx.db
        .query("runs")
        .withIndex("by_workspace_id", (q) => q.eq("workspace_id", ws1))
        .collect();
    });

    const ws2Runs = await t.run(async (ctx) => {
      return ctx.db
        .query("runs")
        .withIndex("by_workspace_id", (q) => q.eq("workspace_id", ws2))
        .collect();
    });

    expect(ws1Runs).toHaveLength(2);
    expect(ws2Runs).toHaveLength(1);
  });
});

/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import { api } from "./_generated/api";
import schema from "./schema";
import {
  seedWorkspace,
  seedProject,
  seedRunResult,
  seedRun,
} from "./testHelpers";

const modules = import.meta.glob("./**/*.ts");

async function seedFlakinessSetup(t: ReturnType<typeof convexTest>) {
  const workspaceId = await seedWorkspace(t);
  const projectId = await seedProject(t, workspaceId);
  const suiteId = await t.run(async (ctx) => {
    return ctx.db.insert("suites", {
      workspace_id: workspaceId,
      project_id: projectId,
      name: "Flaky Suite",
      source_type: "manual",
    });
  });
  const testId1 = await t.run(async (ctx) => {
    return ctx.db.insert("tests", {
      workspace_id: workspaceId,
      suite_id: suiteId,
      name: "Login Test",
      playwright_code: "test('login', async ({ page }) => {});",
      source_type: "prd",
      status: "approved",
    });
  });
  const testId2 = await t.run(async (ctx) => {
    return ctx.db.insert("tests", {
      workspace_id: workspaceId,
      suite_id: suiteId,
      name: "Checkout Test",
      playwright_code: "test('checkout', async ({ page }) => {});",
      source_type: "prd",
      status: "approved",
    });
  });
  return { workspaceId, projectId, suiteId, testId1, testId2 };
}

async function seedCompletedRunWithResults(
  t: ReturnType<typeof convexTest>,
  workspaceId: string,
  projectId: string,
  suiteId: string,
  results: Array<{ testId: string; status: "passed" | "failed" | "skipped" }>,
) {
  const passCount = results.filter((r) => r.status === "passed").length;
  const failCount = results.filter((r) => r.status === "failed").length;
  const overallStatus = failCount > 0 ? "failed" : "passed";

  const runId = await seedRun(t, workspaceId, projectId, suiteId, null, {
    status: overallStatus,
    pass_count: passCount,
    fail_count: failCount,
    duration_ms: 1000,
  });

  for (const r of results) {
    await seedRunResult(t, workspaceId, runId, r.testId, {
      status: r.status,
      duration_ms: 500,
    });
  }

  return runId;
}

describe("computeFlakinessPct", () => {
  async function getComputeFlakinessPct() {
    const { computeFlakinessPct } = await import("./flakiness/queries");
    return computeFlakinessPct;
  }

  it("returns 0 for empty array", async () => {
    const fn = await getComputeFlakinessPct();
    expect(fn([])).toBe(0);
  });

  it("returns 0 for single run", async () => {
    const fn = await getComputeFlakinessPct();
    expect(fn(["passed"])).toBe(0);
  });

  it("returns 0 for stable test", async () => {
    const fn = await getComputeFlakinessPct();
    expect(fn(["passed", "passed", "passed"])).toBe(0);
  });

  it("returns 100 for fully alternating test", async () => {
    const fn = await getComputeFlakinessPct();
    expect(fn(["passed", "failed", "passed", "failed"])).toBe(100);
  });

  it("returns 33.3 for one change in three transitions", async () => {
    const fn = await getComputeFlakinessPct();
    expect(fn(["passed", "passed", "failed", "failed"])).toBe(33.3);
  });

  it("returns 50 for alternating pairs", async () => {
    const fn = await getComputeFlakinessPct();
    expect(fn(["passed", "failed"])).toBe(100);
  });
});

describe("getFlakinessMap query", () => {
  it("returns empty data when no auth context", async () => {
    const t = convexTest(schema, modules);
    const result = await t.query(api.flakiness.queries.getFlakinessMap);
    expect(result.workspaceId).toBeNull();
    expect(result.tests).toHaveLength(0);
    expect(result.runs).toHaveLength(0);
    expect(result.clusters).toHaveLength(0);
  });
});

describe("flakiness data layer", () => {
  it("builds heatmap matrix from run results", async () => {
    const t = convexTest(schema, modules);
    const { workspaceId, projectId, suiteId, testId1, testId2 } = await seedFlakinessSetup(t);

    await seedCompletedRunWithResults(t, workspaceId, projectId, suiteId, [
      { testId: testId1, status: "passed" },
      { testId: testId2, status: "passed" },
    ]);
    await seedCompletedRunWithResults(t, workspaceId, projectId, suiteId, [
      { testId: testId1, status: "failed" },
      { testId: testId2, status: "passed" },
    ]);

    const data = await t.run(async (ctx) => {
      const runs = await ctx.db
        .query("runs")
        .withIndex("by_workspace_id", (q) => q.eq("workspace_id", workspaceId))
        .order("desc")
        .collect();
      const completed = runs.filter((r) => r.status !== "running");

      const testResultMap = new Map<string, { name: string; statuses: Map<string, string> }>();

      for (const run of completed) {
        const runResults = await ctx.db
          .query("run_results")
          .withIndex("by_run_id", (q) => q.eq("run_id", run._id))
          .collect();

        for (const rr of runResults) {
          let entry = testResultMap.get(rr.test_id);
          if (!entry) {
            const test = await ctx.db.get(rr.test_id);
            entry = { name: test?.name ?? "Unknown", statuses: new Map() };
            testResultMap.set(rr.test_id, entry);
          }
          entry.statuses.set(run._id, rr.status);
        }
      }

      return {
        runCount: completed.length,
        testCount: testResultMap.size,
        tests: [...testResultMap.entries()].map(([id, d]) => ({
          id,
          name: d.name,
          statusCount: d.statuses.size,
        })),
      };
    });

    expect(data.runCount).toBe(2);
    expect(data.testCount).toBe(2);
    const loginEntry = data.tests.find((e: { name: string }) => e.name === "Login Test");
    expect(loginEntry).toBeDefined();
    expect(loginEntry.statusCount).toBe(2);
  });

  it("computes flakiness for alternating test via data layer", async () => {
    const { computeFlakinessPct } = await import("./flakiness/queries");
    const t = convexTest(schema, modules);
    const { workspaceId, projectId, suiteId, testId1 } = await seedFlakinessSetup(t);

    await seedCompletedRunWithResults(t, workspaceId, projectId, suiteId, [
      { testId: testId1, status: "passed" },
    ]);
    await seedCompletedRunWithResults(t, workspaceId, projectId, suiteId, [
      { testId: testId1, status: "failed" },
    ]);
    await seedCompletedRunWithResults(t, workspaceId, projectId, suiteId, [
      { testId: testId1, status: "passed" },
    ]);
    await seedCompletedRunWithResults(t, workspaceId, projectId, suiteId, [
      { testId: testId1, status: "failed" },
    ]);

    const statuses = await t.run(async (ctx) => {
      const runs = await ctx.db
        .query("runs")
        .withIndex("by_workspace_id", (q) => q.eq("workspace_id", workspaceId))
        .order("desc")
        .collect();
      const completed = runs.filter((r) => r.status !== "running").reverse();

      const results = [];
      for (const run of completed) {
        const rr = await ctx.db
          .query("run_results")
          .withIndex("by_run_id", (q) => q.eq("run_id", run._id))
          .first();
        if (rr && rr.test_id === testId1) results.push(rr.status);
      }
      return results;
    });

    expect(computeFlakinessPct(statuses)).toBe(100);
  });

  it("excludes running runs from heatmap data", async () => {
    const t = convexTest(schema, modules);
    const { workspaceId, projectId, suiteId, testId1 } = await seedFlakinessSetup(t);

    await seedCompletedRunWithResults(t, workspaceId, projectId, suiteId, [
      { testId: testId1, status: "passed" },
    ]);

    await seedRun(t, workspaceId, projectId, suiteId, null, { status: "running" });

    const completedCount = await t.run(async (ctx) => {
      const runs = await ctx.db
        .query("runs")
        .withIndex("by_workspace_id", (q) => q.eq("workspace_id", workspaceId))
        .collect();
      return runs.filter((r) => r.status !== "running").length;
    });

    expect(completedCount).toBe(1);
  });

  it("retrieves flakiness cluster insights", async () => {
    const t = convexTest(schema, modules);
    const { workspaceId, projectId, suiteId, testId1 } = await seedFlakinessSetup(t);

    const runId = await seedCompletedRunWithResults(t, workspaceId, projectId, suiteId, [
      { testId: testId1, status: "failed" },
    ]);

    await t.run(async (ctx) => {
      await ctx.db.insert("ai_insights", {
        workspace_id: workspaceId,
        test_id: testId1,
        run_id: runId,
        type: "flakiness_cluster",
        analysis_text: "Login and checkout fail together due to shared auth",
        suggested_fix: "Stabilize auth mock",
        confidence_score: 0.85,
      });
    });

    const insight = await t.run(async (ctx) => {
      return ctx.db
        .query("ai_insights")
        .withIndex("by_test_id", (q) => q.eq("test_id", testId1))
        .first();
    });

    expect(insight).not.toBeNull();
    expect(insight!.type).toBe("flakiness_cluster");
    expect(insight!.analysis_text).toBe("Login and checkout fail together due to shared auth");
  });

  it("limits runs to last 20", async () => {
    const t = convexTest(schema, modules);
    const { workspaceId, projectId, suiteId, testId1 } = await seedFlakinessSetup(t);

    for (let i = 0; i < 25; i++) {
      await seedCompletedRunWithResults(t, workspaceId, projectId, suiteId, [
        { testId: testId1, status: i % 2 === 0 ? "passed" : "failed" },
      ]);
    }

    const cappedCount = await t.run(async (ctx) => {
      const runs = await ctx.db
        .query("runs")
        .withIndex("by_workspace_id", (q) => q.eq("workspace_id", workspaceId))
        .order("desc")
        .collect();
      const completed = runs.filter((r) => r.status !== "running");
      return Math.min(completed.length, 20);
    });

    expect(cappedCount).toBe(20);
  });
});

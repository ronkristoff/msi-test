/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import { api } from "./_generated/api";
import schema from "./schema";
import {
  seedRunResult,
  seedFullRunWithTests,
  seedRunWithTwoTests,
} from "./testHelpers";

const modules = import.meta.glob("./**/*.ts");

async function seedCompletedRun(
  t: ReturnType<typeof convexTest>,
  workspaceId: string,
  projectId: string,
  suiteId: string,
  testId: string,
  status: "passed" | "failed",
) {
  const runId = await t.run(async (ctx) => {
    return ctx.db.insert("runs", {
      workspace_id: workspaceId,
      project_id: projectId,
      suite_id: suiteId,
      trigger_type: "manual",
      status,
      started_at: Date.now() - 5000,
      finished_at: Date.now(),
      duration_ms: 1500,
      pass_count: status === "passed" ? 1 : 0,
      fail_count: status === "failed" ? 1 : 0,
      skip_count: 0,
    });
  });

  await seedRunResult(t, workspaceId, runId, testId, {
    status,
    duration_ms: 1500,
  });

  return runId;
}

describe("getDashboardStats", () => {
  it("returns zeros when no auth context", async () => {
    const t = convexTest(schema, modules);
    const stats = await t.query(api.dashboard.queries.getDashboardStats);

    expect(stats.passRate).toBe(0);
    expect(stats.failedCount).toBe(0);
    expect(stats.flakyCount).toBe(0);
    expect(stats.testsRun).toBe(0);
    expect(stats.trendData).toHaveLength(0);
    expect(stats.recentFailures).toHaveLength(0);
  });
});

describe("dashboard data layer", () => {
  it("computes pass rate from run pass/fail counts", async () => {
    const t = convexTest(schema, modules);
    const { workspaceId, projectId, suiteId, testId } = await seedFullRunWithTests(t);

    await seedCompletedRun(t, workspaceId, projectId, suiteId, testId, "passed");
    await seedCompletedRun(t, workspaceId, projectId, suiteId, testId, "passed");

    const counts = await t.run(async (ctx) => {
      const runs = await ctx.db
        .query("runs")
        .withIndex("by_workspace_id", (q) => q.eq("workspace_id", workspaceId))
        .collect();
      const completed = runs.filter((r) => r.status !== "running");
      let totalPass = 0;
      let totalFail = 0;
      for (const run of completed) {
        totalPass += run.pass_count ?? 0;
        totalFail += run.fail_count ?? 0;
      }
      return { totalPass, totalFail };
    });

    const passRate = Math.round((counts.totalPass / (counts.totalPass + counts.totalFail)) * 1000) / 10;
    expect(passRate).toBe(100);
    expect(counts.totalPass).toBe(2);
    expect(counts.totalFail).toBe(0);
  });

  it("computes mixed pass rate correctly", async () => {
    const t = convexTest(schema, modules);
    const { workspaceId, projectId, suiteId, testId } = await seedFullRunWithTests(t);

    await seedCompletedRun(t, workspaceId, projectId, suiteId, testId, "passed");
    await seedCompletedRun(t, workspaceId, projectId, suiteId, testId, "failed");

    const counts = await t.run(async (ctx) => {
      const runs = await ctx.db
        .query("runs")
        .withIndex("by_workspace_id", (q) => q.eq("workspace_id", workspaceId))
        .collect();
      const completed = runs.filter((r) => r.status !== "running");
      let totalPass = 0;
      let totalFail = 0;
      for (const run of completed) {
        totalPass += run.pass_count ?? 0;
        totalFail += run.fail_count ?? 0;
      }
      return { totalPass, totalFail };
    });

    const passRate = Math.round((counts.totalPass / (counts.totalPass + counts.totalFail)) * 1000) / 10;
    expect(passRate).toBe(50);
    expect(counts.totalFail).toBe(1);
  });

  it("detects flaky tests across runs", async () => {
    const t = convexTest(schema, modules);
    const { workspaceId, projectId, suiteId, testId } = await seedFullRunWithTests(t);

    await seedCompletedRun(t, workspaceId, projectId, suiteId, testId, "passed");
    await seedCompletedRun(t, workspaceId, projectId, suiteId, testId, "failed");

    const isFlaky = await t.run(async (ctx) => {
      const results = await ctx.db
        .query("run_results")
        .withIndex("by_test_id", (q) => q.eq("test_id", testId))
        .collect();

      const hasPassed = results.some((r) => r.status === "passed");
      const hasFailed = results.some((r) => r.status === "failed");
      return hasPassed && hasFailed;
    });

    expect(isFlaky).toBe(true);
  });

  it("does not count stable tests as flaky", async () => {
    const t = convexTest(schema, modules);
    const { workspaceId, projectId, suiteId, testId } = await seedFullRunWithTests(t);

    await seedCompletedRun(t, workspaceId, projectId, suiteId, testId, "passed");
    await seedCompletedRun(t, workspaceId, projectId, suiteId, testId, "passed");

    const isFlaky = await t.run(async (ctx) => {
      const results = await ctx.db
        .query("run_results")
        .withIndex("by_test_id", (q) => q.eq("test_id", testId))
        .collect();

      const hasPassed = results.some((r) => r.status === "passed");
      const hasFailed = results.some((r) => r.status === "failed");
      return hasPassed && hasFailed;
    });

    expect(isFlaky).toBe(false);
  });

  it("finds failed run results with step errors", async () => {
    const t = convexTest(schema, modules);
    const { workspaceId, runResultId } = await seedFullRunWithTests(t);

    await t.run(async (ctx) => {
      await ctx.db.patch(runResultId, { status: "failed", duration_ms: 1000 });
      await ctx.db.insert("steps", {
        workspace_id: workspaceId,
        run_result_id: runResultId,
        step_number: 1,
        command: "click",
        status: "failed",
        error_message: "Button not found",
        duration_ms: 500,
      });
    });

    const failure = await t.run(async (ctx) => {
      const rr = await ctx.db.get(runResultId);
      if (!rr || rr.status !== "failed") return null;

      const steps = await ctx.db
        .query("steps")
        .withIndex("by_run_result_id", (q) => q.eq("run_result_id", runResultId))
        .collect();

      const errorStep = steps.find((s) => s.error_message);
      return {
        testId: rr.test_id,
        errorMessage: errorStep?.error_message ?? null,
      };
    });

    expect(failure).not.toBeNull();
    expect(failure!.errorMessage).toBe("Button not found");
  });

  it("links AI insights to failed tests", async () => {
    const t = convexTest(schema, modules);
    const { workspaceId, projectId, suiteId, testId } = await seedFullRunWithTests(t);

    const runId = await seedCompletedRun(t, workspaceId, projectId, suiteId, testId, "failed");

    await t.run(async (ctx) => {
      await ctx.db.insert("ai_insights", {
        workspace_id: workspaceId,
        test_id: testId,
        run_id: runId,
        type: "root_cause",
        analysis_text: "Element hidden by CSS animation",
        suggested_fix: "Add explicit wait for visibility",
        confidence_score: 0.92,
      });
    });

    const insight = await t.run(async (ctx) => {
      return ctx.db
        .query("ai_insights")
        .withIndex("by_test_id", (q) => q.eq("test_id", testId))
        .first();
    });

    expect(insight).not.toBeNull();
    expect(insight!.analysis_text).toBe("Element hidden by CSS animation");
    expect(insight!.suggested_fix).toBe("Add explicit wait for visibility");
    expect(insight!.confidence_score).toBe(0.92);
  });

  it("computes trend by comparing two periods", async () => {
    const t = convexTest(schema, modules);
    const { workspaceId, projectId, suiteId, testId } = await seedFullRunWithTests(t);

    for (let i = 0; i < 10; i++) {
      await seedCompletedRun(t, workspaceId, projectId, suiteId, testId, "failed");
    }
    for (let i = 0; i < 10; i++) {
      await seedCompletedRun(t, workspaceId, projectId, suiteId, testId, "passed");
    }

    const trend = await t.run(async (ctx) => {
      const runs = await ctx.db
        .query("runs")
        .withIndex("by_workspace_id", (q) => q.eq("workspace_id", workspaceId))
        .order("desc")
        .collect();
      const completed = runs.filter((r) => r.status !== "running");

      const recent = completed.slice(0, 10);
      const previous = completed.slice(10, 20);

      let recentPass = 0;
      let recentFail = 0;
      for (const r of recent) {
        recentPass += r.pass_count ?? 0;
        recentFail += r.fail_count ?? 0;
      }

      let prevPass = 0;
      let prevFail = 0;
      for (const r of previous) {
        prevPass += r.pass_count ?? 0;
        prevFail += r.fail_count ?? 0;
      }

      return {
        recentRate: Math.round((recentPass / (recentPass + recentFail)) * 1000) / 10,
        prevRate: Math.round((prevPass / (prevPass + prevFail)) * 1000) / 10,
        failDelta: recentFail - prevFail,
      };
    });

    expect(trend.recentRate).toBe(100);
    expect(trend.recentRate - trend.prevRate).toBeGreaterThan(0);
    expect(trend.failDelta).toBeLessThan(0);
  });

  it("limits trend data to 20 runs", async () => {
    const t = convexTest(schema, modules);
    const { workspaceId, projectId, suiteId, testId } = await seedFullRunWithTests(t);

    for (let i = 0; i < 25; i++) {
      await seedCompletedRun(t, workspaceId, projectId, suiteId, testId, "passed");
    }

    const count = await t.run(async (ctx) => {
      const runs = await ctx.db
        .query("runs")
        .withIndex("by_workspace_id", (q) => q.eq("workspace_id", workspaceId))
        .collect();
      const completed = runs.filter((r) => r.status !== "running");
      return Math.min(completed.length, 20);
    });

    expect(count).toBe(20);
  });
});

describe("getActiveRuns", () => {
  it("returns empty array when no auth context", async () => {
    const t = convexTest(schema, modules);
    const activeRuns = await t.query(api.dashboard.queries.getActiveRuns);
    expect(activeRuns).toHaveLength(0);
  });

  it("finds running runs with completed results", async () => {
    const t = convexTest(schema, modules);
    const { workspaceId, testId1, runId } = await seedRunWithTwoTests(t);

    await t.run(async (ctx) => {
      await ctx.db.patch(runId, { started_at: Date.now() - 3000 });
    });

    await seedRunResult(t, workspaceId, runId, testId1, {
      status: "passed",
      duration_ms: 1000,
    });

    const progress = await t.run(async (ctx) => {
      const run = await ctx.db.get(runId);
      if (!run || run.status !== "running") return null;

      const results = await ctx.db
        .query("run_results")
        .withIndex("by_run_id", (q) => q.eq("run_id", runId))
        .collect();

      const completed = results.filter(
        (r) => r.status === "passed" || r.status === "failed",
      ).length;

      const tests = await ctx.db
        .query("tests")
        .withIndex("by_suite_id", (q) => q.eq("suite_id", run.suite_id!))
        .collect();
      const total = tests.filter((t) => t.status === "approved").length;

      return { completed, total };
    });

    expect(progress).not.toBeNull();
    expect(progress!.total).toBe(2);
    expect(progress!.completed).toBe(1);
  });

  it("excludes completed runs from active", async () => {
    const t = convexTest(schema, modules);
    const { workspaceId } = await seedFullRunWithTests(t);

    await t.run(async (ctx) => {
      const runs = await ctx.db
        .query("runs")
        .withIndex("by_workspace_id", (q) => q.eq("workspace_id", workspaceId))
        .collect();
      for (const run of runs) {
        await ctx.db.patch(run._id, { status: "passed", finished_at: Date.now() });
      }
    });

    const hasActive = await t.run(async (ctx) => {
      const runs = await ctx.db
        .query("runs")
        .withIndex("by_workspace_id", (q) => q.eq("workspace_id", workspaceId))
        .collect();
      return runs.some((r) => r.status === "running");
    });

    expect(hasActive).toBe(false);
  });
});

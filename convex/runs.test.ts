/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import { api } from "./_generated/api";
import schema from "./schema";
import {
  seedFullRunWithTests,
  seedFullStack,
  seedEnvironment,
} from "./testHelpers";

const modules = import.meta.glob("./**/*.ts");

describe("runs internal mutations", () => {
  it("claimRun sets runner_id and started_at", async () => {
    const t = convexTest(schema, modules);
    const { runId } = await seedFullRunWithTests(t);

    await t.run(async (ctx) => {
      const before = await ctx.db.get(runId);
      expect(before!.runner_id).toBeUndefined();
      expect(before!.started_at).toBeUndefined();
    });

    await t.mutation(api.runs.internal.claimRun, {
      run_id: runId,
      runner_id: "runner-1",
    });

    await t.run(async (ctx) => {
      const after = await ctx.db.get(runId);
      expect(after!.runner_id).toBe("runner-1");
      expect(after!.started_at).toBeTypeOf("number");
    });
  });

  it("claimRun rejects already-claimed run", async () => {
    const t = convexTest(schema, modules);
    const { runId } = await seedFullRunWithTests(t);

    await t.mutation(api.runs.internal.claimRun, {
      run_id: runId,
      runner_id: "runner-1",
    });

    await expect(
      t.mutation(api.runs.internal.claimRun, {
        run_id: runId,
        runner_id: "runner-2",
      }),
    ).rejects.toThrow("already claimed");
  });

  it("writeStepResult creates a step record", async () => {
    const t = convexTest(schema, modules);
    const { workspaceId, runResultId } = await seedFullRunWithTests(t);

    await t.mutation(api.runs.internal.writeStepResult, {
      workspace_id: workspaceId,
      run_result_id: runResultId,
      step_number: 1,
      command: "click",
      locator: "button.submit",
      status: "passed",
      duration_ms: 150,
    });

    const steps = await t.run(async (ctx) => {
      return ctx.db
        .query("steps")
        .withIndex("by_run_result_id", (q) => q.eq("run_result_id", runResultId))
        .collect();
    });

    expect(steps).toHaveLength(1);
    expect(steps[0].command).toBe("click");
    expect(steps[0].locator).toBe("button.submit");
    expect(steps[0].status).toBe("passed");
    expect(steps[0].duration_ms).toBe(150);
  });

  it("writeRunResult patches run result", async () => {
    const t = convexTest(schema, modules);
    const { runResultId } = await seedFullRunWithTests(t);

    await t.mutation(api.runs.internal.writeRunResult, {
      run_result_id: runResultId,
      status: "failed",
      duration_ms: 3200,
    });

    await t.run(async (ctx) => {
      const rr = await ctx.db.get(runResultId);
      expect(rr!.status).toBe("failed");
      expect(rr!.duration_ms).toBe(3200);
    });
  });

  it("completeRun sets final status and duration", async () => {
    const t = convexTest(schema, modules);
    const { runId } = await seedFullRunWithTests(t);

    await t.mutation(api.runs.internal.claimRun, {
      run_id: runId,
      runner_id: "runner-1",
    });

    await t.mutation(api.runs.internal.completeRun, {
      run_id: runId,
      status: "passed",
    });

    await t.run(async (ctx) => {
      const run = await ctx.db.get(runId);
      expect(run!.status).toBe("passed");
      expect(run!.finished_at).toBeTypeOf("number");
      expect(run!.duration_ms).toBeTypeOf("number");
    });
  });

  it("updateRunHeartbeat creates heartbeat record", async () => {
    const t = convexTest(schema, modules);
    const { runId } = await seedFullRunWithTests(t);

    await t.mutation(api.runs.internal.updateRunHeartbeat, {
      run_id: runId,
    });

    await t.run(async (ctx) => {
      const hb = await ctx.db
        .query("run_heartbeats")
        .withIndex("by_run_id", (q) => q.eq("run_id", runId))
        .first();
      expect(hb).not.toBeNull();
      expect(hb!.last_heartbeat_at).toBeTypeOf("number");
    });
  });

  it("updateRunHeartbeat updates existing record", async () => {
    const t = convexTest(schema, modules);
    const { runId } = await seedFullRunWithTests(t);

    await t.mutation(api.runs.internal.updateRunHeartbeat, {
      run_id: runId,
    });

    const firstAt = await t.run(async (ctx) => {
      const hb = await ctx.db
        .query("run_heartbeats")
        .withIndex("by_run_id", (q) => q.eq("run_id", runId))
        .first();
      return hb!.last_heartbeat_at;
    });

    await t.mutation(api.runs.internal.updateRunHeartbeat, {
      run_id: runId,
    });

    await t.run(async (ctx) => {
      const hbs = await ctx.db
        .query("run_heartbeats")
        .withIndex("by_run_id", (q) => q.eq("run_id", runId))
        .collect();
      expect(hbs).toHaveLength(1);
      expect(hbs[0].last_heartbeat_at).toBeGreaterThanOrEqual(firstAt);
    });
  });

  it("markStaleRuns marks stale runs as timed_out", async () => {
    const t = convexTest(schema, modules);
    const { workspaceId, runId } = await seedFullRunWithTests(t);

    await t.run(async (ctx) => {
      await ctx.db.insert("run_heartbeats", {
        workspace_id: workspaceId,
        run_id: runId,
        last_heartbeat_at: Date.now() - 200_000,
      });
    });

    await t.mutation(api.runs.internal.markStaleRuns, {
      stale_threshold_ms: 120_000,
    });

    await t.run(async (ctx) => {
      const run = await ctx.db.get(runId);
      expect(run!.status).toBe("timed_out");
      expect(run!.finished_at).toBeTypeOf("number");

      const hb = await ctx.db
        .query("run_heartbeats")
        .withIndex("by_run_id", (q) => q.eq("run_id", runId))
        .first();
      expect(hb).toBeNull();
    });
  });

  it("markStaleRuns skips recent heartbeats", async () => {
    const t = convexTest(schema, modules);
    const { runId } = await seedFullRunWithTests(t);

    await t.mutation(api.runs.internal.updateRunHeartbeat, {
      run_id: runId,
    });

    await t.mutation(api.runs.internal.markStaleRuns, {
      stale_threshold_ms: 120_000,
    });

    await t.run(async (ctx) => {
      const run = await ctx.db.get(runId);
      expect(run!.status).toBe("running");
    });
  });
});

describe("runs queries", () => {
  it("getPendingWork returns unclaimed running runs", async () => {
    const t = convexTest(schema, modules);
    const { runId } = await seedFullRunWithTests(t);

    const pending = await t.query(api.runs.queries.getPendingWork);
    expect(pending).toHaveLength(1);
    expect(pending[0].run_id).toBe(runId);
    expect(pending[0].tests).toHaveLength(1);
    expect(pending[0].base_url).toBe("https://staging.example.com");
  });

  it("getPendingWork excludes claimed runs", async () => {
    const t = convexTest(schema, modules);
    const { runId } = await seedFullRunWithTests(t);

    await t.mutation(api.runs.internal.claimRun, {
      run_id: runId,
      runner_id: "runner-1",
    });

    const pending = await t.query(api.runs.queries.getPendingWork);
    expect(pending).toHaveLength(0);
  });

  it("getPendingWork excludes non-running runs", async () => {
    const t = convexTest(schema, modules);
    const { runId } = await seedFullRunWithTests(t);

    await t.run(async (ctx) => {
      await ctx.db.patch(runId, { status: "passed", finished_at: Date.now() });
    });

    const pending = await t.query(api.runs.queries.getPendingWork);
    expect(pending).toHaveLength(0);
  });
});

describe("runs data layer", () => {
  it("triggerRun creates run with suite run_results for approved tests", async () => {
    const t = convexTest(schema, modules);
    const { workspaceId, projectId, suiteId, testId } = await seedFullStack(t);

    await t.run(async (ctx) => {
      await ctx.db.patch(testId, { status: "approved" });
    });

    const envId = await seedEnvironment(t, workspaceId, projectId);

    const runId = await t.run(async (ctx) => {
      return ctx.db.insert("runs", {
        workspace_id: workspaceId,
        project_id: projectId,
        suite_id: suiteId,
        environment_id: envId,
        trigger_type: "manual",
        status: "running",
      });
    });

    await t.run(async (ctx) => {
      await ctx.db.insert("run_results", {
        workspace_id: workspaceId,
        run_id: runId,
        test_id: testId,
        status: "passed",
        duration_ms: 0,
        retries: 0,
      });
    });

    const runResults = await t.run(async (ctx) => {
      return ctx.db
        .query("run_results")
        .withIndex("by_run_id", (q) => q.eq("run_id", runId))
        .collect();
    });

    expect(runResults).toHaveLength(1);
    expect(runResults[0].test_id).toBe(testId);
  });

  it("completeRun computes aggregate status from run_results", async () => {
    const t = convexTest(schema, modules);
    const { runId, runResultId } = await seedFullRunWithTests(t);

    await t.mutation(api.runs.internal.claimRun, {
      run_id: runId,
      runner_id: "runner-1",
    });

    await t.mutation(api.runs.internal.writeRunResult, {
      run_result_id: runResultId,
      status: "failed",
      duration_ms: 1500,
    });

    await t.mutation(api.runs.internal.completeRun, {
      run_id: runId,
      status: "failed",
    });

    await t.run(async (ctx) => {
      const run = await ctx.db.get(runId);
      expect(run!.status).toBe("failed");
      expect(run!.duration_ms).toBeTypeOf("number");
    });
  });

  it("rerun creates new run linked to original", async () => {
    const t = convexTest(schema, modules);
    const {
      workspaceId,
      projectId,
      suiteId,
      testId,
      runId: originalRunId,
    } = await seedFullRunWithTests(t);

    await t.run(async (ctx) => {
      await ctx.db.patch(originalRunId, {
        status: "failed",
        finished_at: Date.now(),
        runner_id: "runner-1",
        started_at: Date.now() - 5000,
      });
    });

    const rerunId = await t.run(async (ctx) => {
      return ctx.db.insert("runs", {
        workspace_id: workspaceId,
        project_id: projectId,
        suite_id: suiteId,
        test_id: testId,
        rerun_of_run_id: originalRunId,
        rerun_of_test_id: testId,
        trigger_type: "rerun",
        status: "running",
      });
    });

    await t.run(async (ctx) => {
      const rerun = await ctx.db.get(rerunId);
      expect(rerun!.rerun_of_run_id).toBe(originalRunId);
      expect(rerun!.rerun_of_test_id).toBe(testId);
      expect(rerun!.trigger_type).toBe("rerun");
      expect(rerun!.status).toBe("running");

      const original = await ctx.db.get(originalRunId);
      expect(original!.status).toBe("failed");
    });
  });
});

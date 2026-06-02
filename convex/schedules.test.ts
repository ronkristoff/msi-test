/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import {
  seedWorkspace,
  seedProject,
  seedSuite,
  seedTestDoc,
  seedEnvironment,
  seedRun,
  seedRunResult,
  seedSchedule,
} from "./testHelpers";

const modules = import.meta.glob("./**/*.ts");

describe("schedules data layer", () => {
  it("stores and retrieves a schedule", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const { suiteId } = await seedSuite(t, workspaceId);
    const envId = await seedEnvironment(t, workspaceId, projectId);

    const scheduleId = await seedSchedule(t, workspaceId, suiteId, envId, {
      name: "Daily regression",
      cadence_seconds: 86400,
    });

    const schedule = await t.run(async (ctx) => ctx.db.get(scheduleId));
    expect(schedule!.name).toBe("Daily regression");
    expect(schedule!.suite_id).toBe(suiteId);
    expect(schedule!.cadence.seconds).toBe(86400);
    expect(schedule!.enabled).toBe(true);
  });

  it("links a run back to a schedule via schedule_id", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const { suiteId } = await seedSuite(t, workspaceId);
    const envId = await seedEnvironment(t, workspaceId, projectId);

    const scheduleId = await seedSchedule(t, workspaceId, suiteId, envId);

    const runId = await seedRun(t, workspaceId, projectId, suiteId, null, {
      trigger_type: "scheduled",
      schedule_id: scheduleId,
    });

    const run = await t.run(async (ctx) => ctx.db.get(runId));
    expect(run!.trigger_type).toBe("scheduled");
    expect(run!.schedule_id).toBe(scheduleId);
  });

  it("updates schedule last_run_at and next_run_at", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const { suiteId } = await seedSuite(t, workspaceId);
    const envId = await seedEnvironment(t, workspaceId, projectId);

    const scheduleId = await seedSchedule(t, workspaceId, suiteId, envId, {
      cadence_seconds: 604800,
      next_run_at: 1000,
    });

    const now = 5000;
    await t.run(async (ctx) => {
      await ctx.db.patch(scheduleId, {
        last_run_at: now,
        next_run_at: now + 604800000,
      });
    });

    const schedule = await t.run(async (ctx) => ctx.db.get(scheduleId));
    expect(schedule!.last_run_at).toBe(now);
    expect(schedule!.next_run_at).toBe(now + 604800000);
  });

  it("deleting a schedule does not affect past runs", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const { suiteId } = await seedSuite(t, workspaceId);
    const envId = await seedEnvironment(t, workspaceId, projectId);

    const scheduleId = await seedSchedule(t, workspaceId, suiteId, envId);

    const runId = await seedRun(t, workspaceId, projectId, suiteId, null, {
      trigger_type: "scheduled",
    });

    await t.run(async (ctx) => {
      await ctx.db.patch(runId, { schedule_id: scheduleId });
    });

    await t.run(async (ctx) => {
      await ctx.db.delete(scheduleId);
    });

    const run = await t.run(async (ctx) => ctx.db.get(runId));
    expect(run).not.toBeNull();
    expect(run!.trigger_type).toBe("scheduled");
  });
});

describe("schedule run diff", () => {
  it("detects tests that flipped status between consecutive runs", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const { projectId, suiteId, testId } = await seedTestDoc(t, workspaceId, {
      status: "approved",
    });
    const envId = await seedEnvironment(t, workspaceId, projectId);

    const scheduleId = await seedSchedule(t, workspaceId, suiteId, envId);

    const previousRunId = await seedRun(t, workspaceId, projectId, suiteId, null, {
      status: "passed",
      schedule_id: scheduleId,
    });
    await seedRunResult(t, workspaceId, previousRunId, testId, {
      status: "passed",
    });

    const currentRunId = await seedRun(t, workspaceId, projectId, suiteId, null, {
      status: "failed",
      schedule_id: scheduleId,
    });
    await seedRunResult(t, workspaceId, currentRunId, testId, {
      status: "failed",
    });

    const prevResults = await t.run(async (ctx) => {
      return ctx.db
        .query("run_results")
        .withIndex("by_run_id", (q) => q.eq("run_id", previousRunId))
        .collect();
    });
    const currResults = await t.run(async (ctx) => {
      return ctx.db
        .query("run_results")
        .withIndex("by_run_id", (q) => q.eq("run_id", currentRunId))
        .collect();
    });

    expect(prevResults[0].status).toBe("passed");
    expect(currResults[0].status).toBe("failed");
  });

  it("stores runs with scheduled trigger_type", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);

    const runId = await seedRun(t, workspaceId, projectId, null, null, {
      trigger_type: "scheduled",
    });

    const run = await t.run(async (ctx) => ctx.db.get(runId));
    expect(run!.trigger_type).toBe("scheduled");
  });
});

describe("schedules index queries", () => {
  it("queries schedules by workspace_id", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const { suiteId } = await seedSuite(t, workspaceId);
    const envId = await seedEnvironment(t, workspaceId, projectId);

    await seedSchedule(t, workspaceId, suiteId, envId, {
      name: "Schedule A",
      cadence_seconds: 3600,
    });
    await seedSchedule(t, workspaceId, suiteId, envId, {
      name: "Schedule B",
      cadence_seconds: 86400,
      enabled: false,
    });

    const results = await t.run(async (ctx) => {
      return ctx.db
        .query("schedules")
        .withIndex("by_workspace_id", (q) =>
          q.eq("workspace_id", workspaceId),
        )
        .collect();
    });

    expect(results.length).toBe(2);
    expect(results.map((r) => r.name)).toContain("Schedule A");
    expect(results.map((r) => r.name)).toContain("Schedule B");
  });

  it("queries due schedules by next_run_at", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const { suiteId } = await seedSuite(t, workspaceId);
    const envId = await seedEnvironment(t, workspaceId, projectId);

    const now = Date.now();

    await seedSchedule(t, workspaceId, suiteId, envId, {
      name: "Due",
      next_run_at: now - 1000,
    });
    await seedSchedule(t, workspaceId, suiteId, envId, {
      name: "Not yet",
      next_run_at: now + 100000,
    });

    const due = await t.run(async (ctx) => {
      return ctx.db
        .query("schedules")
        .withIndex("by_next_run_at", (q) => q.lte("next_run_at", now))
        .collect();
    });

    expect(due.length).toBe(1);
    expect(due[0].name).toBe("Due");
  });
});

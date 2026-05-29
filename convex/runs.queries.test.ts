/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import type { Doc } from "./_generated/dataModel";
import {
  seedWorkspace,
  seedRun,
} from "./testHelpers";

const modules = import.meta.glob("./**/*.ts");

async function seedCompletedRun(
  t: ReturnType<typeof convexTest>,
  workspaceId: string,
  overrides?: {
    status?: "running" | "passed" | "failed" | "cancelled" | "timed_out";
    branch?: string;
    duration_ms?: number;
    pass_count?: number;
    fail_count?: number;
    skip_count?: number;
    suiteName?: string;
    projectName?: string;
  },
) {
  const projectId = await t.run(async (ctx) => {
    return ctx.db.insert("projects", {
      workspace_id: workspaceId,
      name: overrides?.projectName ?? "Test Project",
      app_url: "https://example.com",
    });
  });
  const suiteId = await t.run(async (ctx) => {
    return ctx.db.insert("suites", {
      workspace_id: workspaceId,
      project_id: projectId,
      name: overrides?.suiteName ?? "Test Suite",
      source_type: "manual",
    });
  });
  const runId = await seedRun(t, workspaceId, projectId, suiteId, null, {
    status: overrides?.status ?? "passed",
    branch: overrides?.branch,
    duration_ms: overrides?.duration_ms,
    pass_count: overrides?.pass_count,
    fail_count: overrides?.fail_count,
    skip_count: overrides?.skip_count,
  });
  return { projectId, suiteId, runId };
}

describe("isFlaky", () => {
  async function getIsFlaky() {
    const { isFlaky } = await import("./runs/queries");
    return isFlaky;
  }

  it("returns true when both pass and fail counts > 0", async () => {
    const isFlaky = await getIsFlaky();
    const t = convexTest(schema, modules);
    const wsId = await seedWorkspace(t);
    const { runId } = await seedCompletedRun(t, wsId, { pass_count: 3, fail_count: 2 });
    const run = await t.run(async (ctx) => ctx.db.get(runId));
    expect(run).toBeTruthy();
    expect(isFlaky(run!)).toBe(true);
  });

  it("returns false when only passes", async () => {
    const isFlaky = await getIsFlaky();
    const t = convexTest(schema, modules);
    const wsId = await seedWorkspace(t);
    const { runId } = await seedCompletedRun(t, wsId, { pass_count: 5, fail_count: 0 });
    const run = await t.run(async (ctx) => ctx.db.get(runId));
    expect(isFlaky(run!)).toBe(false);
  });

  it("returns false when only fails", async () => {
    const isFlaky = await getIsFlaky();
    const t = convexTest(schema, modules);
    const wsId = await seedWorkspace(t);
    const { runId } = await seedCompletedRun(t, wsId, { pass_count: 0, fail_count: 3 });
    const run = await t.run(async (ctx) => ctx.db.get(runId));
    expect(isFlaky(run!)).toBe(false);
  });

  it("returns false when counts are undefined", async () => {
    const isFlaky = await getIsFlaky();
    const t = convexTest(schema, modules);
    const wsId = await seedWorkspace(t);
    const { runId } = await seedCompletedRun(t, wsId, { status: "running" });
    const run = await t.run(async (ctx) => ctx.db.get(runId));
    expect(isFlaky(run!)).toBe(false);
  });
});

describe("sortRuns", () => {
  async function seedMultiple(
    t: ReturnType<typeof convexTest>,
    wsId: string,
    configs: Array<{
      duration_ms?: number;
      pass_count?: number;
      fail_count?: number;
      suiteName?: string;
    }>,
  ) {
    const results = [];
    for (const cfg of configs) {
      results.push(await seedCompletedRun(t, wsId, cfg));
    }
    return results;
  }

  it("sorts by duration ascending", async () => {
    const { sortRuns } = await import("./runs/queries");
    const t = convexTest(schema, modules);
    const wsId = await seedWorkspace(t);
    await seedMultiple(t, wsId, [
      { suiteName: "Slow", duration_ms: 5000 },
      { suiteName: "Fast", duration_ms: 500 },
    ]);

    const runs = await t.run(async (ctx) =>
      ctx.db.query("runs").withIndex("by_workspace_id", (q) => q.eq("workspace_id", wsId)).collect()
    );

    const sorted = sortRuns(runs, "duration", "asc");
    expect(sorted[0].duration_ms).toBe(500);
    expect(sorted[1].duration_ms).toBe(5000);
  });

  it("sorts by fail_count descending", async () => {
    const { sortRuns } = await import("./runs/queries");
    const t = convexTest(schema, modules);
    const wsId = await seedWorkspace(t);
    await seedMultiple(t, wsId, [
      { suiteName: "Clean", fail_count: 0, pass_count: 5 },
      { suiteName: "Broken", fail_count: 3, pass_count: 2 },
    ]);

    const runs = await t.run(async (ctx) =>
      ctx.db.query("runs").withIndex("by_workspace_id", (q) => q.eq("workspace_id", wsId)).collect()
    );

    const sorted = sortRuns(runs, "fail_count", "desc");
    expect(sorted[0].fail_count).toBe(3);
    expect(sorted[1].fail_count).toBe(0);
  });

  it("sorts by recency descending (newest first)", async () => {
    const { sortRuns } = await import("./runs/queries");
    const t = convexTest(schema, modules);
    const wsId = await seedWorkspace(t);
    const first = await seedCompletedRun(t, wsId, { suiteName: "First" });
    const second = await seedCompletedRun(t, wsId, { suiteName: "Second" });

    const runs = await t.run(async (ctx) =>
      ctx.db.query("runs").withIndex("by_workspace_id", (q) => q.eq("workspace_id", wsId)).collect()
    );

    const sorted = sortRuns(runs, "recency", "desc");
    expect(sorted[0]._id).toBe(second.runId);
    expect(sorted[1]._id).toBe(first.runId);
  });

  it("sorts flaky runs first when sorting by flakiness desc", async () => {
    const { sortRuns } = await import("./runs/queries");
    const t = convexTest(schema, modules);
    const wsId = await seedWorkspace(t);
    await seedMultiple(t, wsId, [
      { suiteName: "Stable", pass_count: 5, fail_count: 0 },
      { suiteName: "Flaky", pass_count: 3, fail_count: 2 },
    ]);

    const runs = await t.run(async (ctx) =>
      ctx.db.query("runs").withIndex("by_workspace_id", (q) => q.eq("workspace_id", wsId)).collect()
    );

    const sorted = sortRuns(runs, "flakiness", "desc");
    expect(sorted[0].fail_count).toBe(2);
    expect(sorted[0].pass_count).toBe(3);
  });
});

function makeEnriched(
  overrides: Partial<{ _id: string; suite_name: string | null; project_name: string | null; environment_name: string | null }>,
) {
  return {
    _id: overrides._id ?? "r1",
    suite_name: overrides.suite_name ?? null,
    environment_name: overrides.environment_name ?? null,
    project_name: overrides.project_name ?? null,
  } as Doc<"runs"> & { suite_name: string | null; environment_name: string | null; project_name: string | null };
}

describe("matchSearch", () => {
  it("matches run ID", async () => {
    const { matchSearch } = await import("./runs/queries");
    const run = makeEnriched({ _id: "abc123def", suite_name: "Login", project_name: "App" });
    expect(matchSearch(run, "abc123")).toBe(true);
    expect(matchSearch(run, "XYZ")).toBe(false);
  });

  it("matches suite name case-insensitively", async () => {
    const { matchSearch } = await import("./runs/queries");
    const run = makeEnriched({ suite_name: "Login Tests", project_name: "App" });
    expect(matchSearch(run, "login")).toBe(true);
    expect(matchSearch(run, "LOGIN TESTS")).toBe(true);
    expect(matchSearch(run, "checkout")).toBe(false);
  });

  it("matches project name", async () => {
    const { matchSearch } = await import("./runs/queries");
    const run = makeEnriched({ suite_name: null, project_name: "My Special App" });
    expect(matchSearch(run, "special")).toBe(true);
    expect(matchSearch(run, "other")).toBe(false);
  });

  it("returns false when all fields are null", async () => {
    const { matchSearch } = await import("./runs/queries");
    const run = makeEnriched({ suite_name: null, project_name: null });
    expect(matchSearch(run, "anything")).toBe(false);
  });
});

describe("getRunFilterOptions — status counts data layer", () => {
  it("counts runs by status including flaky", async () => {
    const t = convexTest(schema, modules);
    const wsId = await seedWorkspace(t);
    await seedCompletedRun(t, wsId, { status: "passed", pass_count: 5, fail_count: 0 });
    await seedCompletedRun(t, wsId, { status: "failed", pass_count: 0, fail_count: 3 });
    await seedCompletedRun(t, wsId, { status: "failed", pass_count: 2, fail_count: 1 });
    await seedCompletedRun(t, wsId, { status: "running" });

    const { isFlaky } = await import("./runs/queries");

    const runs = await t.run(async (ctx) =>
      ctx.db.query("runs").withIndex("by_workspace_id", (q) => q.eq("workspace_id", wsId)).collect()
    );

    const counts: Record<string, number> = { all: runs.length, running: 0, passed: 0, failed: 0, cancelled: 0, flaky: 0 };
    for (const r of runs) {
      counts[r.status] = (counts[r.status] ?? 0) + 1;
      if (isFlaky(r)) counts.flaky++;
    }

    expect(counts.all).toBe(4);
    expect(counts.passed).toBe(1);
    expect(counts.failed).toBe(2);
    expect(counts.running).toBe(1);
    expect(counts.flaky).toBe(1);
  });

  it("returns empty for workspace with no runs", async () => {
    const t = convexTest(schema, modules);
    const wsId = await seedWorkspace(t);

    const runs = await t.run(async (ctx) =>
      ctx.db.query("runs").withIndex("by_workspace_id", (q) => q.eq("workspace_id", wsId)).collect()
    );

    expect(runs).toHaveLength(0);
  });
});

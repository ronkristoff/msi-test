/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import { api } from "./_generated/api";
import schema from "./schema";
import {
  seedWorkspace,
  seedSuite,
  seedRun,
  seedTestDoc,
  seedExploration,
  seedProject,
} from "./testHelpers";

const modules = import.meta.glob("./**/*.ts");

describe("getActiveTasks", () => {
  it("returns empty array when no auth context", async () => {
    const t = convexTest(schema, modules);
    const tasks = await t.query(api.suites.queries.getActiveTasks);
    expect(tasks).toEqual([]);
  });

  it("returns empty when no generating suites or running runs exist", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t, "user1");

    await seedSuite(t, workspaceId);

    const tasks = await t.query(api.suites.queries.getActiveTasks);
    expect(tasks).toEqual([]);
  });

  it("data layer: finds generating suites by workspace_id + status index", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t, "user1");

    const { suiteId } = await seedSuite(t, workspaceId, {
      status: "generating",
      triggered_by: "user1",
    });

    const found = await t.run(async (ctx) => {
      return ctx.db
        .query("suites")
        .withIndex("by_workspace_id_and_status", (q) =>
          q.eq("workspace_id", workspaceId).eq("status", "generating"),
        )
        .collect();
    });

    expect(found).toHaveLength(1);
    expect(found[0]._id).toBe(suiteId);
    expect(found[0].status).toBe("generating");
    expect(found[0].triggered_by).toBe("user1");
  });

  it("data layer: does not find ready suites via generating index", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t, "user1");

    await seedSuite(t, workspaceId);

    const found = await t.run(async (ctx) => {
      return ctx.db
        .query("suites")
        .withIndex("by_workspace_id_and_status", (q) =>
          q.eq("workspace_id", workspaceId).eq("status", "generating"),
        )
        .collect();
    });

    expect(found).toHaveLength(0);
  });

  it("data layer: filters runs by workspace_id and status", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t, "user1");
    const { projectId, suiteId } = await seedTestDoc(t, workspaceId);

    await seedRun(t, workspaceId, projectId, suiteId, null, {
      status: "running",
    });
    await seedRun(t, workspaceId, projectId, suiteId, null, {
      status: "passed",
    });

    const runningRuns = await t.run(async (ctx) => {
      const all = await ctx.db
        .query("runs")
        .withIndex("by_workspace_id", (q) => q.eq("workspace_id", workspaceId))
        .collect();
      return all.filter((r) => r.status === "running");
    });

    expect(runningRuns).toHaveLength(1);
    expect(runningRuns[0].status).toBe("running");
  });

  it("data layer: scopes suites to correct workspace", async () => {
    const t = convexTest(schema, modules);
    const ws1 = await seedWorkspace(t, "user1");
    const ws2 = await seedWorkspace(t, "user2");

    await seedSuite(t, ws1, {
      status: "generating",
      triggered_by: "user1",
    });
    await seedSuite(t, ws2, {
      status: "generating",
      triggered_by: "user2",
    });

    const ws1Generating = await t.run(async (ctx) => {
      return ctx.db
        .query("suites")
        .withIndex("by_workspace_id_and_status", (q) =>
          q.eq("workspace_id", ws1).eq("status", "generating"),
        )
        .collect();
    });

    expect(ws1Generating).toHaveLength(1);
    expect(ws1Generating[0].triggered_by).toBe("user1");

    const ws2Generating = await t.run(async (ctx) => {
      return ctx.db
        .query("suites")
        .withIndex("by_workspace_id_and_status", (q) =>
          q.eq("workspace_id", ws2).eq("status", "generating"),
        )
        .collect();
    });

    expect(ws2Generating).toHaveLength(1);
    expect(ws2Generating[0].triggered_by).toBe("user2");
  });

  it("data layer: resolves user name from workspace_members", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t, "user1");

    const name = await t.run(async (ctx) => {
      const membership = await ctx.db
        .query("workspace_members")
        .withIndex("by_workspace_id_and_user_id", (q) =>
          q.eq("workspace_id", workspaceId).eq("user_id", "user1"),
        )
        .first();
      return membership?.user_name ?? "Unknown User";
    });

    expect(name).toBe("user1");
  });

  it("data layer: unknown user resolves to Unknown User", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t, "user1");

    const name = await t.run(async (ctx) => {
      const membership = await ctx.db
        .query("workspace_members")
        .withIndex("by_workspace_id_and_user_id", (q) =>
          q.eq("workspace_id", workspaceId).eq("user_id", "nonexistent"),
        )
        .first();
      return membership?.user_name ?? "Unknown User";
    });

    expect(name).toBe("Unknown User");
  });

  it("data layer: mixes generating suites and running runs", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t, "user1");
    const { projectId, suiteId } = await seedTestDoc(t, workspaceId);

    await seedSuite(t, workspaceId, {
      status: "generating",
      triggered_by: "user1",
    });
    await seedRun(t, workspaceId, projectId, suiteId, null, {
      status: "running",
    });

    const generating = await t.run(async (ctx) => {
      return ctx.db
        .query("suites")
        .withIndex("by_workspace_id_and_status", (q) =>
          q.eq("workspace_id", workspaceId).eq("status", "generating"),
        )
        .collect();
    });

    const running = await t.run(async (ctx) => {
      const all = await ctx.db
        .query("runs")
        .withIndex("by_workspace_id", (q) => q.eq("workspace_id", workspaceId))
        .collect();
      return all.filter((r) => r.status === "running");
    });

    expect(generating).toHaveLength(1);
    expect(running).toHaveLength(1);
  });

  it("data layer: run triggered_by resolves user name", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t, "user1");
    const { projectId, suiteId } = await seedTestDoc(t, workspaceId);

    const runId = await seedRun(t, workspaceId, projectId, suiteId, null, {
      status: "running",
    });

    await t.run(async (ctx) => {
      await ctx.db.patch(runId, { triggered_by: "user1" });
    });

    const name = await t.run(async (ctx) => {
      const membership = await ctx.db
        .query("workspace_members")
        .withIndex("by_workspace_id_and_user_id", (q) =>
          q.eq("workspace_id", workspaceId).eq("user_id", "user1"),
        )
        .first();
      return membership?.user_name ?? "Unknown User";
    });

    expect(name).toBe("user1");
  });

  it("data layer: finds active explorations by workspace_id + status index", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t, "user1");
    const projectId = await seedProject(t, workspaceId);

    await seedExploration(t, workspaceId, projectId, {
      status: "capturing",
      url: "https://example.com",
    });

    const found = await t.run(async (ctx) => {
      const results: { _id: string }[] = [];
      for (const status of ["pending", "capturing", "analyzing"]) {
        const batch = await ctx.db
          .query("explorations")
          .withIndex("by_workspace_id_and_status", (q) =>
            q.eq("workspace_id", workspaceId).eq("status", status),
          )
          .collect();
        results.push(...batch);
      }
      return results;
    });

    expect(found).toHaveLength(1);
  });

  it("data layer: does not find completed explorations", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t, "user1");
    const projectId = await seedProject(t, workspaceId);

    await seedExploration(t, workspaceId, projectId, {
      status: "completed",
      url: "https://example.com",
    });

    const found = await t.run(async (ctx) => {
      const results: { _id: string }[] = [];
      for (const status of ["pending", "capturing", "analyzing"]) {
        const batch = await ctx.db
          .query("explorations")
          .withIndex("by_workspace_id_and_status", (q) =>
            q.eq("workspace_id", workspaceId).eq("status", status),
          )
          .collect();
        results.push(...batch);
      }
      return results;
    });

    expect(found).toHaveLength(0);
  });

  it("data layer: scopes explorations to correct workspace", async () => {
    const t = convexTest(schema, modules);
    const ws1 = await seedWorkspace(t, "user1");
    const ws2 = await seedWorkspace(t, "user2");
    const p1 = await seedProject(t, ws1);
    const p2 = await seedProject(t, ws2);

    await seedExploration(t, ws1, p1, { status: "capturing", url: "https://a.com" });
    await seedExploration(t, ws2, p2, { status: "pending", url: "https://b.com" });

    const ws1Explorations = await t.run(async (ctx) => {
      const results: { _id: string }[] = [];
      for (const status of ["pending", "capturing", "analyzing"]) {
        const batch = await ctx.db
          .query("explorations")
          .withIndex("by_workspace_id_and_status", (q) =>
            q.eq("workspace_id", ws1).eq("status", status),
          )
          .collect();
        results.push(...batch);
      }
      return results;
    });

    expect(ws1Explorations).toHaveLength(1);

    const ws2Explorations = await t.run(async (ctx) => {
      const results: { _id: string }[] = [];
      for (const status of ["pending", "capturing", "analyzing"]) {
        const batch = await ctx.db
          .query("explorations")
          .withIndex("by_workspace_id_and_status", (q) =>
            q.eq("workspace_id", ws2).eq("status", status),
          )
          .collect();
        results.push(...batch);
      }
      return results;
    });

    expect(ws2Explorations).toHaveLength(1);
  });
});

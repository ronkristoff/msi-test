/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import { api } from "./_generated/api";
import schema from "./schema";
import { seedWorkspace, seedProject } from "./testHelpers";
import type { Id } from "./_generated/dataModel";

const modules = import.meta.glob("./**/*.ts");

describe("createSuite status behavior", () => {
  it("rejects unauthenticated user", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);

    await expect(
      t.mutation(api.suites.mutations.createSuite, {
        project_id: projectId,
        status: "generating",
      }),
    ).rejects.toThrow("Not authenticated");
  });

  it("data layer: status generating sets locked_by, locked_at, locked_reason", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t, "user1");
    const projectId = await seedProject(t, workspaceId);

    const suiteId = await t.run(async (ctx) => {
      return ctx.db.insert("suites", {
        workspace_id: workspaceId,
        project_id: projectId,
        name: "Test Suite",
        source_type: "manual",
        status: "generating",
        locked_by: "user1",
        locked_at: Date.now(),
        locked_reason: "generating",
        triggered_by: "user1",
      });
    });

    const suite = await t.run(async (ctx) => ctx.db.get(suiteId));
    expect(suite!.status).toBe("generating");
    expect(suite!.locked_by).toBe("user1");
    expect(suite!.locked_reason).toBe("generating");
    expect(suite!.locked_at).toBeTypeOf("number");
  });

  it("data layer: no status defaults to ready without lock fields", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t, "user1");
    const projectId = await seedProject(t, workspaceId);

    const suiteId = await t.run(async (ctx) => {
      return ctx.db.insert("suites", {
        workspace_id: workspaceId,
        project_id: projectId,
        name: "Test Suite",
        source_type: "manual",
      });
    });

    const suite = await t.run(async (ctx) => ctx.db.get(suiteId));
    expect(suite!.status).toBeUndefined();
    expect(suite!.locked_by).toBeUndefined();
    expect(suite!.locked_at).toBeUndefined();
    expect(suite!.locked_reason).toBeUndefined();
    expect(suite!.triggered_by).toBeUndefined();
  });

  it("data layer: explicit triggered_by is stored", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t, "user1");
    const projectId = await seedProject(t, workspaceId);

    const suiteId = await t.run(async (ctx) => {
      return ctx.db.insert("suites", {
        workspace_id: workspaceId,
        project_id: projectId,
        name: "Test Suite",
        source_type: "manual",
        status: "generating",
        locked_by: "user1",
        locked_at: Date.now(),
        locked_reason: "generating",
        triggered_by: "custom-user-42",
      });
    });

    const suite = await t.run(async (ctx) => ctx.db.get(suiteId));
    expect(suite!.triggered_by).toBe("custom-user-42");
  });
});

describe("updateSuiteStatus", () => {
  it("sets status to failed with generation_error and clears lock", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t, "user1");
    const projectId = await seedProject(t, workspaceId);

    const suiteId = await t.run(async (ctx) => {
      return ctx.db.insert("suites", {
        workspace_id: workspaceId,
        project_id: projectId,
        name: "Test Suite",
        source_type: "manual",
        status: "generating",
        locked_by: "user1",
        locked_at: Date.now(),
        locked_reason: "generating",
      });
    });

    await t.mutation(api.suites.mutations.updateSuiteStatus, {
      suite_id: suiteId,
      status: "failed",
      generation_error: "AI model timeout",
    });

    const suite = await t.run(async (ctx) => ctx.db.get(suiteId));
    expect(suite!.status).toBe("failed");
    expect(suite!.generation_error).toBe("AI model timeout");
    expect(suite!.locked_by).toBeUndefined();
    expect(suite!.locked_at).toBeUndefined();
  });

  it("transition generating → ready clears lock fields and error", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t, "user1");
    const projectId = await seedProject(t, workspaceId);

    const suiteId = await t.run(async (ctx) => {
      return ctx.db.insert("suites", {
        workspace_id: workspaceId,
        project_id: projectId,
        name: "Test Suite",
        source_type: "manual",
        status: "generating",
        locked_by: "user1",
        locked_at: Date.now(),
        locked_reason: "generating",
        triggered_by: "user1",
      });
    });

    await t.mutation(api.suites.mutations.updateSuiteStatus, {
      suite_id: suiteId,
      status: "ready",
    });

    const suite = await t.run(async (ctx) => ctx.db.get(suiteId));
    expect(suite!.status).toBe("ready");
    expect(suite!.locked_by).toBeUndefined();
    expect(suite!.locked_at).toBeUndefined();
    expect(suite!.locked_reason).toBeUndefined();
    expect(suite!.generation_error).toBeUndefined();
  });

  it("transition generating → failed preserves error message", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t, "user1");
    const projectId = await seedProject(t, workspaceId);

    const suiteId = await t.run(async (ctx) => {
      return ctx.db.insert("suites", {
        workspace_id: workspaceId,
        project_id: projectId,
        name: "Test Suite",
        source_type: "manual",
        status: "generating",
        locked_by: "user1",
        locked_at: Date.now(),
        locked_reason: "generating",
        triggered_by: "user1",
      });
    });

    await t.mutation(api.suites.mutations.updateSuiteStatus, {
      suite_id: suiteId,
      status: "failed",
      generation_error: "Parse error at line 5",
    });

    const suite = await t.run(async (ctx) => ctx.db.get(suiteId));
    expect(suite!.status).toBe("failed");
    expect(suite!.generation_error).toBe("Parse error at line 5");
    expect(suite!.locked_by).toBeUndefined();
  });

  it("throws on non-existent suite", async () => {
    const t = convexTest(schema, modules);

    await expect(
      t.mutation(api.suites.mutations.updateSuiteStatus, {
        suite_id: "j1234567890abcdef" as unknown as Id<"suites">,
        status: "ready",
      }),
    ).rejects.toThrow();
  });
});

describe("createSuitesForExploration", () => {
  it("rejects unauthenticated user", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);

    await expect(
      t.mutation(api.suites.mutations.createSuitesForExploration, {
        project_id: projectId,
        areas: ["login", "checkout"],
      }),
    ).rejects.toThrow("Not authenticated");
  });

  it("data layer: creates one suite per area with generating status", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t, "user1");
    const projectId = await seedProject(t, workspaceId);

    const areas = ["login", "checkout", "profile"];

    const suiteIds = await t.run(async (ctx) => {
      const ids: string[] = [];
      for (const area of areas) {
        const id = await ctx.db.insert("suites", {
          workspace_id: workspaceId,
          project_id: projectId,
          name: `${area} — Exploration`,
          source_type: "url_exploration",
          status: "generating",
          locked_by: "user1",
          locked_at: Date.now(),
          locked_reason: "generating",
          triggered_by: "user1",
        });
        ids.push(id);
      }
      return ids;
    });

    expect(suiteIds).toHaveLength(3);

    for (let i = 0; i < suiteIds.length; i++) {
      const suite = await t.run(async (ctx) => ctx.db.get(suiteIds[i] as Id<"suites">));
      expect(suite!.status).toBe("generating");
      expect(suite!.name).toContain(areas[i]);
      expect(suite!.source_type).toBe("url_exploration");
      expect(suite!.locked_by).toBe("user1");
      expect(suite!.locked_reason).toBe("generating");
    }
  });

  it("data layer: custom source_type is stored", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t, "user1");
    const projectId = await seedProject(t, workspaceId);

    const suiteId = await t.run(async (ctx) => {
      return ctx.db.insert("suites", {
        workspace_id: workspaceId,
        project_id: projectId,
        name: "admin — Exploration",
        source_type: "prd",
        status: "generating",
        locked_by: "user1",
        locked_at: Date.now(),
        locked_reason: "generating",
      });
    });

    const suite = await t.run(async (ctx) => ctx.db.get(suiteId));
    expect(suite!.source_type).toBe("prd");
  });

  it("data layer: triggered_by override is stored", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t, "user1");
    const projectId = await seedProject(t, workspaceId);

    const suiteId = await t.run(async (ctx) => {
      return ctx.db.insert("suites", {
        workspace_id: workspaceId,
        project_id: projectId,
        name: "admin — Exploration",
        source_type: "url_exploration",
        status: "generating",
        locked_by: "user1",
        locked_at: Date.now(),
        locked_reason: "generating",
        triggered_by: "custom-trigger-user",
      });
    });

    const suite = await t.run(async (ctx) => ctx.db.get(suiteId));
    expect(suite!.triggered_by).toBe("custom-trigger-user");
  });
});

/// <reference types="vite/client" />
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { convexTest } from "convex-test";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { seedWorkspace, seedProject } from "./testHelpers";

const modules = import.meta.glob("./**/*.ts");

describe("stagehand lib", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("isBrowserbaseConfigured returns false when no env vars", async () => {
    delete process.env.BROWSERBASE_API_KEY;
    delete process.env.BROWSERBASE_PROJECT_ID;
    delete process.env.MODEL_API_KEY;

    const { isBrowserbaseConfigured } = await import("./stagehand/lib");
    expect(isBrowserbaseConfigured()).toBe(false);
  });

  it("isBrowserbaseConfigured returns false when partially set", async () => {
    process.env.BROWSERBASE_API_KEY = "test-key";
    delete process.env.BROWSERBASE_PROJECT_ID;
    delete process.env.MODEL_API_KEY;

    const { isBrowserbaseConfigured } = await import("./stagehand/lib");
    expect(isBrowserbaseConfigured()).toBe(false);
  });

  it("isBrowserbaseConfigured returns true when all env vars set", async () => {
    process.env.BROWSERBASE_API_KEY = "bb-key";
    process.env.BROWSERBASE_PROJECT_ID = "bb-project";
    process.env.MODEL_API_KEY = "model-key";

    const { isBrowserbaseConfigured } = await import("./stagehand/lib");
    expect(isBrowserbaseConfigured()).toBe(true);
  });
});

describe("stagehand workspace schema", () => {
  it("workspace accepts stagehand_enabled field", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("workspaces", {
        name: "Stagehand WS",
        owner_id: "user1",
        ai_config: {
          endpoint_url: "https://api.example.com",
          api_key: "key123",
          model_name: "gpt-4",
        },
        stagehand_enabled: true,
      });
      await ctx.db.insert("workspace_members", {
        workspace_id: id,
        user_id: "user1",
        role: "owner",
        invited_at: Date.now(),
        user_name: "user1",
      });
      return id;
    });

    const workspace = await t.run(async (ctx) => ctx.db.get(workspaceId));
    expect(workspace!.stagehand_enabled).toBe(true);
  });

  it("workspace defaults stagehand_enabled to undefined", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);

    const workspace = await t.run(async (ctx) => ctx.db.get(workspaceId));
    expect(workspace!.stagehand_enabled).toBeUndefined();
  });
});

describe("stagehand workspace mutations", () => {
  it("updateWorkspace sets stagehand_enabled via db.patch", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);

    await t.run(async (ctx) => {
      await ctx.db.patch(workspaceId, { stagehand_enabled: true });
    });

    const workspace = await t.run(async (ctx) => ctx.db.get(workspaceId));
    expect(workspace!.stagehand_enabled).toBe(true);
  });

  it("updateWorkspace can disable stagehand", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);

    await t.run(async (ctx) => {
      await ctx.db.patch(workspaceId, { stagehand_enabled: true });
    });
    await t.run(async (ctx) => {
      await ctx.db.patch(workspaceId, { stagehand_enabled: false });
    });

    const workspace = await t.run(async (ctx) => ctx.db.get(workspaceId));
    expect(workspace!.stagehand_enabled).toBe(false);
  });
});

describe("stagehand action fallback", () => {
  it("checkUrlReachability returns unavailable when not configured", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    await t.run(async (ctx) => {
      await ctx.db.patch(workspaceId, { stagehand_enabled: true });
    });

    const asUser = t.withIdentity({ subject: "user1", issuer: "test" });
    const result = await asUser.action(api.stagehand.actions.checkUrlReachability, {
      project_id: await seedProject(t, workspaceId) as Id<"projects">,
    });
    expect(result.available).toBe(false);
    expect(result.reason).toContain("not configured");
  });

  it("extractPageInfo returns unavailable when not configured", async () => {
    const t = convexTest(schema, modules);
    await seedWorkspace(t);

    const asUser = t.withIdentity({ subject: "user1", issuer: "test" });
    const result = await asUser.action(api.stagehand.actions.extractPageInfo, {
      url: "https://example.com",
    });
    expect(result.available).toBe(false);
    expect(result.reason).toContain("not configured");
  });

  it("detectPageChanges returns unavailable when not configured", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    await t.run(async (ctx) => {
      await ctx.db.patch(workspaceId, { stagehand_enabled: true });
    });

    const asUser = t.withIdentity({ subject: "user1", issuer: "test" });
    const result = await asUser.action(api.stagehand.actions.detectPageChanges, {
      project_id: await seedProject(t, workspaceId) as Id<"projects">,
    });
    expect(result.available).toBe(false);
    expect(result.reason).toContain("not configured");
  });
});

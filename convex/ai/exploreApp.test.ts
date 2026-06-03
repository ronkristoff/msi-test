/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { seedWorkspace, seedProject, seedSuite } from "../testHelpers";
import { buildSnapshotContext } from "./workflowShared";

const modules = import.meta.glob("../**/*.ts");

describe("exploration generation data layer", () => {
  it("stores test with validated: true when validation passes", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const { suiteId } = await seedSuite(t, workspaceId, { source_type: "url_exploration" });

    await t.run(async (ctx) => {
      await ctx.db.insert("tests", {
        workspace_id: workspaceId,
        suite_id: suiteId,
        name: "validated exploration test",
        playwright_code: "test('validated exploration test', async () => {});",
        source_type: "url_exploration",
        status: "draft",
        validated: true,
      });
    });

    const tests = await t.run(async (ctx) => {
      return ctx.db
        .query("tests")
        .withIndex("by_suite_id", (q) => q.eq("suite_id", suiteId))
        .collect();
    });

    expect(tests).toHaveLength(1);
    expect(tests[0].validated).toBe(true);
    expect(tests[0].source_type).toBe("url_exploration");
  });

  it("stores test without validated field when Runner unavailable", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const { suiteId } = await seedSuite(t, workspaceId, { source_type: "url_exploration" });

    await t.run(async (ctx) => {
      await ctx.db.insert("tests", {
        workspace_id: workspaceId,
        suite_id: suiteId,
        name: "no runner exploration test",
        playwright_code: "test('no runner exploration test', async () => {});",
        source_type: "url_exploration",
        status: "draft",
      });
    });

    const tests = await t.run(async (ctx) => {
      return ctx.db
        .query("tests")
        .withIndex("by_suite_id", (q) => q.eq("suite_id", suiteId))
        .collect();
    });

    expect(tests[0].validated).toBeUndefined();
  });

  it("stores test with validated: false when validation fails", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const { suiteId } = await seedSuite(t, workspaceId, { source_type: "url_exploration" });

    await t.run(async (ctx) => {
      await ctx.db.insert("tests", {
        workspace_id: workspaceId,
        suite_id: suiteId,
        name: "failed validation exploration test",
        playwright_code: "test('failed validation exploration test', async () => {});",
        source_type: "url_exploration",
        status: "draft",
        validated: false,
      });
    });

    const tests = await t.run(async (ctx) => {
      return ctx.db
        .query("tests")
        .withIndex("by_suite_id", (q) => q.eq("suite_id", suiteId))
        .collect();
    });

    expect(tests[0].validated).toBe(false);
  });

  it("mix of validated and non-validated exploration tests in same suite", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const { suiteId } = await seedSuite(t, workspaceId, { source_type: "url_exploration" });

    await t.run(async (ctx) => {
      await ctx.db.insert("tests", {
        workspace_id: workspaceId,
        suite_id: suiteId,
        name: "validated test",
        playwright_code: "test('validated', async () => {});",
        source_type: "url_exploration",
        status: "draft",
        validated: true,
      });
      await ctx.db.insert("tests", {
        workspace_id: workspaceId,
        suite_id: suiteId,
        name: "no snapshot test",
        playwright_code: "test('no snapshot', async () => {});",
        source_type: "url_exploration",
        status: "draft",
      });
    });

    const tests = await t.run(async (ctx) => {
      return ctx.db
        .query("tests")
        .withIndex("by_suite_id", (q) => q.eq("suite_id", suiteId))
        .collect();
    });

    expect(tests).toHaveLength(2);
    expect(tests.find((t) => t.validated === true)).toBeDefined();
    expect(tests.find((t) => t.validated === undefined)).toBeDefined();
  });

  it("suite progress_message shows snapshot fetching during generation", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const { suiteId } = await seedSuite(t, workspaceId, {
      status: "generating",
      source_type: "url_exploration",
    });

    await t.run(async (ctx) => {
      await ctx.db.patch(suiteId, {
        progress_message: "Fetching live snapshots for scenario pages...",
      });
    });

    const suite = await t.run(async (ctx) => ctx.db.get(suiteId));
    expect(suite!.progress_message).toBe("Fetching live snapshots for scenario pages...");
  });

  it("suite progress_message shows validation step", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const { suiteId } = await seedSuite(t, workspaceId, {
      status: "generating",
      source_type: "url_exploration",
    });

    await t.run(async (ctx) => {
      await ctx.db.patch(suiteId, {
        progress_message: "Validating generated tests...",
      });
    });

    const suite = await t.run(async (ctx) => ctx.db.get(suiteId));
    expect(suite!.progress_message).toBe("Validating generated tests...");
  });

  it("backward compatible — existing exploration tests without validated field still work", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const { suiteId } = await seedSuite(t, workspaceId, { source_type: "url_exploration" });

    const testId = await t.run(async (ctx) => {
      return ctx.db.insert("tests", {
        workspace_id: workspaceId,
        suite_id: suiteId,
        name: "legacy exploration test",
        playwright_code: "test('legacy', async () => {});",
        source_type: "url_exploration",
        status: "draft",
      });
    });

    const test = await t.run(async (ctx) => ctx.db.get(testId));
    expect(test!.validated).toBeUndefined();
    expect(test!.status).toBe("draft");
  });
});

describe("live + exploration context merge (via buildSnapshotContext)", () => {
  it("returns empty string when no live snapshots", () => {
    const explorationCtx = "--- Page 1: Home (https://example.com) ---\nWelcome";
    const result = buildSnapshotContext([]);
    expect(result).toBe("");
  });

  it("formats single live snapshot with LIVE PAGE CONTEXT header", () => {
    const snapshot = {
      aria_snapshot: JSON.stringify({ role: "WebArea", name: "Dashboard" }),
      page_title: "Dashboard",
      url: "https://example.com/dashboard",
      interactive_elements: [
        { element_type: "button", role: "button", aria_label: "Submit", suggested_locator: "page.getByRole('button', { name: 'Submit' })" },
      ],
    };

    const result = buildSnapshotContext([snapshot]);
    expect(result).toContain("LIVE PAGE CONTEXT");
    expect(result).toContain("Dashboard");
    expect(result).toContain("https://example.com/dashboard");
    expect(result).toContain("page.getByRole('button', { name: 'Submit' })");
  });

  it("formats multiple live snapshots", () => {
    const snapshots = [
      {
        aria_snapshot: JSON.stringify({ role: "WebArea", name: "Home" }),
        page_title: "Home",
        url: "https://example.com",
      },
      {
        aria_snapshot: JSON.stringify({ role: "WebArea", name: "About" }),
        page_title: "About",
        url: "https://example.com/about",
      },
    ];

    const result = buildSnapshotContext(snapshots);
    expect(result).toContain("multiple pages");
    expect(result).toContain("Home");
    expect(result).toContain("About");
  });
});

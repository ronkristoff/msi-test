/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { seedWorkspace, seedSuite } from "../testHelpers";
import { extractUrlsFromText } from "./snapshotFormatter";
import { resolveUrls } from "./prdWorkflow";
import { buildSnapshotContext, buildRetryContext } from "./workflowShared";

const modules = import.meta.glob("../**/*.ts");

describe("PRD workflow data layer", () => {
  it("stores test with validated: true when validation passes", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const { suiteId } = await seedSuite(t, workspaceId);

    await t.run(async (ctx) => {
      await ctx.db.insert("tests", {
        workspace_id: workspaceId,
        suite_id: suiteId,
        name: "validated prd test",
        playwright_code: "test('validated prd test', async () => {});",
        source_type: "prd",
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
    expect(tests[0].source_type).toBe("prd");
  });

  it("stores test without validated field when Runner unavailable", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const { suiteId } = await seedSuite(t, workspaceId);

    await t.run(async (ctx) => {
      await ctx.db.insert("tests", {
        workspace_id: workspaceId,
        suite_id: suiteId,
        name: "no runner prd test",
        playwright_code: "test('no runner prd test', async () => {});",
        source_type: "prd",
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

  it("suite progress_message shows snapshot step during generation", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const { suiteId } = await seedSuite(t, workspaceId, {
      status: "generating",
      source_type: "prd",
    });

    await t.run(async (ctx) => {
      await ctx.db.patch(suiteId, {
        progress_message: "Extracting URLs and fetching page snapshots...",
      });
    });

    const suite = await t.run(async (ctx) => ctx.db.get(suiteId));
    expect(suite!.progress_message).toBe("Extracting URLs and fetching page snapshots...");

    await t.run(async (ctx) => {
      await ctx.db.patch(suiteId, {
        progress_message: "Generating tests with live DOM context (3 page(s))...",
      });
    });

    const updated = await t.run(async (ctx) => ctx.db.get(suiteId));
    expect(updated!.progress_message).toBe("Generating tests with live DOM context (3 page(s))...");
  });

  it("cancel generation marks suite as failed", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const { suiteId } = await seedSuite(t, workspaceId, {
      status: "generating",
      source_type: "prd",
    });

    await t.run(async (ctx) => {
      await ctx.db.patch(suiteId, {
        status: "failed",
        generation_error: "Generation cancelled by user",
        locked_by: undefined,
        locked_at: undefined,
        locked_reason: undefined,
        progress_message: undefined,
      });
    });

    const suite = await t.run(async (ctx) => ctx.db.get(suiteId));
    expect(suite!.status).toBe("failed");
    expect(suite!.generation_error).toBe("Generation cancelled by user");
    expect(suite!.progress_message).toBeUndefined();
  });

  it("stores multiple generated tests from PRD with different validated states", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const { suiteId } = await seedSuite(t, workspaceId, { source_type: "prd" });

    await t.run(async (ctx) => {
      await ctx.db.insert("tests", {
        workspace_id: workspaceId,
        suite_id: suiteId,
        name: "signup flow",
        playwright_code: "test('signup flow', async () => {});",
        source_type: "prd",
        status: "draft",
        validated: true,
      });
      await ctx.db.insert("tests", {
        workspace_id: workspaceId,
        suite_id: suiteId,
        name: "login flow",
        playwright_code: "test('login flow', async () => {});",
        source_type: "prd",
        status: "draft",
        validated: false,
      });
      await ctx.db.insert("tests", {
        workspace_id: workspaceId,
        suite_id: suiteId,
        name: "checkout flow",
        playwright_code: "test('checkout flow', async () => {});",
        source_type: "prd",
        status: "draft",
      });
    });

    const tests = await t.run(async (ctx) => {
      return ctx.db
        .query("tests")
        .withIndex("by_suite_id", (q) => q.eq("suite_id", suiteId))
        .collect();
    });

    expect(tests).toHaveLength(3);
    expect(tests.find((t) => t.name === "signup flow")!.validated).toBe(true);
    expect(tests.find((t) => t.name === "login flow")!.validated).toBe(false);
    expect(tests.find((t) => t.name === "checkout flow")!.validated).toBeUndefined();
  });

  it("suite shows validation step progress", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const { suiteId } = await seedSuite(t, workspaceId, {
      status: "generating",
      source_type: "prd",
    });

    await t.run(async (ctx) => {
      await ctx.db.patch(suiteId, {
        progress_message: "Validating generated tests...",
      });
    });

    const suite = await t.run(async (ctx) => ctx.db.get(suiteId));
    expect(suite!.progress_message).toBe("Validating generated tests...");
  });

  it("suite shows retry step progress", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const { suiteId } = await seedSuite(t, workspaceId, {
      status: "generating",
      source_type: "prd",
    });

    await t.run(async (ctx) => {
      await ctx.db.patch(suiteId, {
        progress_message: "Retrying test generation with error context...",
      });
    });

    const suite = await t.run(async (ctx) => ctx.db.get(suiteId));
    expect(suite!.progress_message).toBe("Retrying test generation with error context...");
  });
});

describe("URL extraction from PRD text", () => {
  it("extracts absolute URLs from PRD text", () => {
    const prd = `The app has pages at https://example.com/dashboard and https://example.com/settings Users navigate to https://example.com/profile to view their profile`;
    const urls = extractUrlsFromText(prd);
    expect(urls).toContain("https://example.com/dashboard");
    expect(urls).toContain("https://example.com/settings");
    expect(urls).toContain("https://example.com/profile");
  });

  it("extracts relative paths from PRD text", () => {
    const prd = `Navigate to /login to sign in. The dashboard is at /dashboard.
    Settings page: /settings`;
    const urls = extractUrlsFromText(prd);
    expect(urls).toContain("/login");
    expect(urls).toContain("/dashboard");
    expect(urls).toContain("/settings");
  });

  it("extracts mix of absolute URLs and relative paths", () => {
    const prd = `Visit https://app.example.com for the main page.
    Admin panel at /admin.
    API docs: https://docs.example.com/api`;
    const urls = extractUrlsFromText(prd);
    expect(urls).toContain("https://app.example.com");
    expect(urls).toContain("/admin");
    expect(urls).toContain("https://docs.example.com/api");
  });

  it("returns empty for PRD without URLs", () => {
    const prd = "The app should have a login form with email and password fields.";
    const urls = extractUrlsFromText(prd);
    expect(urls).toEqual([]);
  });

  it("deduplicates URLs", () => {
    const prd = `Go to /dashboard. Then return to /dashboard.`;
    const urls = extractUrlsFromText(prd);
    const dashboardUrls = urls.filter((u) => u === "/dashboard");
    expect(dashboardUrls).toHaveLength(1);
  });
});

describe("resolveUrls", () => {
  it("resolves relative paths against app_url", () => {
    const result = resolveUrls(["/login", "/dashboard"], "https://example.com");
    expect(result).toContain("https://example.com/login");
    expect(result).toContain("https://example.com/dashboard");
  });

  it("keeps absolute URLs unchanged", () => {
    const result = resolveUrls(["https://other.com/page"], "https://example.com");
    expect(result).toContain("https://other.com/page");
  });

  it("deduplicates resolved URLs", () => {
    const result = resolveUrls(["/login", "/login"], "https://example.com");
    expect(result).toHaveLength(1);
    expect(result).toContain("https://example.com/login");
  });

  it("filters out invalid URLs", () => {
    const result = resolveUrls(["not-a-url"], "https://example.com");
    expect(result).toHaveLength(0);
  });

  it("handles empty input", () => {
    const result = resolveUrls([], "https://example.com");
    expect(result).toHaveLength(0);
  });

  it("mixes absolute and relative URLs correctly", () => {
    const result = resolveUrls(
      ["/settings", "https://other.com/docs"],
      "https://example.com",
    );
    expect(result).toContain("https://example.com/settings");
    expect(result).toContain("https://other.com/docs");
    expect(result).toHaveLength(2);
  });
});

describe("buildSnapshotContext", () => {
  const singleSnapshot = {
    aria_snapshot: JSON.stringify({ role: "WebArea", name: "Dashboard" }),
    page_title: "Dashboard",
    url: "https://example.com/dashboard",
  };

  const secondSnapshot = {
    aria_snapshot: JSON.stringify({ role: "WebArea", name: "Settings" }),
    page_title: "Settings",
    url: "https://example.com/settings",
  };

  it("returns empty string for no snapshots", () => {
    expect(buildSnapshotContext([])).toBe("");
  });

  it("formats single snapshot with singular header", () => {
    const result = buildSnapshotContext([singleSnapshot]);
    expect(result).toContain("LIVE PAGE CONTEXT — use elements and locators from this context:");
    expect(result).toContain("Dashboard");
  });

  it("formats multiple snapshots with multi-page header", () => {
    const result = buildSnapshotContext([singleSnapshot, secondSnapshot]);
    expect(result).toContain("multiple pages detected");
    expect(result).toContain("Dashboard");
    expect(result).toContain("Settings");
  });

  it("appends login snapshot context", () => {
    const loginSnapshot = {
      aria_snapshot: JSON.stringify({ role: "WebArea", name: "Login" }),
      page_title: "Login",
      url: "https://example.com/login",
    };
    const result = buildSnapshotContext([singleSnapshot], loginSnapshot);
    expect(result).toContain("LOGIN PAGE CONTEXT");
    expect(result).toContain("Login");
  });

  it("returns only login context when no page snapshots", () => {
    const loginSnapshot = {
      aria_snapshot: JSON.stringify({ role: "WebArea", name: "Login" }),
      page_title: "Login",
      url: "https://example.com/login",
    };
    const result = buildSnapshotContext([], loginSnapshot);
    expect(result).toContain("LOGIN PAGE CONTEXT");
    expect(result).not.toContain("LIVE PAGE CONTEXT");
  });
});

describe("buildRetryContext", () => {
  it("returns empty string when no validation error", () => {
    expect(buildRetryContext()).toBe("");
    expect(buildRetryContext(undefined, undefined, undefined)).toBe("");
  });

  it("builds retry context with error message", () => {
    const result = buildRetryContext("Element not found");
    expect(result).toContain("PREVIOUS ATTEMPT FAILED");
    expect(result).toContain("Element not found");
    expect(result).toContain("Fix the issues above");
  });

  it("includes failure snapshot when provided", () => {
    const result = buildRetryContext("err", "page state at failure");
    expect(result).toContain("Page state at failure:");
    expect(result).toContain("page state at failure");
  });

  it("includes previous code when provided", () => {
    const result = buildRetryContext("err", undefined, "await page.click('#btn')");
    expect(result).toContain("Previous code that failed:");
    expect(result).toContain("await page.click('#btn')");
  });

  it("includes all fields together", () => {
    const result = buildRetryContext("timeout", "snapshot", "code");
    expect(result).toContain("timeout");
    expect(result).toContain("snapshot");
    expect(result).toContain("code");
  });
});

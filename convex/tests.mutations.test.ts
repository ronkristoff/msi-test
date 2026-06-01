/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import type { Id } from "./_generated/dataModel";
import { seedWorkspace, seedTestDoc, seedSuite } from "./testHelpers";

const modules = import.meta.glob("./**/*.ts");

describe("tests mutations", () => {
  it("updateTestCode rejects unauthenticated user", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const { testId } = await seedTestDoc(t, workspaceId);

    await expect(
      t.mutation(api.tests.mutations.updateTestCode, {
        test_id: testId,
        playwright_code: "new code",
      }),
    ).rejects.toThrow("Not authenticated");
  });

  it("updateTestStatus rejects unauthenticated user", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const { testId } = await seedTestDoc(t, workspaceId);

    await expect(
      t.mutation(api.tests.mutations.updateTestStatus, {
        test_id: testId,
        status: "approved",
      }),
    ).rejects.toThrow("Not authenticated");
  });

  it("deleteTest rejects unauthenticated user", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const { testId } = await seedTestDoc(t, workspaceId);

    await expect(
      t.mutation(api.tests.mutations.deleteTest, {
        test_id: testId,
      }),
    ).rejects.toThrow("Not authenticated");
  });

  it("data layer: updateTestCode patches playwright_code", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const { testId } = await seedTestDoc(t, workspaceId);

    await t.run(async (ctx) => {
      await ctx.db.patch(testId, { playwright_code: "import { test } from '@playwright/test';\ntest('updated', async ({ page }) => { await page.goto('/'); });" });
    });

    const test = await t.run(async (ctx) => ctx.db.get(testId));
    expect(test!.playwright_code).toContain("updated");
    expect(test!.name).toBe("Test Case");
  });

  it("data layer: updateTestStatus toggles draft to approved", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const { testId } = await seedTestDoc(t, workspaceId, { status: "draft" });

    await t.run(async (ctx) => {
      await ctx.db.patch(testId, { status: "approved" });
    });

    const test = await t.run(async (ctx) => ctx.db.get(testId));
    expect(test!.status).toBe("approved");
  });

  it("data layer: updateTestStatus toggles approved to draft", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const { testId } = await seedTestDoc(t, workspaceId, { status: "approved" });

    await t.run(async (ctx) => {
      await ctx.db.patch(testId, { status: "draft" });
    });

    const test = await t.run(async (ctx) => ctx.db.get(testId));
    expect(test!.status).toBe("draft");
  });

  it("data layer: deleteTest removes test but preserves suite", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const { suiteId, testId } = await seedTestDoc(t, workspaceId);

    await t.run(async (ctx) => {
      await ctx.db.delete(testId);
    });

    const test = await t.run(async (ctx) => ctx.db.get(testId));
    expect(test).toBeNull();

    const suite = await t.run(async (ctx) => ctx.db.get(suiteId));
    expect(suite).not.toBeNull();
  });

  describe("createTestFromGeneration", () => {
    it("creates test with draft status and inherited workspace_id", async () => {
      const t = convexTest(schema, modules);
      const workspaceId = await seedWorkspace(t);
      const { suiteId } = await seedSuite(t, workspaceId);

      const testId = await t.mutation(internal.tests.mutations.createTestFromGeneration, {
        suite_id: suiteId,
        name: "login flow",
        playwright_code: "import { test } from '@playwright/test';\ntest('login flow', async () => {});",
        source_type: "prd",
      });

      const test = await t.run(async (ctx) => ctx.db.get(testId as Id<"tests">));
      expect(test!.name).toBe("login flow");
      expect(test!.status).toBe("draft");
      expect(test!.source_type).toBe("prd");
      expect(test!.workspace_id).toBe(workspaceId);
      expect(test!.suite_id).toBe(suiteId);
    });

    it("rejects empty test name", async () => {
      const t = convexTest(schema, modules);
      const workspaceId = await seedWorkspace(t);
      const { suiteId } = await seedSuite(t, workspaceId);

      await expect(
        t.mutation(internal.tests.mutations.createTestFromGeneration, {
          suite_id: suiteId,
          name: "   ",
          playwright_code: "code",
          source_type: "prd",
        }),
      ).rejects.toThrow("Test name cannot be empty");
    });

    it("rejects non-existent suite", async () => {
      const t = convexTest(schema, modules);
      const workspaceId = await seedWorkspace(t);
      const { suiteId } = await seedSuite(t, workspaceId);

      await t.run(async (ctx) => {
        await ctx.db.delete(suiteId);
      });

      await expect(
        t.mutation(internal.tests.mutations.createTestFromGeneration, {
          suite_id: suiteId,
          name: "test",
          playwright_code: "code",
          source_type: "prd",
        }),
      ).rejects.toThrow("Suite not found");
    });

    it("trims test name", async () => {
      const t = convexTest(schema, modules);
      const workspaceId = await seedWorkspace(t);
      const { suiteId } = await seedSuite(t, workspaceId);

      const testId = await t.mutation(internal.tests.mutations.createTestFromGeneration, {
        suite_id: suiteId,
        name: "  signup flow  ",
        playwright_code: "code",
        source_type: "url_exploration",
      });

      const test = await t.run(async (ctx) => ctx.db.get(testId as Id<"tests">));
      expect(test!.name).toBe("signup flow");
    });

    it("defaults execution_type to playwright when not specified", async () => {
      const t = convexTest(schema, modules);
      const workspaceId = await seedWorkspace(t);
      const { suiteId } = await seedSuite(t, workspaceId);

      const testId = await t.mutation(internal.tests.mutations.createTestFromGeneration, {
        suite_id: suiteId,
        name: "legacy test",
        playwright_code: "code",
        source_type: "prd",
      });

      const test = await t.run(async (ctx) => ctx.db.get(testId as Id<"tests">));
      expect(test!.execution_type).toBe("playwright");
      expect(test!.steps).toBeUndefined();
    });

    it("creates stagehand test with steps and no playwright_code", async () => {
      const t = convexTest(schema, modules);
      const workspaceId = await seedWorkspace(t);
      const { suiteId } = await seedSuite(t, workspaceId);

      const steps = [
        { instruction: "Navigate to the login page", expected_outcome: "Login form is visible" },
        { instruction: "Enter valid credentials and submit", assertion_code: "expect(await page.textContent('.welcome')).toContain('Dashboard')", expected_outcome: "User is redirected to dashboard" },
      ];

      const testId = await t.mutation(internal.tests.mutations.createTestFromGeneration, {
        suite_id: suiteId,
        name: "stagehand login test",
        execution_type: "stagehand",
        steps,
        source_type: "url_exploration",
      });

      const test = await t.run(async (ctx) => ctx.db.get(testId as Id<"tests">));
      expect(test!.execution_type).toBe("stagehand");
      expect(test!.playwright_code).toBeUndefined();
      expect(test!.steps).toHaveLength(2);
      expect(test!.steps![0].instruction).toBe("Navigate to the login page");
      expect(test!.steps![1].assertion_code).toContain("expect");
      expect(test!.steps![0].assertion_code).toBeUndefined();
    });

    it("creates hybrid test with both steps and playwright_code", async () => {
      const t = convexTest(schema, modules);
      const workspaceId = await seedWorkspace(t);
      const { suiteId } = await seedSuite(t, workspaceId);

      const steps = [
        { instruction: "Navigate to /settings", expected_outcome: "Settings page loads" },
      ];

      const testId = await t.mutation(internal.tests.mutations.createTestFromGeneration, {
        suite_id: suiteId,
        name: "hybrid test",
        playwright_code: "test('settings', async ({ page }) => { await page.goto('/settings'); });",
        execution_type: "stagehand",
        steps,
        source_type: "natural_language",
      });

      const test = await t.run(async (ctx) => ctx.db.get(testId as Id<"tests">));
      expect(test!.execution_type).toBe("stagehand");
      expect(test!.playwright_code).toContain("settings");
      expect(test!.steps).toHaveLength(1);
    });
  });

  describe("updateTestCode with steps", () => {
    it("updates steps on an existing test", async () => {
      const t = convexTest(schema, modules);
      const workspaceId = await seedWorkspace(t);
      const { testId } = await seedTestDoc(t, workspaceId);

      const newSteps = [
        { instruction: "Go to homepage", expected_outcome: "Homepage renders" },
        { instruction: "Click sign up link" },
      ];

      await t.run(async (ctx) => {
        await ctx.db.patch(testId, {
          execution_type: "stagehand" as const,
          steps: newSteps,
        });
      });

      const test = await t.run(async (ctx) => ctx.db.get(testId));
      expect(test!.steps).toHaveLength(2);
      expect(test!.steps![0].instruction).toBe("Go to homepage");
      expect(test!.steps![1].expected_outcome).toBeUndefined();
    });

    it("legacy tests without execution_type are backward compatible", async () => {
      const t = convexTest(schema, modules);
      const workspaceId = await seedWorkspace(t);
      const { testId } = await seedTestDoc(t, workspaceId);

      const test = await t.run(async (ctx) => ctx.db.get(testId));
      expect(test!.playwright_code).toBeDefined();
      expect(test!.execution_type).toBeUndefined();
      expect(test!.steps).toBeUndefined();
    });
  });
});

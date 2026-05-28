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
  });
});

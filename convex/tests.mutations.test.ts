/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import { api } from "./_generated/api";
import schema from "./schema";
import { seedWorkspace, seedTestDoc } from "./testHelpers";

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
});

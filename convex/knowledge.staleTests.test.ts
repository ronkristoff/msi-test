/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import {
  seedWorkspace,
  seedProject,
  seedKnowledgeBase,
  seedModule,
  seedExplorationWithScenarios,
  seedSuiteWithExploration,
  seedTestInSuite,
} from "./testHelpers";
import { computeModuleFingerprint } from "./knowledge/moduleDiff";

const modules = import.meta.glob("./**/*.ts");

describe("_snapshotModulesForResync", () => {
  it("captures pre-resync fingerprints for a ready KB with modules", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const kbId = await seedKnowledgeBase(t, workspaceId, projectId, {
      status: "ready",
    });
    await seedModule(t, workspaceId, kbId, {
      name: "Auth Module",
      description: "Handles auth",
      files: ["src/auth.ts"],
      apis: [{ path: "/api/login", method: "POST" }],
      user_flows: [{ route: "/login", name: "Login" }],
      dependencies: ["crypto"],
    });
    await seedModule(t, workspaceId, kbId, {
      name: "Billing Module",
      description: "Handles billing",
      files: ["src/billing.ts"],
      dependencies: ["stripe"],
    });

    const { internal } = await import("./_generated/api");
    await t.mutation(internal.knowledge.internal._snapshotModulesForResync, {
      knowledge_base_id: kbId,
    });

    const kb = await t.run(async (ctx) => ctx.db.get(kbId));
    expect(kb!.previous_module_fingerprints?.length).toBe(2);
    const names = kb!.previous_module_fingerprints!.map((f) => f.name);
    expect(names).toContain("Auth Module");
    expect(names).toContain("Billing Module");
    const auth = kb!.previous_module_fingerprints!.find(
      (f) => f.name === "Auth Module",
    )!;
    expect(auth.fingerprint).toMatch(/^[0-9a-f]+$/);
    expect(auth.fingerprint.length).toBeGreaterThan(0);
  });

  it("stores an empty-array snapshot when the KB has zero modules", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const kbId = await seedKnowledgeBase(t, workspaceId, projectId, {
      status: "ready",
    });

    const { internal } = await import("./_generated/api");
    await t.mutation(internal.knowledge.internal._snapshotModulesForResync, {
      knowledge_base_id: kbId,
    });

    const kb = await t.run(async (ctx) => ctx.db.get(kbId));
    expect(kb!.previous_module_fingerprints).toEqual([]);
  });

  it("is idempotent — second call overwrites the snapshot", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const kbId = await seedKnowledgeBase(t, workspaceId, projectId, {
      status: "ready",
    });
    await seedModule(t, workspaceId, kbId, { name: "FirstOnly" });
    await seedModule(t, workspaceId, kbId, { name: "Shared" });

    const { internal } = await import("./_generated/api");
    await t.mutation(internal.knowledge.internal._snapshotModulesForResync, {
      knowledge_base_id: kbId,
    });

    await t.run(async (ctx) => {
      await ctx.db.insert("kb_modules", {
        workspace_id: workspaceId,
        knowledge_base_id: kbId,
        name: "Third",
      });
    });

    await t.mutation(internal.knowledge.internal._snapshotModulesForResync, {
      knowledge_base_id: kbId,
    });

    const kb = await t.run(async (ctx) => ctx.db.get(kbId));
    const names = kb!.previous_module_fingerprints!.map((f) => f.name);
    expect(names).toEqual(["FirstOnly", "Shared", "Third"]);
    expect(names.length).toBe(3);
  });

  it("does NOT throw on a non-existent KB (defensive no-op)", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const kbId = await seedKnowledgeBase(t, workspaceId, projectId, {
      status: "ready",
    });
    await t.run(async (ctx) => {
      await ctx.db.delete(kbId);
    });

    const { internal } = await import("./_generated/api");
    await expect(
      t.mutation(internal.knowledge.internal._snapshotModulesForResync, {
        knowledge_base_id: kbId,
      }),
    ).resolves.toBeNull();
  });
});

describe("_handleIngestionComplete: success branch", () => {
  it("computes + persists diff and clears the snapshot when previous_module_fingerprints is set", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const kbId = await seedKnowledgeBase(t, workspaceId, projectId, {
      status: "building",
    });

    await seedModule(t, workspaceId, kbId, {
      name: "ChangedMod",
      description: "NEW description",
      files: ["src/changed.ts"],
      dependencies: ["d1"],
    });
    await seedModule(t, workspaceId, kbId, {
      name: "NewMod",
      description: "Brand new",
      dependencies: [],
    });
    await seedModule(t, workspaceId, kbId, {
      name: "UnchangedMod",
      description: "Same as before",
      files: ["src/unchanged.ts"],
      dependencies: ["u1"],
    });

    const unchangedFp = computeModuleFingerprint({
      name: "UnchangedMod",
      description: "Same as before",
      files: ["src/unchanged.ts"],
      dependencies: ["u1"],
    });
    const changedOldFp = computeModuleFingerprint({
      name: "ChangedMod",
      description: "OLD description",
      files: ["src/changed.ts"],
      dependencies: ["d1"],
    });
    await t.run(async (ctx) => {
      await ctx.db.patch(kbId, {
        previous_module_fingerprints: [
          { name: "ChangedMod", fingerprint: changedOldFp },
          { name: "RemovedMod", fingerprint: "deadbeef" },
          { name: "UnchangedMod", fingerprint: unchangedFp },
        ],
      });
    });

    const { internal } = await import("./_generated/api");
    await t.mutation(internal.knowledge.internal._handleIngestionComplete, {
      workflowId: "wf-success-1",
      context: { knowledge_base_id: kbId, project_id: projectId },
      result: { kind: "success", returnValue: {} },
    });

    const kb = await t.run(async (ctx) => ctx.db.get(kbId));
    expect(kb!.module_diff).toBeDefined();
    expect(kb!.module_diff!.added).toEqual(["NewMod"]);
    expect(kb!.module_diff!.removed).toEqual(["RemovedMod"]);
    expect(kb!.module_diff!.changed).toEqual(["ChangedMod"]);
    expect(typeof kb!.module_diff!.computed_at).toBe("number");
    expect(kb!.previous_module_fingerprints).toBeUndefined();
  });

  it("is a no-op when there is no snapshot (initial ingestion)", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const kbId = await seedKnowledgeBase(t, workspaceId, projectId, {
      status: "building",
    });
    await seedModule(t, workspaceId, kbId, { name: "Alpha" });
    await seedModule(t, workspaceId, kbId, { name: "Beta" });

    const { internal } = await import("./_generated/api");
    await t.mutation(internal.knowledge.internal._handleIngestionComplete, {
      workflowId: "wf-success-2",
      context: { knowledge_base_id: kbId, project_id: projectId },
      result: { kind: "success", returnValue: {} },
    });

    const kb = await t.run(async (ctx) => ctx.db.get(kbId));
    expect(kb!.module_diff).toBeUndefined();
    expect(kb!.previous_module_fingerprints).toBeUndefined();
  });
});

describe("_handleIngestionComplete: failed + canceled branches unchanged", () => {
  it("failed branch sets error and writes NO module_diff", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const kbId = await seedKnowledgeBase(t, workspaceId, projectId, {
      status: "building",
    });

    const { internal } = await import("./_generated/api");
    await t.mutation(internal.knowledge.internal._handleIngestionComplete, {
      workflowId: "wf-failed",
      context: { knowledge_base_id: kbId, project_id: projectId },
      result: { kind: "failed", error: "Extraction blew up" },
    });

    const kb = await t.run(async (ctx) => ctx.db.get(kbId));
    expect(kb!.status).toBe("error");
    expect(kb!.error_message).toBe("Extraction blew up");
    expect(kb!.module_diff).toBeUndefined();
  });

  it("canceled branch is a pure no-op (no status change, no diff)", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const kbId = await seedKnowledgeBase(t, workspaceId, projectId, {
      status: "building",
    });

    const { internal } = await import("./_generated/api");
    await t.mutation(internal.knowledge.internal._handleIngestionComplete, {
      workflowId: "wf-canceled",
      context: { knowledge_base_id: kbId, project_id: projectId },
      result: { kind: "canceled" },
    });

    const kb = await t.run(async (ctx) => ctx.db.get(kbId));
    expect(kb!.status).toBe("building");
    expect(kb!.module_diff).toBeUndefined();
  });

  it("failed branch clears a pre-existing previous_module_fingerprints snapshot", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const kbId = await seedKnowledgeBase(t, workspaceId, projectId, {
      status: "building",
    });
    await t.run(async (ctx) => {
      await ctx.db.patch(kbId, {
        previous_module_fingerprints: [
          { name: "StaleMod", fingerprint: "deadbeef" },
        ],
      });
    });

    const { internal } = await import("./_generated/api");
    await t.mutation(internal.knowledge.internal._handleIngestionComplete, {
      workflowId: "wf-failed-snap",
      context: { knowledge_base_id: kbId, project_id: projectId },
      result: { kind: "failed", error: "boom" },
    });

    const kb = await t.run(async (ctx) => ctx.db.get(kbId));
    expect(kb!.status).toBe("error");
    expect(kb!.previous_module_fingerprints).toBeUndefined();
  });

  it("canceled branch clears a pre-existing previous_module_fingerprints snapshot", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const kbId = await seedKnowledgeBase(t, workspaceId, projectId, {
      status: "building",
    });
    await t.run(async (ctx) => {
      await ctx.db.patch(kbId, {
        previous_module_fingerprints: [
          { name: "StaleMod", fingerprint: "deadbeef" },
        ],
      });
    });

    const { internal } = await import("./_generated/api");
    await t.mutation(internal.knowledge.internal._handleIngestionComplete, {
      workflowId: "wf-canceled-snap",
      context: { knowledge_base_id: kbId, project_id: projectId },
      result: { kind: "canceled" },
    });

    const kb = await t.run(async (ctx) => ctx.db.get(kbId));
    expect(kb!.status).toBe("building");
    expect(kb!.previous_module_fingerprints).toBeUndefined();
  });
});

describe("getStaleTests", () => {
  it("flags tests in suites whose exploration references changed/removed modules", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const kbId = await seedKnowledgeBase(t, workspaceId, projectId, {
      status: "ready",
    });
    await t.run(async (ctx) => {
      await ctx.db.patch(kbId, {
        module_diff: {
          added: ["NewMod"],
          removed: ["Auth Module"],
          changed: ["Billing Module"],
          computed_at: Date.now(),
        },
      });
    });

    const authExplId = await seedExplorationWithScenarios(t, workspaceId, projectId, [
      { kb_module: "Auth Module", name: "Login scenario" },
    ]);
    const billingExplId = await seedExplorationWithScenarios(t, workspaceId, projectId, [
      { kb_module: "Billing Module", name: "Checkout scenario" },
    ]);
    const unchangedExplId = await seedExplorationWithScenarios(t, workspaceId, projectId, [
      { kb_module: "Unchanged Module", name: "Misc scenario" },
    ]);

    const authSuiteId = await seedSuiteWithExploration(
      t,
      workspaceId,
      projectId,
      authExplId,
      "Auth Suite",
    );
    const billingSuiteId = await seedSuiteWithExploration(
      t,
      workspaceId,
      projectId,
      billingExplId,
      "Billing Suite",
    );
    const unchangedSuiteId = await seedSuiteWithExploration(
      t,
      workspaceId,
      projectId,
      unchangedExplId,
      "Unchanged Suite",
    );

    await seedTestInSuite(t, workspaceId, authSuiteId, "Login Flow");
    await seedTestInSuite(t, workspaceId, billingSuiteId, "Checkout Flow");
    await seedTestInSuite(t, workspaceId, unchangedSuiteId, "Misc Flow");

    const { api } = await import("./_generated/api");
    const asUser = t.withIdentity({ subject: "user1", issuer: "test" });
    const results = await asUser.query(api.knowledge.queries.getStaleTests, {
      project_id: projectId as never,
    });

    expect(results.length).toBe(2);
    const byName = new Map(results.map((r) => [r.name, r]));
    expect(byName.has("Login Flow")).toBe(true);
    expect(byName.has("Checkout Flow")).toBe(true);
    expect(byName.has("Misc Flow")).toBe(false);

    const login = byName.get("Login Flow")!;
    expect(login.module_name).toBe("Auth Module");
    expect(login.reason).toBe("removed");
    expect(login.suite_name).toBe("Auth Suite");

    const checkout = byName.get("Checkout Flow")!;
    expect(checkout.module_name).toBe("Billing Module");
    expect(checkout.reason).toBe("changed");
    expect(checkout.suite_name).toBe("Billing Suite");
  });

  it("returns [] when KB has no module_diff", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    await seedKnowledgeBase(t, workspaceId, projectId, { status: "ready" });

    const { api } = await import("./_generated/api");
    const asUser = t.withIdentity({ subject: "user1", issuer: "test" });
    const results = await asUser.query(api.knowledge.queries.getStaleTests, {
      project_id: projectId as never,
    });
    expect(results).toEqual([]);
  });

  it("returns [] when module_diff only contains added modules (coverage gap, not staleness)", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const kbId = await seedKnowledgeBase(t, workspaceId, projectId, {
      status: "ready",
    });
    await t.run(async (ctx) => {
      await ctx.db.patch(kbId, {
        module_diff: {
          added: ["Brand New Module"],
          removed: [],
          changed: [],
          computed_at: Date.now(),
        },
      });
    });
    const explId = await seedExplorationWithScenarios(t, workspaceId, projectId, [
      { kb_module: "Brand New Module", name: "scenario" },
    ]);
    const suiteId = await seedSuiteWithExploration(
      t,
      workspaceId,
      projectId,
      explId,
      "Suite",
    );
    await seedTestInSuite(t, workspaceId, suiteId, "Test");

    const { api } = await import("./_generated/api");
    const asUser = t.withIdentity({ subject: "user1", issuer: "test" });
    const results = await asUser.query(api.knowledge.queries.getStaleTests, {
      project_id: projectId as never,
    });
    expect(results).toEqual([]);
  });

  it("returns [] when no exploration scenario matches the flag set", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const kbId = await seedKnowledgeBase(t, workspaceId, projectId, {
      status: "ready",
    });
    await t.run(async (ctx) => {
      await ctx.db.patch(kbId, {
        module_diff: {
          added: [],
          removed: ["Ghost Module"],
          changed: [],
          computed_at: Date.now(),
        },
      });
    });
    const explId = await seedExplorationWithScenarios(t, workspaceId, projectId, [
      { kb_module: "Some Other Module", name: "scenario" },
    ]);
    const suiteId = await seedSuiteWithExploration(
      t,
      workspaceId,
      projectId,
      explId,
      "Suite",
    );
    await seedTestInSuite(t, workspaceId, suiteId, "Test");

    const { api } = await import("./_generated/api");
    const asUser = t.withIdentity({ subject: "user1", issuer: "test" });
    const results = await asUser.query(api.knowledge.queries.getStaleTests, {
      project_id: projectId as never,
    });
    expect(results).toEqual([]);
  });

  it("returns [] for cross-workspace access (ownership check)", async () => {
    const t = convexTest(schema, modules);
    const wsA = await seedWorkspace(t, "userA");
    const projectA = await seedProject(t, wsA);
    const kbA = await seedKnowledgeBase(t, wsA, projectA, { status: "ready" });
    await t.run(async (ctx) => {
      await ctx.db.patch(kbA, {
        module_diff: {
          added: [],
          removed: ["Auth Module"],
          changed: [],
          computed_at: Date.now(),
        },
      });
    });
    const explA = await seedExplorationWithScenarios(t, wsA, projectA, [
      { kb_module: "Auth Module", name: "scenario" },
    ]);
    const suiteA = await seedSuiteWithExploration(t, wsA, projectA, explA, "Suite");
    await seedTestInSuite(t, wsA, suiteA, "Test A");

    await seedWorkspace(t, "userB");

    const { api } = await import("./_generated/api");
    const asUserB = t.withIdentity({ subject: "userB", issuer: "test" });
    const results = await asUserB.query(api.knowledge.queries.getStaleTests, {
      project_id: projectA as never,
    });
    expect(results).toEqual([]);
  });

  it("returns [] when project has no KB", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);

    const { api } = await import("./_generated/api");
    const asUser = t.withIdentity({ subject: "user1", issuer: "test" });
    const results = await asUser.query(api.knowledge.queries.getStaleTests, {
      project_id: projectId as never,
    });
    expect(results).toEqual([]);
  });

  it("returns [] while the latest KB is building (hides stale banner during re-sync)", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const kbId = await seedKnowledgeBase(t, workspaceId, projectId, {
      status: "building",
    });
    await t.run(async (ctx) => {
      await ctx.db.patch(kbId, {
        module_diff: {
          added: [],
          removed: ["Auth Module"],
          changed: [],
          computed_at: Date.now(),
        },
      });
    });
    const explId = await seedExplorationWithScenarios(t, workspaceId, projectId, [
      { kb_module: "Auth Module", name: "scenario" },
    ]);
    const suiteId = await seedSuiteWithExploration(t, workspaceId, projectId, explId, "Suite");
    await seedTestInSuite(t, workspaceId, suiteId, "Stale Test");

    const { api } = await import("./_generated/api");
    const asUser = t.withIdentity({ subject: "user1", issuer: "test" });
    const results = await asUser.query(api.knowledge.queries.getStaleTests, {
      project_id: projectId as never,
    });
    expect(results).toEqual([]);
  });
});

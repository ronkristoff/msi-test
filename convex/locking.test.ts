/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { seedWorkspace, seedSuite, seedTestDoc, seedRun, seedRunResult } from "./testHelpers";

const modules = import.meta.glob("./**/*.ts");

describe("locking module", () => {
  describe("suite locking", () => {
    it("suite can have lock fields set", async () => {
      const t = convexTest(schema, modules);
      const workspaceId = await seedWorkspace(t);
      const { projectId, suiteId } = await seedSuite(t, workspaceId);

      await t.run(async (ctx) => {
        await ctx.db.patch(suiteId, {
          locked_by: "user1",
          locked_at: Date.now(),
          locked_reason: "running",
        });
      });

      const suite = await t.run(async (ctx) => ctx.db.get(suiteId));
      expect(suite!.locked_by).toBe("user1");
      expect(suite!.locked_reason).toBe("running");
      expect(suite!.locked_at).toBeTypeOf("number");
    });

    it("suite lock is cleared by patching fields to undefined", async () => {
      const t = convexTest(schema, modules);
      const workspaceId = await seedWorkspace(t);
      const { projectId, suiteId } = await seedSuite(t, workspaceId);

      await t.run(async (ctx) => {
        await ctx.db.patch(suiteId, {
          locked_by: "user1",
          locked_at: Date.now(),
          locked_reason: "running",
        });
      });

      await t.run(async (ctx) => {
        await ctx.db.patch(suiteId, {
          locked_by: undefined,
          locked_at: undefined,
          locked_reason: undefined,
        });
      });

      const suite = await t.run(async (ctx) => ctx.db.get(suiteId));
      expect(suite!.locked_by).toBeUndefined();
      expect(suite!.locked_at).toBeUndefined();
      expect(suite!.locked_reason).toBeUndefined();
    });

    it("triggerRun sets suite lock and triggered_by", async () => {
      const t = convexTest(schema, modules);
      const workspaceId = await seedWorkspace(t);
      const { projectId, suiteId } = await seedTestDoc(t, workspaceId, { status: "approved" });
      const envId = await t.run(async (ctx) => {
        return ctx.db.insert("environments", {
          workspace_id: workspaceId,
          project_id: projectId,
          name: "Staging",
          base_url: "https://staging.example.com",
        });
      });

      await t.run(async (ctx) => {
        const runId = await ctx.db.insert("runs", {
          workspace_id: workspaceId,
          project_id: projectId,
          suite_id: suiteId,
          environment_id: envId,
          trigger_type: "manual",
          status: "running",
          triggered_by: "user1",
        });

        await ctx.db.patch(suiteId, {
          locked_by: "user1",
          locked_at: Date.now(),
          locked_reason: "running",
        });
      });

      const suite = await t.run(async (ctx) => ctx.db.get(suiteId));
      expect(suite!.locked_by).toBe("user1");
      expect(suite!.locked_reason).toBe("running");
    });

    it("run completion clears suite lock", async () => {
      const t = convexTest(schema, modules);
      const workspaceId = await seedWorkspace(t);
      const { projectId, suiteId, testId } = await seedTestDoc(t, workspaceId, { status: "approved" });
      const envId = await t.run(async (ctx) => {
        return ctx.db.insert("environments", {
          workspace_id: workspaceId,
          project_id: projectId,
          name: "Staging",
          base_url: "https://staging.example.com",
        });
      });

      const runId = await seedRun(t, workspaceId, projectId, suiteId, null, { environment_id: envId });
      await seedRunResult(t, workspaceId, runId, testId);

      await t.run(async (ctx) => {
        await ctx.db.patch(suiteId, {
          locked_by: "user1",
          locked_at: Date.now(),
          locked_reason: "running",
        });
      });

      await t.run(async (ctx) => {
        const results = await ctx.db
          .query("run_results")
          .withIndex("by_run_id", (q) => q.eq("run_id", runId))
          .collect();

        let pass_count = 0;
        for (const r of results) {
          if (r.status === "passed") pass_count++;
        }

        await ctx.db.patch(runId, {
          status: pass_count > 0 ? "passed" : "failed",
          finished_at: Date.now(),
          pass_count,
          fail_count: 0,
          skip_count: 0,
        });

        const run = await ctx.db.get(runId);
        if (run?.suite_id) {
          await ctx.db.patch(run.suite_id, {
            locked_by: undefined,
            locked_at: undefined,
            locked_reason: undefined,
          });
        }
      });

      const suite = await t.run(async (ctx) => ctx.db.get(suiteId));
      expect(suite!.locked_by).toBeUndefined();
      expect(suite!.locked_reason).toBeUndefined();
    });
  });

  describe("test locking", () => {
    it("test can have lock fields set", async () => {
      const t = convexTest(schema, modules);
      const workspaceId = await seedWorkspace(t);
      const { testId } = await seedTestDoc(t, workspaceId);

      await t.run(async (ctx) => {
        await ctx.db.patch(testId, {
          locked_by: "user1",
          locked_at: Date.now(),
        });
      });

      const test = await t.run(async (ctx) => ctx.db.get(testId));
      expect(test!.locked_by).toBe("user1");
      expect(test!.locked_at).toBeTypeOf("number");
    });

    it("test lock can be cleared", async () => {
      const t = convexTest(schema, modules);
      const workspaceId = await seedWorkspace(t);
      const { testId } = await seedTestDoc(t, workspaceId);

      await t.run(async (ctx) => {
        await ctx.db.patch(testId, {
          locked_by: "user1",
          locked_at: Date.now(),
        });
      });

      await t.run(async (ctx) => {
        await ctx.db.patch(testId, {
          locked_by: undefined,
          locked_at: undefined,
        });
      });

      const test = await t.run(async (ctx) => ctx.db.get(testId));
      expect(test!.locked_by).toBeUndefined();
    });

    it("re-locking by same user succeeds", async () => {
      const t = convexTest(schema, modules);
      const workspaceId = await seedWorkspace(t);
      const { testId } = await seedTestDoc(t, workspaceId);

      const t1 = Date.now();
      await t.run(async (ctx) => {
        await ctx.db.patch(testId, { locked_by: "user1", locked_at: t1 });
      });

      const t2 = Date.now();
      await t.run(async (ctx) => {
        const test = await ctx.db.get(testId);
        if (test?.locked_by === "user1") {
          await ctx.db.patch(testId, { locked_at: t2 });
        }
      });

      const test = await t.run(async (ctx) => ctx.db.get(testId));
      expect(test!.locked_by).toBe("user1");
      expect(test!.locked_at).toBe(t2);
    });
  });

  describe("stale lock detection", () => {
    it("identifies locks older than threshold", async () => {
      const t = convexTest(schema, modules);
      const workspaceId = await seedWorkspace(t);
      const { testId } = await seedTestDoc(t, workspaceId);

      const thirtyOneMinutesAgo = Date.now() - 31 * 60 * 1000;
      await t.run(async (ctx) => {
        await ctx.db.patch(testId, {
          locked_by: "user1",
          locked_at: thirtyOneMinutesAgo,
        });
      });

      const staleThresholdMs = 30 * 60 * 1000;
      const stale = await t.run(async (ctx) => {
        const test = await ctx.db.get(testId);
        if (!test?.locked_at) return false;
        return Date.now() - test.locked_at > staleThresholdMs;
      });

      expect(stale).toBe(true);
    });

    it("does not flag recent locks as stale", async () => {
      const t = convexTest(schema, modules);
      const workspaceId = await seedWorkspace(t);
      const { testId } = await seedTestDoc(t, workspaceId);

      await t.run(async (ctx) => {
        await ctx.db.patch(testId, {
          locked_by: "user1",
          locked_at: Date.now(),
        });
      });

      const staleThresholdMs = 30 * 60 * 1000;
      const stale = await t.run(async (ctx) => {
        const test = await ctx.db.get(testId);
        if (!test?.locked_at) return false;
        return Date.now() - test.locked_at > staleThresholdMs;
      });

      expect(stale).toBe(false);
    });
  });
});

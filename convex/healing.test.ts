/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import { api } from "./_generated/api";
import schema from "./schema";
import {
  seedFullRunWithTests,
  seedStagehandTest,
} from "./testHelpers";

const modules = import.meta.glob("./**/*.ts");

describe("recordHealingHistory", () => {
  it("inserts healing_history record and updates test step with learned_selector", async () => {
    const t = convexTest(schema, modules);
    const { workspaceId, testId, runId } = await seedFullRunWithTests(t);

    await t.run(async (ctx) => {
      const test = await ctx.db.get(testId);
      expect(test).not.toBeNull();
    });

    await t.run(async (ctx) => {
      const test = await ctx.db.get(testId);
      if (!test) throw new Error("test not found");
      await ctx.db.patch(testId, {
        execution_type: "stagehand",
        steps: [
          { instruction: "Click the submit button" },
          { instruction: "Verify the result" },
        ],
      });
    });

    await t.mutation(api.runs.internal.recordHealingHistory, {
      workspace_id: workspaceId,
      test_id: testId,
      step_index: 0,
      original_instruction: "Click the submit button",
      healed_selector: "button.approve",
      healed_description: "Approve button",
      confidence: 0.92,
      reason: "Button text changed from Submit to Approve",
      run_id: runId,
    });

    await t.run(async (ctx) => {
      const history = await ctx.db
        .query("healing_history")
        .withIndex("by_test_id", (q) => q.eq("test_id", testId))
        .collect();

      expect(history).toHaveLength(1);
      expect(history[0].step_index).toBe(0);
      expect(history[0].healed_selector).toBe("button.approve");
      expect(history[0].healed_description).toBe("Approve button");
      expect(history[0].confidence).toBe(0.92);
      expect(history[0].reason).toBe("Button text changed from Submit to Approve");
      expect(history[0].run_id).toBe(runId);

      const test = await ctx.db.get(testId);
      expect(test?.steps?.[0].learned_selector).toBe("button.approve");
      expect(test?.steps?.[0].learned_description).toBe("Approve button");
      expect(test?.steps?.[1].learned_selector).toBeUndefined();
      expect(test?.last_healed_at).toBeTypeOf("number");
    });
  });

  it("updates learned_selector on subsequent heals for same step", async () => {
    const t = convexTest(schema, modules);
    const { workspaceId, testId, runId } = await seedFullRunWithTests(t);

    await t.run(async (ctx) => {
      await ctx.db.patch(testId, {
        execution_type: "stagehand",
        steps: [{ instruction: "Click the submit button" }],
      });
    });

    await t.mutation(api.runs.internal.recordHealingHistory, {
      workspace_id: workspaceId,
      test_id: testId,
      step_index: 0,
      original_instruction: "Click the submit button",
      healed_selector: "button.approve-v1",
      confidence: 0.9,
      reason: "First heal",
    });

    await t.mutation(api.runs.internal.recordHealingHistory, {
      workspace_id: workspaceId,
      test_id: testId,
      step_index: 0,
      original_instruction: "Click the submit button",
      healed_selector: "button.approve-v2",
      confidence: 0.95,
      reason: "Second heal",
      run_id: runId,
    });

    await t.run(async (ctx) => {
      const history = await ctx.db
        .query("healing_history")
        .withIndex("by_test_id", (q) => q.eq("test_id", testId))
        .collect();

      expect(history).toHaveLength(2);

      const test = await ctx.db.get(testId);
      expect(test?.steps?.[0].learned_selector).toBe("button.approve-v2");
    });
  });

  it("healing history is scoped per test", async () => {
    const t = convexTest(schema, modules);
    const { workspaceId } = await seedFullRunWithTests(t);
    const { testId: testId1 } = await seedStagehandTest(t, workspaceId);
    const { testId: testId2 } = await seedStagehandTest(t, workspaceId);

    await t.mutation(api.runs.internal.recordHealingHistory, {
      workspace_id: workspaceId,
      test_id: testId1,
      step_index: 0,
      original_instruction: "Click button",
      healed_selector: "button.v1",
      confidence: 0.9,
      reason: "Heal 1",
    });

    await t.run(async (ctx) => {
      const history1 = await ctx.db
        .query("healing_history")
        .withIndex("by_test_id", (q) => q.eq("test_id", testId1))
        .collect();

      const history2 = await ctx.db
        .query("healing_history")
        .withIndex("by_test_id", (q) => q.eq("test_id", testId2))
        .collect();

      expect(history1).toHaveLength(1);
      expect(history2).toHaveLength(0);
    });
  });

  it("does not crash when test has no steps", async () => {
    const t = convexTest(schema, modules);
    const { workspaceId, testId, runId } = await seedFullRunWithTests(t);

    await t.run(async (ctx) => {
      await ctx.db.patch(testId, { steps: undefined });
    });

    await t.mutation(api.runs.internal.recordHealingHistory, {
      workspace_id: workspaceId,
      test_id: testId,
      step_index: 0,
      original_instruction: "Click button",
      healed_selector: "button.fixed",
      confidence: 0.8,
      reason: "Fix",
      run_id: runId,
    });

    await t.run(async (ctx) => {
      const history = await ctx.db
        .query("healing_history")
        .withIndex("by_test_id", (q) => q.eq("test_id", testId))
        .collect();

      expect(history).toHaveLength(1);

      const test = await ctx.db.get(testId);
      expect(test?.steps).toBeUndefined();
    });
  });
});

describe("getHealingHistory query", () => {
  it("returns healing history for a test sorted by creation time desc", async () => {
    const t = convexTest(schema, modules);
    const { workspaceId, testId, runId } = await seedFullRunWithTests(t);

    await t.run(async (ctx) => {
      await ctx.db.patch(testId as string, {
        execution_type: "stagehand",
        steps: [{ instruction: "Click button" }],
      });
    });

    await t.mutation(api.runs.internal.recordHealingHistory, {
      workspace_id: workspaceId,
      test_id: testId,
      step_index: 0,
      original_instruction: "Click button",
      healed_selector: "button.v1",
      confidence: 0.85,
      reason: "First",
    });

    await t.mutation(api.runs.internal.recordHealingHistory, {
      workspace_id: workspaceId,
      test_id: testId,
      step_index: 0,
      original_instruction: "Click button",
      healed_selector: "button.v2",
      confidence: 0.92,
      reason: "Second",
      run_id: runId,
    });

    await t.run(async (ctx) => {
      const history = await ctx.db
        .query("healing_history")
        .withIndex("by_test_id", (q) => q.eq("test_id", testId as string))
        .order("desc")
        .collect();

      expect(history).toHaveLength(2);
      expect(history[0].healed_selector).toBe("button.v2");
      expect(history[0].confidence).toBe(0.92);
      expect(history[1].healed_selector).toBe("button.v1");
      expect(history[1].confidence).toBe(0.85);
      expect(history[0].run_id).toBe(runId as string);
      expect(history[1].run_id).toBeUndefined();
    });
  });

  it("returns empty when no healing history exists", async () => {
    const t = convexTest(schema, modules);
    const { testId } = await seedFullRunWithTests(t);

    await t.run(async (ctx) => {
      const history = await ctx.db
        .query("healing_history")
        .withIndex("by_test_id", (q) => q.eq("test_id", testId as string))
        .collect();

      expect(history).toHaveLength(0);
    });
  });
});

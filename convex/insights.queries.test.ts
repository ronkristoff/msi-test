/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import { api } from "./_generated/api";
import schema from "./schema";
import {
  seedWorkspace,
  seedProject,
  seedTestDoc,
  seedRun,
  seedAIInsight,
} from "./testHelpers";

const modules = import.meta.glob("./**/*.ts");

async function seedInsightFixtures(t: ReturnType<typeof convexTest>) {
  const workspaceId = await seedWorkspace(t);
  const projectId = await seedProject(t, workspaceId);
  const { suiteId, testId } = await seedTestDoc(t, workspaceId, {
    status: "approved",
  });
  const runId = await seedRun(t, workspaceId, projectId, suiteId, null, {
    status: "failed",
    fail_count: 1,
  });
  return { workspaceId, projectId, suiteId, testId, runId };
}

describe("getAIInsights", () => {
  it("returns empty when no auth context", async () => {
    const t = convexTest(schema, modules);
    const insights = await t.query(api.insights.queries.getAIInsights, {});
    expect(insights).toHaveLength(0);
  });
});

describe("insights data layer", () => {
  it("fetches insights scoped to workspace", async () => {
    const t = convexTest(schema, modules);
    const { workspaceId, testId, runId } = await seedInsightFixtures(t);

    await seedAIInsight(t, workspaceId, testId, runId, {
      analysis_text: "Button hidden",
      confidence_score: 0.9,
    });

    const insights = await t.run(async (ctx) => {
      return ctx.db
        .query("ai_insights")
        .withIndex("by_workspace_id", (q) => q.eq("workspace_id", workspaceId))
        .collect();
    });

    expect(insights).toHaveLength(1);
    expect(insights[0].analysis_text).toBe("Button hidden");
  });

  it("filters by type", async () => {
    const t = convexTest(schema, modules);
    const { workspaceId, testId, runId } = await seedInsightFixtures(t);

    await seedAIInsight(t, workspaceId, testId, runId, { type: "root_cause" });
    await seedAIInsight(t, workspaceId, testId, runId, { type: "flakiness_cluster" });

    const all = await t.run(async (ctx) => {
      return ctx.db
        .query("ai_insights")
        .withIndex("by_workspace_id", (q) => q.eq("workspace_id", workspaceId))
        .collect();
    });

    const rootCause = all.filter((i) => i.type === "root_cause");
    const flaky = all.filter((i) => i.type === "flakiness_cluster");

    expect(rootCause).toHaveLength(1);
    expect(flaky).toHaveLength(1);
  });

  it("computes frequency per test", async () => {
    const t = convexTest(schema, modules);
    const { workspaceId, projectId, suiteId, testId, runId } = await seedInsightFixtures(t);

    const runId2 = await seedRun(t, workspaceId, projectId, suiteId, null, {
      status: "failed",
      fail_count: 1,
    });

    await seedAIInsight(t, workspaceId, testId, runId);
    await seedAIInsight(t, workspaceId, testId, runId2);

    const frequency = await t.run(async (ctx) => {
      const insights = await ctx.db
        .query("ai_insights")
        .withIndex("by_workspace_id", (q) => q.eq("workspace_id", workspaceId))
        .collect();
      const count = new Map<string, number>();
      for (const i of insights) {
        count.set(i.test_id, (count.get(i.test_id) ?? 0) + 1);
      }
      return count.get(testId) ?? 0;
    });

    expect(frequency).toBe(2);
  });

  it("sorts by severity score descending", async () => {
    const t = convexTest(schema, modules);
    const { workspaceId, testId, runId } = await seedInsightFixtures(t);

    await seedAIInsight(t, workspaceId, testId, runId, {
      confidence_score: 0.3,
      analysis_text: "Low",
    });
    await seedAIInsight(t, workspaceId, testId, runId, {
      confidence_score: 0.95,
      analysis_text: "High",
    });

    const sorted = await t.run(async (ctx) => {
      const insights = await ctx.db
        .query("ai_insights")
        .withIndex("by_workspace_id", (q) => q.eq("workspace_id", workspaceId))
        .collect();
      return [...insights].sort((a, b) => b.confidence_score - a.confidence_score);
    });

    expect(sorted[0].analysis_text).toBe("High");
    expect(sorted[1].analysis_text).toBe("Low");
  });

  it("enriches insight with test and run data", async () => {
    const t = convexTest(schema, modules);
    const { workspaceId, testId, runId } = await seedInsightFixtures(t);

    await seedAIInsight(t, workspaceId, testId, runId, {
      suggested_fix: "Add wait",
      confidence_score: 0.88,
    });

    const enriched = await t.run(async (ctx) => {
      const insight = await ctx.db
        .query("ai_insights")
        .withIndex("by_workspace_id", (q) => q.eq("workspace_id", workspaceId))
        .first();
      if (!insight) return null;

      const [test, run] = await Promise.all([
        ctx.db.get(insight.test_id),
        ctx.db.get(insight.run_id),
      ]);

      return {
        test_name: test?.name ?? "Unknown test",
        run_status: run?.status ?? "unknown",
        suggested_fix: insight.suggested_fix,
        confidence_score: insight.confidence_score,
      };
    });

    expect(enriched).not.toBeNull();
    expect(enriched!.test_name).toBe("Test Case");
    expect(enriched!.run_status).toBe("failed");
    expect(enriched!.suggested_fix).toBe("Add wait");
    expect(enriched!.confidence_score).toBe(0.88);
  });
});

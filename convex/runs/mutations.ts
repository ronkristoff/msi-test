import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { getOwnedEntity, getOwnedWorkspace } from "../lib/requireAuth";

export const triggerRun = mutation({
  args: {
    project_id: v.id("projects"),
    suite_id: v.optional(v.id("suites")),
    test_id: v.optional(v.id("tests")),
    environment_id: v.optional(v.id("environments")),
    trigger_type: v.optional(
      v.union(v.literal("manual"), v.literal("ci"), v.literal("rerun")),
    ),
  },
  handler: async (ctx, args) => {
    const { workspace } = await getOwnedWorkspace(ctx);
    const { entity: project } = await getOwnedEntity(ctx, args.project_id, "projects");

    if (args.suite_id) await getOwnedEntity(ctx, args.suite_id, "suites");
    if (args.test_id) await getOwnedEntity(ctx, args.test_id, "tests");
    if (args.environment_id) await getOwnedEntity(ctx, args.environment_id, "environments");

    if (!args.suite_id && !args.test_id) {
      throw new ConvexError("Must provide either suite_id or test_id");
    }
    if (args.suite_id && args.test_id) {
      throw new ConvexError("Provide suite_id or test_id, not both");
    }

    let testIds: Id<"tests">[];
    if (args.suite_id) {
      const tests = await ctx.db
        .query("tests")
        .withIndex("by_suite_id", (q) => q.eq("suite_id", args.suite_id!))
        .collect();

      testIds = tests.filter((t) => t.status === "approved").map((t) => t._id);
      if (testIds.length === 0) {
        throw new ConvexError("No approved tests in this suite");
      }
    } else {
      const test = await ctx.db.get(args.test_id!);
      if (!test) throw new ConvexError("Test not found");
      if (test.status !== "approved") {
        throw new ConvexError("Test must be approved to run");
      }
      testIds = [test._id];
    }

    const runId = await ctx.db.insert("runs", {
      workspace_id: workspace._id,
      project_id: project._id,
      suite_id: args.suite_id,
      test_id: args.test_id,
      environment_id: args.environment_id,
      trigger_type: args.trigger_type ?? "manual",
      status: "running",
    });

    for (const testId of testIds) {
      await ctx.db.insert("run_results", {
        workspace_id: workspace._id,
        run_id: runId,
        test_id: testId,
        status: "passed",
        duration_ms: 0,
        retries: 0,
      });
    }

    return runId;
  },
});

export const rerunTest = mutation({
  args: {
    run_id: v.id("runs"),
    environment_id: v.optional(v.id("environments")),
  },
  handler: async (ctx, args) => {
    const { workspace } = await getOwnedWorkspace(ctx);
    const { entity: originalRun } = await getOwnedEntity(ctx, args.run_id, "runs");

    const originalResults = await ctx.db
      .query("run_results")
      .withIndex("by_run_id", (q) => q.eq("run_id", args.run_id))
      .collect();

    if (originalResults.length === 0) {
      throw new ConvexError("Original run has no results");
    }

    const firstResult = originalResults[0];
    const testIds =
      originalRun.test_id && !originalRun.suite_id
        ? [originalRun.test_id]
        : originalResults.map((r) => r.test_id);

    const runId = await ctx.db.insert("runs", {
      workspace_id: workspace._id,
      project_id: originalRun.project_id,
      suite_id: originalRun.suite_id,
      test_id: originalRun.test_id ?? firstResult.test_id,
      rerun_of_run_id: args.run_id,
      rerun_of_test_id: originalRun.test_id ?? firstResult.test_id,
      environment_id: args.environment_id ?? originalRun.environment_id,
      trigger_type: "rerun",
      status: "running",
    });

    for (const testId of testIds) {
      await ctx.db.insert("run_results", {
        workspace_id: workspace._id,
        run_id: runId,
        test_id: testId,
        status: "passed",
        duration_ms: 0,
        retries: 0,
      });
    }

    return runId;
  },
});

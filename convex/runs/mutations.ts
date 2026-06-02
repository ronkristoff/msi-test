import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { getOwnedEntity, getOwnedWorkspace, getUserName } from "../lib/requireAuth";
import { resolveSuiteTestIds } from "../lib/resolveSuiteTests";

export const triggerRun = mutation({
  args: {
    project_id: v.id("projects"),
    suite_id: v.optional(v.id("suites")),
    test_id: v.optional(v.id("tests")),
    test_list_id: v.optional(v.id("test_lists")),
    environment_id: v.id("environments"),
    trigger_type: v.optional(
      v.union(v.literal("manual"), v.literal("ci"), v.literal("scheduled"), v.literal("rerun")),
    ),
  },
  handler: async (ctx, args) => {
    const { user, workspace } = await getOwnedWorkspace(ctx);
    const userId = String(user._id);
    const { entity: project } = await getOwnedEntity(ctx, args.project_id, "projects");

    if (args.suite_id) {
      const { entity: suite } = await getOwnedEntity(ctx, args.suite_id, "suites");
      if (suite.locked_by && suite.locked_by !== userId) {
        const holderName = await getUserName(ctx, suite.workspace_id, suite.locked_by);
        throw new ConvexError(`Suite is locked by ${holderName}`);
      }
    }
    if (args.test_id) await getOwnedEntity(ctx, args.test_id, "tests");
    if (args.test_list_id) await getOwnedEntity(ctx, args.test_list_id, "test_lists");
    if (args.environment_id) await getOwnedEntity(ctx, args.environment_id, "environments");

    const targetCount = [args.suite_id, args.test_id, args.test_list_id].filter(Boolean).length;
    if (targetCount === 0) {
      throw new ConvexError("Must provide suite_id, test_id, or test_list_id");
    }
    if (targetCount > 1) {
      throw new ConvexError("Provide only one of suite_id, test_id, or test_list_id");
    }

    let testIds: Id<"tests">[];
    if (args.test_list_id) {
      const members = await ctx.db
        .query("test_list_members")
        .withIndex("by_test_list_id", (q) => q.eq("test_list_id", args.test_list_id!))
        .collect();

      const validated: Id<"tests">[] = [];
      for (const member of members) {
        const test = await ctx.db.get(member.test_id);
        if (test && test.status === "approved") {
          validated.push(test._id);
        }
      }
      if (validated.length === 0) {
        throw new ConvexError("No approved tests in this test list");
      }
      testIds = validated;
    } else if (args.suite_id) {
      testIds = await resolveSuiteTestIds(ctx.db, args.suite_id);

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
      test_list_id: args.test_list_id,
      environment_id: args.environment_id,
      trigger_type: args.trigger_type ?? "manual",
      status: "running",
      triggered_by: userId,
    });

    if (args.suite_id) {
      await ctx.db.patch(args.suite_id, {
        locked_by: userId,
        locked_at: Date.now(),
        locked_reason: "running",
      });
    }

    for (const testId of testIds) {
      await ctx.db.insert("run_results", {
        workspace_id: workspace._id,
        run_id: runId,
        test_id: testId,
        status: "pending",
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
    const { user, workspace } = await getOwnedWorkspace(ctx);
    const userId = String(user._id);
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
      originalRun.test_id && !originalRun.suite_id && !originalRun.test_list_id
        ? [originalRun.test_id]
        : originalResults.map((r) => r.test_id);

    const runId = await ctx.db.insert("runs", {
      workspace_id: workspace._id,
      project_id: originalRun.project_id,
      suite_id: originalRun.suite_id,
      test_id: originalRun.test_id ?? firstResult.test_id,
      test_list_id: originalRun.test_list_id,
      rerun_of_run_id: args.run_id,
      rerun_of_test_id: originalRun.test_id ?? firstResult.test_id,
      environment_id: args.environment_id ?? originalRun.environment_id,
      trigger_type: "rerun",
      status: "running",
      triggered_by: userId,
    });

    for (const testId of testIds) {
      await ctx.db.insert("run_results", {
        workspace_id: workspace._id,
        run_id: runId,
        test_id: testId,
        status: "pending",
        duration_ms: 0,
        retries: 0,
      });
    }

    return runId;
  },
});

export const runAllTests = mutation({
  args: {
    project_id: v.id("projects"),
    environment_id: v.id("environments"),
  },
  handler: async (ctx, args) => {
    const { user, workspace } = await getOwnedWorkspace(ctx);
    const userId = String(user._id);
    const { entity: project } = await getOwnedEntity(ctx, args.project_id, "projects");
    await getOwnedEntity(ctx, args.environment_id, "environments");

    const functionalSuites = await ctx.db
      .query("suites")
      .withIndex("by_project_id_and_suite_type", (q) =>
        q.eq("project_id", args.project_id).eq("suite_type", "functional"),
      )
      .collect();

    const testIdSet = new Set<Id<"tests">>();
    for (const suite of functionalSuites) {
      const tests = await ctx.db
        .query("tests")
        .withIndex("by_suite_id", (q) => q.eq("suite_id", suite._id))
        .collect();
      for (const t of tests) {
        if (t.status === "approved") testIdSet.add(t._id);
      }
    }

    if (testIdSet.size === 0) {
      throw new ConvexError("No approved tests found. Approve tests before running them.");
    }

    const runId = await ctx.db.insert("runs", {
      workspace_id: workspace._id,
      project_id: project._id,
      environment_id: args.environment_id,
      trigger_type: "manual",
      status: "running",
      triggered_by: userId,
    });

    for (const testId of testIdSet) {
      await ctx.db.insert("run_results", {
        workspace_id: workspace._id,
        run_id: runId,
        test_id: testId,
        status: "pending",
        duration_ms: 0,
        retries: 0,
      });
    }

    return runId;
  },
});

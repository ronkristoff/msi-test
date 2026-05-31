import { mutation, internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { getOwnedWorkspace, getOwnedEntity, getMemberWorkspace } from "../lib/requireAuth";
import { validateRequiredField } from "../lib/validation";
import type { Id } from "../_generated/dataModel";

function generateDefaultName(): string {
  const now = new Date();
  const month = now.toLocaleString("en-US", { month: "short" });
  const day = now.getDate();
  return `New Suite — ${month} ${day}`;
}

export const createSuite = mutation({
  args: {
    project_id: v.id("projects"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    source_type: v.optional(
      v.union(
        v.literal("url_exploration"),
        v.literal("prd"),
        v.literal("natural_language"),
        v.literal("manual"),
      ),
    ),
    status: v.optional(
      v.union(v.literal("generating"), v.literal("ready"), v.literal("failed")),
    ),
    triggered_by: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user, workspace } = await getMemberWorkspace(ctx);
    const { entity: project } = await getOwnedEntity(ctx, args.project_id, "projects");

    const name = args.name?.trim() ? validateRequiredField(args.name, "Suite name") : generateDefaultName();
    const userId = String(user._id);
    const status = args.status ?? "ready";

    return ctx.db.insert("suites", {
      workspace_id: workspace._id,
      project_id: project._id,
      name,
      description: args.description?.trim() || undefined,
      suite_type: "functional",
      source_type: args.source_type ?? "manual",
      status,
      triggered_by: args.triggered_by ?? (status === "generating" ? userId : undefined),
      ...(status === "generating"
        ? { locked_by: userId, locked_at: Date.now(), locked_reason: "generating" as const }
        : {}),
    });
  },
});

export const updateSuite = mutation({
  args: {
    suite_id: v.id("suites"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await getOwnedEntity(ctx, args.suite_id, "suites");

    const updates: Record<string, unknown> = {};

    if (args.name !== undefined) {
      updates.name = validateRequiredField(args.name, "Suite name");
    }

    if (args.description !== undefined) {
      updates.description = args.description.trim() || undefined;
    }

    await ctx.db.patch(args.suite_id, updates);
  },
});

export const deleteSuite = mutation({
  args: { suite_id: v.id("suites") },
  handler: async (ctx, args) => {
    await getOwnedEntity(ctx, args.suite_id, "suites");

    const tests = await ctx.db
      .query("tests")
      .withIndex("by_suite_id", (q) => q.eq("suite_id", args.suite_id))
      .collect();

    for (const test of tests) {
      const testMembers = await ctx.db
        .query("suite_members")
        .withIndex("by_member_test_id", (q) => q.eq("member_test_id", test._id))
        .collect();
      for (const m of testMembers) {
        await ctx.db.delete(m._id);
      }
      await ctx.db.delete(test._id);
    }

    const membersOfRegression = await ctx.db
      .query("suite_members")
      .withIndex("by_regression_suite_id", (q) => q.eq("regression_suite_id", args.suite_id))
      .collect();
    for (const member of membersOfRegression) {
      await ctx.db.delete(member._id);
    }

    const referencedByRegression = await ctx.db
      .query("suite_members")
      .withIndex("by_member_suite_id", (q) => q.eq("member_suite_id", args.suite_id))
      .collect();
    for (const member of referencedByRegression) {
      await ctx.db.delete(member._id);
    }

    await ctx.db.delete(args.suite_id);
  },
});

export const createRegressionSuite = mutation({
  args: {
    project_id: v.id("projects"),
    name: v.string(),
    description: v.optional(v.string()),
    auto_include_all: v.optional(v.boolean()),
    member_suite_ids: v.optional(v.array(v.id("suites"))),
  },
  handler: async (ctx, args) => {
    const { workspace } = await getOwnedWorkspace(ctx);
    const { entity: project } = await getOwnedEntity(ctx, args.project_id, "projects");

    const name = validateRequiredField(args.name, "Suite name");

    const suiteId = await ctx.db.insert("suites", {
      workspace_id: workspace._id,
      project_id: project._id,
      name,
      description: args.description?.trim() || undefined,
      suite_type: "regression",
      auto_include_all: args.auto_include_all ?? false,
      source_type: "manual",
    });

    if (args.member_suite_ids?.length) {
      for (const memberSuiteId of args.member_suite_ids) {
        const memberSuite = await ctx.db.get(memberSuiteId);
        if (!memberSuite || memberSuite.project_id !== project._id) {
          throw new ConvexError(`Suite ${memberSuiteId} not found in this project`);
        }
        if (memberSuite.suite_type === "regression") {
          throw new ConvexError("Cannot nest regression suites");
        }
        await ctx.db.insert("suite_members", {
          workspace_id: workspace._id,
          regression_suite_id: suiteId,
          member_suite_id: memberSuiteId,
        });
      }
    }

    return suiteId;
  },
});

export const addSuiteMember = mutation({
  args: {
    regression_suite_id: v.id("suites"),
    member_suite_id: v.optional(v.id("suites")),
    member_test_id: v.optional(v.id("tests")),
  },
  handler: async (ctx, args) => {
    const { entity: regression } = await getOwnedEntity(ctx, args.regression_suite_id, "suites");
    if (regression.suite_type !== "regression") {
      throw new ConvexError("Can only add members to regression suites");
    }
    if (!args.member_suite_id && !args.member_test_id) {
      throw new ConvexError("Must provide either member_suite_id or member_test_id");
    }
    if (args.member_suite_id && args.member_test_id) {
      throw new ConvexError("Cannot provide both member_suite_id and member_test_id");
    }

    if (args.member_suite_id) {
      const memberSuite = await ctx.db.get(args.member_suite_id);
      if (!memberSuite || memberSuite.project_id !== regression.project_id) {
        throw new ConvexError("Member suite not found in this project");
      }
      if (memberSuite.suite_type === "regression") {
        throw new ConvexError("Cannot nest regression suites");
      }

      const existing = await ctx.db
        .query("suite_members")
        .withIndex("by_regression_suite_id", (q) =>
          q.eq("regression_suite_id", args.regression_suite_id),
        )
        .collect();
      if (existing.some((m) => m.member_suite_id === args.member_suite_id)) {
        throw new ConvexError("Suite is already a member of this regression");
      }
    }

    if (args.member_test_id) {
      const test = await ctx.db.get(args.member_test_id);
      if (!test || test.workspace_id !== regression.workspace_id) {
        throw new ConvexError("Test not found in this workspace");
      }

      const existing = await ctx.db
        .query("suite_members")
        .withIndex("by_regression_suite_id", (q) =>
          q.eq("regression_suite_id", args.regression_suite_id),
        )
        .collect();
      if (existing.some((m) => m.member_test_id === args.member_test_id)) {
        throw new ConvexError("Test is already a member of this regression");
      }
    }

    await ctx.db.insert("suite_members", {
      workspace_id: regression.workspace_id,
      regression_suite_id: args.regression_suite_id,
      member_suite_id: args.member_suite_id,
      member_test_id: args.member_test_id,
    });
  },
});

export const removeSuiteMember = mutation({
  args: {
    regression_suite_id: v.id("suites"),
    member_suite_id: v.optional(v.id("suites")),
    member_test_id: v.optional(v.id("tests")),
  },
  handler: async (ctx, args) => {
    await getOwnedEntity(ctx, args.regression_suite_id, "suites");

    const existing = await ctx.db
      .query("suite_members")
      .withIndex("by_regression_suite_id", (q) =>
        q.eq("regression_suite_id", args.regression_suite_id),
      )
      .collect();

    const match = existing.find((m) => {
      if (args.member_suite_id) return m.member_suite_id === args.member_suite_id;
      if (args.member_test_id) return m.member_test_id === args.member_test_id;
      return false;
    });

    if (!match) {
      throw new ConvexError("Member not found in this regression suite");
    }

    await ctx.db.delete(match._id);
  },
});

export const updateSuiteStatus = internalMutation({
  args: {
    suite_id: v.id("suites"),
    status: v.union(v.literal("generating"), v.literal("ready"), v.literal("failed")),
    generation_error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const suite = await ctx.db.get(args.suite_id);
    if (!suite) {
      throw new ConvexError(`Suite not found: ${args.suite_id}`);
    }

    const updates: Record<string, unknown> = {
      status: args.status,
    };

    if (args.status === "ready" || args.status === "failed") {
      updates.locked_by = undefined;
      updates.locked_at = undefined;
      updates.locked_reason = undefined;
    }

    if (args.status === "failed" && args.generation_error) {
      updates.generation_error = args.generation_error;
    }

    if (args.status === "ready") {
      updates.generation_error = undefined;
    }

    await ctx.db.patch(args.suite_id, updates);
  },
});

export const retrySuiteGeneration = mutation({
  args: {
    suite_id: v.id("suites"),
  },
  handler: async (ctx, args) => {
    const { entity: suite } = await getOwnedEntity(ctx, args.suite_id, "suites");

    if (suite.source_type !== "prd" && suite.source_type !== "natural_language") {
      throw new ConvexError("Can only retry PRD or NL generation");
    }

    const identity = await ctx.auth.getUserIdentity();
    const userId = identity?.subject ?? "unknown";

    await ctx.db.patch(args.suite_id, {
      status: "generating",
      generation_error: undefined,
      locked_by: userId,
      locked_at: Date.now(),
      locked_reason: "generating",
      triggered_by: userId,
    });

    return { project_id: suite.project_id, source_type: suite.source_type };
  },
});

export const createSuitesForExploration = mutation({
  args: {
    project_id: v.id("projects"),
    areas: v.array(v.string()),
    source_type: v.optional(
      v.union(
        v.literal("url_exploration"),
        v.literal("prd"),
        v.literal("natural_language"),
        v.literal("manual"),
      ),
    ),
    triggered_by: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user, workspace } = await getMemberWorkspace(ctx);
    const { entity: project } = await getOwnedEntity(ctx, args.project_id, "projects");
    const userId = String(user._id);

    const now = new Date();
    const month = now.toLocaleString("en-US", { month: "short" });
    const day = now.getDate();

    const results: { area: string; suite_id: Id<"suites"> }[] = [];

    for (const area of args.areas) {
      const suiteName = `Exploration — ${area} — ${month} ${day}`;
      const suiteId = await ctx.db.insert("suites", {
        workspace_id: workspace._id,
        project_id: project._id,
        name: suiteName,
        description: `Generated from URL exploration — ${area} flows`,
        suite_type: "functional",
        source_type: args.source_type ?? "url_exploration",
        status: "generating",
        triggered_by: args.triggered_by ?? userId,
        locked_by: userId,
        locked_at: Date.now(),
        locked_reason: "generating",
      });
      results.push({ area, suite_id: suiteId });
    }

    return results;
  },
});

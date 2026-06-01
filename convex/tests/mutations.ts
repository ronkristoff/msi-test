import { mutation, internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { getOwnedEntity, getUserName } from "../lib/requireAuth";
import { validateRequiredField, testStepValidator } from "../lib/validation";

export const updateTestCode = mutation({
  args: {
    test_id: v.id("tests"),
    playwright_code: v.optional(v.string()),
    steps: v.optional(v.array(testStepValidator)),
    name: v.optional(v.string()),
    status: v.optional(v.union(v.literal("draft"), v.literal("approved"))),
    last_healed_at: v.optional(v.number()),
    last_healed_diff: v.optional(v.string()),
    clear_healed_at: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { user, entity: test } = await getOwnedEntity(ctx, args.test_id, "tests");
    const userId = String(user._id);

    if (test.locked_by && test.locked_by !== userId) {
      const holderName = await getUserName(ctx, test.workspace_id, test.locked_by);
      throw new ConvexError(`Test is locked by ${holderName}`);
    }

    const updates: Record<string, unknown> = {};
    if (args.playwright_code !== undefined) {
      updates.playwright_code = validateRequiredField(args.playwright_code, "Playwright code");
    }
    if (args.steps !== undefined) {
      updates.steps = args.steps;
    }
    if (args.name !== undefined) {
      updates.name = validateRequiredField(args.name, "Test name");
    }
    if (args.status !== undefined) {
      updates.status = args.status;
    }
    if (args.last_healed_at !== undefined) {
      updates.last_healed_at = args.last_healed_at;
    }
    if (args.last_healed_diff !== undefined) {
      updates.last_healed_diff = args.last_healed_diff;
    }
    if (args.clear_healed_at) {
      updates.last_healed_at = undefined;
      updates.last_healed_diff = undefined;
    }

    await ctx.db.patch(args.test_id, updates);
  },
});

export const updateTestStatus = mutation({
  args: {
    test_id: v.id("tests"),
    status: v.union(v.literal("draft"), v.literal("approved"), v.literal("healing")),
  },
  handler: async (ctx, args) => {
    await getOwnedEntity(ctx, args.test_id, "tests");

    await ctx.db.patch(args.test_id, { status: args.status });
  },
});

export const setTestHealing = internalMutation({
  args: { test_id: v.id("tests") },
  handler: async (ctx, args) => {
    const test = await ctx.db.get(args.test_id);
    if (!test) throw new ConvexError("Test not found");
    await ctx.db.patch(args.test_id, { status: "healing" });
  },
});

export const setTestDraft = internalMutation({
  args: { test_id: v.id("tests") },
  handler: async (ctx, args) => {
    const test = await ctx.db.get(args.test_id);
    if (!test) throw new ConvexError("Test not found");
    await ctx.db.patch(args.test_id, { status: "draft" });
  },
});

export const deleteTest = mutation({
  args: { test_id: v.id("tests") },
  handler: async (ctx, args) => {
    await getOwnedEntity(ctx, args.test_id, "tests");

    await ctx.db.delete(args.test_id);
  },
});

export const createTestFromGeneration = internalMutation({
  args: {
    suite_id: v.id("suites"),
    name: v.string(),
    playwright_code: v.optional(v.string()),
    execution_type: v.optional(
      v.union(v.literal("playwright"), v.literal("stagehand")),
    ),
    steps: v.optional(v.array(testStepValidator)),
    source_type: v.union(
      v.literal("url_exploration"),
      v.literal("prd"),
      v.literal("natural_language"),
    ),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (!args.name.trim()) {
      throw new ConvexError("Test name cannot be empty");
    }

    const suite = await ctx.db.get(args.suite_id);
    if (!suite) throw new ConvexError("Suite not found");

    return ctx.db.insert("tests", {
      workspace_id: suite.workspace_id,
      suite_id: args.suite_id,
      name: args.name.trim(),
      description: args.description?.trim() || undefined,
      playwright_code: args.playwright_code,
      execution_type: args.execution_type ?? "playwright",
      steps: args.steps,
      source_type: args.source_type,
      status: "draft",
    });
  },
});

export const lockTest = mutation({
  args: { test_id: v.id("tests") },
  handler: async (ctx, args) => {
    const { user, entity: test } = await getOwnedEntity(ctx, args.test_id, "tests");
    const userId = String(user._id);

    if (test.locked_by && test.locked_by !== userId) {
      const holderName = await getUserName(ctx, test.workspace_id, test.locked_by);
      throw new ConvexError(`Test is locked by ${holderName}`);
    }

    await ctx.db.patch(args.test_id, {
      locked_by: userId,
      locked_at: Date.now(),
    });
  },
});

export const unlockTest = mutation({
  args: { test_id: v.id("tests") },
  handler: async (ctx, args) => {
    const { user, entity: test } = await getOwnedEntity(ctx, args.test_id, "tests");
    const userId = String(user._id);

    if (test.locked_by && test.locked_by !== userId) {
      throw new ConvexError("Cannot unlock a test locked by another user");
    }

    await ctx.db.patch(args.test_id, {
      locked_by: undefined,
      locked_at: undefined,
    });
  },
});

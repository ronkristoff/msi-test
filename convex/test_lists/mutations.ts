import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { getMemberWorkspace, getOwnedEntity } from "../lib/requireAuth";
import { validateRequiredField } from "../lib/validation";
import { NAME_MAX } from "../lib/constraints";
import { resolveTestSource } from "./helpers";
import type { Id } from "../_generated/dataModel";

export const createTestList = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user, workspace } = await getMemberWorkspace(ctx);
    const name = validateRequiredField(args.name, "Test list name");
    if (name.length > NAME_MAX) {
      throw new ConvexError(`Name must be under ${NAME_MAX} characters`);
    }

    return ctx.db.insert("test_lists", {
      workspace_id: workspace._id,
      name,
      description: args.description?.trim() || undefined,
      created_by: String(user._id),
    });
  },
});

export const updateTestList = mutation({
  args: {
    test_list_id: v.id("test_lists"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await getOwnedEntity(ctx, args.test_list_id, "test_lists");

    const updates: Record<string, unknown> = {};
    if (args.name !== undefined) {
      updates.name = validateRequiredField(args.name, "Test list name");
    }
    if (args.description !== undefined) {
      updates.description = args.description.trim() || undefined;
    }

    await ctx.db.patch(args.test_list_id, updates);
  },
});

export const deleteTestList = mutation({
  args: {
    test_list_id: v.id("test_lists"),
  },
  handler: async (ctx, args) => {
    await getOwnedEntity(ctx, args.test_list_id, "test_lists");

    const members = await ctx.db
      .query("test_list_members")
      .withIndex("by_test_list_id", (q) => q.eq("test_list_id", args.test_list_id))
      .collect();

    for (const member of members) {
      await ctx.db.delete(member._id);
    }

    await ctx.db.delete(args.test_list_id);
  },
});

export const addTestToList = mutation({
  args: {
    test_list_id: v.id("test_lists"),
    test_id: v.id("tests"),
  },
  handler: async (ctx, args) => {
    const { workspace } = await getMemberWorkspace(ctx);
    await getOwnedEntity(ctx, args.test_list_id, "test_lists");

    const test = await ctx.db.get(args.test_id);
    if (!test || test.workspace_id !== workspace._id) {
      throw new ConvexError("Test not found or access denied");
    }

    const existing = await ctx.db
      .query("test_list_members")
      .withIndex("by_test_list_id", (q) => q.eq("test_list_id", args.test_list_id))
      .collect();
    if (existing.some((m) => m.test_id === args.test_id)) {
      throw new ConvexError("Test is already in this list");
    }

    const source = await resolveTestSource(ctx, test);

    return ctx.db.insert("test_list_members", {
      workspace_id: workspace._id,
      test_list_id: args.test_list_id,
      test_id: args.test_id,
      source_suite_id: source.source_suite_id,
      source_project_id: source.source_project_id,
      added_at: Date.now(),
    });
  },
});

export const removeTestFromList = mutation({
  args: {
    test_list_id: v.id("test_lists"),
    test_id: v.id("tests"),
  },
  handler: async (ctx, args) => {
    await getOwnedEntity(ctx, args.test_list_id, "test_lists");

    const members = await ctx.db
      .query("test_list_members")
      .withIndex("by_test_list_id", (q) => q.eq("test_list_id", args.test_list_id))
      .collect();

    const match = members.find((m) => m.test_id === args.test_id);
    if (!match) {
      throw new ConvexError("Test is not in this list");
    }

    await ctx.db.delete(match._id);
  },
});

export const addTestsToList = mutation({
  args: {
    test_list_id: v.id("test_lists"),
    test_ids: v.array(v.id("tests")),
  },
  handler: async (ctx, args) => {
    const { workspace } = await getMemberWorkspace(ctx);
    await getOwnedEntity(ctx, args.test_list_id, "test_lists");

    const existing = await ctx.db
      .query("test_list_members")
      .withIndex("by_test_list_id", (q) => q.eq("test_list_id", args.test_list_id))
      .collect();
    const existingTestIds = new Set(existing.map((m) => m.test_id));

    const added: Id<"test_list_members">[] = [];
    for (const testId of args.test_ids) {
      if (existingTestIds.has(testId)) continue;

      const test = await ctx.db.get(testId);
      if (!test || test.workspace_id !== workspace._id) continue;

      let source: { source_suite_id: Id<"suites">; source_project_id: Id<"projects"> };
      try {
        source = await resolveTestSource(ctx, test);
      } catch {
        continue;
      }

      const memberId = await ctx.db.insert("test_list_members", {
        workspace_id: workspace._id,
        test_list_id: args.test_list_id,
        test_id: testId,
        source_suite_id: source.source_suite_id,
        source_project_id: source.source_project_id,
        added_at: Date.now(),
      });
      added.push(memberId);
    }

    return added;
  },
});

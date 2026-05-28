import { mutation, internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { getOwnedEntity } from "../lib/requireAuth";
import { validateRequiredField } from "../lib/validation";

export const updateTestCode = mutation({
  args: {
    test_id: v.id("tests"),
    playwright_code: v.string(),
    name: v.optional(v.string()),
    status: v.optional(v.union(v.literal("draft"), v.literal("approved"))),
  },
  handler: async (ctx, args) => {
    await getOwnedEntity(ctx, args.test_id, "tests");

    const code = validateRequiredField(args.playwright_code, "Playwright code");

    const updates: Record<string, unknown> = { playwright_code: code };
    if (args.name !== undefined) {
      updates.name = validateRequiredField(args.name, "Test name");
    }
    if (args.status !== undefined) {
      updates.status = args.status;
    }

    await ctx.db.patch(args.test_id, updates);
  },
});

export const updateTestStatus = mutation({
  args: {
    test_id: v.id("tests"),
    status: v.union(v.literal("draft"), v.literal("approved")),
  },
  handler: async (ctx, args) => {
    await getOwnedEntity(ctx, args.test_id, "tests");

    await ctx.db.patch(args.test_id, { status: args.status });
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
    playwright_code: v.string(),
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
      source_type: args.source_type,
      status: "draft",
    });
  },
});

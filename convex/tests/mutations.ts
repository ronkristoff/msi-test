import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { getOwnedEntity } from "../lib/requireAuth";
import { validateRequiredField } from "../lib/validation";

export const updateTestCode = mutation({
  args: {
    test_id: v.id("tests"),
    playwright_code: v.string(),
  },
  handler: async (ctx, args) => {
    await getOwnedEntity(ctx, args.test_id, "tests");

    const code = validateRequiredField(args.playwright_code, "Playwright code");

    await ctx.db.patch(args.test_id, { playwright_code: code });
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

import { query } from "../_generated/server";
import { v } from "convex/values";
import { getOptionalOwnedEntity } from "../lib/requireAuth";

export const getTests = query({
  args: { suite_id: v.id("suites") },
  handler: async (ctx, args) => {
    const result = await getOptionalOwnedEntity(ctx, args.suite_id, "suites");
    if (!result) return [];

    return ctx.db
      .query("tests")
      .withIndex("by_suite_id", (q) => q.eq("suite_id", args.suite_id))
      .order("desc")
      .collect();
  },
});

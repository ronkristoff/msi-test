import { query } from "../_generated/server";
import { v } from "convex/values";
import { getOptionalOwnedWorkspace } from "../lib/requireAuth";

export const getTests = query({
  args: { suite_id: v.id("suites") },
  handler: async (ctx, args) => {
    const result = await getOptionalOwnedWorkspace(ctx);
    if (!result) return [];

    const suite = await ctx.db.get(args.suite_id);
    if (!suite || suite.workspace_id !== result.workspace._id) return [];

    return ctx.db
      .query("tests")
      .withIndex("by_suite_id", (q) => q.eq("suite_id", args.suite_id))
      .order("desc")
      .collect();
  },
});

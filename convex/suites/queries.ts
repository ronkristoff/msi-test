import { query } from "../_generated/server";
import { v } from "convex/values";
import { getOptionalOwnedEntity } from "../lib/requireAuth";

export const getSuites = query({
  args: { project_id: v.id("projects") },
  handler: async (ctx, args) => {
    const result = await getOptionalOwnedEntity(ctx, args.project_id, "projects");
    if (!result) return [];

    const suites = await ctx.db
      .query("suites")
      .withIndex("by_project_id", (q) => q.eq("project_id", args.project_id))
      .order("desc")
      .collect();

    const withCounts = await Promise.all(
      suites.map(async (suite) => {
        const testCount = (await ctx.db
          .query("tests")
          .withIndex("by_suite_id", (q) => q.eq("suite_id", suite._id))
          .collect()).length;
        return { ...suite, testCount };
      }),
    );

    return withCounts;
  },
});

export const getSuite = query({
  args: { suite_id: v.id("suites") },
  handler: async (ctx, args) => {
    const result = await getOptionalOwnedEntity(ctx, args.suite_id, "suites");
    if (!result) return null;

    const testCount = (await ctx.db
      .query("tests")
      .withIndex("by_suite_id", (q) => q.eq("suite_id", args.suite_id))
      .collect()).length;

    return { ...result.entity, testCount };
  },
});

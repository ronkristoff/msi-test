import { internalQuery } from "../_generated/server";
import { v } from "convex/values";

export const getLastCapturedPage = internalQuery({
  args: { project_id: v.id("projects") },
  handler: async (ctx, args) => {
    const explorations = await ctx.db
      .query("explorations")
      .withIndex("by_project_id", (q) => q.eq("project_id", args.project_id))
      .order("desc")
      .collect();

    const lastCompleted = explorations.find(
      (e) => e.status === "completed" || e.status === "analyzed",
    );

    return lastCompleted?.captured_pages?.[0] ?? null;
  },
});

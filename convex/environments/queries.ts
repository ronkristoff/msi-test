import { query } from "../_generated/server";
import { v } from "convex/values";
import { getOptionalOwnedEntity } from "../lib/requireAuth";

export const getEnvironments = query({
  args: { project_id: v.id("projects") },
  handler: async (ctx, args) => {
    const result = await getOptionalOwnedEntity(ctx, args.project_id, "projects");
    if (!result) return [];

    return ctx.db
      .query("environments")
      .withIndex("by_project_id", (q) => q.eq("project_id", args.project_id))
      .order("desc")
      .collect();
  },
});

export const getEnvironment = query({
  args: { environment_id: v.id("environments") },
  handler: async (ctx, args) => {
    const result = await getOptionalOwnedEntity(ctx, args.environment_id, "environments");
    if (!result) return null;
    return result.entity;
  },
});

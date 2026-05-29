import { query } from "../_generated/server";
import { v } from "convex/values";
import { getOptionalOwnedEntity, getOptionalOwnedWorkspace } from "../lib/requireAuth";

export const getExploration = query({
  args: { exploration_id: v.id("explorations") },
  handler: async (ctx, args) => {
    const result = await getOptionalOwnedEntity(ctx, args.exploration_id, "explorations");
    if (!result) return null;
    return result.entity;
  },
});

export const getExplorationsByProject = query({
  args: { project_id: v.id("projects") },
  handler: async (ctx, args) => {
    const ws = await getOptionalOwnedWorkspace(ctx);
    if (!ws) return [];

    const project = await ctx.db.get(args.project_id);
    if (!project || project.workspace_id !== ws.workspace._id) return [];

    return ctx.db
      .query("explorations")
      .withIndex("by_project_id", (q) => q.eq("project_id", args.project_id))
      .order("desc")
      .collect();
  },
});

export const getPendingExplorations = query({
  args: {},
  handler: async (ctx) => {
    return ctx.db
      .query("explorations")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();
  },
});

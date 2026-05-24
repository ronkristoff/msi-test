import { query } from "../_generated/server";
import { v } from "convex/values";
import { getOptionalOwnedWorkspace } from "../lib/requireAuth";

export const getProjects = query({
  args: { workspace_id: v.id("workspaces") },
  handler: async (ctx, args) => {
    const result = await getOptionalOwnedWorkspace(ctx);
    if (!result) return [];
    if (args.workspace_id !== result.workspace._id) return [];

    return ctx.db
      .query("projects")
      .withIndex("by_workspace_id", (q) => q.eq("workspace_id", args.workspace_id))
      .order("asc")
      .collect();
  },
});

export const getProject = query({
  args: { project_id: v.id("projects") },
  handler: async (ctx, args) => {
    const result = await getOptionalOwnedWorkspace(ctx);
    if (!result) return null;

    const project = await ctx.db.get(args.project_id);
    if (!project) return null;
    if (project.workspace_id !== result.workspace._id) return null;

    return project;
  },
});

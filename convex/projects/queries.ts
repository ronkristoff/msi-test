import { query } from "../_generated/server";
import { v } from "convex/values";
import { getOptionalOwnedWorkspace, getOptionalOwnedEntity } from "../lib/requireAuth";
import { maskApiKey } from "../lib/validation";

export const getProjects = query({
  args: { workspace_id: v.id("workspaces") },
  handler: async (ctx, args) => {
    const result = await getOptionalOwnedWorkspace(ctx);
    if (!result) return [];
    if (args.workspace_id !== result.workspace._id) return [];

    return ctx.db
      .query("projects")
      .withIndex("by_workspace_id", (q) => q.eq("workspace_id", args.workspace_id))
      .order("desc")
      .collect();
  },
});

export const getProject = query({
  args: { project_id: v.id("projects") },
  handler: async (ctx, args) => {
    const result = await getOptionalOwnedEntity(ctx, args.project_id, "projects");
    if (!result) return null;
    const project = result.entity;
    return {
      ...project,
      explore_password: project.explore_password
        ? maskApiKey(project.explore_password)
        : undefined,
      explore_cookie_value: project.explore_cookie_value
        ? maskApiKey(project.explore_cookie_value)
        : undefined,
    };
  },
});

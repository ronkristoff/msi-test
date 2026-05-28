import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { getOwnedWorkspace, getOwnedEntity } from "../lib/requireAuth";
import { validateRequiredField, normalizeAppUrl } from "../lib/validation";

export const createEnvironment = mutation({
  args: {
    project_id: v.id("projects"),
    name: v.string(),
    base_url: v.string(),
  },
  handler: async (ctx, args) => {
    const { workspace } = await getOwnedWorkspace(ctx);
    const { entity: project } = await getOwnedEntity(ctx, args.project_id, "projects");
    if (project.workspace_id !== workspace._id) {
      throw new Error("Not found or access denied");
    }

    const name = validateRequiredField(args.name, "Environment name");
    const base_url = normalizeAppUrl(args.base_url);

    return ctx.db.insert("environments", {
      workspace_id: workspace._id,
      project_id: project._id,
      name,
      base_url,
    });
  },
});

export const updateEnvironment = mutation({
  args: {
    environment_id: v.id("environments"),
    name: v.optional(v.string()),
    base_url: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await getOwnedEntity(ctx, args.environment_id, "environments");

    const updates: Record<string, unknown> = {};

    if (args.name !== undefined) {
      updates.name = validateRequiredField(args.name, "Environment name");
    }

    if (args.base_url !== undefined) {
      updates.base_url = normalizeAppUrl(args.base_url);
    }

    await ctx.db.patch(args.environment_id, updates);
  },
});

export const deleteEnvironment = mutation({
  args: { environment_id: v.id("environments") },
  handler: async (ctx, args) => {
    await getOwnedEntity(ctx, args.environment_id, "environments");
    await ctx.db.delete(args.environment_id);
  },
});

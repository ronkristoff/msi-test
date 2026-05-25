import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { getOwnedWorkspace, getOwnedEntity } from "../lib/requireAuth";
import { validateProjectName, normalizeAppUrl } from "../lib/validation";

export const createProject = mutation({
  args: {
    workspace_id: v.id("workspaces"),
    name: v.string(),
    app_url: v.string(),
    prd_text: v.optional(v.string()),
    prd_file_id: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const { workspace } = await getOwnedWorkspace(ctx);
    if (args.workspace_id !== workspace._id) {
      throw new ConvexError("Not found or access denied");
    }

    const name = validateProjectName(args.name);
    const appUrl = normalizeAppUrl(args.app_url);

    const existing = await ctx.db
      .query("projects")
      .withIndex("by_workspace_id_and_name", (q) =>
        q.eq("workspace_id", args.workspace_id).eq("name", name),
      )
      .first();
    if (existing) {
      throw new ConvexError("A project with this name already exists in this workspace");
    }

    return ctx.db.insert("projects", {
      workspace_id: args.workspace_id,
      name,
      app_url: appUrl,
      ...(args.prd_text?.trim() ? { prd_text: args.prd_text.trim() } : {}),
      ...(args.prd_file_id ? { prd_file_id: args.prd_file_id } : {}),
    });
  },
});

export const updateProject = mutation({
  args: {
    project_id: v.id("projects"),
    name: v.optional(v.string()),
    app_url: v.optional(v.string()),
    prd_text: v.optional(v.string()),
    prd_file_id: v.optional(v.id("_storage")),
    clear_prd: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { entity: project } = await getOwnedEntity(ctx, args.project_id, "projects");

    const updates: Record<string, unknown> = {};

    if (args.name !== undefined) {
      const name = validateProjectName(args.name);

      if (name !== project.name) {
        const existing = await ctx.db
          .query("projects")
          .withIndex("by_workspace_id_and_name", (q) =>
            q.eq("workspace_id", project.workspace_id).eq("name", name),
          )
          .first();
        if (existing) {
          throw new ConvexError("A project with this name already exists in this workspace");
        }
      }
      updates.name = name;
    }

    if (args.app_url !== undefined) {
      updates.app_url = normalizeAppUrl(args.app_url);
    }

    if (args.clear_prd) {
      if (project.prd_file_id) {
        await ctx.storage.delete(project.prd_file_id);
      }
      updates.prd_text = undefined;
      updates.prd_file_id = undefined;
    } else if (args.prd_text !== undefined) {
      if (project.prd_file_id) {
        await ctx.storage.delete(project.prd_file_id);
      }
      updates.prd_text = args.prd_text.trim() || undefined;
      updates.prd_file_id = undefined;
    } else if (args.prd_file_id !== undefined) {
      updates.prd_text = undefined;
      updates.prd_file_id = args.prd_file_id;
    }

    await ctx.db.patch(args.project_id, updates);
  },
});

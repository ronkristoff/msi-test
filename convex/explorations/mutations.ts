import { mutation } from "../_generated/server";
import { ConvexError, v } from "convex/values";
import { getOwnedWorkspace, getOwnedEntity } from "../lib/requireAuth";
import { normalizeAppUrl } from "../lib/validation";

export const createExploration = mutation({
  args: {
    project_id: v.id("projects"),
    url: v.optional(v.string()),
    goal: v.optional(v.string()),
    additional_urls: v.optional(v.array(v.string())),
    exploration_mode: v.optional(v.union(v.literal("scripted"), v.literal("autonomous"))),
    max_steps: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { workspace } = await getOwnedWorkspace(ctx);
    const { entity: project } = await getOwnedEntity(ctx, args.project_id, "projects");

    if (args.max_steps !== undefined && (args.max_steps < 5 || args.max_steps > 100)) {
      throw new ConvexError("max_steps must be between 5 and 100");
    }

    const url = args.url?.trim()
      ? normalizeAppUrl(args.url)
      : project.app_url;

    return ctx.db.insert("explorations", {
      workspace_id: workspace._id,
      project_id: project._id,
      url,
      goal: args.goal?.trim() || undefined,
      additional_urls: args.additional_urls?.filter((u) => u.trim()) || undefined,
      exploration_mode: args.exploration_mode ?? "scripted",
      max_steps: args.max_steps,
      status: "pending",
    });
  },
});

export const cancelExploration = mutation({
  args: { exploration_id: v.id("explorations") },
  handler: async (ctx, args) => {
    const { entity: exploration } = await getOwnedEntity(ctx, args.exploration_id, "explorations");

    const cancellableStatuses = ["pending", "capturing", "analyzing"];
    if (!cancellableStatuses.includes(exploration.status)) {
      throw new ConvexError("Exploration is not in a cancellable state");
    }

    await ctx.db.patch(args.exploration_id, {
      status: "failed",
      error_message: "Cancelled by user",
    });
  },
});

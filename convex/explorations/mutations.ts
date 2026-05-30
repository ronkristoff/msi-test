import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { getOwnedWorkspace, getOwnedEntity } from "../lib/requireAuth";
import { normalizeAppUrl } from "../lib/validation";

export const createExploration = mutation({
  args: {
    project_id: v.id("projects"),
    url: v.optional(v.string()),
    goal: v.optional(v.string()),
    additional_urls: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const { workspace } = await getOwnedWorkspace(ctx);
    const { entity: project } = await getOwnedEntity(ctx, args.project_id, "projects");

    const url = args.url?.trim()
      ? normalizeAppUrl(args.url)
      : project.app_url;

    return ctx.db.insert("explorations", {
      workspace_id: workspace._id,
      project_id: project._id,
      url,
      goal: args.goal?.trim() || undefined,
      additional_urls: args.additional_urls?.filter((u) => u.trim()) || undefined,
      status: "pending",
    });
  },
});

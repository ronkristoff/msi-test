import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { getOwnedWorkspace, getOwnedEntity } from "../lib/requireAuth";
import { normalizeAppUrl } from "../lib/validation";

export const createExploration = mutation({
  args: {
    project_id: v.id("projects"),
    url: v.optional(v.string()),
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
      status: "pending",
    });
  },
});

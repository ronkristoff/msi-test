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

    const cancellableStatuses = ["pending", "discovering", "discovered", "capturing", "analyzing"];
    if (!cancellableStatuses.includes(exploration.status)) {
      throw new ConvexError("Exploration is not in a cancellable state");
    }

    await ctx.db.patch(args.exploration_id, {
      status: "failed",
      error_message: "Cancelled by user",
    });
  },
});

export const startDeepExploration = mutation({
  args: {
    exploration_id: v.id("explorations"),
    selected_pages: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const { entity: exploration } = await getOwnedEntity(ctx, args.exploration_id, "explorations");
    if (exploration.status !== "discovered") {
      throw new ConvexError("Can only start deep exploration from discovered state");
    }

    const discoveredUrls = new Set((exploration.discovered_pages ?? []).map((p: { url: string }) => p.url));
    for (const url of args.selected_pages) {
      if (!discoveredUrls.has(url)) {
        throw new ConvexError(`Selected page ${url} was not discovered`);
      }
    }

    await ctx.db.patch(args.exploration_id, {
      status: "pending",
      selected_pages: args.selected_pages,
      runner_id: undefined,
      progress_message: "Queuing deep exploration...",
    });
  },
});

export const updateDiscoveredPages = mutation({
  args: {
    exploration_id: v.id("explorations"),
    additional_urls: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const { entity: exploration } = await getOwnedEntity(ctx, args.exploration_id, "explorations");
    if (exploration.status !== "discovered") {
      throw new ConvexError("Can only add pages to a discovered exploration");
    }

    const existingPages = exploration.discovered_pages ?? [];
    const existingUrls = new Set(existingPages.map((p: { url: string }) => p.url));
    const newPages = args.additional_urls
      .filter((url) => {
        const trimmed = url.trim();
        if (!trimmed) return false;
        try { new URL(trimmed); return true; } catch { return false; }
      })
      .filter((url) => !existingUrls.has(url.trim()))
      .map((url) => ({ url: url.trim(), title: url.trim() }));

    await ctx.db.patch(args.exploration_id, {
      discovered_pages: [...existingPages, ...newPages],
    });
  },
});

export const markExplorationCompleted = mutation({
  args: {
    exploration_id: v.id("explorations"),
  },
  handler: async (ctx, args) => {
    const { entity: exploration } = await getOwnedEntity(ctx, args.exploration_id, "explorations");
    await ctx.db.patch(args.exploration_id, {
      status: "completed",
      progress_message: "Test generation dispatched. Check individual suites for progress.",
    });
  },
});

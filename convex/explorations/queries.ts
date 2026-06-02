import { query } from "../_generated/server";
import { v } from "convex/values";
import { getOptionalOwnedEntity, getOptionalOwnedWorkspace } from "../lib/requireAuth";

export const getExploration = query({
  args: { exploration_id: v.id("explorations") },
  handler: async (ctx, args) => {
    const result = await getOptionalOwnedEntity(ctx, args.exploration_id, "explorations");
    if (!result) return null;

    const exploration = result.entity;

    if (!exploration.captured_pages) return exploration;

    const resolvedPages = await Promise.all(
      exploration.captured_pages.map(async (page) => {
        if (!page.screenshot_storage_id) return { ...page, screenshot_url: null };
        const url = await ctx.storage.getUrl(page.screenshot_storage_id);
        return { ...page, screenshot_url: url };
      }),
    );

    return { ...exploration, captured_pages: resolvedPages };
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

const ACTIVE_STATUSES = ["pending", "capturing", "captured", "analyzing", "analyzed"] as const;

export const getLatestActiveExploration = query({
  args: { project_id: v.id("projects") },
  handler: async (ctx, args) => {
    const ws = await getOptionalOwnedWorkspace(ctx);
    if (!ws) return null;

    const project = await ctx.db.get(args.project_id);
    if (!project || project.workspace_id !== ws.workspace._id) return null;

    const explorations = await ctx.db
      .query("explorations")
      .withIndex("by_project_id", (q) => q.eq("project_id", args.project_id))
      .order("desc")
      .collect();

    return explorations.find((e) =>
      (ACTIVE_STATUSES as readonly string[]).includes(e.status),
    ) ?? null;
  },
});

export const getPendingExplorations = query({
  args: {},
  handler: async (ctx) => {
    const explorations = await ctx.db
      .query("explorations")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();

    const enriched = await Promise.all(
      explorations.map(async (exploration) => {
        const project = await ctx.db.get(exploration.project_id);
        return {
          _id: exploration._id,
          url: exploration.url,
          workspace_id: exploration.workspace_id,
          project_id: exploration.project_id,
          auth_mode: project?.explore_auth_mode ?? "none",
          login_url: project?.explore_login_url,
          username: project?.explore_username,
          password: project?.explore_password,
          cookie_name: project?.explore_cookie_name,
          cookie_value: project?.explore_cookie_value,
          additional_urls: exploration.additional_urls,
          interactive: exploration.interactive ?? false,
          exploration_mode: exploration.exploration_mode ?? "scripted",
          max_steps: exploration.max_steps,
          goal: exploration.goal,
          prd_text: project?.prd_text,
        };
      }),
    );
    return enriched;
  },
});

import { internalMutation, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { capturedPageValidator, discoveredFlowValidator, discoveredPageValidator, prdCoverageItemValidator, authCookieValidator } from "../lib/validation";

export const claimExploration = internalMutation({
  args: {
    exploration_id: v.id("explorations"),
    runner_id: v.string(),
    target_status: v.optional(v.union(
      v.literal("discovering"),
      v.literal("capturing"),
    )),
  },
  handler: async (ctx, args) => {
    const exploration = await ctx.db.get(args.exploration_id);
    if (!exploration) throw new Error("Exploration not found");
    if (exploration.runner_id && exploration.runner_id !== args.runner_id) throw new Error("Exploration already claimed");

    const targetStatus = args.target_status ?? "capturing";

    if (targetStatus === "discovering" && exploration.status !== "pending") {
      throw new Error("Exploration is not in pending status for discovery");
    }
    if (targetStatus === "capturing" && exploration.status !== "discovered" && exploration.status !== "pending") {
      throw new Error("Exploration is not in discovered/pending status for capture");
    }

    await ctx.db.patch(args.exploration_id, {
      runner_id: args.runner_id,
      status: targetStatus,
      progress_message: targetStatus === "discovering"
        ? "Discovering pages..."
        : "Starting deep exploration...",
      pages_captured: 0,
    });
  },
});

export const completeDiscovery = internalMutation({
  args: {
    exploration_id: v.id("explorations"),
    discovered_pages: v.array(discoveredPageValidator),
    discovered_flows: v.optional(v.array(discoveredFlowValidator)),
    auth_cookies: v.optional(v.array(authCookieValidator)),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.exploration_id, {
      status: "discovered",
      discovered_pages: args.discovered_pages,
      pages_captured: args.discovered_pages.length,
      progress_message: `Discovered ${args.discovered_pages.length} pages. Select pages to explore.`,
      runner_id: undefined,
      ...(args.discovered_flows !== undefined ? { discovered_flows: args.discovered_flows } : {}),
      ...(args.auth_cookies !== undefined ? { auth_cookies: args.auth_cookies } : {}),
    });
  },
});

export const updateExplorationProgress = internalMutation({
  args: {
    exploration_id: v.id("explorations"),
    progress_message: v.string(),
    pages_captured: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.exploration_id, {
      progress_message: args.progress_message,
      pages_captured: args.pages_captured,
    });
  },
});

export const completeExplorationCapture = internalMutation({
  args: {
    exploration_id: v.id("explorations"),
    captured_pages: v.array(capturedPageValidator),
    discovered_flows: v.optional(v.array(discoveredFlowValidator)),
    prd_coverage: v.optional(v.array(prdCoverageItemValidator)),
    nav_menu: v.optional(v.array(v.object({
      text: v.string(),
      href: v.string(),
    }))),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.exploration_id, {
      status: "captured",
      captured_pages: args.captured_pages,
      pages_captured: args.captured_pages.length,
      progress_message: "Capture complete, starting analysis...",
      ...(args.discovered_flows !== undefined ? { discovered_flows: args.discovered_flows } : {}),
      ...(args.prd_coverage !== undefined ? { prd_coverage: args.prd_coverage } : {}),
      ...(args.nav_menu !== undefined ? { nav_menu: args.nav_menu } : {}),
    });
  },
});

export const storeProposedScenarios = internalMutation({
  args: {
    exploration_id: v.id("explorations"),
    scenarios: v.array(
      v.object({
        name: v.string(),
        description: v.string(),
        flow_summary: v.string(),
        area: v.string(),
        related_flows: v.optional(v.array(v.string())),
        relevant_page_urls: v.optional(v.array(v.string())),
      }),
    ),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.exploration_id, {
      status: "analyzed",
      proposed_scenarios: args.scenarios,
      progress_message: "Analysis complete. Review proposed scenarios.",
    });
  },
});

export const updateExplorationStatus = internalMutation({
  args: {
    exploration_id: v.id("explorations"),
    status: v.union(
      v.literal("discovering"),
      v.literal("discovered"),
      v.literal("analyzing"),
      v.literal("completed"),
      v.literal("failed"),
    ),
    progress_message: v.optional(v.string()),
    error_message: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const patch: Record<string, unknown> = { status: args.status };
    if (args.progress_message !== undefined) patch.progress_message = args.progress_message;
    if (args.error_message !== undefined) patch.error_message = args.error_message;
    await ctx.db.patch(args.exploration_id, patch);
  },
});

export const getExplorationStatus = internalQuery({
  args: { exploration_id: v.id("explorations") },
  handler: async (ctx, args) => {
    const exploration = await ctx.db.get(args.exploration_id);
    if (!exploration) return { status: "failed" as const };
    return { status: exploration.status, error_message: exploration.error_message };
  },
});

export const getExplorationAuthConfig = internalQuery({
  args: { exploration_id: v.id("explorations") },
  handler: async (ctx, args) => {
    const exploration = await ctx.db.get(args.exploration_id);
    if (!exploration) return null;
    const project = await ctx.db.get(exploration.project_id);
    if (!project) return null;
    return {
      auth_mode: project.explore_auth_mode ?? "none",
      login_url: project.explore_login_url,
      username: project.explore_username,
      password: project.explore_password,
      cookie_name: project.explore_cookie_name,
      cookie_value: project.explore_cookie_value,
    };
  },
});

export const getExplorationForAnalysis = internalQuery({
  args: { exploration_id: v.id("explorations") },
  handler: async (ctx, args) => {
    const exploration = await ctx.db.get(args.exploration_id);
    if (!exploration) return null;
    return {
      workspace_id: exploration.workspace_id,
      project_id: exploration.project_id,
      url: exploration.url,
      goal: exploration.goal,
      captured_pages: exploration.captured_pages ?? [],
      discovered_flows: exploration.discovered_flows,
      prd_coverage: exploration.prd_coverage,
    };
  },
});

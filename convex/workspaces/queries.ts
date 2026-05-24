import { query } from "../_generated/server";
import { getOptionalAuthUser } from "../lib/requireAuth";
import { getOwnerId } from "../lib/requireAuth";
import { maskApiKey } from "../lib/validation";

export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    return getOptionalAuthUser(ctx);
  },
});

export const getWorkspaceForUser = query({
  args: {},
  handler: async (ctx) => {
    const user = await getOptionalAuthUser(ctx);
    if (!user) return null;

    const workspace = await ctx.db
      .query("workspaces")
      .withIndex("by_owner_id", (q) => q.eq("owner_id", getOwnerId(user)))
      .first();
    if (!workspace) return null;

    const { api_key, ...safeAiConfig } = workspace.ai_config;
    return {
      ...workspace,
      ai_config: { ...safeAiConfig, api_key_masked: maskApiKey(api_key) },
    };
  },
});

export const hasWorkspace = query({
  args: {},
  handler: async (ctx) => {
    const user = await getOptionalAuthUser(ctx);
    if (!user) return false;

    const workspace = await ctx.db
      .query("workspaces")
      .withIndex("by_owner_id", (q) => q.eq("owner_id", getOwnerId(user)))
      .first();
    return workspace !== null;
  },
});

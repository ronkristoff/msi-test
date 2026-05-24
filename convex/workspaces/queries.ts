import { query } from "../_generated/server";
import { getOptionalOwnedWorkspace, getOptionalAuthUser } from "../lib/requireAuth";
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
    const result = await getOptionalOwnedWorkspace(ctx);
    if (!result) return null;

    const { workspace } = result;
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
    const result = await getOptionalOwnedWorkspace(ctx);
    return result !== null;
  },
});

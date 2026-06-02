"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
import { validateRunnerSecret } from "../lib/runner";
import { internal } from "../_generated/api";
import type { AiConfig } from "../ai/model";

export const runnerGetWorkspaceAiConfig = action({
  args: { runner_secret: v.string(), workspace_id: v.id("workspaces") },
  handler: async (ctx, args): Promise<AiConfig> => {
    validateRunnerSecret(args.runner_secret);
    return ctx.runQuery(internal.ai.model.getWorkspaceAiConfigQuery, {
      workspace_id: args.workspace_id,
    }) as Promise<AiConfig>;
  },
});

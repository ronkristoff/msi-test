"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
import { validateRunnerSecret } from "../lib/runner";
import { getWorkspaceAiConfig } from "../ai/model";

export const runnerGetWorkspaceAiConfig = action({
  args: { runner_secret: v.string(), workspace_id: v.id("workspaces") },
  handler: async (ctx, args) => {
    validateRunnerSecret(args.runner_secret);
    return getWorkspaceAiConfig(ctx, args.workspace_id);
  },
});

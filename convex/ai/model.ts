import { createOpenAI } from "@ai-sdk/openai";
import type { Config } from "@convex-dev/agent";
import { internalQuery } from "../_generated/server";
import { v, ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

type AgentModel = Config extends { languageModel?: infer M } ? M : never;

export type AiConfig = {
  endpoint_url: string;
  api_key: string;
  model_name: string;
  stagehand_model_name?: string;
};

export async function getWorkspaceAiConfig(
  ctx: QueryCtx,
  workspaceId: Id<"workspaces">,
): Promise<AiConfig> {
  const workspace = await ctx.db.get(workspaceId);
  if (!workspace) throw new Error("Workspace not found");
  return workspace.ai_config;
}

export const getWorkspaceAiConfigQuery = internalQuery({
  args: { workspace_id: v.id("workspaces") },
  handler: async (ctx, args) => {
    return getWorkspaceAiConfig(ctx, args.workspace_id);
  },
});

export function getWorkspaceModel(config: AiConfig): AgentModel {
  if (config.model_name.toLowerCase().endsWith("free")) {
    throw new ConvexError(
      `Model "${config.model_name}" is a free-tier model. Free-tier models are not permitted — configure a production model in workspace AI settings.`,
    );
  }
  const openai = createOpenAI({
    baseURL: config.endpoint_url,
    apiKey: config.api_key,
  });
  return openai.chat(config.model_name);
}

import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { requireAuth, getOwnerId } from "../lib/requireAuth";
import { getOwnedWorkspace } from "../lib/requireAuth";
import { validateWorkspaceName, validateEndpointUrl, validateRequiredField } from "../lib/validation";

export const createWorkspace = mutation({
  args: {
    name: v.string(),
    ai_config: v.object({
      endpoint_url: v.string(),
      api_key: v.string(),
      model_name: v.string(),
      stagehand_model_name: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const name = validateWorkspaceName(args.name);
    validateEndpointUrl(args.ai_config.endpoint_url);
    validateRequiredField(args.ai_config.api_key, "API key");
    validateRequiredField(args.ai_config.model_name, "Model name");

    const ownerId = getOwnerId(user);
    const existing = await ctx.db
      .query("workspaces")
      .withIndex("by_owner_id", (q) => q.eq("owner_id", ownerId))
      .first();
    if (existing) throw new ConvexError("Workspace already exists");

    const workspaceId = await ctx.db.insert("workspaces", {
      name,
      owner_id: ownerId,
      ai_config: args.ai_config,
    });

    await ctx.db.insert("workspace_members", {
      workspace_id: workspaceId,
      user_id: ownerId,
      role: "owner" as const,
      invited_at: Date.now(),
      user_name: ownerId,
    });

    return workspaceId;
  },
});

export const updateWorkspace = mutation({
  args: {
    name: v.optional(v.string()),
    ai_config: v.optional(
      v.object({
        endpoint_url: v.string(),
        api_key: v.optional(v.string()),
        model_name: v.string(),
        stagehand_model_name: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const { workspace } = await getOwnedWorkspace(ctx);

    if (args.name !== undefined) {
      validateWorkspaceName(args.name);
    }

    const updates: Record<string, unknown> = {};
    if (args.name !== undefined) updates.name = args.name.trim();
    if (args.ai_config !== undefined) {
      validateEndpointUrl(args.ai_config.endpoint_url);
      const resolvedKey = args.ai_config.api_key ?? workspace.ai_config.api_key;
      validateRequiredField(resolvedKey, "API key");
      updates.ai_config = {
        endpoint_url: args.ai_config.endpoint_url,
        api_key: resolvedKey,
        model_name: args.ai_config.model_name,
        stagehand_model_name: args.ai_config.stagehand_model_name ?? workspace.ai_config.stagehand_model_name,
      };
    }

    await ctx.db.patch(workspace._id, updates);
  },
});

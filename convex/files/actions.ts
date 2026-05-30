import { action } from "../_generated/server";
import { ConvexError, v } from "convex/values";
import { validateRunnerSecret } from "../lib/runner";

export const generateUploadUrl = action({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("Not authenticated");
    return ctx.storage.generateUploadUrl();
  },
});

export const runnerGenerateUploadUrl = action({
  args: { runner_secret: v.string() },
  handler: async (ctx, args) => {
    validateRunnerSecret(args.runner_secret);
    return ctx.storage.generateUploadUrl();
  },
});

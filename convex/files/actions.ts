import { action } from "../_generated/server";
import { ConvexError } from "convex/values";

export const generateUploadUrl = action({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("Not authenticated");
    return ctx.storage.generateUploadUrl();
  },
});

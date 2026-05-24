import { mutation } from "../_generated/server";
import { v } from "convex/values";

export const logError = mutation({
  args: {
    message: v.string(),
    stack: v.optional(v.string()),
    source: v.string(),
    severity: v.optional(v.string()),
    url: v.optional(v.string()),
    user_agent: v.optional(v.string()),
    user_id: v.optional(v.string()),
    context: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const message = args.message.slice(0, 2000);
    const stack = args.stack?.slice(0, 5000);
    const context = args.context?.slice(0, 5000);

    await ctx.db.insert("error_logs", {
      message,
      stack,
      source: args.source,
      severity: args.severity ?? "error",
      url: args.url?.slice(0, 500),
      user_agent: args.user_agent?.slice(0, 500),
      user_id: args.user_id,
      context,
    });
  },
});

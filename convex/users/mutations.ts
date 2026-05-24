import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { requireAuth } from "../lib/requireAuth";
import { authComponent, createAuth } from "../auth";

export const updateUserName = mutation({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    await requireAuth(ctx);

    const name = args.name.trim();
    if (name.length === 0 || name.length > 100) {
      throw new ConvexError("Name must be 1-100 characters");
    }

    const { auth, headers } = await authComponent.getAuth(createAuth, ctx);
    await auth.api.updateUser({
      body: { name },
      headers,
    });
  },
});

export const updateUserPassword = mutation({
  args: {
    currentPassword: v.string(),
    newPassword: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);

    if (args.newPassword.length < 8) {
      throw new ConvexError("New password must be at least 8 characters");
    }

    const { auth, headers } = await authComponent.getAuth(createAuth, ctx);
    await auth.api.changePassword({
      body: {
        currentPassword: args.currentPassword,
        newPassword: args.newPassword,
      },
      headers,
    });
  },
});

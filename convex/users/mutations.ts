import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { requireAuth } from "../lib/requireAuth";
import { authComponent, createAuth } from "../auth";
import { NAME_MAX, PASSWORD_MIN } from "../lib/constraints";

export const updateUserName = mutation({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    await requireAuth(ctx);

    const name = args.name.trim();
    if (name.length === 0 || name.length > NAME_MAX) {
      throw new ConvexError(`Name must be 1-${NAME_MAX} characters`);
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

    if (args.newPassword.length < PASSWORD_MIN) {
      throw new ConvexError(`New password must be at least ${PASSWORD_MIN} characters`);
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

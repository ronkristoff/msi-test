import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { requireAuth, getOwnerId, getOwnerWorkspace } from "../lib/requireAuth";

function generateInviteCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export const joinWorkspace = mutation({
  args: {
    invite_code: v.string(),
    user_name: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const userId = getOwnerId(user);

    const userName = args.user_name.trim();
    if (!userName) throw new ConvexError("Name is required");

    const workspace = await ctx.db
      .query("workspaces")
      .withIndex("by_invite_code", (q) => q.eq("invite_code", args.invite_code.trim()))
      .first();
    if (!workspace) throw new ConvexError("Invalid invite code");

    const existing = await ctx.db
      .query("workspace_members")
      .withIndex("by_workspace_id_and_user_id", (q) =>
        q.eq("workspace_id", workspace._id).eq("user_id", userId),
      )
      .first();
    if (existing) throw new ConvexError("Already a member of this workspace");

    await ctx.db.insert("workspace_members", {
      workspace_id: workspace._id,
      user_id: userId,
      role: "member",
      invited_at: Date.now(),
      user_name: userName,
    });

    return { workspace_id: workspace._id, user_id: userId };
  },
});

export const removeMember = mutation({
  args: {
    member_id: v.id("workspace_members"),
  },
  handler: async (ctx, args) => {
    const { workspace } = await getOwnerWorkspace(ctx);

    const member = await ctx.db.get(args.member_id);
    if (!member) throw new ConvexError("Member not found");
    if (member.workspace_id !== workspace._id) {
      throw new ConvexError("Not found or access denied");
    }
    if (member.role === "owner") {
      throw new ConvexError("Cannot remove workspace owner");
    }

    await ctx.db.delete(args.member_id);
  },
});

export const regenerateInviteCode = mutation({
  args: {},
  handler: async (ctx) => {
    const { workspace } = await getOwnerWorkspace(ctx);
    const newCode = generateInviteCode();
    await ctx.db.patch(workspace._id, { invite_code: newCode });
    return newCode;
  },
});

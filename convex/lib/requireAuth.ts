import { ConvexError } from "convex/values";
import { authComponent } from "../auth";
import type { QueryCtx, MutationCtx } from "../_generated/server";

export async function getOptionalAuthUser(ctx: QueryCtx | MutationCtx) {
  try {
    return await authComponent.getAuthUser(ctx);
  } catch {
    return null;
  }
}

export async function requireAuth(ctx: QueryCtx | MutationCtx) {
  const user = await getOptionalAuthUser(ctx);
  if (!user) throw new ConvexError("Not authenticated");
  return user;
}

export function getOwnerId(user: { _id: string }): string {
  return String(user._id);
}

export async function getOwnedWorkspace(ctx: QueryCtx | MutationCtx) {
  const user = await requireAuth(ctx);
  const ownerId = getOwnerId(user);
  const workspace = await ctx.db
    .query("workspaces")
    .withIndex("by_owner_id", (q) => q.eq("owner_id", ownerId))
    .first();
  if (!workspace) throw new ConvexError("Workspace not found");
  return { user, workspace, ownerId };
}

export async function getOptionalOwnedWorkspace(ctx: QueryCtx | MutationCtx) {
  const user = await getOptionalAuthUser(ctx);
  if (!user) return null;
  const ownerId = getOwnerId(user);
  const workspace = await ctx.db
    .query("workspaces")
    .withIndex("by_owner_id", (q) => q.eq("owner_id", ownerId))
    .first();
  if (!workspace) return null;
  return { user, workspace, ownerId };
}

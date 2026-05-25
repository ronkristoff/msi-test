import { ConvexError } from "convex/values";
import { authComponent } from "../auth";
import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { TableNames, Id, Doc } from "../_generated/dataModel";

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

export async function getOwnedEntity<T extends TableNames>(
  ctx: QueryCtx | MutationCtx,
  entityId: Id<T>,
  _tableName: T,
) {
  const { user, workspace } = await getOwnedWorkspace(ctx);
  const entity = await ctx.db.get(entityId);
  if (!entity) throw new ConvexError("Not found or access denied");
  if (entity.workspace_id !== workspace._id) throw new ConvexError("Not found or access denied");
  return { user, workspace, entity: entity as Doc<T> & { _id: Id<T> } };
}

export async function getOptionalOwnedEntity<T extends TableNames>(
  ctx: QueryCtx | MutationCtx,
  entityId: Id<T>,
  _tableName: T,
) {
  const result = await getOptionalOwnedWorkspace(ctx);
  if (!result) return null;
  const entity = await ctx.db.get(entityId);
  if (!entity) return null;
  if (entity.workspace_id !== result.workspace._id) return null;
  return { ...result, entity: entity as Doc<T> & { _id: Id<T> } };
}

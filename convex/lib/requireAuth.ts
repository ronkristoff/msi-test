import { ConvexError } from "convex/values";
import { authComponent } from "../auth";
import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { TableNames, Id, Doc } from "../_generated/dataModel";

export async function getOptionalAuthUser(ctx: QueryCtx | MutationCtx) {
  try {
    const user = await authComponent.getAuthUser(ctx);
    if (user) return user;
  } catch {
    // Better Auth not available (e.g. test environment)
  }

  const identity = await ctx.auth.getUserIdentity();
  if (identity) {
    return { _id: identity.subject };
  }

  return null;
}

export async function requireAuth(ctx: QueryCtx | MutationCtx) {
  const user = await getOptionalAuthUser(ctx);
  if (!user) throw new ConvexError("Not authenticated");
  return user;
}

export function getOwnerId(user: { _id: string }): string {
  return String(user._id);
}

type MemberWorkspaceResult = {
  user: { _id: string };
  workspace: Doc<"workspaces"> & { _id: Id<"workspaces"> };
  membership: Doc<"workspace_members"> & { _id: Id<"workspace_members"> };
};

export async function getMemberWorkspace(ctx: QueryCtx | MutationCtx): Promise<MemberWorkspaceResult> {
  const user = await requireAuth(ctx);
  const userId = getOwnerId(user);

  const membership = await ctx.db
    .query("workspace_members")
    .withIndex("by_user_id", (q) => q.eq("user_id", userId))
    .first();
  if (!membership) throw new ConvexError("Workspace not found");

  const workspace = await ctx.db.get(membership.workspace_id);
  if (!workspace) throw new ConvexError("Workspace not found");

  return { user, workspace, membership };
}

export async function getOwnerWorkspace(ctx: QueryCtx | MutationCtx): Promise<MemberWorkspaceResult> {
  const result = await getMemberWorkspace(ctx);
  if (result.membership.role !== "owner") {
    throw new ConvexError("Only workspace owners can perform this action");
  }
  return result;
}

export async function getOptionalMemberWorkspace(ctx: QueryCtx | MutationCtx): Promise<MemberWorkspaceResult | null> {
  const user = await getOptionalAuthUser(ctx);
  if (!user) return null;
  const userId = getOwnerId(user);

  const membership = await ctx.db
    .query("workspace_members")
    .withIndex("by_user_id", (q) => q.eq("user_id", userId))
    .first();
  if (!membership) return null;

  const workspace = await ctx.db.get(membership.workspace_id);
  if (!workspace) return null;

  return { user, workspace, membership };
}

export async function getOwnedEntity<T extends TableNames>(
  ctx: QueryCtx | MutationCtx,
  entityId: Id<T>,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _tableName: T,
) {
  const { user, workspace } = await getMemberWorkspace(ctx);
  const entity = await ctx.db.get(entityId);
  if (!entity) throw new ConvexError("Not found or access denied");
  if (entity.workspace_id !== workspace._id) throw new ConvexError("Not found or access denied");
  return { user, workspace, entity: entity as Doc<T> & { _id: Id<T> } };
}

export async function getOwnedEntityMessage<T extends TableNames>(
  ctx: QueryCtx | MutationCtx,
  entityId: Id<T>,
  tableName: T,
  message: string,
) {
  const { user, workspace } = await getMemberWorkspace(ctx);
  const entity = await ctx.db.get(entityId);
  if (!entity) throw new ConvexError(message);
  if (entity.workspace_id !== workspace._id) throw new ConvexError(message);
  return { user, workspace, entity: entity as Doc<T> & { _id: Id<T> } };
}

export async function getOptionalOwnedEntity<T extends TableNames>(
  ctx: QueryCtx | MutationCtx,
  entityId: Id<T>,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _tableName: T,
) {
  const result = await getOptionalMemberWorkspace(ctx);
  if (!result) return null;
  const entity = await ctx.db.get(entityId);
  if (!entity) return null;
  if (entity.workspace_id !== result.workspace._id) return null;
  return { ...result, entity: entity as Doc<T> & { _id: Id<T> } };
}

export async function getUserName(ctx: QueryCtx | MutationCtx, workspaceId: Id<"workspaces">, userId: string): Promise<string> {
  const membership = await ctx.db
    .query("workspace_members")
    .withIndex("by_workspace_id_and_user_id", (q) =>
      q.eq("workspace_id", workspaceId).eq("user_id", userId),
    )
    .first();
  return membership?.user_name ?? "Unknown User";
}

/** @deprecated Use getMemberWorkspace instead */
export const getOwnedWorkspace = getMemberWorkspace;
/** @deprecated Use getOptionalMemberWorkspace instead */
export const getOptionalOwnedWorkspace = getOptionalMemberWorkspace;

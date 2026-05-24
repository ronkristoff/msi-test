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

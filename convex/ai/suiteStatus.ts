import type { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";

export async function markSuiteFailed(
  ctx: ActionCtx,
  suiteId: Id<"suites">,
  error: string,
) {
  await ctx.runMutation(internal.suites.mutations.updateSuiteStatus, {
    suite_id: suiteId,
    status: "failed",
    generation_error: error,
  });
}

export async function markSuiteReady(
  ctx: ActionCtx,
  suiteId: Id<"suites">,
) {
  await ctx.runMutation(internal.suites.mutations.updateSuiteStatus, {
    suite_id: suiteId,
    status: "ready",
  });
}

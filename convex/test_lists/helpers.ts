import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Id, Doc } from "../_generated/dataModel";

export type ResolvedTestSource = {
  source_suite_id: Id<"suites">;
  source_project_id: Id<"projects">;
};

export async function resolveTestSource(
  ctx: QueryCtx | MutationCtx,
  test: Doc<"tests">,
): Promise<ResolvedTestSource> {
  const suite = await ctx.db.get(test.suite_id);
  if (!suite) {
    throw new Error("Source suite not found");
  }
  return {
    source_suite_id: test.suite_id,
    source_project_id: suite.project_id,
  };
}

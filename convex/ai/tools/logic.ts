import type { QueryCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";

export async function readExistingTestsLogic(
  ctx: QueryCtx,
  suiteId: Id<"suites">,
): Promise<Array<{ name: string; playwright_code: string }>> {
  const tests = await ctx.db
    .query("tests")
    .withIndex("by_suite_id", (q) => q.eq("suite_id", suiteId))
    .collect();
  return tests.map((t) => ({ name: t.name, playwright_code: t.playwright_code ?? "" }));
}

export async function readProjectContextLogic(
  ctx: QueryCtx,
  projectId: Id<"projects">,
): Promise<{ name: string; app_url: string; prd_text?: string } | null> {
  const project = await ctx.db.get(projectId);
  if (!project) return null;
  return { name: project.name, app_url: project.app_url, prd_text: project.prd_text };
}

export async function readTestCodeLogic(
  ctx: QueryCtx,
  testId: Id<"tests">,
): Promise<{ name: string; playwright_code: string } | null> {
  const test = await ctx.db.get(testId);
  if (!test) return null;
  return { name: test.name, playwright_code: test.playwright_code ?? "" };
}

export function readPreviousExplorationsLogic(): [] {
  return [];
}

export function readRecentFailuresLogic(): [] {
  return [];
}

import type { DatabaseReader } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

export async function resolveSuiteTestIds(
  db: DatabaseReader,
  suiteId: Id<"suites">,
): Promise<Id<"tests">[]> {
  const suite = await db.get(suiteId);
  if (!suite) return [];

  if (suite.suite_type === "regression") {
    return resolveRegressionTestIds(db, suiteId, suite.project_id, suite.auto_include_all);
  }

  const tests = await db
    .query("tests")
    .withIndex("by_suite_id", (q) => q.eq("suite_id", suiteId))
    .collect();

  return tests.filter((t) => t.status === "approved").map((t) => t._id);
}

async function resolveRegressionTestIds(
  db: DatabaseReader,
  regressionSuiteId: Id<"suites">,
  projectId: Id<"projects">,
  autoIncludeAll?: boolean,
): Promise<Id<"tests">[]> {
  const testIdSet = new Set<string>();

  const members = await db
    .query("suite_members")
    .withIndex("by_regression_suite_id", (q) =>
      q.eq("regression_suite_id", regressionSuiteId),
    )
    .collect();

  const suiteIdsToInclude = new Set<string>();

  for (const member of members) {
    if (member.member_suite_id) {
      suiteIdsToInclude.add(member.member_suite_id);
    }
    if (member.member_test_id) {
      const test = await db.get(member.member_test_id);
      if (test && test.status === "approved") {
        testIdSet.add(test._id);
      }
    }
  }

  if (autoIncludeAll) {
    const allFunctional = await db
      .query("suites")
      .withIndex("by_project_id_and_suite_type", (q) =>
        q.eq("project_id", projectId).eq("suite_type", "functional"),
      )
      .collect();
    for (const fs of allFunctional) {
      suiteIdsToInclude.add(fs._id);
    }
  }

  for (const sid of suiteIdsToInclude) {
    const tests = await db
      .query("tests")
      .withIndex("by_suite_id", (q) => q.eq("suite_id", sid as Id<"suites">))
      .collect();
    for (const t of tests) {
      if (t.status === "approved") testIdSet.add(t._id);
    }
  }

  return [...testIdSet] as Id<"tests">[];
}

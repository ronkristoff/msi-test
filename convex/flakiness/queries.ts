import { query } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { getOptionalOwnedWorkspace } from "../lib/requireAuth";

const MAX_RUNS = 20;

type FlakinessCell = {
  runId: string;
  status: string;
  createdAt: number;
};

type FlakinessTestRow = {
  testId: string;
  testName: string;
  flakinessPct: number;
  results: FlakinessCell[];
};

type FlakinessCluster = {
  _id: string;
  testId: string;
  runId: string;
  analysisText: string;
  suggestedFix: string | null;
  confidenceScore: number;
};

type FlakinessRun = {
  runId: string;
  createdAt: number;
  label: string;
};

type FlakinessMapResult = {
  workspaceId: string | null;
  tests: FlakinessTestRow[];
  runs: FlakinessRun[];
  clusters: FlakinessCluster[];
};

const EMPTY_RESULT: FlakinessMapResult = {
  workspaceId: null,
  tests: [],
  runs: [],
  clusters: [],
};

export function computeFlakinessPct(statuses: string[]): number {
  if (statuses.length <= 1) return 0;
  let changes = 0;
  for (let i = 1; i < statuses.length; i++) {
    if (statuses[i] !== statuses[i - 1]) changes++;
  }
  return Math.round((changes / (statuses.length - 1)) * 1000) / 10;
}

export const getFlakinessMap = query({
  args: {},
  handler: async (ctx): Promise<FlakinessMapResult> => {
    const result = await getOptionalOwnedWorkspace(ctx);
    if (!result) return EMPTY_RESULT;

    const { workspace } = result;

    const allRuns = await ctx.db
      .query("runs")
      .withIndex("by_workspace_id", (q) => q.eq("workspace_id", workspace._id))
      .order("desc")
      .collect();

    const completed = allRuns
      .filter((r) => r.status !== "running")
      .slice(0, MAX_RUNS);

    if (completed.length === 0) return EMPTY_RESULT;

    const runs: FlakinessRun[] = completed
      .slice()
      .reverse()
      .map((run, i) => ({
        runId: run._id,
        createdAt: run._creationTime,
        label: `Run ${i + 1}`,
      }));

    const testResultMap = new Map<
      string,
      { name: string; statuses: Map<string, string> }
    >();

    for (const run of completed) {
      const runResults = await ctx.db
        .query("run_results")
        .withIndex("by_run_id", (q) => q.eq("run_id", run._id))
        .collect();

      for (const rr of runResults) {
        let entry = testResultMap.get(rr.test_id);
        if (!entry) {
          const test = await ctx.db.get(rr.test_id);
          entry = { name: test?.name ?? "Unknown test", statuses: new Map() };
          testResultMap.set(rr.test_id, entry);
        }
        entry.statuses.set(run._id, rr.status);
      }
    }

    const tests: FlakinessTestRow[] = [];
    for (const [testId, data] of testResultMap) {
      const orderedStatuses = completed
        .slice()
        .reverse()
        .map((run) => data.statuses.get(run._id) ?? "skipped");

      const results: FlakinessCell[] = completed.slice().reverse().map((run) => ({
        runId: run._id,
        status: data.statuses.get(run._id) ?? "skipped",
        createdAt: run._creationTime,
      }));

      tests.push({
        testId,
        testName: data.name,
        flakinessPct: computeFlakinessPct(orderedStatuses),
        results,
      });
    }

    const testIds = [...testResultMap.keys()] as Id<"tests">[];
    const clusters: FlakinessCluster[] = [];

    for (const testId of testIds) {
      const insights = await ctx.db
        .query("ai_insights")
        .withIndex("by_test_id", (q) => q.eq("test_id", testId))
        .collect();

      for (const insight of insights) {
        if (insight.type === "flakiness_cluster") {
          clusters.push({
            _id: insight._id,
            testId: insight.test_id,
            runId: insight.run_id,
            analysisText: insight.analysis_text,
            suggestedFix: insight.suggested_fix ?? null,
            confidenceScore: insight.confidence_score,
          });
        }
      }
    }

    return { workspaceId: workspace._id, tests, runs, clusters };
  },
});

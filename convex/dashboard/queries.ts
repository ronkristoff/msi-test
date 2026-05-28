import { query } from "../_generated/server";
import { getOptionalOwnedWorkspace } from "../lib/requireAuth";

const EMPTY_STATS = {
  passRate: 0,
  passRateTrend: 0,
  failedCount: 0,
  failedTrend: 0,
  flakyCount: 0,
  testsRun: 0,
  trendData: [] as TrendPoint[],
  recentFailures: [] as RecentFailure[],
};

type TrendPoint = {
  runId: string;
  passRate: number;
  createdAt: number;
  label: string;
};

type RecentFailure = {
  testId: string;
  testName: string;
  errorSummary: string;
  rootCause: string | null;
  suggestedFix: string | null;
  confidenceScore: number | null;
  runId: string;
  createdAt: number;
};

const TREND_WINDOW = 10;
const MAX_RUNS = 20;
const MAX_FAILURES = 5;

function passRate(pass: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((pass / total) * 1000) / 10;
}

function sumCounts(runs: Array<{ pass_count?: number; fail_count?: number }>) {
  let p = 0;
  let f = 0;
  for (const r of runs) {
    p += r.pass_count ?? 0;
    f += r.fail_count ?? 0;
  }
  return { pass: p, fail: f };
}

export const getDashboardStats = query({
  args: {},
  handler: async (ctx) => {
    const result = await getOptionalOwnedWorkspace(ctx);
    if (!result) return EMPTY_STATS;

    const { workspace } = result;

    const runs = await ctx.db
      .query("runs")
      .withIndex("by_workspace_id", (q) => q.eq("workspace_id", workspace._id))
      .order("desc")
      .take(MAX_RUNS);

    const completed = runs.filter((r) => r.status !== "running");

    const recent = completed.slice(0, TREND_WINDOW);
    const previous = completed.slice(TREND_WINDOW, TREND_WINDOW * 2);

    const recentCounts = sumCounts(recent);
    const prevCounts = sumCounts(previous);

    const recentRate = passRate(recentCounts.pass, recentCounts.pass + recentCounts.fail);
    const prevRate = passRate(prevCounts.pass, prevCounts.pass + prevCounts.fail);

    const trendData: TrendPoint[] = completed
      .map((run, i) => ({
        runId: run._id,
        passRate: passRate(run.pass_count ?? 0, (run.pass_count ?? 0) + (run.fail_count ?? 0)),
        createdAt: run._creationTime,
        label: `Run ${completed.length - i}`,
      }))
      .reverse();

    const perTestStatuses = new Map<string, Set<string>>();
    const failedResults: Array<{
      test_id: string;
      run_id: string;
      run_result_id: string;
      created_at: number;
    }> = [];

    for (const run of completed) {
      const results = await ctx.db
        .query("run_results")
        .withIndex("by_run_id", (q) => q.eq("run_id", run._id))
        .collect();

      for (const rr of results) {
        let statuses = perTestStatuses.get(rr.test_id);
        if (!statuses) {
          statuses = new Set();
          perTestStatuses.set(rr.test_id, statuses);
        }
        statuses.add(rr.status);

        if (rr.status === "failed") {
          failedResults.push({
            test_id: rr.test_id,
            run_id: rr.run_id,
            run_result_id: rr._id,
            created_at: rr._creationTime,
          });
        }
      }
    }

    let flakyCount = 0;
    for (const statuses of perTestStatuses.values()) {
      if (statuses.has("passed") && statuses.has("failed")) {
        flakyCount++;
      }
    }

    failedResults.sort((a, b) => b.created_at - a.created_at);
    const topFailures = failedResults.slice(0, MAX_FAILURES);

    const recentFailures: RecentFailure[] = await Promise.all(
      topFailures.map(async (fr) => {
        const [test, steps, insight] = await Promise.all([
          ctx.db.get(fr.test_id),
          ctx.db
            .query("steps")
            .withIndex("by_run_result_id", (q) => q.eq("run_result_id", fr.run_result_id))
            .first(),
          ctx.db
            .query("ai_insights")
            .withIndex("by_test_id", (q) => q.eq("test_id", fr.test_id))
            .order("desc")
            .first(),
        ]);

        return {
          testId: fr.test_id,
          testName: test?.name ?? "Unknown test",
          errorSummary: steps?.error_message ?? "Test failed",
          rootCause: insight?.analysis_text ?? null,
          suggestedFix: insight?.suggested_fix ?? null,
          confidenceScore: insight?.confidence_score ?? null,
          runId: fr.run_id,
          createdAt: fr.created_at,
        };
      }),
    );

    return {
      passRate: recentRate,
      passRateTrend: previous.length === 0 ? 0 : Math.round((recentRate - prevRate) * 10) / 10,
      failedCount: recentCounts.fail,
      failedTrend: previous.length === 0 ? 0 : recentCounts.fail - prevCounts.fail,
      flakyCount,
      testsRun: perTestStatuses.size,
      trendData,
      recentFailures,
    };
  },
});

export const getActiveRuns = query({
  args: {},
  handler: async (ctx) => {
    const result = await getOptionalOwnedWorkspace(ctx);
    if (!result) return [];

    const { workspace } = result;

    const running = await ctx.db
      .query("runs")
      .withIndex("by_status", (q) => q.eq("status", "running"))
      .collect();

    const active = running.filter((r) => r.workspace_id === workspace._id);

    return Promise.all(
      active.map(async (run) => {
        const [suite, project, results] = await Promise.all([
          run.suite_id ? ctx.db.get(run.suite_id) : null,
          ctx.db.get(run.project_id),
          ctx.db
            .query("run_results")
            .withIndex("by_run_id", (q) => q.eq("run_id", run._id))
            .collect(),
        ]);

        const completedTests = results.filter(
          (r) => r.status === "passed" || r.status === "failed",
        ).length;

        let totalTests = 0;
        if (run.suite_id) {
          const tests = await ctx.db
            .query("tests")
            .withIndex("by_suite_id", (q) => q.eq("suite_id", run.suite_id))
            .collect();
          totalTests = tests.filter((t) => t.status === "approved").length;
        } else if (run.test_id) {
          totalTests = 1;
        }

        return {
          runId: run._id,
          suiteName: suite?.name ?? null,
          totalTests,
          completedTests,
          startedAt: run.started_at ?? null,
          projectName: project?.name ?? "Unknown project",
        };
      }),
    );
  },
});

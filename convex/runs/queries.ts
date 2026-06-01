import { query, internalQuery } from "../_generated/server";
import type { QueryCtx } from "../_generated/server";
import type { Id, Doc } from "../_generated/dataModel";
import { v } from "convex/values";
import { getOptionalOwnedEntity, getOptionalOwnedWorkspace } from "../lib/requireAuth";

type StepRow = {
  step_number: number;
  command: string;
  locator: string | null;
  status: string;
  duration_ms: number;
  error_message: string | null;
  screenshot_file_id?: string | null;
};

type ResultWithSteps = {
  _id: string;
  test_id: string;
  suite_id: string | null;
  status: string;
  duration_ms: number;
  retries: number;
  console_log_file_id?: string | null;
  trace_file_id?: string | null;
  video_file_id?: string | null;
  screenshot_file_ids?: string[] | null;
  error_message?: string | null;
  test_name: string;
  playwright_code: string | null;
  steps: StepRow[];
};

async function fetchResultsWithSteps(
  ctx: QueryCtx,
  run_id: Id<"runs">,
): Promise<ResultWithSteps[]> {
  const runResults = await ctx.db
    .query("run_results")
    .withIndex("by_run_id", (q) => q.eq("run_id", run_id))
    .collect();

  return Promise.all(
    runResults.map(async (rr) => {
      const steps = await ctx.db
        .query("steps")
        .withIndex("by_run_result_id", (q) => q.eq("run_result_id", rr._id))
        .collect();

      const test = await ctx.db.get(rr.test_id);

      return {
        _id: rr._id,
        test_id: rr.test_id,
        suite_id: test?.suite_id ?? null,
        status: rr.status,
        duration_ms: rr.duration_ms,
        retries: rr.retries,
        console_log_file_id: rr.console_log_file_id ?? null,
        trace_file_id: rr.trace_file_id ?? null,
        video_file_id: rr.video_file_id ?? null,
        screenshot_file_ids: rr.screenshot_file_ids ?? null,
        error_message: rr.error_message ?? null,
        test_name: test?.name ?? "Unknown test",
        playwright_code: test?.playwright_code ?? null,
        steps: steps.map((s) => ({
          step_number: s.step_number,
          command: s.command,
          locator: s.locator ?? null,
          status: s.status,
          duration_ms: s.duration_ms,
          error_message: s.error_message ?? null,
          screenshot_file_id: s.screenshot_file_id ?? null,
        })),
      };
    }),
  );
}

export const getPendingWork = query({
  args: {},
  handler: async (ctx) => {
    const runs = await ctx.db
      .query("runs")
      .withIndex("by_status", (q) => q.eq("status", "running"))
      .collect();

    const pending = runs.filter((r) => !r.runner_id);

    return Promise.all(
      pending.map(async (run) => {
        const runResults = await ctx.db
          .query("run_results")
          .withIndex("by_run_id", (q) => q.eq("run_id", run._id))
          .collect();

        const tests: Array<{
          _id: string;
          name: string;
          playwright_code: string;
        }> = (
          await Promise.all(
            runResults.map(async (rr) => {
              const test = await ctx.db.get(rr.test_id);
              if (!test) return null;
              return {
                _id: test._id,
                name: test.name,
                playwright_code: test.playwright_code,
              };
            }),
          )
        ).filter((t): t is NonNullable<typeof t> => t !== null);

        let base_url: string | null = null;
        if (run.environment_id) {
          const env = await ctx.db.get(run.environment_id);
          if (env) base_url = env.base_url;
        }

        const project = await ctx.db.get(run.project_id);

        return {
          run_id: run._id,
          workspace_id: run.workspace_id,
          project_id: run.project_id,
          environment_id: run.environment_id ?? null,
          base_url,
          trigger_type: run.trigger_type,
          tests,
          run_result_ids: runResults.map((rr) => ({ _id: rr._id, test_id: rr.test_id })),
          auth_mode: project?.explore_auth_mode ?? "none",
          login_url: project?.explore_login_url ?? undefined,
          test_username: project?.explore_username ?? undefined,
          test_password: project?.explore_password ?? undefined,
          test_data: project?.test_data ?? undefined,
        };
      }),
    );
  },
});

export const getRunDetail = query({
  args: { run_id: v.id("runs") },
  handler: async (ctx, args) => {
    const result = await getOptionalOwnedEntity(ctx, args.run_id, "runs");
    if (!result) return null;

    const run = result.entity;
    const results = await fetchResultsWithSteps(ctx, args.run_id);

    let environment = null;
    if (run.environment_id) {
      const env = await ctx.db.get(run.environment_id);
      if (env) environment = { name: env.name, base_url: env.base_url };
    }

    let suite = null;
    if (run.suite_id) {
      const suiteDoc = await ctx.db.get(run.suite_id);
      if (suiteDoc) suite = { _id: suiteDoc._id, name: suiteDoc.name };
    }

    let project = null;
    const projectDoc = await ctx.db.get(run.project_id);
    if (projectDoc) project = { _id: projectDoc._id, name: projectDoc.name, app_url: projectDoc.app_url };

    return {
      ...run,
      environment,
      suite,
      project,
      results,
    };
  },
});

export const getActiveRunForSuite = query({
  args: { suite_id: v.id("suites") },
  handler: async (ctx, args) => {
    const result = await getOptionalOwnedEntity(ctx, args.suite_id, "suites");
    if (!result) return null;

    const runs = await ctx.db
      .query("runs")
      .withIndex("by_suite_id", (q) => q.eq("suite_id", args.suite_id))
      .order("desc")
      .collect();

    return runs.find((r) => r.status === "running") ?? null;
  },
});

type EnrichedRun = Doc<"runs"> & {
  suite_name: string | null;
  environment_name: string | null;
  project_name: string | null;
};

async function enrichRun(ctx: QueryCtx, run: Doc<"runs">): Promise<EnrichedRun> {
  const [suite, env, project] = await Promise.all([
    run.suite_id ? ctx.db.get(run.suite_id) : null,
    run.environment_id ? ctx.db.get(run.environment_id) : null,
    ctx.db.get(run.project_id),
  ]);
  return {
    ...run,
    suite_name: suite?.name ?? null,
    environment_name: env?.name ?? null,
    project_name: project?.name ?? null,
  };
}

const RUN_STATUS_VALIDATORS = v.union(
  v.literal("running"),
  v.literal("passed"),
  v.literal("failed"),
  v.literal("cancelled"),
  v.literal("timed_out"),
);

type RunSortField = "recency" | "duration" | "fail_count" | "flakiness";

export function isFlaky(run: Doc<"runs">): boolean {
  return (run.pass_count ?? 0) > 0 && (run.fail_count ?? 0) > 0;
}

export function sortRuns(runs: Doc<"runs">[], sortBy: RunSortField, order: "asc" | "desc"): Doc<"runs">[] {
  const sorted = [...runs];
  const dir = order === "asc" ? 1 : -1;
  sorted.sort((a, b) => {
    switch (sortBy) {
      case "duration":
        return dir * ((a.duration_ms ?? 0) - (b.duration_ms ?? 0));
      case "fail_count":
        return dir * ((a.fail_count ?? 0) - (b.fail_count ?? 0));
      case "flakiness": {
        const aFlaky = isFlaky(a) ? 1 : 0;
        const bFlaky = isFlaky(b) ? 1 : 0;
        return dir * (aFlaky - bFlaky);
      }
      case "recency":
      default:
        return dir * (a._creationTime - b._creationTime);
    }
  });
  return sorted;
}

export function matchSearch(enriched: EnrichedRun, term: string): boolean {
  const t = term.toLowerCase();
  return (
    enriched._id.toLowerCase().includes(t) ||
    (enriched.suite_name?.toLowerCase().includes(t) ?? false) ||
    (enriched.project_name?.toLowerCase().includes(t) ?? false)
  );
}

export const getWorkspaceRuns = query({
  args: {
    status: v.optional(RUN_STATUS_VALIDATORS),
    branch: v.optional(v.string()),
    environment_id: v.optional(v.id("environments")),
    search: v.optional(v.string()),
    sort_by: v.optional(v.union(
      v.literal("recency"),
      v.literal("duration"),
      v.literal("fail_count"),
      v.literal("flakiness"),
    )),
    sort_order: v.optional(v.union(v.literal("asc"), v.literal("desc"))),
    flaky_only: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const ws = await getOptionalOwnedWorkspace(ctx);
    if (!ws) return [];

    const sortBy: RunSortField = args.sort_by ?? "recency";
    const sortOrder = args.sort_order ?? "desc";

    let runs = await ctx.db
      .query("runs")
      .withIndex("by_workspace_id", (q) => q.eq("workspace_id", ws.workspace._id))
      .collect();

    if (args.status) {
      runs = runs.filter((r) => r.status === args.status);
    }
    if (args.branch) {
      runs = runs.filter((r) => r.branch === args.branch);
    }
    if (args.environment_id) {
      runs = runs.filter((r) => r.environment_id === args.environment_id);
    }
    if (args.flaky_only) {
      runs = runs.filter(isFlaky);
    }

    // TODO: server-side pagination at scale — currently returns all matching runs
    const sorted = sortRuns(runs, sortBy, sortOrder);

    const enriched = await Promise.all(sorted.map((r) => enrichRun(ctx, r)));

    if (args.search) {
      return enriched.filter((r) => matchSearch(r, args.search!));
    }

    return enriched;
  },
});

export const getRunFilterOptions = query({
  args: {},
  handler: async (ctx) => {
    const ws = await getOptionalOwnedWorkspace(ctx);
    if (!ws) return { branches: [] as string[], environments: [] as { _id: Id<"environments">; name: string }[], statusCounts: {} as Record<string, number> };

    const runs = await ctx.db
      .query("runs")
      .withIndex("by_workspace_id", (q) => q.eq("workspace_id", ws.workspace._id))
      .collect();

    const branchSet = new Set<string>();
    const counts: Record<string, number> = { all: runs.length, running: 0, passed: 0, failed: 0, cancelled: 0, flaky: 0 };
    for (const r of runs) {
      if (r.branch) branchSet.add(r.branch);
      counts[r.status] = (counts[r.status] ?? 0) + 1;
      if (isFlaky(r)) counts.flaky = (counts.flaky ?? 0) + 1;
    }

    const environments = await ctx.db
      .query("environments")
      .withIndex("by_workspace_id", (q) => q.eq("workspace_id", ws.workspace._id))
      .collect();

    return {
      branches: [...branchSet].sort(),
      environments: environments.map((e) => ({ _id: e._id, name: e.name })),
      statusCounts: counts,
    };
  },
});

export const getSameFailureHistory = query({
  args: { test_id: v.id("tests"), exclude_run_id: v.id("runs") },
  handler: async (ctx, args) => {
    const ws = await getOptionalOwnedWorkspace(ctx);
    if (!ws) return [];

    const results = await ctx.db
      .query("run_results")
      .withIndex("by_test_id", (q) => q.eq("test_id", args.test_id))
      .collect();

    const failed = results
      .filter((r) => r.status === "failed" && r.run_id !== args.exclude_run_id)
      .slice(0, 5);

    return Promise.all(
      failed.map(async (r) => {
        const run = await ctx.db.get(r.run_id);
        return {
          run_id: r.run_id,
          run_status: run?.status ?? null,
          duration_ms: r.duration_ms,
          _creationTime: r._creationTime,
        };
      }),
    );
  },
});

export const getStepScreenshotUrl = query({
  args: { storage_id: v.id("_storage"), run_result_id: v.id("run_results") },
  handler: async (ctx, args) => {
    const ws = await getOptionalOwnedWorkspace(ctx);
    if (!ws) return null;

    const rr = await ctx.db.get(args.run_result_id);
    if (!rr || rr.workspace_id !== ws.workspace._id) return null;

    return ctx.storage.getUrl(args.storage_id);
  },
});

export const getConsoleLogUrl = query({
  args: { run_result_id: v.id("run_results") },
  handler: async (ctx, args) => {
    const ws = await getOptionalOwnedWorkspace(ctx);
    if (!ws) return null;

    const rr = await ctx.db.get(args.run_result_id);
    if (!rr || rr.workspace_id !== ws.workspace._id) return null;

    if (!rr.console_log_file_id) return null;
    return ctx.storage.getUrl(rr.console_log_file_id);
  },
});

export const getResultArtifactUrls = query({
  args: { run_result_id: v.id("run_results") },
  handler: async (ctx, args) => {
    const ws = await getOptionalOwnedWorkspace(ctx);
    if (!ws) return { screenshots: [] as (string | null)[], video: null as string | null, trace: null as string | null };

    const rr = await ctx.db.get(args.run_result_id);
    if (!rr || rr.workspace_id !== ws.workspace._id) return { screenshots: [] as (string | null)[], video: null as string | null, trace: null as string | null };

    const screenshots = rr.screenshot_file_ids
      ? await Promise.all(rr.screenshot_file_ids.map((id) => ctx.storage.getUrl(id)))
      : [];
    const video = rr.video_file_id ? await ctx.storage.getUrl(rr.video_file_id) : null;
    const trace = rr.trace_file_id ? await ctx.storage.getUrl(rr.trace_file_id) : null;

    return { screenshots, video, trace };
  },
});

export const getLatestFailureForTest = query({
  args: { test_id: v.id("tests") },
  handler: async (ctx, args) => {
    const ws = await getOptionalOwnedWorkspace(ctx);
    if (!ws) return null;

    const results = await ctx.db
      .query("run_results")
      .withIndex("by_test_id", (q) => q.eq("test_id", args.test_id))
      .collect();

    const failed = results
      .filter((r) => r.status === "failed" && r.error_message)
      .sort((a, b) => b._creationTime - a._creationTime);

    if (failed.length === 0) return null;

    const latest = failed[0];
    const stepErrors = await ctx.db
      .query("steps")
      .withIndex("by_run_result_id", (q) => q.eq("run_result_id", latest._id))
      .collect();

    const failedSteps = stepErrors
      .filter((s) => s.error_message)
      .map((s) => `Step ${s.step_number} (${s.command}): ${s.error_message}`)
      .join("\n");

    return {
      error_message: latest.error_message ?? null,
      step_errors: failedSteps || null,
      run_id: latest.run_id,
      _creationTime: latest._creationTime,
    };
  },
});

export const getRunForAnalysis = internalQuery({
  args: { run_id: v.id("runs") },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.run_id);
    if (!run) return null;

    const results = await fetchResultsWithSteps(ctx, args.run_id);

    return {
      workspace_id: run.workspace_id,
      results: results.map((r) => ({
        test_id: r.test_id,
        test_name: r.test_name,
        playwright_code: r.playwright_code,
        status: r.status,
        error_message: r.steps.find((s) => s.error_message)?.error_message ?? null,
        console_log_file_id: r.console_log_file_id,
        screenshot_file_id: r.steps.find((s) => s.status === "failed" && s.screenshot_file_id)?.screenshot_file_id ?? null,
        steps: r.steps,
      })),
    };
  },
});

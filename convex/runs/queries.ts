import { query, internalQuery } from "../_generated/server";
import type { QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { getOptionalOwnedEntity } from "../lib/requireAuth";

type StepRow = {
  step_number: number;
  command: string;
  locator: string | null;
  status: string;
  error_message: string | null;
  screenshot_file_id?: string | null;
};

type ResultWithSteps = {
  _id: string;
  test_id: string;
  status: string;
  duration_ms: number;
  console_log_file_id?: string | null;
  trace_file_id?: string | null;
  video_file_id?: string | null;
  screenshot_file_ids?: string[] | null;
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
        status: rr.status,
        duration_ms: rr.duration_ms,
        console_log_file_id: rr.console_log_file_id ?? null,
        trace_file_id: rr.trace_file_id ?? null,
        video_file_id: rr.video_file_id ?? null,
        screenshot_file_ids: rr.screenshot_file_ids ?? null,
        test_name: test?.name ?? "Unknown test",
        playwright_code: test?.playwright_code ?? null,
        steps: steps.map((s) => ({
          step_number: s.step_number,
          command: s.command,
          locator: s.locator ?? null,
          status: s.status,
          error_message: s.error_message ?? null,
          screenshot_file_id: s.screenshot_file_id ?? null,
        })),
      };
    }),
  );
}

export const getPendingWork = internalQuery({
  args: {},
  handler: async (ctx) => {
    const runs = await ctx.db
      .query("runs")
      .withIndex("by_status", (q) => q.eq("status", "running"))
      .collect();

    const pending = runs.filter((r) => !r.runner_id);

    return Promise.all(
      pending.map(async (run) => {
        let tests: Array<{
          _id: string;
          name: string;
          playwright_code: string;
        }> = [];

        if (run.suite_id) {
          const allTests = await ctx.db
            .query("tests")
            .withIndex("by_suite_id", (q) => q.eq("suite_id", run.suite_id!))
            .collect();
          tests = allTests
            .filter((t) => t.status === "approved")
            .map((t) => ({
              _id: t._id,
              name: t.name,
              playwright_code: t.playwright_code,
            }));
        } else if (run.test_id) {
          const test = await ctx.db.get(run.test_id);
          if (test) {
            tests = [
              {
                _id: test._id,
                name: test.name,
                playwright_code: test.playwright_code,
              },
            ];
          }
        }

        let base_url: string | null = null;
        if (run.environment_id) {
          const env = await ctx.db.get(run.environment_id);
          if (env) base_url = env.base_url;
        }

        const runResults = await ctx.db
          .query("run_results")
          .withIndex("by_run_id", (q) => q.eq("run_id", run._id))
          .collect();

        return {
          run_id: run._id,
          workspace_id: run.workspace_id,
          project_id: run.project_id,
          environment_id: run.environment_id ?? null,
          base_url,
          trigger_type: run.trigger_type,
          tests,
          run_result_ids: runResults.map((rr) => ({ _id: rr._id, test_id: rr.test_id })),
        };
      }),
    );
  },
});

export const getRuns = query({
  args: {
    project_id: v.id("projects"),
    status: v.optional(
      v.union(
        v.literal("running"),
        v.literal("passed"),
        v.literal("failed"),
        v.literal("cancelled"),
        v.literal("timed_out"),
      ),
    ),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const result = await getOptionalOwnedEntity(ctx, args.project_id, "projects");
    if (!result) {
      return { page: [], isDone: true, continueCursor: "" };
    }

    const q = args.status
      ? ctx.db
          .query("runs")
          .withIndex("by_project_id_and_status", (q) =>
            q.eq("project_id", args.project_id).eq("status", args.status!),
          )
      : ctx.db
          .query("runs")
          .withIndex("by_project_id", (q) => q.eq("project_id", args.project_id));

    return q.order("desc").paginate(args.paginationOpts);
  },
});

export const getRunDetail = query({
  args: { run_id: v.id("runs") },
  handler: async (ctx, args) => {
    const result = await getOptionalOwnedEntity(ctx, args.run_id, "runs");
    if (!result) return null;

    const run = result.entity;
    const results = await fetchResultsWithSteps(ctx, args.run_id);

    let environment = null;    if (run.environment_id) {
      const env = await ctx.db.get(run.environment_id);
      if (env) environment = { name: env.name, base_url: env.base_url };
    }

    return {
      ...run,
      environment,
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

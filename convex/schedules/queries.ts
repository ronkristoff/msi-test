import { query } from "../_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import {
  getOptionalOwnedWorkspace,
  getOptionalOwnedEntity,
} from "../lib/requireAuth";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

type CadenceLabel = "hourly" | "daily" | "weekly" | "custom";

function cadenceLabel(seconds: number): CadenceLabel {
  if (seconds === 3600) return "hourly";
  if (seconds === 86400) return "daily";
  if (seconds === 604800) return "weekly";
  return "custom";
}

type EnrichedSchedule = Doc<"schedules"> & {
  suite_name: string | null;
  environment_name: string | null;
  cadence_label: CadenceLabel;
  last_run_status: string | null;
};

async function findLatestRunForSchedule(
  ctx: QueryCtx,
  scheduleId: Id<"schedules">,
): Promise<Doc<"runs"> | null> {
  return ctx.db
    .query("runs")
    .withIndex("by_schedule_id", (q) => q.eq("schedule_id", scheduleId))
    .order("desc")
    .first();
}

async function enrichSchedule(
  ctx: QueryCtx,
  s: Doc<"schedules">,
): Promise<EnrichedSchedule> {
  const [env, lastRun, suite] = await Promise.all([
    ctx.db.get(s.environment_id),
    findLatestRunForSchedule(ctx, s._id),
    ctx.db.get(s.suite_id),
  ]);

  return {
    ...s,
    suite_name: suite?.name ?? null,
    environment_name: env?.name ?? null,
    cadence_label: cadenceLabel(s.cadence.seconds),
    last_run_status: lastRun?.status ?? null,
  };
}

export const getSchedules = query({
  args: {},
  handler: async (ctx) => {
    const ws = await getOptionalOwnedWorkspace(ctx);
    if (!ws) return [];

    const schedules = await ctx.db
      .query("schedules")
      .withIndex("by_workspace_id", (q) =>
        q.eq("workspace_id", ws.workspace._id),
      )
      .collect();

    return Promise.all(schedules.map((s) => enrichSchedule(ctx, s)));
  },
});

export const getSchedule = query({
  args: { schedule_id: v.id("schedules") },
  handler: async (ctx, args) => {
    const result = await getOptionalOwnedEntity(
      ctx,
      args.schedule_id,
      "schedules",
    );
    if (!result) return null;

    return enrichSchedule(ctx, result.entity);
  },
});

export const getScheduleRuns = query({
  args: {
    schedule_id: v.id("schedules"),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const result = await getOptionalOwnedEntity(
      ctx,
      args.schedule_id,
      "schedules",
    );
    if (!result) return { page: [], isDone: true, continueCursor: null };

    return ctx.db
      .query("runs")
      .withIndex("by_schedule_id", (q) => q.eq("schedule_id", args.schedule_id))
      .order("desc")
      .paginate(args.paginationOpts);
  },
});

type DiffEntry = {
  test_id: Id<"tests">;
  test_name: string;
  previous_status: string;
  current_status: string;
  change: "new_pass" | "new_fail";
};

export const getScheduleRunDiff = query({
  args: {
    current_run_id: v.id("runs"),
    previous_run_id: v.id("runs"),
  },
  handler: async (ctx, args) => {
    const ws = await getOptionalOwnedWorkspace(ctx);
    if (!ws) return [];

    const [currentRun, previousRun] = await Promise.all([
      ctx.db.get(args.current_run_id),
      ctx.db.get(args.previous_run_id),
    ]);

    if (!currentRun || !previousRun) return [];
    if (currentRun.workspace_id !== ws.workspace._id) return [];
    if (previousRun.workspace_id !== ws.workspace._id) return [];

    const [currentResults, previousResults] = await Promise.all([
      ctx.db
        .query("run_results")
        .withIndex("by_run_id", (q) => q.eq("run_id", args.current_run_id))
        .collect(),
      ctx.db
        .query("run_results")
        .withIndex("by_run_id", (q) => q.eq("run_id", args.previous_run_id))
        .collect(),
    ]);

    const prevByTest = new Map(previousResults.map((r) => [r.test_id, r.status]));
    const diffs: DiffEntry[] = [];

    for (const cr of currentResults) {
      const prevStatus = prevByTest.get(cr.test_id);
      if (!prevStatus || prevStatus === cr.status) continue;

      let change: DiffEntry["change"];
      if (cr.status === "passed") change = "new_pass";
      else if (cr.status === "failed") change = "new_fail";
      else continue;

      const test = await ctx.db.get(cr.test_id);
      diffs.push({
        test_id: cr.test_id,
        test_name: test?.name ?? "Unknown",
        previous_status: prevStatus,
        current_status: cr.status,
        change,
      });
    }

    return diffs;
  },
});

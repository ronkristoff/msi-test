import { internalMutation } from "../_generated/server";
import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { v } from "convex/values";

export const claimRun = internalMutation({
  args: {
    run_id: v.id("runs"),
    runner_id: v.string(),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.run_id);
    if (!run) throw new Error("Run not found");
    if (run.runner_id) throw new Error("Run already claimed");
    if (run.status !== "running") throw new Error("Run is not in running status");

    await ctx.db.patch(args.run_id, {
      runner_id: args.runner_id,
      started_at: Date.now(),
    });
  },
});

export const writeStepResult = internalMutation({
  args: {
    workspace_id: v.id("workspaces"),
    run_result_id: v.id("run_results"),
    step_number: v.number(),
    command: v.string(),
    locator: v.optional(v.string()),
    status: v.union(
      v.literal("passed"),
      v.literal("failed"),
      v.literal("skipped"),
    ),
    error_message: v.optional(v.string()),
    screenshot_file_id: v.optional(v.id("_storage")),
    duration_ms: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("steps", {
      workspace_id: args.workspace_id,
      run_result_id: args.run_result_id,
      step_number: args.step_number,
      command: args.command,
      locator: args.locator,
      status: args.status,
      error_message: args.error_message,
      screenshot_file_id: args.screenshot_file_id,
      duration_ms: args.duration_ms,
    });
  },
});

export const writeRunResult = internalMutation({
  args: {
    run_result_id: v.id("run_results"),
    status: v.union(
      v.literal("passed"),
      v.literal("failed"),
      v.literal("skipped"),
    ),
    duration_ms: v.number(),
    console_log_file_id: v.optional(v.id("_storage")),
    trace_file_id: v.optional(v.id("_storage")),
    video_file_id: v.optional(v.id("_storage")),
    screenshot_file_ids: v.optional(v.array(v.id("_storage"))),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.run_result_id, {
      status: args.status,
      duration_ms: args.duration_ms,
      console_log_file_id: args.console_log_file_id,
      trace_file_id: args.trace_file_id,
      video_file_id: args.video_file_id,
      screenshot_file_ids: args.screenshot_file_ids,
    });
  },
});

async function aggregateAndFinalize(
  ctx: MutationCtx,
  run_id: Id<"runs">,
  statusOverride?: "failed" | "cancelled" | "timed_out",
) {
  const now = Date.now();
  const run = await ctx.db.get(run_id);
  if (!run) throw new Error("Run not found");

  const results = await ctx.db
    .query("run_results")
    .withIndex("by_run_id", (q) => q.eq("run_id", run_id))
    .collect();

  let pass_count = 0;
  let fail_count = 0;
  let skip_count = 0;
  let total_duration_ms = 0;

  for (const r of results) {
    total_duration_ms += r.duration_ms;
    if (r.status === "passed") pass_count++;
    else if (r.status === "failed") fail_count++;
    else skip_count++;
  }

  const status = statusOverride ?? (fail_count > 0 ? "failed" as const : "passed" as const);

  await ctx.db.patch(run_id, {
    status,
    finished_at: now,
    duration_ms: total_duration_ms,
    pass_count,
    fail_count,
    skip_count,
  });

  const heartbeat = await ctx.db
    .query("run_heartbeats")
    .withIndex("by_run_id", (q) => q.eq("run_id", run_id))
    .first();
  if (heartbeat) {
    await ctx.db.delete(heartbeat._id);
  }
}

export const completeRun = internalMutation({
  args: {
    run_id: v.id("runs"),
  },
  handler: async (ctx, args) => {
    await aggregateAndFinalize(ctx, args.run_id);
  },
});

export const forceCompleteRun = internalMutation({
  args: {
    run_id: v.id("runs"),
    forced_status: v.union(
      v.literal("failed"),
      v.literal("cancelled"),
      v.literal("timed_out"),
    ),
  },
  handler: async (ctx, args) => {
    await aggregateAndFinalize(ctx, args.run_id, args.forced_status);
  },
});

export const updateRunHeartbeat = internalMutation({
  args: {
    run_id: v.id("runs"),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("run_heartbeats")
      .withIndex("by_run_id", (q) => q.eq("run_id", args.run_id))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        last_heartbeat_at: Date.now(),
      });
    } else {
      const run = await ctx.db.get(args.run_id);
      if (!run) throw new Error("Run not found");

      await ctx.db.insert("run_heartbeats", {
        workspace_id: run.workspace_id,
        run_id: args.run_id,
        last_heartbeat_at: Date.now(),
      });
    }
  },
});

export const markStaleRuns = internalMutation({
  args: {
    stale_threshold_ms: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const cutoff = now - args.stale_threshold_ms;

    const heartbeats = await ctx.db.query("run_heartbeats").collect();

    for (const hb of heartbeats) {
      if (hb.last_heartbeat_at < cutoff) {
        const run = await ctx.db.get(hb.run_id);
        if (run && run.status === "running") {
          await ctx.db.patch(run._id, {
            status: "timed_out",
            finished_at: now,
            duration_ms: run.started_at ? now - run.started_at : 0,
          });
          await ctx.db.delete(hb._id);
        }
      }
    }
  },
});

export const storeAiInsight = internalMutation({
  args: {
    workspace_id: v.id("workspaces"),
    test_id: v.id("tests"),
    run_id: v.id("runs"),
    analysis_text: v.string(),
    suggested_fix: v.optional(v.string()),
    confidence_score: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("ai_insights", {
      workspace_id: args.workspace_id,
      test_id: args.test_id,
      run_id: args.run_id,
      type: "root_cause",
      analysis_text: args.analysis_text,
      suggested_fix: args.suggested_fix,
      confidence_score: args.confidence_score,
    });
  },
});

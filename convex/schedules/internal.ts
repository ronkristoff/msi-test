import { internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { resolveSuiteTestIds } from "../lib/resolveSuiteTests";

export const triggerScheduledRun = internalMutation({
  args: {
    schedule_id: v.id("schedules"),
  },
  handler: async (ctx, args) => {
    const schedule = await ctx.db.get(args.schedule_id);
    if (!schedule) return;

    const testIds = await resolveSuiteTestIds(ctx.db, schedule.suite_id);

    if (testIds.length === 0) {
      const now = Date.now();
      await ctx.db.patch(args.schedule_id, {
        next_run_at: now + schedule.cadence.seconds * 1000,
      });
      return;
    }

    const suite = await ctx.db.get(schedule.suite_id);
    if (!suite) return;

    const runId = await ctx.db.insert("runs", {
      workspace_id: schedule.workspace_id,
      project_id: suite.project_id,
      suite_id: schedule.suite_id,
      environment_id: schedule.environment_id,
      trigger_type: "scheduled",
      schedule_id: args.schedule_id,
      status: "running",
      started_at: Date.now(),
    });

    for (const testId of testIds) {
      await ctx.db.insert("run_results", {
        workspace_id: schedule.workspace_id,
        run_id: runId,
        test_id: testId,
        status: "pending",
        duration_ms: 0,
        retries: 0,
      });
    }

    const now = Date.now();
    await ctx.db.patch(args.schedule_id, {
      last_run_at: now,
      next_run_at: now + schedule.cadence.seconds * 1000,
    });
  },
});

export const checkScheduledRuns = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const schedules = await ctx.db
      .query("schedules")
      .withIndex("by_next_run_at", (q) => q.lte("next_run_at", now))
      .collect();

    const due = schedules.filter((s) => s.enabled);

    for (const schedule of due) {
      await ctx.runMutation(internal.schedules.internal.triggerScheduledRun, {
        schedule_id: schedule._id,
      });
    }
  },
});

"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { internal } from "../_generated/api";

function validateRunnerSecret(secret: string) {
  const expected = process.env.RUNNER_SECRET;
  if (!expected) throw new ConvexError("RUNNER_SECRET not configured");
  if (secret !== expected) throw new ConvexError("Invalid runner secret");
}

export const runnerClaimRun = action({
  args: { runner_secret: v.string(), run_id: v.id("runs"), runner_id: v.string() },
  handler: async (ctx, args) => {
    validateRunnerSecret(args.runner_secret);
    await ctx.runMutation(internal.runs.internal.claimRun, {
      run_id: args.run_id,
      runner_id: args.runner_id,
    });
  },
});

export const runnerWriteStepResult = action({
  args: {
    runner_secret: v.string(),
    workspace_id: v.id("workspaces"),
    run_result_id: v.id("run_results"),
    step_number: v.number(),
    command: v.string(),
    locator: v.optional(v.string()),
    status: v.union(v.literal("passed"), v.literal("failed"), v.literal("skipped")),
    error_message: v.optional(v.string()),
    screenshot_file_id: v.optional(v.id("_storage")),
    duration_ms: v.number(),
  },
  handler: async (ctx, args) => {
    validateRunnerSecret(args.runner_secret);
    const { runner_secret: _, ...rest } = args;
    void _;
    await ctx.runMutation(internal.runs.internal.writeStepResult, rest);
  },
});

export const runnerWriteRunResult = action({
  args: {
    runner_secret: v.string(),
    run_result_id: v.id("run_results"),
    status: v.union(v.literal("passed"), v.literal("failed"), v.literal("skipped")),
    duration_ms: v.number(),
    console_log_file_id: v.optional(v.id("_storage")),
    trace_file_id: v.optional(v.id("_storage")),
    video_file_id: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    validateRunnerSecret(args.runner_secret);
    const { runner_secret: _, ...rest } = args;
    void _;
    await ctx.runMutation(internal.runs.internal.writeRunResult, rest);
  },
});

export const runnerCompleteRun = action({
  args: {
    runner_secret: v.string(),
    run_id: v.id("runs"),
    status: v.union(v.literal("passed"), v.literal("failed"), v.literal("cancelled"), v.literal("timed_out")),
  },
  handler: async (ctx, args) => {
    validateRunnerSecret(args.runner_secret);
    const { runner_secret: _, ...rest } = args;
    void _;
    await ctx.runMutation(internal.runs.internal.completeRun, rest);
  },
});

export const runnerHeartbeat = action({
  args: { runner_secret: v.string(), run_id: v.id("runs") },
  handler: async (ctx, args) => {
    validateRunnerSecret(args.runner_secret);
    await ctx.runMutation(internal.runs.internal.updateRunHeartbeat, { run_id: args.run_id });
  },
});

"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { validateRunnerSecret } from "../lib/runner";
import { capturedPageValidator, discoveredFlowValidator } from "../lib/validation";

export const runnerClaimExploration = action({
  args: {
    runner_secret: v.string(),
    exploration_id: v.id("explorations"),
    runner_id: v.string(),
  },
  handler: async (ctx, args) => {
    validateRunnerSecret(args.runner_secret);
    await ctx.runMutation(internal.explorations.internal.claimExploration, {
      exploration_id: args.exploration_id,
      runner_id: args.runner_id,
    });
  },
});

export const runnerUpdateExplorationProgress = action({
  args: {
    runner_secret: v.string(),
    exploration_id: v.id("explorations"),
    progress_message: v.string(),
    pages_captured: v.number(),
  },
  handler: async (ctx, args) => {
    validateRunnerSecret(args.runner_secret);
    await ctx.runMutation(internal.explorations.internal.updateExplorationProgress, {
      exploration_id: args.exploration_id,
      progress_message: args.progress_message,
      pages_captured: args.pages_captured,
    });
  },
});

export const runnerCompleteExploration = action({
  args: {
    runner_secret: v.string(),
    exploration_id: v.id("explorations"),
    captured_pages: v.array(capturedPageValidator),
    discovered_flows: v.optional(v.array(discoveredFlowValidator)),
  },
  handler: async (ctx, args) => {
    validateRunnerSecret(args.runner_secret);
    await ctx.runMutation(internal.explorations.internal.completeExplorationCapture, {
      exploration_id: args.exploration_id,
      captured_pages: args.captured_pages,
      discovered_flows: args.discovered_flows,
    });
    await ctx.runAction(internal.ai.exploreApp.analyzeExploration, {
      exploration_id: args.exploration_id,
    });
  },
});

export const runnerFailExploration = action({
  args: {
    runner_secret: v.string(),
    exploration_id: v.id("explorations"),
    error_message: v.string(),
  },
  handler: async (ctx, args) => {
    validateRunnerSecret(args.runner_secret);
    await ctx.runMutation(internal.explorations.internal.updateExplorationStatus, {
      exploration_id: args.exploration_id,
      status: "failed",
      error_message: args.error_message,
    });
  },
});

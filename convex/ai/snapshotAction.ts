import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { ActionCache } from "@convex-dev/action-cache";
import { RateLimiter, MINUTE } from "@convex-dev/rate-limiter";
import { components, internal } from "../_generated/api";
import { getRunnerUrl, snapshotFetch, validateTestFetch } from "./browserClient";

const CACHE_TTL_MS = 30 * MINUTE;
const RATE_LIMIT_PER_MINUTE = 10;

function getRunnerConfig(): { url: string; secret: string } | null {
  const url = getRunnerUrl(process.env.RUNNER_URL);
  if (!url) return null;
  return { url, secret: process.env.RUNNER_SECRET ?? "" };
}

const snapshotCache = new ActionCache(components.actionCache, {
  action: internal.ai.snapshotAction.fetchSnapshotForCache,
  name: "liveSnapshot",
  ttl: CACHE_TTL_MS,
});

const rateLimiter = new RateLimiter(components.rateLimiter, {
  snapshotPerWorkspace: {
    kind: "fixed window",
    rate: RATE_LIMIT_PER_MINUTE,
    period: MINUTE,
  },
});

export const getLiveSnapshot = internalAction({
  args: {
    url: v.string(),
    project_id: v.string(),
    workspace_id: v.string(),
  },
  handler: async (ctx, args) => {
    if (!getRunnerConfig()) return null;

    const rateResult = await rateLimiter.limit(ctx, "snapshotPerWorkspace", {
      key: args.workspace_id,
      throws: false,
    });
    if (!rateResult.ok) {
      console.log(`[snapshotAction] Rate limited for workspace ${args.workspace_id}`);
      return null;
    }

    return snapshotCache.fetch(ctx, {
      url: args.url,
      project_id: args.project_id,
      workspace_id: args.workspace_id,
    });
  },
});

export const fetchSnapshotForCache = internalAction({
  args: {
    url: v.string(),
    project_id: v.string(),
    workspace_id: v.string(),
  },
  handler: async (_ctx, args) => {
    const config = getRunnerConfig();
    if (!config) return null;

    return snapshotFetch(config.url, config.secret, {
      url: args.url,
      project_id: args.project_id,
      workspace_id: args.workspace_id,
    });
  },
});

export const validateTest = internalAction({
  args: {
    url: v.string(),
    project_id: v.string(),
    workspace_id: v.string(),
    playwright_code: v.string(),
  },
  handler: async (_ctx, args) => {
    const config = getRunnerConfig();
    if (!config) return null;

    return validateTestFetch(config.url, config.secret, {
      url: args.url,
      project_id: args.project_id,
      workspace_id: args.workspace_id,
      playwright_code: args.playwright_code,
    });
  },
});

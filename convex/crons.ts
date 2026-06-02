import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";
import { LOCK_STALE_THRESHOLD_MS } from "./lib/locking";

const crons = cronJobs();

crons.interval(
  "markStaleRuns",
  { seconds: 60 },
  internal.runs.internal.markStaleRuns,
  { stale_threshold_ms: 120_000 },
);

crons.interval(
  "clearStaleTestLocks",
  { minutes: 5 },
  internal.runs.internal.clearStaleTestLocks,
  { stale_threshold_ms: LOCK_STALE_THRESHOLD_MS },
);

crons.interval(
  "checkScheduledRuns",
  { seconds: 60 },
  internal.schedules.internal.checkScheduledRuns,
  {},
);

export default crons;

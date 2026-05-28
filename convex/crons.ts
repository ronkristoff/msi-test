import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "markStaleRuns",
  { seconds: 60 },
  internal.runs.internal.markStaleRuns,
  { stale_threshold_ms: 120_000 },
);

export default crons;

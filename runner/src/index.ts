import { RunnerConvexClient } from "./convex-client";
import { executeRun } from "./executor";

const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL;
const RUNNER_SECRET = process.env.RUNNER_SECRET;
const RUNNER_ID = `runner-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const POLL_INTERVAL_MS = 2000;
const HEARTBEAT_INTERVAL_MS = 30_000;

if (!CONVEX_URL) {
  console.error("NEXT_PUBLIC_CONVEX_URL environment variable is required");
  process.exit(1);
}
if (!RUNNER_SECRET) {
  console.error("RUNNER_SECRET environment variable is required");
  process.exit(1);
}

const client = new RunnerConvexClient(CONVEX_URL, RUNNER_SECRET);

let activeRunId: string | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let shuttingDown = false;

function log(msg: string) {
  console.log(`[${new Date().toISOString()}] [${RUNNER_ID}] ${msg}`);
}

function cleanupSession() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  activeRunId = null;
}

async function poll() {
  if (shuttingDown || activeRunId) return;

  try {
    const pending = await client.getPendingWork();
    if (pending.length === 0) return;

    const work = pending[0];

    try {
      await client.claimRun(work.run_id, RUNNER_ID);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("already claimed")) {
        log(`Run ${work.run_id} was claimed by another runner, skipping`);
        return;
      }
      throw err;
    }

    activeRunId = work.run_id;
    log(`Claimed run ${work.run_id} (${work.tests.length} tests)`);

    heartbeatTimer = setInterval(async () => {
      if (!activeRunId) return;
      try {
        await client.sendHeartbeat(activeRunId);
      } catch (err) {
        log(`Heartbeat failed for run ${activeRunId}: ${err}`);
      }
    }, HEARTBEAT_INTERVAL_MS);

    try {
      await client.sendHeartbeat(work.run_id);
    } catch (err) {
      log(`Initial heartbeat failed: ${err}`);
    }

    await executeRun(client, work, log);

    cleanupSession();
    log("Ready for next run");
  } catch (err) {
    log(`Poll error: ${err}`);
    if (activeRunId) {
      try {
        await client.forceCompleteRun(activeRunId, "failed");
      } catch {
        // best effort
      }
      cleanupSession();
    }
  }
}

async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  log("Shutting down...");

  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }

  if (activeRunId) {
    const runId = activeRunId;
    cleanupSession();
    log(`Cancelling active run ${runId}`);
    try {
      await client.forceCompleteRun(runId, "cancelled");
      log(`Run ${runId} cancelled`);
    } catch (err) {
      log(`Failed to cancel run ${runId}: ${err}`);
    }
  }

  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

log(`MSITest Runner started (id: ${RUNNER_ID})`);
log(`Convex URL: ${CONVEX_URL}`);
log(`Polling every ${POLL_INTERVAL_MS}ms`);

poll();
pollTimer = setInterval(poll, POLL_INTERVAL_MS);

import { RunnerConvexClient } from "./convex-client";
import { executeRun, type RunWorkItem } from "./executor";
import { executeStagehandTests } from "./stagehand-executor";
import { executeExploration } from "./explorer";
import type { ExplorationWorkItem } from "./types";

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

type ActiveWork =
  | { kind: "run"; id: string }
  | { kind: "exploration"; id: string }
  | null;

let activeWork: ActiveWork = null;
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
  activeWork = null;
}

async function forceCleanupWork(work: ActiveWork) {
  if (!work) return;
  cleanupSession();
  if (work.kind === "run") {
    log(`Cancelling active run ${work.id}`);
    try {
      await client.forceCompleteRun(work.id, "cancelled", "Runner shutting down");
    } catch (err) {
      log(`Failed to cancel run ${work.id}: ${err}`);
    }
  } else {
    log(`Failing active exploration ${work.id}`);
    try {
      await client.failExploration(work.id, "Runner shutting down");
    } catch (err) {
      log(`Failed to fail exploration ${work.id}: ${err}`);
    }
  }
}

async function poll() {
  if (shuttingDown || activeWork) return;

  try {
    const [pendingRuns, pendingExplorations] = await Promise.all([
      client.getPendingWork(),
      client.getPendingExplorations(),
    ]);

    if (pendingExplorations.length > 0) {
      await handleExploration(pendingExplorations[0]);
      return;
    }

    if (pendingRuns.length === 0) return;

    await handleRun(pendingRuns[0]);
  } catch (err) {
    log(`Poll error: ${err}`);
    await forceCleanupWork(activeWork);
  }
}

async function handleRun(work: RunWorkItem) {
  if (!(await claimWithRetry(
    () => client.claimRun(work.run_id, RUNNER_ID),
    work.run_id,
  ))) return;

  activeWork = { kind: "run", id: work.run_id };
  log(`Claimed run ${work.run_id} (${work.tests.length} tests)`);

  heartbeatTimer = setInterval(async () => {
    if (!activeWork || activeWork.kind !== "run") return;
    try {
      await client.sendHeartbeat(activeWork.id);
    } catch (err) {
      log(`Heartbeat failed for run ${activeWork.id}: ${err}`);
    }
  }, HEARTBEAT_INTERVAL_MS);

  try {
    await client.sendHeartbeat(work.run_id);
  } catch (err) {
    log(`Initial heartbeat failed: ${err}`);
  }

  const hasStagehand = work.tests.some((t) => t.execution_type === "stagehand");
  const hasPlaywright = work.tests.some((t) => t.execution_type !== "stagehand");

  if (hasStagehand) {
    log(`Run ${work.run_id}: dispatching to Stagehand executor`);
    await executeStagehandTests(client, work, log);
  }

  if (hasPlaywright) {
    if (hasStagehand) {
      log(`Run ${work.run_id}: Stagehand tests done, but run already completed — Playwright tests skipped`);
    } else {
      await executeRun(client, work, log);
    }
  }

  cleanupSession();
  log("Ready for next work");
}

async function handleExploration(exploration: {
  _id: string;
  url: string;
  workspace_id: string;
  project_id: string;
  auth_mode: string;
  login_url?: string;
  username?: string;
  password?: string;
  cookie_name?: string;
  cookie_value?: string;
  additional_urls?: string[];
  interactive?: boolean;
}) {
  if (!(await claimWithRetry(
    () => client.claimExploration(exploration._id, RUNNER_ID),
    exploration._id,
  ))) return;

  activeWork = { kind: "exploration", id: exploration._id };
  log(`Claimed exploration ${exploration._id} (${exploration.url}, auth: ${exploration.auth_mode})`);

  const work: ExplorationWorkItem = {
    exploration_id: exploration._id,
    url: exploration.url,
    workspace_id: exploration.workspace_id,
    auth_mode: (exploration.auth_mode as ExplorationWorkItem["auth_mode"]) ?? "none",
    login_url: exploration.login_url,
    username: exploration.username,
    password: exploration.password,
    cookie_name: exploration.cookie_name,
    cookie_value: exploration.cookie_value,
    additional_urls: exploration.additional_urls,
    interactive: exploration.interactive ?? false,
  };

  await executeExploration(client, work, log);

  cleanupSession();
  log("Ready for next work");
}

async function claimWithRetry(claim: () => Promise<void>, id: string): Promise<boolean> {
  try {
    await claim();
    return true;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("already claimed")) {
      log(`${id} was claimed by another runner, skipping`);
      return false;
    }
    throw err;
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

  await forceCleanupWork(activeWork);

  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

log(`MSITest Runner started (id: ${RUNNER_ID})`);
log(`Convex URL: ${CONVEX_URL}`);
log(`Polling every ${POLL_INTERVAL_MS}ms`);

poll();
pollTimer = setInterval(poll, POLL_INTERVAL_MS);

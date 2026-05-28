import * as fsSync from "fs";
import * as path from "path";
import { spawn } from "child_process";
import { RunnerConvexClient } from "./convex-client";
import { generatePlaywrightConfig, writeTestFile, createTempRunDir, cleanupDir } from "./config";

interface PendingWorkItem {
  run_id: string;
  workspace_id: string;
  project_id: string;
  environment_id: string | null;
  base_url: string | null;
  trigger_type: string;
  tests: Array<{
    _id: string;
    name: string;
    playwright_code: string;
  }>;
  run_result_ids: Array<{ _id: string; test_id: string }>;
}

export async function executeRun(
  client: RunnerConvexClient,
  work: PendingWorkItem,
  log: (msg: string) => void,
): Promise<void> {
  const runDir = await createTempRunDir();
  const reporterDir = path.join(runDir, "reporter");

  try {
    if (!work.base_url) {
      throw new Error(`No base_url configured for run ${work.run_id}`);
    }
    if (work.tests.length === 0) {
      throw new Error(`No tests to execute for run ${work.run_id}`);
    }

    log(`Run ${work.run_id}: writing ${work.tests.length} test(s) to ${runDir}`);

    for (let i = 0; i < work.tests.length; i++) {
      await writeTestFile(runDir, i, work.tests[i].playwright_code);
    }

    const reporterModulePath = path.resolve(__dirname, "reporter.js");
    await generatePlaywrightConfig(work.base_url, runDir, reporterModulePath);

    log(`Run ${work.run_id}: starting Playwright execution against ${work.base_url}`);

    fsSync.mkdirSync(reporterDir, { recursive: true });

    const exitCode = await runPlaywright(runDir, log);

    log(`Run ${work.run_id}: Playwright exited with code ${exitCode}`);

    const indexToResultId = buildIndexMapping(work);

    await processStepResults(client, work, reporterDir, indexToResultId, log);

    const summary = readSummary(reporterDir);

    const localArtifacts = scanArtifacts(runDir);
    const artifacts = await uploadArtifacts(client, localArtifacts, log);

    let anyFailed = false;
    for (const result of summary) {
      const resultId = indexToResultId.get(result.file_index);
      if (!resultId) continue;

      if (result.status === "failed") anyFailed = true;

      const testArtifacts = artifacts.get(result.file_index);

      await client.writeRunResult({
        run_result_id: resultId,
        status: result.status,
        duration_ms: result.duration_ms,
        trace_file_id: testArtifacts?.traceId,
        video_file_id: testArtifacts?.videoId,
      });
    }

    const finalStatus = anyFailed ? "failed" : "passed";
    await client.completeRun(work.run_id, finalStatus);
    log(`Run ${work.run_id}: completed with status ${finalStatus}`);
  } catch (err) {
    log(`Run ${work.run_id}: execution error: ${err}`);
    try {
      await client.completeRun(work.run_id, "failed");
    } catch {
      log(`Run ${work.run_id}: failed to mark run as failed`);
    }
  } finally {
    try {
      await cleanupDir(runDir);
    } catch {
      // best effort
    }
  }
}

function buildIndexMapping(work: PendingWorkItem): Map<number, string> {
  const map = new Map<number, string>();
  for (let i = 0; i < work.tests.length; i++) {
    const resultEntry = work.run_result_ids.find(
      (r) => r.test_id === work.tests[i]._id,
    );
    if (resultEntry) {
      map.set(i, resultEntry._id);
    }
  }
  return map;
}

async function processStepResults(
  client: RunnerConvexClient,
  work: PendingWorkItem,
  reporterDir: string,
  indexToResultId: Map<number, string>,
  log: (msg: string) => void,
): Promise<void> {
  const stepsFile = path.join(reporterDir, "steps.jsonl");
  if (!fsSync.existsSync(stepsFile)) return;

  const lines = fsSync.readFileSync(stepsFile, "utf-8").trim().split("\n").filter(Boolean);

  for (const line of lines) {
    try {
      const step = JSON.parse(line);
      const resultId = indexToResultId.get(step.file_index);
      if (!resultId) continue;

      await client.writeStepResult({
        workspace_id: work.workspace_id,
        run_result_id: resultId,
        step_number: step.step_number,
        command: step.command,
        status: step.status,
        error_message: step.error_message,
        duration_ms: step.duration_ms,
      });
    } catch (err) {
      log(`Error writing step: ${err}`);
    }
  }
}

interface TestSummary {
  file_index: number;
  test_name: string;
  status: "passed" | "failed" | "skipped";
  duration_ms: number;
  error_message?: string;
}

function readSummary(reporterDir: string): TestSummary[] {
  const summaryPath = path.join(reporterDir, "summary.json");
  if (!fsSync.existsSync(summaryPath)) return [];
  return JSON.parse(fsSync.readFileSync(summaryPath, "utf-8"));
}

interface TestArtifacts {
  traceId?: string;
  videoId?: string;
}

function scanArtifacts(runDir: string): Map<number, TestArtifacts> {
  const artifacts = new Map<number, TestArtifacts>();
  const testResultsDir = path.join(runDir, "test-results");

  if (!fsSync.existsSync(testResultsDir)) return artifacts;

  const entries: string[] = [];
  try {
    entries.push(...fsSync.readdirSync(testResultsDir, { recursive: true }) as string[]);
  } catch {
    return artifacts;
  }

  for (const entry of entries) {
    const fullPath = path.join(testResultsDir, entry);
    try {
      if (!fsSync.statSync(fullPath).isFile()) continue;
    } catch {
      continue;
    }

    const dirName = entry.split(path.sep)[0] || "";
    const indexMatch = dirName.match(/test-(\d+)/);
    const fileIndex = indexMatch ? parseInt(indexMatch[1], 10) : 0;

    let existing = artifacts.get(fileIndex);
    if (!existing) {
      existing = {};
      artifacts.set(fileIndex, existing);
    }

    if (entry.endsWith(".trace") || entry.endsWith("trace.zip")) {
      existing.traceId = fullPath;
    } else if (entry.endsWith(".webm")) {
      existing.videoId = fullPath;
    }
  }

  return artifacts;
}

async function uploadArtifacts(
  client: RunnerConvexClient,
  artifacts: Map<number, TestArtifacts>,
  log: (msg: string) => void,
): Promise<Map<number, TestArtifacts>> {
  const uploaded = new Map<number, TestArtifacts>();

  for (const [fileIndex, arts] of artifacts) {
    const result: TestArtifacts = {};
    try {
      if (arts.traceId) result.traceId = await client.uploadFile(arts.traceId);
      if (arts.videoId) result.videoId = await client.uploadFile(arts.videoId);
    } catch (err) {
      log(`Error uploading artifacts for test ${fileIndex}: ${err}`);
    }
    uploaded.set(fileIndex, result);
  }

  return uploaded;
}

function runPlaywright(cwd: string, log: (msg: string) => void): Promise<number> {
  return new Promise((resolve) => {
    const proc = spawn(
      "npx",
      ["playwright", "test", "--config=playwright.config.ts"],
      {
        cwd,
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          MSITEST_REPORTER_DIR: path.join(cwd, "reporter"),
        },
      },
    );

    proc.stdout?.on("data", (data: Buffer) => {
      for (const line of data.toString().split("\n").filter(Boolean)) {
        log(`  [pw stdout] ${line}`);
      }
    });

    proc.stderr?.on("data", (data: Buffer) => {
      for (const line of data.toString().split("\n").filter(Boolean)) {
        log(`  [pw stderr] ${line}`);
      }
    });

    proc.on("close", (code) => resolve(code ?? 1));
    proc.on("error", (err) => {
      log(`Playwright process error: ${err}`);
      resolve(1);
    });
  });
}

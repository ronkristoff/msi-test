import { RunnerConvexClient } from "./convex-client";
import { initStagehand, type StagehandInstance } from "./stagehand";
import type { AiConfig } from "../../convex/ai/model";
import type { RunWorkItem, RunTestItem, TestStep } from "./types";

interface StepResult {
  status: "passed" | "failed";
  screenshot_storage_id?: string;
  error_message?: string;
}

interface TestResult {
  status: "passed" | "failed";
  duration_ms: number;
  error_message?: string;
  screenshot_file_ids: string[];
}

const NAVIGATION_TIMEOUT_MS = 30_000;
const STEP_TIMEOUT_MS = 60_000;

export async function executeStagehandTests(
  client: RunnerConvexClient,
  work: RunWorkItem,
  log: (msg: string) => void,
): Promise<void> {
  let stagehand: StagehandInstance | null = null;

  try {
    if (!work.base_url) {
      throw new Error(`No base_url configured for run ${work.run_id}`);
    }

    const stagehandTests = work.tests.filter(
      (t) => t.execution_type === "stagehand" && t.steps && t.steps.length > 0,
    );

    if (stagehandTests.length === 0) {
      log(`Run ${work.run_id}: no Stagehand tests to execute`);
      return;
    }

    log(`Run ${work.run_id}: fetching AI config for workspace ${work.workspace_id}`);
    const aiConfig: AiConfig = await client.getWorkspaceAiConfig(work.workspace_id);

    log(`Run ${work.run_id}: initializing Stagehand`);
    stagehand = await initStagehand(aiConfig, log);

    const page = stagehand.context.activePage() ?? (await stagehand.context.newPage());

    await performLogin(stagehand, page, work, log);

    await page.goto(work.base_url, { timeoutMs: NAVIGATION_TIMEOUT_MS });

    for (const test of stagehandTests) {
      const resultEntry = work.run_result_ids.find((r) => r.test_id === test._id);
      if (!resultEntry) {
        log(`Run ${work.run_id}: no run_result for test ${test._id}, skipping`);
        continue;
      }

      log(`Run ${work.run_id}: executing Stagehand test "${test.name}" (${test.steps!.length} steps)`);
      const result = await executeTest(stagehand, page, test, client, work.workspace_id, resultEntry._id, work.test_data, log);

      await client.writeRunResult({
        run_result_id: resultEntry._id,
        status: result.status,
        duration_ms: result.duration_ms,
        screenshot_file_ids: result.screenshot_file_ids,
        error_message: result.error_message,
      });

      log(`Run ${work.run_id}: test "${test.name}" ${result.status} (${result.duration_ms}ms)`);
    }

    await client.completeRun(work.run_id);
    log(`Run ${work.run_id}: completed`);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    log(`Run ${work.run_id}: Stagehand execution error: ${err}`);
    try {
      await client.forceCompleteRun(work.run_id, "failed", errMsg);
    } catch {
      log(`Run ${work.run_id}: failed to mark run as failed`);
    }
  } finally {
    if (stagehand) {
      try {
        await stagehand.close();
      } catch {
        // best effort
      }
    }
  }
}

async function performLogin(
  stagehand: StagehandInstance,
  page: NonNullable<ReturnType<StagehandInstance["context"]["activePage"]>>,
  work: RunWorkItem,
  log: (msg: string) => void,
): Promise<void> {
  if (work.auth_mode === "form" && work.test_username && work.test_password) {
    log(`Run ${work.run_id}: performing form login`);
    const loginUrl = work.login_url || work.base_url;
    await page.goto(loginUrl!, { timeoutMs: NAVIGATION_TIMEOUT_MS });
    await stagehand.act(
      "Fill in the username/email field with the provided username and the password field with the provided password, then click the submit/login button",
      {
        variables: {
          username: work.test_username,
          password: work.test_password,
        },
      },
    );
    log(`Run ${work.run_id}: login completed, current URL: ${page.url()}`);
  } else if (work.auth_mode === "cookie") {
    log(`Run ${work.run_id}: cookie auth not supported for Stagehand test execution`);
  }
}

async function executeTest(
  stagehand: StagehandInstance,
  page: NonNullable<ReturnType<StagehandInstance["context"]["activePage"]>>,
  test: RunTestItem,
  client: RunnerConvexClient,
  workspaceId: string,
  runResultId: string,
  testData: Record<string, string> | undefined,
  log: (msg: string) => void,
): Promise<TestResult> {
  const startTime = Date.now();
  const steps = test.steps!;
  const screenshotIds: string[] = [];
  let testStatus: "passed" | "failed" = "passed";
  let errorMessage: string | undefined;

  for (let i = 0; i < steps.length; i++) {
    const stepStart = Date.now();
    const step = steps[i];

    log(`  Step ${i + 1}/${steps.length}: ${step.instruction}`);

    const stepResult = await executeStep(stagehand, page, step, testData, client, log);
    const durationMs = Date.now() - stepStart;

    if (stepResult.screenshot_storage_id) {
      screenshotIds.push(stepResult.screenshot_storage_id);
    }

    await client.writeStepResult({
      workspace_id: workspaceId,
      run_result_id: runResultId,
      step_number: i + 1,
      command: step.instruction,
      status: stepResult.status,
      error_message: stepResult.error_message,
      screenshot_file_id: stepResult.screenshot_storage_id,
      duration_ms: durationMs,
    });

    if (stepResult.status === "failed") {
      testStatus = "failed";
      errorMessage = stepResult.error_message;
      log(`  Step ${i + 1} FAILED: ${stepResult.error_message}`);
      break;
    }

    log(`  Step ${i + 1} passed (${durationMs}ms)`);
  }

  return {
    status: testStatus,
    duration_ms: Date.now() - startTime,
    error_message: errorMessage,
    screenshot_file_ids: screenshotIds,
  };
}

async function executeStep(
  stagehand: StagehandInstance,
  page: NonNullable<ReturnType<StagehandInstance["context"]["activePage"]>>,
  step: TestStep,
  testData: Record<string, string> | undefined,
  client: RunnerConvexClient,
  log: (msg: string) => void,
): Promise<StepResult> {
  try {
    const variables = testData ? { ...testData } : undefined;

    await stagehand.act(step.instruction, {
      variables,
      timeout: STEP_TIMEOUT_MS,
    });

    if (step.assertion_code) {
      await executeAssertion(page, step.assertion_code);
    }

    const screenshotId = await captureScreenshot(page, client, log);

    return {
      status: "passed",
      screenshot_storage_id: screenshotId,
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);

    let screenshotId: string | undefined;
    try {
      screenshotId = await captureScreenshot(page, client, log);
    } catch (screenshotErr) {
      log(`  Failed to capture screenshot on error: ${screenshotErr}`);
    }

    return {
      status: "failed",
      error_message: errMsg,
      screenshot_storage_id: screenshotId,
    };
  }
}

const ASSERTION_HELPERS = `
  const assert = {
    ok: (val, msg) => { if (!val) throw new Error(msg || 'Assertion failed'); },
    equal: (a, b, msg) => { if (a !== b) throw new Error(msg || \`Expected \${b} but got \${a}\`); },
    includes: (haystack, needle, msg) => { if (!String(haystack).includes(needle)) throw new Error(msg || \`Expected "\${needle}" in "\${haystack}"\`); },
    match: (str, regex, msg) => { if (!regex.test(str)) throw new Error(msg || 'Regex did not match'); },
  };
`;

async function executeAssertion(
  page: NonNullable<ReturnType<StagehandInstance["context"]["activePage"]>>,
  assertionCode: string,
): Promise<void> {
  await page.evaluate(`(async () => { ${ASSERTION_HELPERS}\n${assertionCode} })()`);
}

async function captureScreenshot(
  page: NonNullable<ReturnType<StagehandInstance["context"]["activePage"]>>,
  client: RunnerConvexClient,
  log: (msg: string) => void,
): Promise<string | undefined> {
  try {
    const buffer = await page.screenshot({ type: "png" });
    return await client.uploadBuffer(Buffer.from(buffer), "image/png");
  } catch (err) {
    log(`  Screenshot capture failed: ${err}`);
    return undefined;
  }
}

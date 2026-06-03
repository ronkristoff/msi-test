import { z } from "zod";
import fs from "fs/promises";
import path from "path";
import { RunnerConvexClient } from "./convex-client";
import { initStagehand, type StagehandInstance } from "./stagehand";
import type { AiConfig } from "../../convex/ai/model";
import type { RunWorkItem, RunTestItem, TestStep } from "./types";

const DEFAULT_HEAL_CONFIDENCE_THRESHOLD = 0.8;
const DEFAULT_CACHE_BASE_PATH = ".stagehand-cache";

interface StepResult {
  status: "passed" | "failed" | "healed";
  screenshot_storage_id?: string;
  error_message?: string;
  heal_reason?: string;
  heal_confidence?: number;
  before_screenshot_storage_id?: string;
  learned_selector?: string;
  learned_description?: string;
}

interface TestResult {
  status: "passed" | "failed";
  duration_ms: number;
  error_message?: string;
  screenshot_file_ids: string[];
}

type HealResult =
  | { outcome: "healed"; reason: string; confidence: number; afterScreenshotId: string | undefined; selector: string; description?: string }
  | { outcome: "no_candidates" }
  | { outcome: "below_threshold"; candidateCount: number; bestConfidence: number };

interface StepContext {
  stagehand: StagehandInstance;
  page: NonNullable<ReturnType<StagehandInstance["context"]["activePage"]>>;
  client: RunnerConvexClient;
  workspaceId: string;
  testId: string;
  runResultId: string;
  runId: string;
  testData: Record<string, string> | undefined;
  threshold: number;
  log: (msg: string) => void;
}

const NAVIGATION_TIMEOUT_MS = 30_000;
const STEP_TIMEOUT_MS = 60_000;

const ELEMENT_NOT_FOUND_PATTERNS = [
  "element not found",
  "could not locate",
  "could not find",
  "no element found",
  "no matching element",
  "selector",
  "not visible",
  "waiting for selector",
];

const healConfidenceSchema = z.object({
  confidence: z.number(),
  reasoning: z.string(),
});

function isElementNotFoundError(errMsg: string): boolean {
  const lower = errMsg.toLowerCase();
  return ELEMENT_NOT_FOUND_PATTERNS.some((p) => lower.includes(p));
}

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

    const cacheDir = path.join(DEFAULT_CACHE_BASE_PATH, work.project_id);
    await fs.mkdir(cacheDir, { recursive: true });
    log(`Run ${work.run_id}: cache dir ready at ${cacheDir}`);

    log(`Run ${work.run_id}: initializing Stagehand`);
    stagehand = await initStagehand(aiConfig, log, cacheDir);

    const page = stagehand.context.activePage() ?? (await stagehand.context.newPage());

    await performLogin(stagehand, page, work, log);

    await page.goto(work.base_url, { timeoutMs: NAVIGATION_TIMEOUT_MS });

    for (const test of stagehandTests) {
      const resultEntry = work.run_result_ids.find((r) => r.test_id === test._id);
      if (!resultEntry) {
        log(`Run ${work.run_id}: no run_result for test ${test._id}, skipping`);
        continue;
      }

      const ctx: StepContext = {
        stagehand,
        page,
        client,
        workspaceId: work.workspace_id,
        testId: test._id,
        runResultId: resultEntry._id,
        runId: work.run_id,
        testData: work.test_data,
        threshold: work.heal_confidence_threshold ?? DEFAULT_HEAL_CONFIDENCE_THRESHOLD,
        log,
      };

      log(`Run ${work.run_id}: executing Stagehand test "${test.name}" (${test.steps!.length} steps)`);
      const result = await executeTest(ctx, test);

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
    if (work.auth_cookies && work.auth_cookies.length > 0) {
      log(`Run ${work.run_id}: trying saved auth cookies first (${work.auth_cookies.length} cookies)`);
      const baseUrl = work.base_url || work.login_url!;
      const domain = new URL(baseUrl).hostname;
      await stagehand.context.addCookies(
        work.auth_cookies.map((c) => ({
          name: c.name,
          value: c.value,
          domain: c.domain || domain,
          path: c.path || "/",
          url: baseUrl,
        })),
      );
      await page.goto(work.base_url!, { timeoutMs: NAVIGATION_TIMEOUT_MS });
      const hasPasswordField = await page.locator('input[type="password"]').count() > 0;
      if (!hasPasswordField) {
        log(`Run ${work.run_id}: cookies valid — on ${page.url()}, skipping form login`);
        return;
      }
      log(`Run ${work.run_id}: cookies expired/revoked — password field detected, falling back to form login`);
    }

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

async function recordHeal(
  ctx: StepContext,
  stepIndex: number,
  step: TestStep,
  stepResult: StepResult,
): Promise<void> {
  try {
    await ctx.client.recordHealingHistory({
      workspace_id: ctx.workspaceId,
      test_id: ctx.testId,
      step_index: stepIndex,
      original_instruction: step.instruction,
      healed_selector: stepResult.learned_selector ?? "",
      healed_description: stepResult.learned_description,
      confidence: stepResult.heal_confidence!,
      reason: stepResult.heal_reason,
      run_id: ctx.runId,
    });
  } catch (err) {
    ctx.log(`  Failed to record healing history: ${err}`);
  }
}

async function executeTest(ctx: StepContext, test: RunTestItem): Promise<TestResult> {
  const startTime = Date.now();
  const steps = test.steps!;
  const screenshotIds: string[] = [];
  let testStatus: "passed" | "failed" = "passed";
  let errorMessage: string | undefined;

  for (let i = 0; i < steps.length; i++) {
    const stepStart = Date.now();
    const step = steps[i];

    ctx.log(`  Step ${i + 1}/${steps.length}: ${step.instruction}`);

    const stepResult = await executeStep(ctx, step);
    const durationMs = Date.now() - stepStart;

    if (stepResult.screenshot_storage_id) {
      screenshotIds.push(stepResult.screenshot_storage_id);
    }

    await ctx.client.writeStepResult({
      workspace_id: ctx.workspaceId,
      run_result_id: ctx.runResultId,
      step_number: i + 1,
      command: step.instruction,
      status: stepResult.status,
      error_message: stepResult.error_message,
      screenshot_file_id: stepResult.screenshot_storage_id,
      duration_ms: durationMs,
      heal_reason: stepResult.heal_reason,
      heal_confidence: stepResult.heal_confidence,
      before_screenshot_file_id: stepResult.before_screenshot_storage_id,
    });

    if (stepResult.status === "failed") {
      testStatus = "failed";
      errorMessage = stepResult.error_message;
      ctx.log(`  Step ${i + 1} FAILED: ${stepResult.error_message}`);
      break;
    }

    if (stepResult.status === "healed") {
      await recordHeal(ctx, i, step, stepResult);
      ctx.log(`  Step ${i + 1} HEALED (${(stepResult.heal_confidence ?? 0) * 100}% confidence): ${stepResult.heal_reason}`);
    } else {
      ctx.log(`  Step ${i + 1} passed (${durationMs}ms)`);
    }
  }

  return {
    status: testStatus,
    duration_ms: Date.now() - startTime,
    error_message: errorMessage,
    screenshot_file_ids: screenshotIds,
  };
}

async function executeStep(ctx: StepContext, step: TestStep): Promise<StepResult> {
  if (step.learned_selector) {
    ctx.log(`  Trying learned selector: "${step.learned_selector}"`);
    try {
      const variables = ctx.testData ? { ...ctx.testData } : undefined;
      await ctx.stagehand.act(
        { selector: step.learned_selector, description: step.learned_description ?? step.instruction },
        { variables, timeout: STEP_TIMEOUT_MS },
      );
      if (step.assertion_code) await executeAssertion(ctx.page, step.assertion_code);
      ctx.log(`  Learned selector succeeded`);
      return { status: "passed", screenshot_storage_id: await captureScreenshot(ctx.page, ctx.client, ctx.log) };
    } catch (err) {
      ctx.log(`  Learned selector failed: ${err instanceof Error ? err.message : String(err)}, falling back`);
    }
  }

  try {
    return await runStep(ctx, step);
  } catch (err) {
    return await handleStepFailure(err, ctx, step);
  }
}

async function runStep(ctx: StepContext, step: TestStep): Promise<StepResult> {
  const variables = ctx.testData ? { ...ctx.testData } : undefined;

  await ctx.stagehand.act(step.instruction, {
    variables,
    timeout: STEP_TIMEOUT_MS,
  });

  if (step.assertion_code) {
    await executeAssertion(ctx.page, step.assertion_code);
  }

  return {
    status: "passed",
    screenshot_storage_id: await captureScreenshot(ctx.page, ctx.client, ctx.log),
  };
}

async function handleStepFailure(
  err: unknown,
  ctx: StepContext,
  step: TestStep,
): Promise<StepResult> {
  const errMsg = err instanceof Error ? err.message : String(err);

  const beforeScreenshotId = await captureScreenshot(ctx.page, ctx.client, ctx.log).catch((e) => {
    ctx.log(`  Failed to capture before-screenshot on error: ${e}`);
    return undefined;
  });

  if (!isElementNotFoundError(errMsg)) {
    return { status: "failed", error_message: errMsg, screenshot_storage_id: beforeScreenshotId };
  }

  const healResult = await attemptHeal(ctx, step);

  switch (healResult.outcome) {
    case "healed":
      return {
        status: "healed",
        screenshot_storage_id: healResult.afterScreenshotId,
        before_screenshot_storage_id: beforeScreenshotId,
        heal_reason: healResult.reason,
        heal_confidence: healResult.confidence,
        learned_selector: healResult.selector,
        learned_description: healResult.description,
      };
    case "below_threshold":
      return {
        status: "failed",
        error_message: `${errMsg}\n\nHeal candidates found but confidence too low (${healResult.candidateCount} candidates, best: ${healResult.bestConfidence * 100}%, threshold: ${ctx.threshold * 100}%)`,
        screenshot_storage_id: beforeScreenshotId,
      };
    case "no_candidates":
      return { status: "failed", error_message: errMsg, screenshot_storage_id: beforeScreenshotId };
  }
}

async function attemptHeal(ctx: StepContext, step: TestStep): Promise<HealResult> {
  try {
    ctx.log(`  Attempting heal: observing page for "${step.instruction}"`);
    const candidates = await ctx.stagehand.observe(step.instruction, {
      timeout: STEP_TIMEOUT_MS,
    });

    if (!candidates || candidates.length === 0) {
      ctx.log(`  Heal: no candidates found`);
      return { outcome: "no_candidates" };
    }

    ctx.log(`  Heal: ${candidates.length} candidate(s) found, evaluating confidence`);

    const topCandidate = candidates[0];
    const { confidence, reasoning } = await evaluateHealConfidence(
      ctx.stagehand,
      step.instruction,
      topCandidate.selector,
      topCandidate.description,
    );

    ctx.log(`  Heal: confidence=${confidence}, threshold=${ctx.threshold}`);

    if (confidence < ctx.threshold) {
      return { outcome: "below_threshold", candidateCount: candidates.length, bestConfidence: confidence };
    }

    ctx.log(`  Heal: confidence above threshold, executing with candidate selector "${topCandidate.selector}"`);
    await ctx.stagehand.act(topCandidate, {
      variables: ctx.testData ? { ...ctx.testData } : undefined,
      timeout: STEP_TIMEOUT_MS,
    });

    if (step.assertion_code) {
      await executeAssertion(ctx.page, step.assertion_code);
    }

    const afterScreenshotId = await captureScreenshot(ctx.page, ctx.client, ctx.log);

    return { outcome: "healed", reason: reasoning, confidence, afterScreenshotId, selector: topCandidate.selector, description: topCandidate.description };
  } catch (healErr) {
    ctx.log(`  Heal attempt failed: ${healErr}`);
    return { outcome: "no_candidates" };
  }
}

async function evaluateHealConfidence(
  stagehand: StagehandInstance,
  instruction: string,
  selector: string,
  description: string,
): Promise<{ confidence: number; reasoning: string }> {
  try {
    const result = await stagehand.extract(
      `Given the instruction "${instruction}" and the candidate element with selector "${selector}" and description "${description}", rate your confidence (0 to 1) that interacting with this element would achieve the instruction's goal. Also provide brief reasoning.`,
      healConfidenceSchema,
    );
    return {
      confidence: Math.max(0, Math.min(1, Number(result.confidence) || 0)),
      reasoning: String(result.reasoning ?? ""),
    };
  } catch {
    return { confidence: 0, reasoning: "Failed to evaluate confidence" };
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

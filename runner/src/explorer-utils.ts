import type { RunnerConvexClient } from "./convex-client";
import type { CapturedPage, ExplorationWorkItem } from "./types";

export type Stagehand = import("@browserbasehq/stagehand").Stagehand;

export const NAVIGATION_TIMEOUT_MS = 30_000;
export const HYDRATION_WAIT_MS = 3_000;

export function normalizeUrl(raw: string): string | null {
  try {
    const parsed = new URL(raw);
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return null;
  }
}

export function isSameOrigin(url: string, origin: string): boolean {
  try {
    return new URL(url).origin === origin;
  } catch {
    return false;
  }
}

export function buildSemanticDescription(title: string, pageText: string): string {
  const textSnippet = pageText.slice(0, 2000).trim();
  return textSnippet ? `${title}: ${textSnippet}` : title;
}

export async function sleep(page: { waitForTimeout?: (ms: number) => Promise<void> }): Promise<void> {
  await page.waitForTimeout?.(HYDRATION_WAIT_MS);
}

const DOM_STABILITY_MIN_WAIT_MS = 2_000;
const DOM_STABILITY_POLL_INTERVAL_MS = 500;
const DOM_STABILITY_SETTLE_ROUNDS = 2;
const DOM_STABILITY_MAX_WAIT_MS = 10_000;

export async function waitForDomStability(
  page: {
    $$eval: (selector: string, fn: (els: Element[]) => number) => Promise<number>;
    waitForTimeout: (ms: number) => Promise<void>;
  },
  selector: string = "a[href]",
): Promise<number> {
  await page.waitForTimeout(DOM_STABILITY_MIN_WAIT_MS);

  const maxPolls = Math.ceil((DOM_STABILITY_MAX_WAIT_MS - DOM_STABILITY_MIN_WAIT_MS) / DOM_STABILITY_POLL_INTERVAL_MS);
  let lastCount = await page.$$eval(selector, (els) => els.length);
  let settleCount = 0;

  for (let i = 0; i < maxPolls; i++) {
    await page.waitForTimeout(DOM_STABILITY_POLL_INTERVAL_MS);
    const count = await page.$$eval(selector, (els) => els.length);
    if (count === lastCount) {
      settleCount++;
      if (settleCount >= DOM_STABILITY_SETTLE_ROUNDS) {
        return count;
      }
    } else {
      settleCount = 0;
    }
    lastCount = count;
  }

  return lastCount;
}

export function getPageText(extraction: unknown): string {
  return (extraction as { pageText?: string }).pageText ?? "";
}

export async function captureScreenshot(
  stagehand: Stagehand,
  client: RunnerConvexClient,
  log: (msg: string) => void,
): Promise<string | undefined> {
  try {
    const page = stagehand.context.activePage();
    if (page) {
      const buffer = await page.screenshot({ type: "png" });
      return client.uploadBuffer(buffer, "image/png");
    }
  } catch (err) {
    log(`  Screenshot failed: ${err}`);
  }
  return undefined;
}

const MAX_LOGIN_SUBMIT_RETRIES = 2;

const USERNAME_SELECTORS = [
  'input[name="username"]',
  'input[name="email"]',
  'input[type="email"]',
  'input[id*="email" i]',
  'input[id*="username" i]',
  'input[placeholder*="email" i]',
  'input[placeholder*="username" i]',
];

const PASSWORD_SELECTORS = [
  'input[type="password"]',
  'input[name="password"]',
  'input[id*="password" i]',
];

const SUBMIT_BUTTON_SELECTORS = [
  'button[type="submit"]',
  'input[type="submit"]',
  'button:has-text("Sign in")',
  'button:has-text("Sign In")',
  'button:has-text("Log in")',
  'button:has-text("Login")',
  'button:has-text("Submit")',
];

async function playwrightFill(
  page: { locator: (s: string) => { count: () => Promise<number>; first: () => { fill: (v: string) => Promise<void> } } },
  value: string,
  selectors: string[],
  log: (msg: string) => void,
  explorationId: string,
  label: string,
): Promise<boolean> {
  for (const selector of selectors) {
    try {
      const loc = page.locator(selector);
      if (await loc.count() > 0) {
        await loc.first().fill(value);
        log(`Discovery ${explorationId}: filled ${label} (${selector})`);
        return true;
      }
    } catch {}
  }
  log(`Discovery ${explorationId}: could not find ${label} field — tried [${selectors.join(", ")}]`);
  return false;
}

async function waitForFormElement(
  page: { locator: (s: string) => { count: () => Promise<number> }; waitForTimeout: (ms: number) => Promise<void> },
  selectors: string[],
  timeoutMs: number,
): Promise<boolean> {
  const pollInterval = 500;
  const maxPolls = Math.ceil(timeoutMs / pollInterval);
  for (let i = 0; i < maxPolls; i++) {
    for (const selector of selectors) {
      try {
        if (await page.locator(selector).count() > 0) return true;
      } catch {}
    }
    await page.waitForTimeout(pollInterval);
  }
  return false;
}

export async function handleFormLoginPlaywright(
  page: { goto: (url: string, opts?: Record<string, unknown>) => Promise<unknown>; locator: (s: string) => { count: () => Promise<number>; first: () => { fill: (v: string) => Promise<void>; click: () => Promise<void> } }; url: () => string; waitForTimeout: (ms: number) => Promise<void>; waitForURL: (url: string | RegExp | ((url: URL) => boolean), opts?: Record<string, unknown>) => Promise<void>; waitForSelector: (selector: string, opts?: Record<string, unknown>) => Promise<unknown> },
  work: ExplorationWorkItem,
  log: (msg: string) => void,
): Promise<{ postLoginUrl: string }> {
  const loginUrl = work.login_url || work.url;
  log(`Discovery ${work.exploration_id}: navigating to login page ${loginUrl}`);
  await page.goto(loginUrl, { timeout: NAVIGATION_TIMEOUT_MS, waitUntil: "domcontentloaded" });

  const usernameFound = await waitForFormElement(page, USERNAME_SELECTORS, 8_000);
  if (!usernameFound) {
    log(`Discovery ${work.exploration_id}: WARNING — no username/email field found after waiting`);
  }

  const passwordFound = await waitForFormElement(page, PASSWORD_SELECTORS, 4_000);
  if (!passwordFound) {
    log(`Discovery ${work.exploration_id}: WARNING — no password field found after waiting`);
  }

  const usernameFilled = await playwrightFill(page, work.username!, USERNAME_SELECTORS, log, work.exploration_id, "username");
  const passwordFilled = await playwrightFill(page, work.password!, PASSWORD_SELECTORS, log, work.exploration_id, "password");

  if (!usernameFilled || !passwordFilled) {
    log(`Discovery ${work.exploration_id}: login form fields not filled (username=${usernameFilled}, password=${passwordFilled})`);
  }

  let submitClicked = false;
  for (const selector of SUBMIT_BUTTON_SELECTORS) {
    try {
      const loc = page.locator(selector);
      if (await loc.count() > 0) {
        log(`Discovery ${work.exploration_id}: clicking submit via ${selector}`);
        await loc.first().click();
        submitClicked = true;
        break;
      }
    } catch {}
  }

  if (!submitClicked) {
    log(`Discovery ${work.exploration_id}: WARNING — no submit button found`);
  }

  if (submitClicked) {
    try {
      await page.waitForURL(
        (url: URL) => url.toString() !== loginUrl && normalizeUrl(url.toString()) !== normalizeUrl(loginUrl),
        { timeout: 10_000 },
      );
      log(`Discovery ${work.exploration_id}: login redirect detected`);
    } catch {
      log(`Discovery ${work.exploration_id}: no redirect after submit, waiting for SPA navigation`);
      await page.waitForTimeout(5_000);
    }
  }

  const postLoginUrl = normalizeUrl(page.url()) ?? loginUrl;
  log(`Discovery ${work.exploration_id}: post-login URL is ${postLoginUrl}`);
  return { postLoginUrl };
}

export async function handleFormLogin(
  stagehand: Stagehand,
  work: ExplorationWorkItem,
  client: RunnerConvexClient,
  log: (msg: string) => void,
): Promise<{ loginPage: CapturedPage; postLoginPage: CapturedPage }> {
  const loginUrl = work.login_url || work.url;

  log(`Exploration ${work.exploration_id}: navigating to login page ${loginUrl}`);
  const page = stagehand.context.activePage() ?? (await stagehand.context.newPage());
  await page.goto(loginUrl, { timeoutMs: NAVIGATION_TIMEOUT_MS });
  await sleep(page);

  const preLoginUrl = normalizeUrl(page.url()) ?? loginUrl;

  log(`Exploration ${work.exploration_id}: capturing login page`);
  const loginTitle = await page.title();
  const loginExtraction = await stagehand.extract();
  const loginPageText = getPageText(loginExtraction);
  const loginScreenshotId = await captureScreenshot(stagehand, client, log);
  const loginPage: CapturedPage = {
    url: preLoginUrl,
    title: loginTitle,
    structure_text: "",
    screenshot_storage_id: loginScreenshotId,
    semantic_description: buildSemanticDescription(loginTitle, loginPageText),
  };

  log(`Exploration ${work.exploration_id}: filling username`);
  await stagehand.act(
    "type the username %username% into the username or email input field",
    { variables: { username: work.username! } },
  );
  await playwrightFill(page, work.username!, USERNAME_SELECTORS, log, work.exploration_id, "username");
  await sleep(page);

  log(`Exploration ${work.exploration_id}: filling password`);
  await stagehand.act(
    "type the password %password% into the password input field",
    { variables: { password: work.password! } },
  );
  await playwrightFill(page, work.password!, PASSWORD_SELECTORS, log, work.exploration_id, "password");
  await sleep(page);

  for (let attempt = 1; attempt <= MAX_LOGIN_SUBMIT_RETRIES + 1; attempt++) {
    log(`Exploration ${work.exploration_id}: clicking submit (attempt ${attempt})`);
    await stagehand.act("click the submit, login, or sign-in button");
    await sleep(page);

    let currentUrl = normalizeUrl(page.url());
    if (currentUrl && currentUrl !== preLoginUrl) {
      log(`Exploration ${work.exploration_id}: login succeeded, redirected to ${currentUrl}`);
      break;
    }

    for (const selector of SUBMIT_BUTTON_SELECTORS) {
      try {
        const loc = page.locator(selector);
        if (await loc.count() > 0) {
          log(`Exploration ${work.exploration_id}: Stagehand submit missed, trying Playwright fallback (${selector})`);
          await loc.first().click();
          await sleep(page);
          break;
        }
      } catch {}
    }

    currentUrl = normalizeUrl(page.url());
    if (currentUrl && currentUrl !== preLoginUrl) {
      log(`Exploration ${work.exploration_id}: login succeeded via Playwright fallback, redirected to ${currentUrl}`);
      break;
    }
    if (attempt <= MAX_LOGIN_SUBMIT_RETRIES) {
      log(`Exploration ${work.exploration_id}: URL unchanged after submit, retrying...`);
    } else {
      log(`Exploration ${work.exploration_id}: login may have failed — still on ${currentUrl}`);
    }
  }

  const postLoginUrl = page.url();
  const postLoginTitle = await page.title();
  const postLoginExtraction = await stagehand.extract();
  const postLoginPageText = getPageText(postLoginExtraction);
  const postLoginScreenshotId = await captureScreenshot(stagehand, client, log);

  return {
    loginPage,
    postLoginPage: {
      url: postLoginUrl,
      title: postLoginTitle,
      structure_text: "",
      screenshot_storage_id: postLoginScreenshotId,
      semantic_description: buildSemanticDescription(postLoginTitle, postLoginPageText),
    },
  };
}

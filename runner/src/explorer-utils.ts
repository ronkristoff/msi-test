import type { RunnerConvexClient } from "./convex-client";
import type { CapturedPage, ExplorationWorkItem } from "./types";

export type Stagehand = import("@browserbasehq/stagehand").Stagehand;

export const NAVIGATION_TIMEOUT_MS = 30_000;
export const HYDRATION_WAIT_MS = 2_000;

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
  const textSnippet = pageText.slice(0, 300).trim();
  return textSnippet ? `${title}: ${textSnippet}` : title;
}

export async function sleep(page: { waitForTimeout?: (ms: number) => Promise<void> }): Promise<void> {
  await page.waitForTimeout?.(HYDRATION_WAIT_MS);
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

export async function handleFormLogin(
  stagehand: Stagehand,
  work: ExplorationWorkItem,
  client: RunnerConvexClient,
  log: (msg: string) => void,
): Promise<CapturedPage> {
  const loginUrl = work.login_url || work.url;

  log(`Exploration ${work.exploration_id}: navigating to login page ${loginUrl}`);
  const page = stagehand.context.activePage() ?? (await stagehand.context.newPage());
  await page.goto(loginUrl, { timeoutMs: NAVIGATION_TIMEOUT_MS });
  await sleep(page);

  const preLoginUrl = normalizeUrl(page.url()) ?? loginUrl;

  log(`Exploration ${work.exploration_id}: filling username`);
  await stagehand.act(
    "type the username %username% into the username or email input field",
    { variables: { username: work.username! } },
  );
  await sleep(page);

  log(`Exploration ${work.exploration_id}: filling password`);
  await stagehand.act(
    "type the password %password% into the password input field",
    { variables: { password: work.password! } },
  );
  await sleep(page);

  for (let attempt = 1; attempt <= MAX_LOGIN_SUBMIT_RETRIES + 1; attempt++) {
    log(`Exploration ${work.exploration_id}: clicking submit (attempt ${attempt})`);
    await stagehand.act("click the submit, login, or sign-in button");
    await sleep(page);

    const currentUrl = normalizeUrl(page.url());
    if (currentUrl && currentUrl !== preLoginUrl) {
      log(`Exploration ${work.exploration_id}: login succeeded, redirected to ${currentUrl}`);
      break;
    }
    if (attempt <= MAX_LOGIN_SUBMIT_RETRIES) {
      log(`Exploration ${work.exploration_id}: URL unchanged after submit, retrying...`);
    } else {
      log(`Exploration ${work.exploration_id}: login may have failed — still on ${currentUrl}`);
    }
  }

  const postLoginUrl = page.url();
  const title = await page.title();
  const extraction = await stagehand.extract();
  const pageText = getPageText(extraction);
  const screenshotStorageId = await captureScreenshot(stagehand, client, log);

  return {
    url: postLoginUrl,
    title,
    structure_text: "",
    screenshot_storage_id: screenshotStorageId,
    semantic_description: buildSemanticDescription(title, pageText),
  };
}

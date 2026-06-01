import { z } from "zod";
import { RunnerConvexClient } from "./convex-client";
import { initStagehand } from "./stagehand";
import type { CapturedPage, ExplorationWorkItem } from "./types";

const MAX_PAGES = 15;
const HYDRATION_WAIT_MS = 2_000;
const NAVIGATION_TIMEOUT_MS = 30_000;

const NOISE_PATTERNS = [
  /privacy/i,
  /terms/i,
  /legal/i,
  /cookie[- _]policy/i,
  /cookie[- _]notice/i,
  /accessibility/i,
  /sitemap/i,
  /rss/i,
  /feed/i,
  /\.pdf$/i,
  /\.zip$/i,
  /\.docx?$/i,
  /\.xlsx?$/i,
  /mailto:/i,
  /tel:/i,
  /javascript:/i,
];

const linksSchema = z.object({
  links: z.array(z.object({ text: z.string(), href: z.string() })),
});

type Stagehand = Awaited<ReturnType<typeof initStagehand>>;

export async function executeExploration(
  client: RunnerConvexClient,
  work: ExplorationWorkItem,
  log: (msg: string) => void,
): Promise<void> {
  let stagehand: Stagehand | null = null;

  try {
    log(`Exploration ${work.exploration_id}: fetching AI config for workspace ${work.workspace_id}`);
    const aiConfig = await client.getWorkspaceAiConfig(work.workspace_id);

    log(`Exploration ${work.exploration_id}: initializing Stagehand`);
    stagehand = await initStagehand(aiConfig, log);

    const capturedPages: CapturedPage[] = [];
    const visited = new Set<string>();

    if (work.auth_mode === "form" && work.username && work.password) {
      const loginPage = await handleFormLogin(stagehand, work, client, log);
      capturedPages.push(loginPage);
      await client.updateExplorationProgress(
        work.exploration_id,
        `Captured login page: ${loginPage.title}`,
        capturedPages.length,
      );
    } else if (work.auth_mode === "cookie" && work.cookie_name && work.cookie_value) {
      await stagehand.context.addCookies([{
        url: work.url,
        name: work.cookie_name,
        value: work.cookie_value,
      }]);
    }

    const queue: string[] = [];
    const origin = new URL(work.url).origin;

    if (work.additional_urls?.length) {
      for (const extraUrl of work.additional_urls) {
        const normalized = normalizeUrl(extraUrl);
        if (normalized && isSameOrigin(normalized, origin) && !visited.has(normalized)) {
          queue.push(normalized);
        }
      }
    }

    const startUrl = normalizeUrl(work.url);
    if (startUrl && !visited.has(startUrl)) {
      queue.unshift(startUrl);
    }

    while (queue.length > 0 && capturedPages.length < MAX_PAGES) {
      const currentUrl = queue.shift()!;
      const normalized = normalizeUrl(currentUrl);
      if (!normalized || visited.has(normalized)) continue;
      visited.add(normalized);

      log(`Exploration ${work.exploration_id}: visiting ${normalized}`);

      try {
        const result = await visitPage(stagehand, normalized, work.interactive, log);
        if (!result) continue;

        const captured = await capturePage(stagehand, normalized, result.title, result.structureText, client, log);
        capturedPages.push(captured);

        await client.updateExplorationProgress(
          work.exploration_id,
          `Visiting page ${capturedPages.length}: ${captured.title}` +
            (result.interactiveCount > 0 ? ` (explored ${result.interactiveCount} interactive elements)` : ""),
          capturedPages.length,
        );

        for (const link of result.links) {
          const linkNormalized = normalizeUrl(link.href);
          if (
            linkNormalized &&
            !visited.has(linkNormalized) &&
            isSameOrigin(linkNormalized, origin) &&
            !isNoiseUrl(linkNormalized) &&
            !queue.includes(linkNormalized)
          ) {
            queue.push(linkNormalized);
          }
        }
      } catch (err) {
        log(`Exploration ${work.exploration_id}: error visiting ${normalized}: ${err}`);
      }
    }

    log(`Exploration ${work.exploration_id}: captured ${capturedPages.length} pages`);

    await client.completeExploration(work.exploration_id, capturedPages);
    log(`Exploration ${work.exploration_id}: completed`);
  } catch (err) {
    log(`Exploration ${work.exploration_id}: error: ${err}`);
    await client.failExploration(
      work.exploration_id,
      err instanceof Error ? err.message : String(err),
    );
  } finally {
    if (stagehand) await stagehand.close({ force: true }).catch(() => {});
  }
}

async function handleFormLogin(
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

  const title = await page.title();
  const extraction = await stagehand.extract();
  const structureText = buildStructureText(loginUrl, title, extraction.pageText);

  log(`Exploration ${work.exploration_id}: performing Stagehand act() login at ${loginUrl}`);
  await stagehand.act(
    "Fill in the username/email field with the provided username and the password field with the provided password, then click the submit/login button",
    {
      variables: {
        username: work.username!,
        password: work.password!,
      },
    },
  );

  await sleep(page);
  log(`Exploration ${work.exploration_id}: login act() completed, current URL: ${page.url()}`);

  return capturePage(stagehand, loginUrl, title, structureText, client, log);
}

async function capturePage(
  stagehand: Stagehand,
  url: string,
  title: string,
  structureText: string,
  client: RunnerConvexClient,
  log: (msg: string) => void,
): Promise<CapturedPage> {
  let screenshotStorageId: string | undefined;
  try {
    const page = stagehand.context.activePage();
    if (page) {
      const buffer = await page.screenshot({ type: "png" });
      screenshotStorageId = await client.uploadBuffer(buffer, "image/png");
    }
  } catch (err) {
    log(`  Screenshot failed for ${url}: ${err}`);
  }

  return { url, title, structure_text: structureText, screenshot_storage_id: screenshotStorageId };
}

interface VisitResult {
  title: string;
  structureText: string;
  links: Array<{ text: string; href: string }>;
  interactiveCount: number;
}

async function visitPage(
  stagehand: Stagehand,
  url: string,
  interactive: boolean,
  log: (msg: string) => void,
): Promise<VisitResult | null> {
  const page = stagehand.context.activePage() ?? (await stagehand.context.newPage());

  const navigated = await gotoWithRetry(page, url);
  if (!navigated) {
    log(`  Could not navigate to ${url}`);
    return null;
  }

  await sleep(page);

  const title = await page.title();

  const [pageTextResult, linksResult, actions] = await Promise.all([
    stagehand.extract(),
    stagehand.extract(
      "Extract all links on this page. For each link, provide the visible text and the href URL.",
      linksSchema,
    ),
    stagehand.observe(
      "Find all interactive elements: buttons, form inputs, dropdowns, and navigation elements. For each, provide the selector and a description of its purpose.",
    ),
  ]);

  let interactiveCount = 0;
  if (interactive && actions.length > 0) {
    log(`  Found ${actions.length} interactive elements, exploring key ones`);
    interactiveCount = await exploreInteractiveElements(stagehand, actions, log);
  }

  const structureText = buildStructureText(
    url,
    title,
    pageTextResult.pageText,
    actions.map((a) => ({ selector: a.selector, description: a.description })),
  );

  return {
    title,
    structureText,
    links: linksResult.links,
    interactiveCount,
  };
}

async function gotoWithRetry(
  page: { goto: (url: string, opts?: { timeoutMs?: number }) => Promise<unknown> },
  url: string,
): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await page.goto(url, { timeoutMs: NAVIGATION_TIMEOUT_MS });
      return true;
    } catch {
      if (attempt === 1) return false;
    }
  }
  return false;
}

async function exploreInteractiveElements(
  stagehand: Stagehand,
  actions: Array<{ selector: string; description: string }>,
  log: (msg: string) => void,
): Promise<number> {
  let explored = 0;
  const maxExplorations = 3;

  for (const action of actions) {
    if (explored >= maxExplorations) break;

    const desc = action.description.toLowerCase();
    const isMeaningfulAction =
      desc.includes("button") ||
      desc.includes("submit") ||
      desc.includes("menu") ||
      desc.includes("tab") ||
      desc.includes("dropdown") ||
      desc.includes("expand") ||
      desc.includes("toggle") ||
      desc.includes("filter") ||
      desc.includes("search");

    if (!isMeaningfulAction) continue;

    try {
      log(`  Exploring interactive: ${action.description}`);
      await stagehand.act(action.description);
      await stagehand.context.activePage()?.waitForTimeout?.(1000);
      explored++;
    } catch (err) {
      log(`  Interactive exploration failed for "${action.description}": ${err}`);
    }
  }

  return explored;
}

function buildStructureText(
  url: string,
  title: string,
  pageText: string,
  interactiveElements?: Array<{ selector: string; description: string }>,
): string {
  const parts: string[] = [];
  parts.push(`URL: ${url}`);
  parts.push(`Title: ${title}`);

  if (pageText) {
    parts.push(`\nPage Content:\n${pageText}`);
  }

  if (interactiveElements && interactiveElements.length > 0) {
    parts.push("\nInteractive Elements:");
    for (const el of interactiveElements) {
      parts.push(`  [${el.selector}] — ${el.description}`);
    }
  }

  return parts.join("\n");
}

async function sleep(page: { waitForTimeout?: (ms: number) => Promise<void> }): Promise<void> {
  await page.waitForTimeout?.(HYDRATION_WAIT_MS);
}

function normalizeUrl(raw: string): string | null {
  try {
    const parsed = new URL(raw);
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return null;
  }
}

function isSameOrigin(url: string, origin: string): boolean {
  try {
    return new URL(url).origin === origin;
  } catch {
    return false;
  }
}

function isNoiseUrl(url: string): boolean {
  return NOISE_PATTERNS.some((p) => p.test(url));
}

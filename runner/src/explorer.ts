import { z } from "zod";
import { RunnerConvexClient } from "./convex-client";
import { initStagehand } from "./stagehand";
import { discoverFlows } from "./flowDiscovery";
import {
  type Stagehand,
  normalizeUrl,
  isSameOrigin,
  buildSemanticDescription,
  captureScreenshot,
  handleFormLogin,
  sleep,
  NAVIGATION_TIMEOUT_MS,
} from "./explorer-utils";
import { extractPrdKeywords, sortQueueByPrdRelevance, buildPrdCoverage } from "./prd-utils";
import type { CapturedPage, ExplorationWorkItem, InteractiveElement } from "./types";

const MAX_PAGES = 15;

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
    const linkGraph = new Map<string, string[]>();
    const linkObjectsBySource = new Map<string, Array<{ text: string; href: string }>>();

    if (work.auth_mode === "form" && work.username && work.password) {
      const { loginPage, postLoginPage } = await handleFormLogin(stagehand, work, client, log);
      capturedPages.push(loginPage, postLoginPage);
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
    const prdKeywords = work.prd_text ? extractPrdKeywords(work.prd_text) : [];

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

        const captured = await buildCapturedPage(
          stagehand, normalized, result.title, result.pageText,
          result.interactiveElements, client, log,
        );
        capturedPages.push(captured);

        linkGraph.set(normalized, result.links.map((l) => l.href));
        linkObjectsBySource.set(normalized, result.links);

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

        if (prdKeywords.length > 0) {
          sortQueueByPrdRelevance(queue, linkObjectsBySource, prdKeywords);
        }
      } catch (err) {
        log(`Exploration ${work.exploration_id}: error visiting ${normalized}: ${err}`);
      }
    }

    log(`Exploration ${work.exploration_id}: captured ${capturedPages.length} pages`);

    const discoveredFlows = discoverFlows(
      capturedPages.map((p) => ({ url: p.url, title: p.title })),
      linkGraph,
    );

    await client.completeExploration(work.exploration_id, {
      capturedPages,
      discoveredFlows,
      prdCoverage: buildPrdCoverage(work.prd_text, capturedPages, discoveredFlows),
    });
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

async function buildCapturedPage(
  stagehand: Stagehand,
  url: string,
  title: string,
  pageText: string,
  interactiveElements: InteractiveElement[],
  client: RunnerConvexClient,
  log: (msg: string) => void,
): Promise<CapturedPage> {
  const screenshotStorageId = await captureScreenshot(stagehand, client, log);

  return {
    url,
    title,
    structure_text: "",
    screenshot_storage_id: screenshotStorageId,
    semantic_description: buildSemanticDescription(title, pageText),
    interactive_elements: interactiveElements.length > 0 ? interactiveElements : undefined,
  };
}

interface VisitResult {
  title: string;
  pageText: string;
  interactiveElements: InteractiveElement[];
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

  return {
    title,
    pageText: pageTextResult.pageText,
    interactiveElements: buildInteractiveElements(actions),
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

function buildInteractiveElements(
  actions: Array<{ selector: string; description: string }>,
): InteractiveElement[] {
  return actions.map((a) => ({
    selector: a.selector,
    description: a.description,
    element_type: inferElementType(a.description),
  }));
}

function inferElementType(description: string): string {
  const lower = description.toLowerCase();
  if (/\b(button|submit|click|btn)\b/.test(lower)) return "button";
  if (/\b(input|field|email|password|text)\b/.test(lower)) return "input";
  if (/\b(link|anchor|navigate)\b/.test(lower)) return "link";
  if (/\b(dropdown|select|combo)\b/.test(lower)) return "dropdown";
  if (/\b(checkbox|check)\b/.test(lower)) return "checkbox";
  if (/\b(radio)\b/.test(lower)) return "radio";
  if (/\b(toggle|switch)\b/.test(lower)) return "toggle";
  if (/\b(menu|nav)\b/.test(lower)) return "navigation";
  if (/\b(tab)\b/.test(lower)) return "tab";
  if (/\b(search)\b/.test(lower)) return "search";
  return "interactive";
}

function isNoiseUrl(url: string): boolean {
  return NOISE_PATTERNS.some((p) => p.test(url));
}

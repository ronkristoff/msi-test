import { chromium, type Browser, type Page } from "playwright";
import { RunnerConvexClient } from "./convex-client";

interface ExplorationWorkItem {
  exploration_id: string;
  url: string;
}

interface CapturedPage {
  url: string;
  title: string;
  structure_text: string;
  screenshot_storage_id?: string;
}

const MAX_PAGES = 15;
const PAGE_TIMEOUT_MS = 30_000;
const HYDRATION_WAIT_MS = 2_000;

export async function executeExploration(
  client: RunnerConvexClient,
  work: ExplorationWorkItem,
  log: (msg: string) => void,
): Promise<void> {
  let browser: Browser | null = null;

  try {
    log(`Exploration ${work.exploration_id}: launching browser for ${work.url}`);
    browser = await chromium.launch({ headless: true });

    const baseUrl = new URL(work.url);
    const visited = new Set<string>();
    const toVisit = [work.url];
    const capturedPages: CapturedPage[] = [];

    while (toVisit.length > 0 && capturedPages.length < MAX_PAGES) {
      const currentUrl = toVisit.shift()!;
      const normalized = normalizeUrl(currentUrl, baseUrl.origin);
      if (!normalized || visited.has(normalized)) continue;

      visited.add(normalized);

      log(`Exploration ${work.exploration_id}: capturing ${normalized}`);

      const page = await browser.newPage();
      try {
        const result = await capturePage(page, normalized, log);

        if (result) {
          let screenshotStorageId: string | undefined;
          try {
            const screenshotBuffer = await page.screenshot({ type: "png", fullPage: false });
            screenshotStorageId = await client.uploadBuffer(screenshotBuffer, "image/png");
          } catch (err) {
            log(`Exploration ${work.exploration_id}: screenshot failed for ${normalized}: ${err}`);
          }

          capturedPages.push({
            ...result.page,
            screenshot_storage_id: screenshotStorageId,
          });

          await client.updateExplorationProgress(
            work.exploration_id,
            `Captured page ${capturedPages.length}: ${result.page.title}`,
            capturedPages.length,
          );

          for (const link of result.links) {
            const linkNormalized = normalizeUrl(link, baseUrl.origin);
            if (
              linkNormalized &&
              !visited.has(linkNormalized) &&
              isSameOrigin(linkNormalized, baseUrl.origin) &&
              !isFileUrl(linkNormalized)
            ) {
              toVisit.push(linkNormalized);
            }
          }
        }
      } catch (err) {
        log(`Exploration ${work.exploration_id}: error capturing ${normalized}: ${err}`);
      } finally {
        await page.close().catch(() => {});
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
    if (browser) await browser.close().catch(() => {});
  }
}

interface CaptureResult {
  page: CapturedPage;
  links: string[];
}

async function capturePage(
  page: Page,
  url: string,
  log: (msg: string) => void,
): Promise<CaptureResult | null> {
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: PAGE_TIMEOUT_MS });
  } catch {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: PAGE_TIMEOUT_MS });
    } catch (err) {
      log(`  Could not navigate to ${url}: ${err}`);
      return null;
    }
  }

  await page.waitForTimeout(HYDRATION_WAIT_MS);

  const title = await page.title();

  const structure = await page.evaluate(() => {
    const headings = Array.from(document.querySelectorAll("h1, h2, h3, h4"))
      .map((el) => `${el.tagName}: ${el.textContent?.trim() ?? ""}`)
      .filter((h) => h.length > 3);

    const links = Array.from(document.querySelectorAll("a[href]"))
      .map((el) => ({
        text: el.textContent?.trim() ?? "",
        href: (el as HTMLAnchorElement).href,
      }))
      .filter((l) => l.href && l.href.startsWith("http"));

    const navElements = Array.from(document.querySelectorAll("nav, [role='navigation']"))
      .map((nav) =>
        Array.from(nav.querySelectorAll("a"))
          .map((a) => a.textContent?.trim() ?? "")
          .filter(Boolean)
          .join(", "),
      );

    const metaDescription =
      document.querySelector('meta[name="description"]')?.getAttribute("content") ?? "";

    const elements = Array.from(
      document.querySelectorAll("input, select, textarea, button, [role='button'], [data-test], [data-testid]"),
    ).slice(0, 50)
      .map((el) => {
        const input = el as HTMLInputElement;
        const tag = el.tagName.toLowerCase();
        const testId = el.getAttribute("data-test") ?? el.getAttribute("data-testid") ?? "";
        const role = el.getAttribute("role") ?? "";
        const type = input.type ?? "";
        const ariaLabel = el.getAttribute("aria-label") ?? "";
        const placeholder = input.getAttribute("placeholder") ?? "";
        const label = input.labels?.[0]?.textContent?.trim() ?? "";
        const text = (el.textContent?.trim() ?? el.getAttribute("value") ?? "").slice(0, 60);
        const href = (el as HTMLAnchorElement).href ?? "";
        return { tag, type, testId, role, ariaLabel, placeholder, label, text, href };
      });

    return { headings, links, navElements, metaDescription, elements };
  });

  const structureText = buildStructureText(url, title, structure);

  return {
    page: { url, title, structure_text: structureText },
    links: structure.links.map((l) => l.href),
  };
}

interface ElementInfo {
  tag: string;
  type: string;
  testId: string;
  role: string;
  ariaLabel: string;
  placeholder: string;
  label: string;
  text: string;
  href: string;
}

function generateLocator(el: ElementInfo): string {
  if (el.testId) return `page.getByTestId('${el.testId}')`;
  if (el.role === "button" || el.tag === "button") {
    const name = el.text || el.ariaLabel;
    return name ? `page.getByRole('button', { name: '${escape(name)}' })` : "page.getByRole('button')";
  }
  if (el.tag === "a" && el.text) return `page.getByRole('link', { name: '${escape(el.text)}' })`;
  if (el.tag === "input" || el.tag === "select" || el.tag === "textarea") {
    if (el.label) return `page.getByLabel('${escape(el.label)}')`;
    if (el.placeholder) return `page.getByPlaceholder('${escape(el.placeholder)}')`;
    if (el.ariaLabel) return `page.getByLabel('${escape(el.ariaLabel)}')`;
  }
  if (el.text) return `page.getByText('${escape(el.text.slice(0, 40))}')`;
  return "";
}

function escape(s: string): string {
  return s.replace(/'/g, "\\'").replace(/\n/g, " ").trim();
}

function buildStructureText(
  url: string,
  title: string,
  structure: {
    headings: string[];
    links: { text: string; href: string }[];
    navElements: string[];
    metaDescription: string;
    elements: ElementInfo[];
  },
): string {
  const parts: string[] = [];

  parts.push(`URL: ${url}`);
  parts.push(`Title: ${title}`);
  if (structure.metaDescription) {
    parts.push(`Description: ${structure.metaDescription}`);
  }

  if (structure.headings.length > 0) {
    parts.push(`\nHeadings:\n${structure.headings.map((h) => `  ${h}`).join("\n")}`);
  }

  if (structure.navElements.length > 0) {
    parts.push(`\nNavigation:\n${structure.navElements.map((n) => `  ${n}`).join("\n")}`);
  }

  const locators = structure.elements
    .map((el) => {
      const locator = generateLocator(el);
      if (!locator) return null;
      const desc = el.label || el.placeholder || el.ariaLabel || el.text;
      const descPart = desc ? ` — ${el.tag}, "${desc}"` : ` — ${el.tag}`;
      return `  ${locator}${descPart}`;
    })
    .filter(Boolean);

  if (locators.length > 0) {
    parts.push("\nPlaywright locators (use these in tests):");
    parts.push(locators.join("\n"));
  }

  const linkTexts = structure.links
    .filter((l) => l.text)
    .slice(0, 30)
    .map((l) => `${l.text} → ${l.href}`);
  if (linkTexts.length > 0) {
    parts.push(`\nLinks:\n${linkTexts.map((l) => `  ${l}`).join("\n")}`);
  }

  return parts.join("\n");
}

function normalizeUrl(raw: string, origin: string): string | null {
  try {
    const parsed = new URL(raw, origin);
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

function isFileUrl(url: string): boolean {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    return /\.(pdf|png|jpg|jpeg|gif|svg|zip|tar|gz|mp4|mp3|wav|avi|mov|doc|docx|xls|xlsx|ppt|pptx)$/i.test(pathname);
  } catch {
    return false;
  }
}

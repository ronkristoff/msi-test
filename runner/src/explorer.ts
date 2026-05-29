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
          capturedPages.push(result.page);

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

    const forms = Array.from(document.querySelectorAll("form"))
      .map((form) => ({
        action: form.action || "",
        method: form.method || "GET",
        inputs: Array.from(form.querySelectorAll("input, select, textarea"))
          .map((el) => {
            const input = el as HTMLInputElement;
            return {
              name: input.name || input.id || "",
              type: input.type || input.tagName.toLowerCase(),
              label:
                input.labels?.[0]?.textContent?.trim() ??
                input.getAttribute("placeholder") ??
                input.getAttribute("aria-label") ??
                "",
            };
          }),
        buttons: Array.from(form.querySelectorAll("button, input[type='submit']"))
          .map((btn) => btn.textContent?.trim() ?? btn.getAttribute("value") ?? "")
          .filter(Boolean),
      }));

    const standaloneButtons = Array.from(
      document.querySelectorAll("button:not(form button), [role='button']:not(form [role='button'])"),
    )
      .map((btn) => btn.textContent?.trim() ?? "")
      .filter(Boolean)
      .slice(0, 20);

    const navElements = Array.from(document.querySelectorAll("nav, [role='navigation']"))
      .map((nav) =>
        Array.from(nav.querySelectorAll("a"))
          .map((a) => a.textContent?.trim() ?? "")
          .filter(Boolean)
          .join(", "),
      );

    const metaDescription =
      document.querySelector('meta[name="description"]')?.getAttribute("content") ?? "";

    return { headings, links, forms, standaloneButtons, navElements, metaDescription };
  });

  const structureText = buildStructureText(url, title, structure);

  return {
    page: { url, title, structure_text: structureText },
    links: structure.links.map((l) => l.href),
  };
}

function buildStructureText(
  url: string,
  title: string,
  structure: {
    headings: string[];
    links: { text: string; href: string }[];
    forms: {
      action: string;
      method: string;
      inputs: { name: string; type: string; label: string }[];
      buttons: string[];
    }[];
    standaloneButtons: string[];
    navElements: string[];
    metaDescription: string;
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

  if (structure.forms.length > 0) {
    parts.push("\nForms:");
    for (const form of structure.forms) {
      const inputList = form.inputs
        .map((i) => `${i.type}[${i.name || "unnamed"}]${i.label ? ` (${i.label})` : ""}`)
        .join(", ");
      const buttonList = form.buttons.join(", ");
      parts.push(`  ${form.method} ${form.action || "(same page)"} → inputs: ${inputList || "none"} | buttons: ${buttonList || "none"}`);
    }
  }

  if (structure.standaloneButtons.length > 0) {
    parts.push(`\nButtons: ${structure.standaloneButtons.join(", ")}`);
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

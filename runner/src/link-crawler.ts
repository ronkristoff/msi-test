import { chromium, type Browser } from "playwright";
import { RunnerConvexClient } from "./convex-client";
import {
  normalizeUrl,
  isSameOrigin,
  handleFormLoginPlaywright,
  waitForDomStability,
  NAVIGATION_TIMEOUT_MS,
} from "./explorer-utils";
import { discoverFlows } from "./flowDiscovery";
import type { AuthCookie, DiscoveredPage, DiscoveredFlow, ExplorationWorkItem } from "./types";

const MAX_CRAWL_PAGES = 50;
const CRAWL_TIMEOUT_MS = 15_000;

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
];

function isNoiseUrl(url: string): boolean {
  return NOISE_PATTERNS.some((p) => p.test(url));
}

export async function executeDiscovery(
  client: RunnerConvexClient,
  work: ExplorationWorkItem,
  log: (msg: string) => void,
): Promise<void> {
  let browser: Browser | null = null;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    const discoveredPages: DiscoveredPage[] = [];
    const visited = new Set<string>();

    let postLoginUrl: string | null = null;
    let authCookies: AuthCookie[] | undefined;
    if (work.auth_mode === "form" && work.username && work.password) {
      const result = await handleFormLoginPlaywright(page, work, log);
      postLoginUrl = result.postLoginUrl;

      const loginUrl = normalizeUrl(work.login_url || work.url);
      const normalizedPostLogin = normalizeUrl(postLoginUrl);
      if (loginUrl && normalizedPostLogin && loginUrl === normalizedPostLogin) {
        throw new Error(
          `Login failed — still on login page ${loginUrl} after all attempts. ` +
          `Check that the login URL, username, and password are correct.`
        );
      }

      if (postLoginUrl) {
        const cookies = await context.cookies();
        authCookies = cookies.map((c) => ({
          name: c.name,
          value: c.value,
          domain: c.domain,
          path: c.path,
        }));
        log(`Discovery ${work.exploration_id}: captured ${authCookies.length} auth cookies`);
      }
    } else if (work.auth_mode === "cookie" && work.cookie_name && work.cookie_value) {
      await context.addCookies([{
        url: work.url,
        name: work.cookie_name,
        value: work.cookie_value,
      }]);
    }

    const effectiveOrigin = postLoginUrl
      ? new URL(postLoginUrl).origin
      : new URL(work.url).origin;
    const linkGraph = new Map<string, string[]>();
    const queue: Array<{ url: string; sourceUrl: string | null }> = [];
    const startUrl = normalizeUrl(work.url);

    if (postLoginUrl) {
      const normalizedPostLogin = normalizeUrl(postLoginUrl);
      if (normalizedPostLogin) {
        visited.add(normalizedPostLogin);

        try {
          await waitForDomStability(page, "nav a[href], [role='navigation'] a[href], aside a[href], header a[href]");
          await waitForDomStability(page);
          const title = await page.title();
          discoveredPages.push({ url: normalizedPostLogin, title });
          await client.updateExplorationProgress(
            work.exploration_id,
            `Discovering page ${discoveredPages.length}: ${title}`,
            discoveredPages.length,
          );

          const links = await page.$$eval("a[href]", (anchors) =>
            anchors.map((a) => ({
              href: (a as HTMLAnchorElement).href,
              text: a.textContent?.trim() ?? "",
            }))
          );

          const navLinks = await page.$$eval("nav a[href], [role='navigation'] a[href], aside a[href], [data-testid*='sidebar'] a[href], [data-testid*='nav'] a[href]", (anchors) =>
            anchors.map((a) => ({
              href: (a as HTMLAnchorElement).href,
              text: a.textContent?.trim() ?? "",
            }))
          );

          const allLinks = [...links];
          const seenHrefs = new Set(links.map((l) => l.href));
          for (const nl of navLinks) {
            if (!seenHrefs.has(nl.href)) {
              allLinks.push(nl);
              seenHrefs.add(nl.href);
            }
          }

          const childUrls: string[] = [];
          for (const link of allLinks) {
            const linkNormalized = normalizeUrl(link.href);
            if (
              linkNormalized &&
              !visited.has(linkNormalized) &&
              !queue.some((q) => q.url === linkNormalized) &&
              isSameOrigin(linkNormalized, effectiveOrigin) &&
              !isNoiseUrl(linkNormalized)
            ) {
              queue.push({ url: linkNormalized, sourceUrl: normalizedPostLogin });
              childUrls.push(linkNormalized);
            }
          }
          linkGraph.set(normalizedPostLogin, childUrls);

          log(`Discovery ${work.exploration_id}: post-login page ${normalizedPostLogin} — ${allLinks.length} links (${navLinks.length} nav), ${queue.length} queued`);
        } catch (err) {
          log(`Discovery ${work.exploration_id}: error extracting post-login page: ${err}`);
        }
      }
    } else if (startUrl) {
      queue.push({ url: startUrl, sourceUrl: null });
    }
    if (work.additional_urls?.length) {
      for (const extraUrl of work.additional_urls) {
        const normalized = normalizeUrl(extraUrl);
        if (normalized && isSameOrigin(normalized, effectiveOrigin) && !visited.has(normalized) && !queue.some((q) => q.url === normalized)) {
          queue.push({ url: normalized, sourceUrl: null });
        }
      }
    }

    while (queue.length > 0 && discoveredPages.length < MAX_CRAWL_PAGES) {
      const { url: currentUrl, sourceUrl } = queue.shift()!;
      const normalized = normalizeUrl(currentUrl);
      if (!normalized || visited.has(normalized)) continue;
      if (!isSameOrigin(normalized, effectiveOrigin)) continue;
      visited.add(normalized);

      if (sourceUrl) {
        const existing = linkGraph.get(sourceUrl) ?? [];
        if (!existing.includes(normalized)) {
          linkGraph.set(sourceUrl, [...existing, normalized]);
        }
      }

      try {
        log(`Discovery ${work.exploration_id}: visiting ${normalized}`);
        const response = await gotoWithRetry(page, currentUrl, CRAWL_TIMEOUT_MS);
        if (!response || response.status() >= 400) continue;

        await waitForDomStability(page, "nav a[href], [role='navigation'] a[href], aside a[href], header a[href]");
        await waitForDomStability(page);

        const title = await page.title();
        discoveredPages.push({ url: normalized, title });

        await client.updateExplorationProgress(
          work.exploration_id,
          `Discovering page ${discoveredPages.length}: ${title}`,
          discoveredPages.length,
        );

        const links = await page.$$eval("a[href]", (anchors) =>
          anchors.map((a) => ({
            href: (a as HTMLAnchorElement).href,
            text: a.textContent?.trim() ?? "",
          }))
        );

        const navLinks = await page.$$eval("nav a[href], [role='navigation'] a[href], aside a[href], [data-testid*='sidebar'] a[href], [data-testid*='nav'] a[href]", (anchors) =>
          anchors.map((a) => ({
            href: (a as HTMLAnchorElement).href,
            text: a.textContent?.trim() ?? "",
          }))
        );

        const allLinks = [...links];
        const seenHrefs = new Set(links.map((l) => l.href));
        for (const nl of navLinks) {
          if (!seenHrefs.has(nl.href)) {
            allLinks.push(nl);
            seenHrefs.add(nl.href);
          }
        }

        const childUrls: string[] = [];
        for (const link of allLinks) {
          const linkNormalized = normalizeUrl(link.href);
          if (
            linkNormalized &&
            !visited.has(linkNormalized) &&
            !queue.some((q) => q.url === linkNormalized) &&
            isSameOrigin(linkNormalized, effectiveOrigin) &&
            !isNoiseUrl(linkNormalized)
          ) {
            queue.push({ url: linkNormalized, sourceUrl: normalized });
            childUrls.push(linkNormalized);
          }
        }
        if (childUrls.length > 0) {
          linkGraph.set(normalized, childUrls);
        }

        log(`Discovery ${work.exploration_id}: ${normalized} — ${allLinks.length} links (${navLinks.length} nav), ${childUrls.length} new queued`);
      } catch (err) {
        log(`Discovery ${work.exploration_id}: error visiting ${normalized}: ${err}`);
      }
    }

    const discoveredFlows = discoverFlows(
      discoveredPages,
      linkGraph,
    );

    log(`Discovery ${work.exploration_id}: found ${discoveredPages.length} pages, ${discoveredFlows.length} flows`);
    await client.completeDiscovery(work.exploration_id, discoveredPages, discoveredFlows, authCookies);
    log(`Discovery ${work.exploration_id}: completed`);
  } catch (err) {
    log(`Discovery ${work.exploration_id}: error: ${err}`);
    await client.failExploration(
      work.exploration_id,
      err instanceof Error ? err.message : String(err),
    );
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

async function gotoWithRetry(
  page: { goto: (url: string, opts?: { timeout?: number; waitUntil?: string }) => Promise<{ status(): number } | null> },
  url: string,
  timeoutMs: number,
): Promise<{ status(): number } | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await page.goto(url, { timeout: timeoutMs, waitUntil: "networkidle" });
    } catch {
      if (attempt === 1) return null;
    }
  }
  return null;
}

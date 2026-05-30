import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { RunnerConvexClient } from "./convex-client";

interface ExplorationWorkItem {
  exploration_id: string;
  url: string;
  auth_mode: "none" | "form" | "cookie";
  login_url?: string;
  username?: string;
  password?: string;
  cookie_name?: string;
  cookie_value?: string;
  additional_urls?: string[];
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
const LOGIN_TIMEOUT_MS = 15_000;

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
    const context = await browser.newContext();
    const capturedPages: CapturedPage[] = [];
    const page = await context.newPage();

    let postLoginUrl: string | undefined;

    if (work.auth_mode === "form" && work.username && work.password) {
      const loginUrl = work.login_url || work.url;

      log(`Exploration ${work.exploration_id}: capturing login page ${loginUrl}`);
      const loginPageResult = await capturePage(page, loginUrl, log);
      if (loginPageResult) {
        const screenshotBuffer = await page.screenshot({ type: "png", fullPage: false });
        const screenshotStorageId = await client.uploadBuffer(screenshotBuffer, "image/png");
        capturedPages.push({
          ...loginPageResult.page,
          screenshot_storage_id: screenshotStorageId,
        });
        await client.updateExplorationProgress(
          work.exploration_id,
          `Captured login page: ${loginPageResult.page.title}`,
          capturedPages.length,
        );
      }

      log(`Exploration ${work.exploration_id}: performing form login at ${loginUrl}`);
      const loginResult = await performFormLogin(context, loginUrl, work.username, work.password, log);
      if (loginResult.success) {
        postLoginUrl = loginResult.postLoginUrl;
      } else {
        log(`Exploration ${work.exploration_id}: login may have failed, continuing anyway`);
      }
    } else if (work.auth_mode === "cookie" && work.cookie_name && work.cookie_value) {
      log(`Exploration ${work.exploration_id}: injecting cookie ${work.cookie_name}`);
      await context.addCookies([{
        name: work.cookie_name,
        value: work.cookie_value,
        domain: baseUrl.hostname,
        path: "/",
      }]);
    }

    const visited = new Set<string>();
    if (postLoginUrl) {
      visited.add(normalizeUrl(work.login_url || work.url, baseUrl.origin) ?? "");
    }

    const startUrl = postLoginUrl ?? work.url;
    const toVisit = [startUrl];

    if (work.additional_urls?.length) {
      for (const extraUrl of work.additional_urls) {
        const normalized = normalizeUrl(extraUrl, baseUrl.origin);
        if (normalized && isSameOrigin(normalized, baseUrl.origin) && !isFileUrl(normalized)) {
          toVisit.push(normalized);
        }
      }
    }

    while (toVisit.length > 0 && capturedPages.length < MAX_PAGES) {
      const currentUrl = toVisit.shift()!;
      const normalized = normalizeUrl(currentUrl, baseUrl.origin);
      if (!normalized || visited.has(normalized)) continue;

      visited.add(normalized);

      log(`Exploration ${work.exploration_id}: capturing ${normalized}`);

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

          const dynamicUrls = await discoverDynamicUrls(page, normalized, baseUrl.origin, visited, log);
          for (const dynUrl of dynamicUrls) {
            const dynNormalized = normalizeUrl(dynUrl, baseUrl.origin);
            if (
              dynNormalized &&
              !visited.has(dynNormalized) &&
              !toVisit.includes(dynNormalized) &&
              isSameOrigin(dynNormalized, baseUrl.origin) &&
              !isFileUrl(dynNormalized)
            ) {
              toVisit.push(dynNormalized);
            }
          }
        }
      } catch (err) {
        log(`Exploration ${work.exploration_id}: error capturing ${normalized}: ${err}`);
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

async function performFormLogin(
  context: BrowserContext,
  loginUrl: string,
  username: string,
  password: string,
  log: (msg: string) => void,
): Promise<{ success: boolean; postLoginUrl?: string }> {
  const page = await context.newPage();
  try {
    await page.goto(loginUrl, { waitUntil: "networkidle", timeout: PAGE_TIMEOUT_MS });
    await page.waitForTimeout(HYDRATION_WAIT_MS);

    const emailInput = page.locator(
      'input[type="email"], input[name="email"], input[name="username"], input[autocomplete="email"], input[autocomplete="username"], input[placeholder*="email" i], input[placeholder*="user" i]'
    ).first();
    const passwordInput = page.locator(
      'input[type="password"]'
    ).first();

    if (!(await emailInput.count()) || !(await passwordInput.count())) {
      log("  Could not find email/password fields on login page");
      return { success: false };
    }

    await emailInput.fill(username);
    await passwordInput.fill(password);

    const submitButton = page.locator(
      'button[type="submit"], input[type="submit"], button:has-text("Sign in"), button:has-text("Log in"), button:has-text("Login"), button:has-text("Sign up")'
    ).first();

    if (await submitButton.count()) {
      await submitButton.click();
    } else {
      await passwordInput.press("Enter");
    }

    await page.waitForURL(
      (url) => url.toString() !== loginUrl,
      { timeout: LOGIN_TIMEOUT_MS }
    ).catch(() => {});

    await page.waitForTimeout(HYDRATION_WAIT_MS);
    const postLoginUrl = page.url();
    log(`  Login navigation completed, current URL: ${postLoginUrl}`);
    return { success: true, postLoginUrl };
  } catch (err) {
    log(`  Form login error: ${err}`);
    return { success: false };
  } finally {
    await page.close().catch(() => {});
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

const MAX_DYNAMIC_CLICKS = 5;
const NAV_CLICK_TIMEOUT_MS = 5_000;

async function discoverDynamicUrls(
  page: Page,
  currentUrl: string,
  origin: string,
  visited: Set<string>,
  log: (msg: string) => void,
): Promise<string[]> {
  const discovered: string[] = [];

  try {
    const toggleButtons = page.locator(
      [
        'button[aria-label*="menu" i]',
        'button[aria-label*="sidebar" i]',
        'button[aria-label*="nav" i]',
        '[data-test*="menu" i]',
        '[data-test*="sidebar" i]',
        'button.menu-toggle',
        'button.hamburger',
        '.bm-burger-button',
        '#react-burger-menu-btn',
      ].join(", "),
    );

    for (let i = 0; i < await toggleButtons.count(); i++) {
      try {
        const btn = toggleButtons.nth(i);
        if (await btn.isVisible()) {
          await btn.click();
          await page.waitForTimeout(500);
          break;
        }
      } catch {
        continue;
      }
    }

    const navLinks = await page.evaluate(() => {
      const selectors = [
        "nav a[href]",
        "[role='navigation'] a[href]",
        ".nav a[href]",
        ".menu a[href]",
        ".sidebar a[href]",
        "#menu a[href]",
        ".bm-menu a[href]",
        "[class*='nav'] a[href]",
        "[class*='menu'] a[href]",
        "[class*='sidebar'] a[href]",
      ];
      const seen = new Set<string>();
      const results: { text: string; href: string }[] = [];

      for (const sel of selectors) {
        for (const el of document.querySelectorAll<HTMLAnchorElement>(sel)) {
          const href = el.href;
          if (!href || !href.startsWith("http") || seen.has(href)) continue;
          seen.add(href);
          results.push({ text: el.textContent?.trim() ?? "", href });
        }
      }

      return results;
    });

    for (const link of navLinks) {
      const normalized = normalizeUrl(link.href, origin);
      if (!normalized || visited.has(normalized)) continue;

      try {
        const currentNormalized = normalizeUrl(page.url(), origin);

        const navItem = page.locator(`a[href="${new URL(link.href).pathname}"]`).first();
        if (!(await navItem.count())) continue;

        await navItem.click();
        await page.waitForURL((u) => u.toString() !== currentUrl, {
          timeout: NAV_CLICK_TIMEOUT_MS,
        }).catch(() => {});

        const newUrl = page.url();
        const newNormalized = normalizeUrl(newUrl, origin);

        if (newNormalized && newNormalized !== currentNormalized && !visited.has(newNormalized)) {
          log(`  Dynamic nav discovered: ${link.text || "unnamed"} → ${newNormalized}`);
          discovered.push(newNormalized);
        }

        await page.goto(currentUrl, { waitUntil: "domcontentloaded", timeout: PAGE_TIMEOUT_MS });
        await page.waitForTimeout(HYDRATION_WAIT_MS);
      } catch {
        try {
          await page.goto(currentUrl, { waitUntil: "domcontentloaded", timeout: PAGE_TIMEOUT_MS });
          await page.waitForTimeout(HYDRATION_WAIT_MS);
        } catch {
          break;
        }
      }

      if (discovered.length >= MAX_DYNAMIC_CLICKS) break;
    }
  } catch (err) {
    log(`  Dynamic nav discovery error: ${err}`);
  }

  return discovered;
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

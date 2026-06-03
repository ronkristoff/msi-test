import { RunnerConvexClient } from "./convex-client";
import { initStagehand } from "./stagehand";
import { discoverFlows } from "./flowDiscovery";
import { buildPrdCoverage, buildPrdInstructionSection } from "./prd-utils";
import {
  type Stagehand,
  normalizeUrl,
  isSameOrigin,
  buildSemanticDescription,
  getPageText,
  captureScreenshot,
  handleFormLogin,
  sleep,
  NAVIGATION_TIMEOUT_MS,
} from "./explorer-utils";
import type { CapturedPage, DiscoveredFlow, ExplorationWorkItem, InteractiveElement, NavMenuItem } from "./types";

type AgentAction = {
  type: string;
  pageUrl?: string;
  [key: string]: unknown;
};

const DEFAULT_MAX_STEPS = 15;
const CANCEL_POLL_INTERVAL_MS = 5_000;

const DEFAULT_INSTRUCTION = `Explore this web app thoroughly. Visit every accessible page, interact with forms, buttons, menus, and navigation. Discover flows, error states, modals, and multi-step processes. Click every nav element, fill forms with test data, and explore different states.`;

export async function executeAutonomousExploration(
  client: RunnerConvexClient,
  work: ExplorationWorkItem,
  log: (msg: string) => void,
): Promise<void> {
  let stagehand: Stagehand | null = null;
  const abortController = new AbortController();

  try {
    log(`Autonomous exploration ${work.exploration_id}: fetching AI config for workspace ${work.workspace_id}`);
    const aiConfig = await client.getWorkspaceAiConfig(work.workspace_id);

    log(`Autonomous exploration ${work.exploration_id}: initializing Stagehand`);
    stagehand = await initStagehand(aiConfig, log);

    const capturedPages: CapturedPage[] = [];
    const visited = new Set<string>();
    const linkGraph = new Map<string, string[]>();
    let previousUrl: string | null = null;
    let authFlow: DiscoveredFlow | null = null;

    let skipNavigation = false;
    let effectiveOrigin = new URL(work.url).origin;

    if (work.auth_mode === "form" && work.username && work.password) {
      const { loginPage, postLoginPage } = await handleFormLogin(stagehand, work, client, log);
      capturedPages.push(loginPage, postLoginPage);

      const loginNormalized = normalizeUrl(loginPage.url) ?? loginPage.url;
      const postLoginNormalized = normalizeUrl(postLoginPage.url) ?? postLoginPage.url;
      visited.add(loginNormalized);
      visited.add(postLoginNormalized);
      linkGraph.set(loginNormalized, [postLoginNormalized]);
      previousUrl = postLoginNormalized;
      effectiveOrigin = new URL(postLoginPage.url).origin;

      await client.updateExplorationProgress(
        work.exploration_id,
        `Agent logged in: ${postLoginPage.title}`,
        capturedPages.length,
      );

      const normalizedLoginUrl = normalizeUrl(work.login_url || work.url);
      if (normalizedLoginUrl && postLoginNormalized === normalizedLoginUrl) {
        throw new Error("Login failed — still on login page after all attempts");
      }
      skipNavigation = isSameOrigin(postLoginPage.url, effectiveOrigin);

      authFlow = {
        name: `Auth: ${loginPage.title} → ${postLoginPage.title}`,
        description: `Login flow from ${loginPage.url} to ${postLoginPage.url}`,
        steps: [loginPage.title, postLoginPage.title],
        pages_involved: [0, 1],
        complexity: "low",
      };
    } else if (work.auth_mode === "cookie" && work.cookie_name && work.cookie_value) {
      await stagehand.context.addCookies([{
        url: work.url,
        name: work.cookie_name,
        value: work.cookie_value,
      }]);
    }

    let navMenu: NavMenuItem[] | undefined;
    try {
      navMenu = await extractNavMenu(page);
      if (navMenu && navMenu.length > 0) {
        log(`Autonomous exploration ${work.exploration_id}: captured ${navMenu.length} nav menu items`);
      }
    } catch (err) {
      log(`Autonomous exploration ${work.exploration_id}: nav menu extraction failed: ${err}`);
    }

    const page = stagehand.context.activePage() ?? (await stagehand.context.newPage());

    if (work.selected_pages && work.selected_pages.length > 0) {
      for (const pageUrl of work.selected_pages) {
        const normalized = normalizeUrl(pageUrl);
        if (!normalized || visited.has(normalized)) continue;
        if (!isSameOrigin(normalized, effectiveOrigin)) continue;
        visited.add(normalized);

        try {
          await page.goto(pageUrl, { timeoutMs: NAVIGATION_TIMEOUT_MS });
          await sleep(page);

          const title = await page.title();

          const [extraction, interactiveElements, structuredText] = await Promise.all([
            stagehand.extract(),
            extractInteractiveElements(page),
            extractStructuredText(page),
          ]);

          const pageText = getPageText(extraction);
          const screenshotStorageId = await captureScreenshot(stagehand, client, log);

          if (previousUrl) {
            const existing = linkGraph.get(previousUrl) ?? [];
            if (!existing.includes(normalized)) {
              linkGraph.set(previousUrl, [...existing, normalized]);
            }
          }
          previousUrl = normalized;

          capturedPages.push({
            url: normalized,
            title,
            structure_text: structuredText,
            screenshot_storage_id: screenshotStorageId,
            semantic_description: buildSemanticDescription(title, pageText),
            interactive_elements: interactiveElements,
          });

          await client.updateExplorationProgress(
            work.exploration_id,
            `Capturing page ${capturedPages.length}: ${title}`,
            capturedPages.length,
          );

          log(`Phase 2 capture: ${normalized} — ${title}`);
        } catch (err) {
          log(`Phase 2 capture error for ${normalized}: ${err}`);
        }
      }
    } else if (!skipNavigation) {
      await page.goto(work.url, { timeoutMs: NAVIGATION_TIMEOUT_MS });
      await sleep(page);
    }

    const instruction = buildInstruction(work) + buildReauthInstruction(work);
    const vars = buildVariables(work);

    const cancelPollTimer = setInterval(async () => {
      try {
        const statusResult = await client.getExplorationStatus(work.exploration_id);
        if (statusResult.status === "failed") {
          log(`Autonomous exploration ${work.exploration_id}: cancel signal received`);
          abortController.abort();
        }
      } catch (err) {
        log(`Cancel poll error: ${err}`);
      }
    }, CANCEL_POLL_INTERVAL_MS);

    const agent = stagehand.agent({});

    const result = await agent.execute({
      instruction,
      maxSteps: work.max_steps ?? DEFAULT_MAX_STEPS,
      ...(vars ? { variables: vars } : {}),
      signal: abortController.signal,
      callbacks: {
        onStepFinish: async () => {
          const currentUrl = page.url();
          const normalized = normalizeUrl(currentUrl);
          if (!normalized || visited.has(normalized)) return;
          if (!isSameOrigin(currentUrl, effectiveOrigin)) return;

          visited.add(normalized);

          if (previousUrl) {
            const existing = linkGraph.get(previousUrl) ?? [];
            if (!existing.includes(normalized)) {
              linkGraph.set(previousUrl, [...existing, normalized]);
            }
          }
          previousUrl = normalized;

          log(`Agent step: new page ${normalized}`);

          try {
            const title = await page.title();
            const extraction = await stagehand.extract();
            const pageText = getPageText(extraction);

            const screenshotStorageId = await captureScreenshot(stagehand, client, log);

            const captured: CapturedPage = {
              url: normalized,
              title,
              structure_text: "",
              screenshot_storage_id: screenshotStorageId,
              semantic_description: buildSemanticDescription(title, pageText),
            };
            capturedPages.push(captured);

            await client.updateExplorationProgress(
              work.exploration_id,
              `Agent exploring page ${capturedPages.length}: ${title}`,
              capturedPages.length,
            );
          } catch (err) {
            log(`Error capturing page ${normalized}: ${err}`);
          }
        },
      },
    });

    clearInterval(cancelPollTimer);

    if (!result.success && capturedPages.length === 0) {
      throw new Error(result.message || "Agent exploration failed with no pages captured");
    }

    log(`Autonomous exploration ${work.exploration_id}: agent completed, ${capturedPages.length} pages, ${result.actions.length} actions`);

    const linkBasedFlows = discoverFlows(
      capturedPages.map((p) => ({ url: p.url, title: p.title })),
      linkGraph,
    );

    const actionFlows = extractFlowsFromActions(result.actions as AgentAction[], capturedPages);
    const allFlows = deduplicateFlows([...linkBasedFlows, ...actionFlows, ...(authFlow ? [authFlow] : [])]);

    await client.completeExploration(work.exploration_id, {
      capturedPages,
      discoveredFlows: allFlows,
      prdCoverage: buildPrdCoverage(work.prd_text, capturedPages, allFlows),
      navMenu,
    });
    log(`Autonomous exploration ${work.exploration_id}: completed`);
  } catch (err) {
    log(`Autonomous exploration ${work.exploration_id}: error: ${err}`);
    await client.failExploration(
      work.exploration_id,
      err instanceof Error ? err.message : String(err),
    );
  } finally {
    if (stagehand) await stagehand.close({ force: true }).catch(() => {});
  }
}

export function buildReauthInstruction(work: ExplorationWorkItem): string {
  if (work.auth_mode === "form" && work.username && work.password) {
    return "\n\nIf you are redirected to a login or sign-in page during exploration, log back in using username %username% and password %password%.";
  }
  return "";
}

export function buildInstruction(work: ExplorationWorkItem): string {
  const goal = work.goal?.trim();
  const origin = new URL(work.url).origin;
  const prdSection = buildPrdInstructionSection(work.prd_text);

  if (goal) {
    return `${goal}${prdSection}\n\nStart from ${work.url}. Explore thoroughly within this application only (stay on origin ${origin}).`;
  }
  return `${DEFAULT_INSTRUCTION}${prdSection}\n\nStart from ${work.url}. Stay within the same origin (${origin}).`;
}

export function buildVariables(work: ExplorationWorkItem): Record<string, string> | undefined {
  const vars: Record<string, string> = {};
  if (work.username) vars.username = work.username;
  if (work.password) vars.password = work.password;
  return Object.keys(vars).length > 0 ? vars : undefined;
}

export function extractFlowsFromActions(
  actions: AgentAction[],
  capturedPages: CapturedPage[],
): DiscoveredFlow[] {
  if (actions.length === 0) return [];

  const urlSequence: string[] = [];
  let currentUrl: string | null = null;

  for (const action of actions) {
    if (action.pageUrl && action.pageUrl !== currentUrl) {
      currentUrl = action.pageUrl;
      urlSequence.push(action.pageUrl);
    }
  }

  if (urlSequence.length < 2) return [];

  const uniqueUrls = [...new Set(urlSequence)];
  const steps = uniqueUrls.map((url) => {
    const page = capturedPages.find((p) => p.url === url);
    return page?.title ?? url;
  });

  const pageIndices = uniqueUrls.map((url) => {
    const idx = capturedPages.findIndex((p) => p.url === url);
    return idx >= 0 ? idx : -1;
  });

  return [{
    name: `Agent flow: ${steps[0]} → ${steps[steps.length - 1]}`,
    description: `Autonomously discovered flow with ${uniqueUrls.length} pages`,
    steps,
    pages_involved: pageIndices.filter((i) => i >= 0),
    complexity: uniqueUrls.length <= 3 ? "low" : uniqueUrls.length <= 6 ? "medium" : "high",
  }];
}

function deduplicateFlows(flows: DiscoveredFlow[]): DiscoveredFlow[] {
  const seen = new Set<string>();
  return flows.filter((f) => {
    const key = f.steps.join("→");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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

function buildInteractiveElementsFromObserve(
  actions: Array<{ selector: string; description: string }>,
): InteractiveElement[] {
  if (!actions || actions.length === 0) return undefined;
  return actions.map((a) => ({
    selector: a.selector,
    description: a.description,
    element_type: inferElementType(a.description),
  }));
}

async function extractStructuredText(page: {
  $$eval: (selector: string, fn: (els: Element[]) => string[]) => Promise<string[]>;
  evaluate: (fn: () => string) => Promise<string>;
}): Promise<string> {
  const sections: string[] = [];

  try {
    const headings = await page.$$eval("h1, h2, h3", (els) =>
      els.map((el) => {
        const tag = el.tagName.toLowerCase();
        const text = (el.textContent ?? "").trim();
        return text ? `${tag.toUpperCase()}: ${text}` : "";
      }).filter(Boolean),
    );
    if (headings.length > 0) {
      sections.push("Headings:\n" + headings.join("\n"));
    }
  } catch {}

  try {
    const tables = await page.$$eval("table", (tables) =>
      tables.slice(0, 5).map((table) => {
        const rows = Array.from(table.querySelectorAll("tr"));
        const lines: string[] = [];
        for (let i = 0; i < Math.min(rows.length, 11); i++) {
          const cells = Array.from(rows[i].querySelectorAll("th, td"));
          const cellTexts = cells.map((c) => (c.textContent ?? "").trim().slice(0, 80));
          const prefix = i === 0 ? "  Headers:" : i === 1 ? "  Row 1:" : `  Row ${i}:`;
          lines.push(prefix + " " + cellTexts.join(" | "));
        }
        const caption = table.querySelector("caption");
        const label = caption ? (caption.textContent ?? "").trim() : table.getAttribute("aria-label") ?? "";
        return (label ? `Table "${label}":\n` : "Table:\n") + lines.join("\n");
      }),
    );
    if (tables.length > 0) {
      sections.push("Tables:\n" + tables.join("\n"));
    }
  } catch {}

  try {
    const bodyText = await page.evaluate(() => {
      const body = document.body;
      if (!body) return "";
      const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT, {
        acceptNode: (node) => {
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          const tag = parent.tagName.toLowerCase();
          if (["script", "style", "noscript", "svg", "path"].includes(tag)) return NodeFilter.FILTER_REJECT;
          const text = (node.textContent ?? "").trim();
          if (text.length < 3) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        },
      });
      const texts: string[] = [];
      while (walker.nextNode() && texts.length < 200) {
        const t = (walker.currentNode.textContent ?? "").trim();
        if (t) texts.push(t.slice(0, 200));
      }
      return texts.join("\n");
    });
    if (bodyText) {
      sections.push("Page text:\n" + bodyText.slice(0, 4000));
    }
  } catch {}

  return sections.join("\n\n");
}

async function extractInteractiveElements(page: {
  $$eval: (selector: string, fn: (els: Element[]) => Array<Record<string, string | undefined>>) => Promise<Array<Record<string, string | undefined>>>;
}): Promise<InteractiveElement[] | undefined> {
  try {
    const rawElements = await page.$$eval(
      'button, input, select, textarea, a[href], [role="button"], [role="link"], [role="tab"], [role="switch"], [role="checkbox"], [role="radio"], [role="menuitem"], [role="searchbox"], [role="textbox"]',
      (els) =>
        els.slice(0, 100).map((el) => {
          const tag = el.tagName.toLowerCase();
          const type = (el as HTMLInputElement).type?.toLowerCase() ?? "";
          const role = el.getAttribute("role") ?? "";
          const text = (el.textContent ?? "").trim().slice(0, 120);
          const ariaLabel = el.getAttribute("aria-label") ?? "";
          const placeholder = (el as HTMLInputElement).placeholder ?? "";
          const href = (el as HTMLAnchorElement).getAttribute("href") ?? "";
          const name = el.getAttribute("name") ?? "";
          const id = el.id ?? "";
          const dataTestid = el.getAttribute("data-testid") ?? el.getAttribute("data-test") ?? "";

          let labelText = "";
          if (id) {
            const label = document.querySelector(`label[for="${CSS.escape(id)}"]`);
            if (label) labelText = (label.textContent ?? "").trim();
          }
          if (!labelText) {
            const parent = el.closest("label");
            if (parent) labelText = (parent.textContent ?? "").trim();
          }
          if (!labelText) {
            const labelledBy = el.getAttribute("aria-labelledby");
            if (labelledBy) {
              const labelEl = document.getElementById(labelledBy);
              if (labelEl) labelText = (labelEl.textContent ?? "").trim();
            }
          }

          let elementType = "interactive";
          if (tag === "button" || type === "submit" || type === "button" || role === "button") {
            elementType = "button";
          } else if (tag === "a" || role === "link") {
            elementType = "link";
          } else if (tag === "select") {
            elementType = "dropdown";
          } else if (type === "checkbox" || role === "checkbox") {
            elementType = "checkbox";
          } else if (type === "radio" || role === "radio") {
            elementType = "radio";
          } else if (type === "search" || role === "searchbox") {
            elementType = "search";
          } else if (role === "tab") {
            elementType = "tab";
          } else if (role === "switch") {
            elementType = "toggle";
          } else if (role === "menuitem") {
            elementType = "navigation";
          } else if (tag === "input" || tag === "textarea" || role === "textbox") {
            elementType = "input";
          }

          let selector = tag;
          if (id) selector = `#${id}`;
          else if (name) selector = `${tag}[name="${name}"]`;
          else if (type) selector = `${tag}[type="${type}"]`;
          else if (role) selector = `[role="${role}"]`;

          const description = text || ariaLabel || placeholder || labelText || name || id || tag;

          return {
            tag, type, role, text, ariaLabel, placeholder, href, name, id, dataTestid,
            labelText, elementType, selector, description,
          };
        }),
    );

    const elements: InteractiveElement[] = rawElements.map((el) => {
      const suggestedLocator = buildSuggestedLocator(el);
      return {
        selector: el.selector ?? "",
        description: el.description ?? "",
        element_type: el.elementType ?? "interactive",
        role: el.role || undefined,
        aria_label: el.ariaLabel || undefined,
        label_text: el.labelText || undefined,
        placeholder: el.placeholder || undefined,
        name: el.name || undefined,
        id: el.id || undefined,
        type: el.type || undefined,
        href: el.href || undefined,
        data_testid: el.dataTestid || undefined,
        suggested_locator: suggestedLocator,
      };
    });

    return elements.length > 0 ? elements : undefined;
  } catch {
    return undefined;
  }
}

function buildSuggestedLocator(el: Record<string, string | undefined>): string {
  if (el.role && el.text) {
    return `page.getByRole('${el.role}', { name: '${el.text.replace(/'/g, "\\'")}' })`;
  }
  if (el.role && el.ariaLabel) {
    return `page.getByRole('${el.role}', { name: '${el.ariaLabel.replace(/'/g, "\\'")}' })`;
  }
  if (el.labelText) {
    return `page.getByLabel('${el.labelText.replace(/'/g, "\\'")}')`;
  }
  if (el.placeholder) {
    return `page.getByPlaceholder('${el.placeholder.replace(/'/g, "\\'")}')`;
  }
  if (el.dataTestid) {
    return `page.getByTestId('${el.dataTestid}')`;
  }
  if (el.text && (el.elementType === "button" || el.elementType === "link")) {
    return `page.getByText('${el.text.slice(0, 60).replace(/'/g, "\\'")}')`;
  }
  if (el.name) {
    return `page.locator('[name="${el.name}"]')`;
  }
  if (el.id) {
    return `page.locator('#${el.id}')`;
  }
  return `page.locator('${el.selector ?? el.tag ?? "*"}')`;
}

async function extractNavMenu(page: import("playwright").Page): Promise<NavMenuItem[]> {
  const selectors = [
    "nav a",
    "[role='navigation'] a",
    "header a",
    "aside a",
    "[role='sidebar'] a",
    "[data-testid*='nav'] a",
    "[data-testid*='sidebar'] a",
    "[data-testid*='menu'] a",
  ];
  const combinedSelector = selectors.join(", ");
  const links = await page.$$eval(combinedSelector, (els) =>
    els
      .filter((el): el is HTMLAnchorElement => el instanceof HTMLAnchorElement)
      .map((a) => ({
        text: (a.textContent ?? "").trim().slice(0, 100),
        href: a.getAttribute("href") ?? "",
      }))
      .filter((item) => item.text.length > 0 && item.href.length > 0 && !item.href.startsWith("#")),
  );
  const seen = new Set<string>();
  return links.filter((item) => {
    const key = `${item.text}|${item.href}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

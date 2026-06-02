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
import type { CapturedPage, DiscoveredFlow, ExplorationWorkItem } from "./types";

type AgentAction = {
  type: string;
  pageUrl?: string;
  [key: string]: unknown;
};

const DEFAULT_MAX_STEPS = 25;
const CANCEL_POLL_INTERVAL_MS = 5_000;

const DEFAULT_INSTRUCTION = `Thoroughly explore this web application. Navigate to every accessible page, interact with forms, buttons, menus, and navigation elements. Try to discover hidden flows, error states, modal dialogs, and multi-step processes. Click on every navigation element, fill out forms with test data, and explore different states of the application. Visit each unique page and describe what you find.`;

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

    let skipNavigation = false;

    if (work.auth_mode === "form" && work.username && work.password) {
      const loginPage = await handleFormLogin(stagehand, work, client, log);
      capturedPages.push(loginPage);
      previousUrl = normalizeUrl(loginPage.url) ?? loginPage.url;
      visited.add(previousUrl);
      await client.updateExplorationProgress(
        work.exploration_id,
        `Agent logged in: ${loginPage.title}`,
        capturedPages.length,
      );

      const normalizedLoginUrl = normalizeUrl(work.login_url || work.url);
      if (normalizedLoginUrl && normalizeUrl(loginPage.url) === normalizedLoginUrl) {
        throw new Error("Login failed — still on login page after all attempts");
      }
      skipNavigation = isSameOrigin(loginPage.url, new URL(work.url).origin);
    } else if (work.auth_mode === "cookie" && work.cookie_name && work.cookie_value) {
      await stagehand.context.addCookies([{
        url: work.url,
        name: work.cookie_name,
        value: work.cookie_value,
      }]);
    }

    const page = stagehand.context.activePage() ?? (await stagehand.context.newPage());
    if (!skipNavigation) {
      await page.goto(work.url, { timeoutMs: NAVIGATION_TIMEOUT_MS });
      await sleep(page);
    }

    const origin = new URL(work.url).origin;
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
          if (!isSameOrigin(currentUrl, origin)) return;

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
    const allFlows = deduplicateFlows([...linkBasedFlows, ...actionFlows]);

    await client.completeExploration(work.exploration_id, {
      capturedPages,
      discoveredFlows: allFlows,
      prdCoverage: buildPrdCoverage(work.prd_text, capturedPages, allFlows),
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

"use node";

import { action, internalAction } from "../_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { internal, api } from "../_generated/api";
import { createExplorationAnalysisAgent, createTestGenerationAgent, createHybridTestGenerationAgent, extractMultipleTests, deriveTestName, explorationScenarioSchema, hybridTestStepSchema, buildKbContextBlock, computeKbCoverageGaps } from "./agents";
import { extractJsonFromAiResponse } from "./parse";
import { classifyAiError } from "./errors";
import { aiDelay, aiMaxRetries } from "./aiRateLimit";
import { markSuiteFailed, markSuiteReady } from "./suiteStatus";
import { buildAuthPromptContext, buildNavMenuContext } from "./authContext";
import { formatCapturedPagesForPrompt, type FormattablePage } from "./formatPages";
import { type SnapshotData } from "./snapshotFormatter";
import { buildSnapshotContext } from "./workflowShared";
import { getWorkspaceModel } from "./model";
import { shouldDiscoverFeedback, buildFeedbackActionFromSnapshot, buildFeedbackPromptContext } from "./feedbackDiscovery";
import type { FormattableElement } from "./formatElements";
import type { FeedbackDiscoveryResult } from "./browserClient";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";

const PRD_ANALYSIS_LIMIT = 4000;
const SCENARIO_TIMEOUT_MS = 90_000;
const ACTION_BUDGET_MS = 500_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout: scenario "${label}" exceeded ${Math.round(ms / 1000)}s`)), ms),
    ),
  ]);
}

const PLAYWRIGHT_TEST_RULES = `- Use a single test() call — do NOT use test.describe(), test.beforeEach(), or test.afterEach()
- Navigate to the application URL at the start using page.goto()
- For SPA apps, after login navigate to internal pages by clicking navigation links (sidebar/menu items), NOT by using page.goto() for internal routes
- After page.goto() or navigation, do NOT use waitForLoadState('networkidle') or waitForLoadState('domcontentloaded') — these fire while loading skeletons are still visible and cause tests to pass on skeleton content
- Instead, wait for a specific meaningful element that proves the page finished loading: await expect(page.getByRole('heading', { name: /settings/i })).toBeVisible({ timeout: 15000 })
- The element you wait for must be real content (heading, data, button) — never a skeleton or loading indicator
- Use the EXACT suggested locators from the Interactive Elements section — do NOT invent or guess locators
- Each interactive element shows a "→" line with the recommended Playwright locator. USE IT.
- If a suggested locator includes .nth(N), use it exactly as provided — the index is computed from the element's DOM position among its duplicates
- If no suggested locator exists, use semantic locators: getByRole, getByLabel, getByPlaceholder, getByTestId
- NEVER use raw CSS selectors unless no semantic locator is available
- When the page context shows multiple elements with the same role and text (e.g. repeated CTA buttons across sections), you MUST use the scoped locator from the suggested locators (e.g. page.locator('#features').getByRole(...)). If no scoped locator is available, scope it yourself using the nearest unique ancestor: parent section with id, landmark role (page.getByRole('banner')), or .first()/.nth(N) as a last resort. NEVER use unscoped getByRole/getByText when duplicates exist — Playwright strict mode will throw an error resolving to multiple elements.
- When the page context includes a "Duplicate Text Patterns" section, treat EVERY listed pattern as a strict mode hazard. Never use unscoped getByText with any of those patterns — always scope to a section or use getByRole('heading', ...) instead.
- When the page context includes a "Page Sections" list, use those section IDs for scoping text assertions on non-interactive elements.
- Use web-first assertions: await expect(locator).toBeVisible(), toHaveText(), toContainText(), toHaveURL()
- Never use waitForTimeout() or arbitrary sleeps
- For assertions on non-interactive text (taglines, descriptions, body content), prefer getByRole('heading', { name: /pattern/ }) over getByText. If you must use getByText, always scope it to a section: page.locator('#hero').getByText('pattern'). NEVER use unscoped getByText with regex patterns on pages that may repeat text across sections.
- For assertions, use ONLY text values that appear in the page context (headings, table data, status text). Do NOT fabricate text that isn't shown in the context.
- For URL assertions, use flexible patterns: toHaveURL(/settings/) not toHaveURL(/\/settings\//). Prefer asserting on visible content over URL after navigation.
- NEVER derive URL paths from page titles. A page titled "Dashboard" may live at "/", "/home", or any other path. ALWAYS use the exact URL shown in parentheses in the page context, not a path invented from the title. After login, do NOT assert toHaveURL(/\/dashboard/) unless the auth context explicitly provides the post-login URL containing "dashboard".
- NEVER use getByRole('main'), getByRole('navigation'), getByRole('banner'), or getByRole('contentinfo') as assertion targets — these ARIA landmarks frequently appear multiple times on a page. Use specific headings, visible text, or URL assertions instead.
- For password fields, ALWAYS use page.locator('input[type="password"]') — do NOT use getByLabel('Password') because it may match a "Show password" toggle button whose aria-label contains "Password".
- STRICT MODE IS NON-NEGOTIABLE: When the page context shows the same button or link text repeated across sections (e.g. "Start your free trial" in hero, features, integration, how-it-works, and footer), you MUST scope the locator to a specific section. Example: page.locator('#hero').getByRole('button', { name: 'Start your free trial' }).first(). Unscoped locators for known duplicates WILL cause strict mode failure.
- When a button or link appears multiple times, ALWAYS append .first() even after scoping. Scoping to getByRole('main') is NOT sufficient if duplicates exist in multiple sections within main — only section ID scoping (#hero, #features) eliminates duplicates. When no section ID is available, .first() is mandatory.
- Playwright locators match case-insensitively by substring by default. getByRole('link', { name: 'How It Works' }) will ALSO match "See how it works". When a link/button name could be a substring of another element's text, use { exact: true }: getByRole('link', { name: 'How It Works', exact: true }).
- Do NOT assert toBeVisible() on elements the page context shows as hidden/aria-hidden unless your test triggers them to appear.
- Do NOT assert on framework-internal elements (e.g. __next-route-announcer__, empty role="status" divs) — they are not user-facing.
- Do NOT test keyboard shortcuts or ARIA live region content unless the page context explicitly shows them as interactive features with populated content.
- Do NOT guard assertions with if (await locator.count() > 0) — this makes assertions optional and lets tests pass on skeleton content
- Every test MUST have at least one unconditional assertion that would FAIL if only a loading skeleton were shown
- Wrap the test in a single markdown code fence with language "typescript"`;

function buildScenarioContext(
  url: string,
  authContext: string,
  navMenuContext: string,
  scenario: { name: string; description: string; flow_summary: string },
  pagesContext: string,
  flowContextSection: string,
  prdSection: string,
) {
  return `Application URL: ${url}
${authContext}${navMenuContext}
Scenario: ${scenario.name}
Description: ${scenario.description}
Flow: ${scenario.flow_summary}

Page structure context:
${pagesContext}
${flowContextSection}${prdSection}`;
}

function buildPlaywrightTestPrompt(
  url: string,
  authContext: string,
  navMenuContext: string,
  scenario: { name: string; description: string; flow_summary: string },
  pagesContext: string,
  flowContextSection: string,
  prdSection: string,
) {
  const context = buildScenarioContext(url, authContext, navMenuContext, scenario, pagesContext, flowContextSection, prdSection);
  return `Generate a single Playwright test for the following scenario.

${context}
Generate a single, self-contained Playwright test. Rules:
${PLAYWRIGHT_TEST_RULES}`;
}

async function resolveExplorationContext(ctx: ActionCtx, explorationId: Id<"explorations">) {
  const exploration = await ctx.runQuery(api.explorations.queries.getExploration, {
    exploration_id: explorationId,
  });
  if (!exploration) return null;

  const aiConfig = await ctx.runQuery(internal.ai.model.getWorkspaceAiConfigQuery, {
    workspace_id: exploration.workspace_id,
  });
  const project = await ctx.runQuery(internal.projects.queries.getProjectForAi, {
    project_id: exploration.project_id,
  });

  const navMenuContext = buildNavMenuContext(exploration.nav_menu);
  const pagesContextSummary = formatCapturedPagesForPrompt(exploration.captured_pages ?? [], 3000, "summary");
  const pagesContextDetailed = formatCapturedPagesForPrompt(exploration.captured_pages ?? [], 6000, "detailed");
  const prdSection = project?.prd_text
    ? `\nPRD / Product Requirements:\n${project.prd_text.slice(0, PRD_ANALYSIS_LIMIT)}\n`
    : "";

  return { exploration, aiConfig, project, navMenuContext, pagesContextSummary, pagesContextDetailed, prdSection, capturedPages: exploration.captured_pages ?? [], discoveredPages: exploration.discovered_pages ?? [] };
}

function buildFilteredPagesContext(
  capturedPages: FormattablePage[],
  relevantUrls: string[] | undefined,
  budget: number,
): string {
  if (!relevantUrls || relevantUrls.length === 0) {
    return formatCapturedPagesForPrompt(capturedPages, budget, "detailed");
  }
  const urlSet = new Set(relevantUrls);
  const filtered = capturedPages.filter((p) => urlSet.has(p.url));
  return formatCapturedPagesForPrompt(filtered.length > 0 ? filtered : capturedPages, budget, "detailed");
}

function getInteractiveElementsForUrl(
  capturedPages: FormattablePage[],
  url: string,
): FormattableElement[] | undefined {
  const page = capturedPages.find(
    (p) => p.url === url || p.url.replace(/\/$/, "") === url.replace(/\/$/, ""),
  );
  return page?.interactive_elements;
}

async function runFeedbackDiscovery(
  ctx: ActionCtx,
  scenario: { name: string; flow_summary?: string; relevant_page_urls?: string[] },
  capturedPages: FormattablePage[],
  projectId: Id<"projects">,
  workspaceId: Id<"workspaces">,
  callerLabel: string,
): Promise<FeedbackDiscoveryResult | null> {
  if (!shouldDiscoverFeedback(scenario)) return null;

  const elements = scenario.relevant_page_urls?.[0]
    ? getInteractiveElementsForUrl(capturedPages, scenario.relevant_page_urls[0])
    : undefined;
  const feedbackAction = buildFeedbackActionFromSnapshot(scenario, elements);
  if (!feedbackAction || !scenario.relevant_page_urls?.[0]) return null;

  try {
    return await ctx.runAction(
      internal.ai.feedbackDiscovery.discoverFeedbackAction,
      {
        url: scenario.relevant_page_urls[0],
        project_id: projectId,
        workspace_id: workspaceId,
        action: feedbackAction,
      },
    ) as FeedbackDiscoveryResult | null;
  } catch (err) {
    console.error(`[${callerLabel}] Feedback discovery failed for "${scenario.name}":`, err);
    return null;
  }
}

function mergeLiveAndExplorationContext(
  liveSnapshots: SnapshotData[],
  explorationPagesCtx: string,
): string {
  if (liveSnapshots.length === 0) return explorationPagesCtx;
  const liveContext = buildSnapshotContext(liveSnapshots);
  const guidance = "\nIMPORTANT: The LIVE PAGE CONTEXT above is the primary source for locators. Use its elements and locators over the exploration flow context when they differ.";
  return `${liveContext}${guidance}\n\nExploration flow context (navigation and flow information):\n${explorationPagesCtx}`;
}

async function fetchLiveSnapshotsForScenario(
  ctx: ActionCtx,
  relevantUrls: string[] | undefined,
  projectId: Id<"projects">,
  workspaceId: Id<"workspaces">,
): Promise<SnapshotData[]> {
  if (!relevantUrls || relevantUrls.length === 0) return [];

  const results = await Promise.allSettled(
    relevantUrls.map((url) =>
      ctx.runAction(internal.ai.snapshotAction.getLiveSnapshot, {
        url,
        project_id: projectId,
        workspace_id: workspaceId,
      }).catch(() => null as SnapshotData | null)
    ),
  );
  return results
    .map((r) => (r.status === "fulfilled" ? r.value : null))
    .filter((s): s is SnapshotData => s !== null);
}

async function validateGeneratedTest(
  ctx: ActionCtx,
  opts: {
    app_url: string;
    project_id: Id<"projects">;
    workspace_id: Id<"workspaces">;
    code: string;
    hasSnapshots: boolean;
  },
): Promise<{ validated: boolean }> {
  if (!opts.hasSnapshots) return { validated: false };

  try {
    const result: { passed: boolean } | null = await ctx.runAction(
      internal.ai.snapshotAction.validateTest,
      {
        url: opts.app_url,
        project_id: opts.project_id,
        workspace_id: opts.workspace_id,
        playwright_code: opts.code,
      },
    );
    return { validated: result?.passed === true };
  } catch {
    return { validated: false };
  }
}

const ANALYSIS_PROMPT = `You are a senior QA engineer analyzing a web application to identify testable scenarios.

Analyze each page individually based on its content, interactive elements, and complexity. Propose test scenarios driven by what each page actually contains.

Analysis rules:
- For pages with FORMS: propose scenarios for valid submission, invalid input handling, required field validation, and error message display
- For pages with TABLES or DATA LISTS: propose scenarios for data rendering, column sorting, filtering, pagination, and empty states
- For pages with NAVIGATION elements: propose scenarios for link correctness, active state highlighting, and page transitions
- For pages with MODALS or DIALOGS: propose scenarios for opening, interacting with, and dismissing
- For pages with DASHBOARDS or CHARTS: propose scenarios for data visualization rendering, date range filters, and data accuracy
- For pages with SETTINGS or CONFIGURATION forms: propose scenarios for saving changes, resetting, and validation
- For pages with AUTHENTICATION: propose scenarios for login, logout, session persistence, and unauthorized access redirects
- For simple static pages: a single scenario for correct content rendering may suffice
- For complex pages with many interactive elements: propose multiple focused scenarios, each testing a distinct interaction or feature
- Each scenario MUST reference specific elements, text, or features found on the page — never propose generic scenarios disconnected from the actual content
- Propose as many scenarios as the content warrants. A 15-page app with rich functionality should have 25-50+ scenarios. A 3-page app with simple content may only need 5-8. Let the content decide.

Group scenarios by area (e.g. "Authentication", "Dashboard", "Settings", "Data Management", "Navigation").

IMPORTANT: Respond with ONLY a valid JSON array. No markdown, no code fences, no explanation — just the raw JSON array. Each element must have exactly these fields:
- "name": string — concise scenario name that includes the specific feature being tested
- "description": string — what the scenario tests and why it matters
- "flowSummary": string — step-by-step flow the test will execute
- "area": string — app area category (e.g. "Authentication", "Dashboard", "Settings", "Navigation")
- "relatedFlows": array of strings (optional) — names of discovered flows this scenario covers. Only include if the scenario clearly exercises a listed flow's steps.
- "relevantPageUrls": array of strings — the URLs of captured pages this scenario tests. Must be exact URLs from the "Captured pages" list above. Only include pages directly exercised by the scenario.
- "kbModule": string (optional) — the EXACT name of the Knowledge Base module this scenario corresponds to. Only include when KB module context is provided above AND the scenario clearly maps to one module. Use the module name verbatim. Omit if no KB context or no clear match.`;

async function markAllSuitesFailed(
  ctx: ActionCtx,
  suiteIds: { area: string; suite_id: Id<"suites"> }[],
  error: string,
) {
  for (const s of suiteIds) {
    await markSuiteFailed(ctx, s.suite_id, error);
  }
}

export const analyzeExploration = internalAction({
  args: { exploration_id: v.id("explorations") },
  handler: async (ctx, args) => {
    const exploration = await ctx.runQuery(internal.explorations.internal.getExplorationForAnalysis, {
      exploration_id: args.exploration_id,
    });

    if (!exploration) {
      throw new ConvexError("Exploration not found");
    }

    if (exploration.captured_pages.length === 0) {
      await ctx.runMutation(internal.explorations.internal.updateExplorationStatus, {
        exploration_id: args.exploration_id,
        status: "failed",
        error_message: "No pages were captured during exploration.",
      });
      return;
    }

    await ctx.runMutation(internal.explorations.internal.updateExplorationStatus, {
      exploration_id: args.exploration_id,
      status: "analyzing",
      progress_message: "AI is analyzing captured pages...",
    });

    const aiConfig = await ctx.runQuery(internal.ai.model.getWorkspaceAiConfigQuery, {
      workspace_id: exploration.workspace_id,
    });

    const project = await ctx.runQuery(internal.projects.queries.getProjectForAi, {
      project_id: exploration.project_id,
    });

    let scenarios: { name: string; description: string; flow_summary: string; area: string }[];
    let kbCoverageGaps: string[] | undefined = undefined;
    try {
      const agent = createExplorationAnalysisAgent(
        (await import("./model")).getWorkspaceModel(aiConfig),
      );
      const { thread } = await agent.createThread(ctx, {
        title: `Exploration Analysis — ${exploration.url}`,
      });

      const pagesDescription = formatCapturedPagesForPrompt(exploration.captured_pages, 4000, "summary");

      const flowsDescription = exploration.discovered_flows
        ?.map((f: { name: string; complexity: string; steps: string[]; pages_involved: number[] }) => `Flow: ${f.name} (${f.complexity})\nSteps: ${f.steps.join(" → ")}\nPages: ${f.pages_involved.join(", ")}`)
        .join("\n\n") ?? "";

      const prdText = project?.prd_text;
      const prdSection = prdText
        ? `\nPRD / Product Requirements:\n${prdText.slice(0, PRD_ANALYSIS_LIMIT)}\n\nIMPORTANT: Cross-reference the discovered pages and flows against the PRD above. For each PRD feature:\n- If found during exploration, note it in the scenario description\n- If NOT found, still propose a scenario for it and mark it as "PRD requirement — not found during exploration"\n`
        : "";

      const kb = await ctx.runQuery(internal.ai.tools.queries.readKnowledgeBaseQuery, {
        project_id: exploration.project_id,
      });
      const kbContext = buildKbContextBlock(kb, null);
      const kbContextSection = kbContext
        ? `\nKnowledge Base modules:\n${kbContext}\n\nIMPORTANT: Cross-reference the discovered pages above against these Knowledge Base modules. For each scenario that clearly maps to a module, set "kbModule" to the EXACT module name verbatim.\n`
        : "";

      const prdCoverageSection = exploration.prd_coverage
        ? `\nPRD keyword coverage (preliminary):\n${exploration.prd_coverage.map((c: { feature: string; found: boolean }) => `- ${c.feature}: ${c.found ? "Found" : "NOT FOUND"}`).join("\n")}\n`
        : "";

      const result = await thread.generateText({
        maxRetries: aiMaxRetries,
        prompt: `Application: ${exploration.url}

Captured pages:
${pagesDescription}
${flowsDescription ? `\nDiscovered navigation flows:\n${flowsDescription}\n` : ""}${kbContextSection}${prdSection}${prdCoverageSection}${exploration.goal ? `\nUser's testing goal: ${exploration.goal}\n\nPrioritize scenarios that align with this goal, but also include important general scenarios.\n` : ""}

${ANALYSIS_PROMPT}`,
      });

      const text = result.text.trim();
      const jsonStart = text.indexOf("[");
      if (jsonStart === -1) {
        throw new Error("AI response did not contain a JSON array");
      }
      let depth = 0;
      let jsonEnd = -1;
      for (let i = jsonStart; i < text.length; i++) {
        if (text[i] === "[") depth++;
        if (text[i] === "]") depth--;
        if (depth === 0) { jsonEnd = i; break; }
      }
      if (jsonEnd === -1) {
        throw new Error("AI response contained unclosed JSON array");
      }
      const parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1));
      const validated = explorationScenarioSchema.array().parse(parsed);
      scenarios = validated.map((s) => ({
        name: s.name,
        description: s.description,
        flow_summary: s.flowSummary,
        area: s.area,
        related_flows: s.relatedFlows,
        relevant_page_urls: s.relevantPageUrls,
        kb_module: s.kbModule,
      }));
      kbCoverageGaps = kb ? computeKbCoverageGaps(kb.modules.map((m) => m.name), validated) : undefined;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      await ctx.runMutation(internal.explorations.internal.updateExplorationStatus, {
        exploration_id: args.exploration_id,
        status: "failed",
        error_message: msg,
      });
      return;
    }

    await ctx.runMutation(internal.explorations.internal.storeProposedScenarios, {
      exploration_id: args.exploration_id,
      scenarios,
      kb_coverage_gaps: kbCoverageGaps,
    });
  },
});

export const generateExplorationTests = action({
  args: {
    exploration_id: v.id("explorations"),
    selected_scenarios: v.array(
      v.object({
        name: v.string(),
        description: v.string(),
        flow_summary: v.string(),
        area: v.string(),
        related_flows: v.optional(v.array(v.string())),
        relevant_page_urls: v.optional(v.array(v.string())),
      }),
    ),
    suite_ids: v.array(
      v.object({
        area: v.string(),
        suite_id: v.id("suites"),
      }),
    ),
    flow_context: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const resolved = await resolveExplorationContext(ctx, args.exploration_id);
    if (!resolved) {
      await markAllSuitesFailed(ctx, args.suite_ids, "Exploration not found");
      throw new ConvexError("Exploration not found");
    }

    if (args.selected_scenarios.length === 0) {
      await markAllSuitesFailed(ctx, args.suite_ids, "No scenarios selected");
      throw new ConvexError("No scenarios selected");
    }

    const { exploration, aiConfig, project, navMenuContext, pagesContextDetailed, prdSection, capturedPages, discoveredPages } = resolved;
    console.log(`[generateExplorationTests] project auth: mode=${(project as Record<string, unknown> | null)?.explore_auth_mode}, username=${(project as Record<string, unknown> | null)?.explore_username ?? "(none)"}`);
    const flowContextSection = args.flow_context
      ? `\nDiscovered navigation flow context:\n${args.flow_context}\n`
      : "";

    const areaSuiteMap = new Map(args.suite_ids.map((s) => [s.area, s.suite_id]));
    const failedAreas = new Set<string>();

    const BATCH_SIZE = 5;
    const totalScenarios = args.selected_scenarios.length;

    const promptTemplate = (scenario: typeof args.selected_scenarios[number], kind: "playwright" | "hybrid", liveSnapshots: SnapshotData[], feedbackResult: FeedbackDiscoveryResult | null) => {
      const authContext = buildAuthPromptContext(project, scenario, discoveredPages, capturedPages);
      const pagesCtx = buildFilteredPagesContext(capturedPages, scenario.relevant_page_urls, 6000);
      const pagesSection = mergeLiveAndExplorationContext(liveSnapshots, pagesCtx);
      const feedbackContext = buildFeedbackPromptContext(feedbackResult, scenario.flow_summary || scenario.name);
      const context = buildScenarioContext(exploration.url, authContext, navMenuContext, scenario, pagesSection, flowContextSection, prdSection) + feedbackContext;
      if (kind === "playwright") {
        return `Generate a single Playwright test for the following scenario.\n\n${context}\nGenerate a single, self-contained Playwright test. Rules:\n${PLAYWRIGHT_TEST_RULES}`;
      }
      return `Generate test steps for the following scenario.\n\n${context}\nGenerate 3-8 steps that cover this scenario. Use exact element labels and text from the page context.`;
    };

    const allTestBlocks: { name: string; code: string; steps?: { instruction: string; assertion_code?: string; expected_outcome?: string }[]; area: string; hasSnapshots: boolean }[] = [];

    for (let batchStart = 0; batchStart < totalScenarios; batchStart += BATCH_SIZE) {
      const batchEnd = Math.min(batchStart + BATCH_SIZE, totalScenarios);
      const batch = args.selected_scenarios.slice(batchStart, batchEnd);

      const progressMsg = `Generating tests ${batchStart + 1}-${batchEnd} of ${totalScenarios}...`;
      for (const { suite_id } of args.suite_ids) {
        await ctx.runMutation(internal.suites.mutations.updateSuiteStatus, {
          suite_id,
          status: "generating",
          progress_message: progressMsg,
        });
      }

      await aiDelay();
      const batchResults = await Promise.allSettled(
        batch.map(async (scenario) => {
          const liveSnapshots = await fetchLiveSnapshotsForScenario(
            ctx,
            scenario.relevant_page_urls,
            exploration.project_id,
            exploration.workspace_id,
          );
          const hasSnapshots = liveSnapshots.length > 0;

          const feedbackResult = await runFeedbackDiscovery(
            ctx, scenario, capturedPages,
            exploration.project_id, exploration.workspace_id,
            "generateExplorationTests",
          );

          const model = (await import("./model")).getWorkspaceModel(aiConfig);

          const [playwrightResult, hybridResult] = await withTimeout(
            Promise.all([
              (async () => {
                const agent = createTestGenerationAgent(model);
                const { thread } = await agent.createThread(ctx, {
                  title: `Test Generation — ${scenario.name}`,
                });
                return thread.generateText({
                  maxRetries: aiMaxRetries,
                  prompt: promptTemplate(scenario, "playwright", liveSnapshots, feedbackResult),
                });
              })(),
              (async () => {
                try {
                  const hybridAgent = createHybridTestGenerationAgent(model);
                  const { thread } = await hybridAgent.createThread(ctx, {
                    title: `Hybrid Steps — ${scenario.name}`,
                  });
                  return await thread.generateText({
                    maxRetries: aiMaxRetries,
                    prompt: promptTemplate(scenario, "hybrid", liveSnapshots, feedbackResult),
                  });
                } catch (err) {
                  console.error(`[generateExplorationTests] Hybrid step generation failed for "${scenario.name}":`, err);
                  return null;
                }
              })(),
            ]),
            SCENARIO_TIMEOUT_MS,
            scenario.name,
          );

          const blocks = extractMultipleTests(playwrightResult.text);
          const hybridSteps = hybridResult
            ? extractJsonFromAiResponse(hybridResult.text, hybridTestStepSchema.array()) ?? undefined
            : undefined;

          return blocks.map((block, i) => ({
            name: deriveTestName(block, i),
            code: block,
            steps: hybridSteps,
            area: scenario.area,
            hasSnapshots,
          }));
        }),
      );

      for (let i = 0; i < batchResults.length; i++) {
        const result = batchResults[i];
        if (result.status === "fulfilled") {
          allTestBlocks.push(...result.value);
        } else {
          const scenario = batch[i];
          failedAreas.add(scenario.area);
          console.error(`[generateExplorationTests] Failed to generate test for scenario "${scenario.name}":`, result.reason);
        }
      }
    }

    const areaGroups = new Map<string, { name: string; code: string; steps?: { instruction: string; assertion_code?: string; expected_outcome?: string }[]; area: string; hasSnapshots: boolean }[]>();
    for (const block of allTestBlocks) {
      const existing = areaGroups.get(block.area) ?? [];
      existing.push(block);
      areaGroups.set(block.area, existing);
    }

    const suiteIds: string[] = [];
    const testIds: string[] = [];

    for (const [area, blocks] of areaGroups) {
      const suiteId = areaSuiteMap.get(area);
      if (!suiteId) continue;

      suiteIds.push(suiteId);

      for (const block of blocks) {
        const { validated } = await validateGeneratedTest(ctx, {
          app_url: exploration.url,
          project_id: exploration.project_id,
          workspace_id: exploration.workspace_id,
          code: block.code,
          hasSnapshots: block.hasSnapshots,
        });

        const testId: string = await ctx.runMutation(internal.tests.mutations.createTestFromGeneration, {
          suite_id: suiteId,
          name: block.name,
          playwright_code: block.code,
          steps: block.steps,
          source_type: "url_exploration",
          validated: block.hasSnapshots ? validated : undefined,
        });
        testIds.push(testId);
      }

      await markSuiteReady(ctx, suiteId);
    }

    for (const [area, suiteId] of areaSuiteMap) {
      if (!areaGroups.has(area)) {
        await markSuiteFailed(
          ctx,
          suiteId,
          failedAreas.has(area)
            ? "AI failed to generate tests for this area"
            : "No test blocks generated for this area",
        );
      }
    }

    await ctx.runMutation(internal.explorations.internal.updateExplorationStatus, {
      exploration_id: args.exploration_id,
      status: "completed",
      progress_message: "Tests generated successfully.",
    });

    return { suiteIds, testIds, testNameCount: testIds.length };
  },
});

export const generateExplorationTestsForArea = action({
  args: {
    exploration_id: v.id("explorations"),
    scenarios: v.array(
      v.object({
        name: v.string(),
        description: v.string(),
        flow_summary: v.string(),
        area: v.string(),
        related_flows: v.optional(v.array(v.string())),
        relevant_page_urls: v.optional(v.array(v.string())),
      }),
    ),
    suite_id: v.id("suites"),
    area: v.string(),
    flow_context: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const resolved = await resolveExplorationContext(ctx, args.exploration_id);
    if (!resolved) {
      await markSuiteFailed(ctx, args.suite_id, "Exploration not found");
      return { testIds: [] as string[], failed: 0 };
    }

    if (args.scenarios.length === 0) {
      await markSuiteFailed(ctx, args.suite_id, "No scenarios provided");
      return { testIds: [] as string[], failed: 0 };
    }

    const { exploration, aiConfig, project, navMenuContext, pagesContextDetailed, prdSection, capturedPages, discoveredPages } = resolved;
    const flowContextSection = args.flow_context
      ? `\nDiscovered navigation flow context:\n${args.flow_context}\n`
      : "";

    const model = getWorkspaceModel(aiConfig);
    const testIds: string[] = [];
    let failed = 0;
    const failedScenarioNames: string[] = [];
    const startTime = Date.now();

    for (let i = 0; i < args.scenarios.length; i++) {
      const scenario = args.scenarios[i];

      if (Date.now() - startTime > ACTION_BUDGET_MS) {
        const remaining = args.scenarios.length - i;
        console.log(`[generateExplorationTestsForArea] Time budget reached — generated ${testIds.length} tests, skipping ${remaining} remaining scenarios`);
        await ctx.runMutation(internal.suites.mutations.updateSuiteStatus, {
          suite_id: args.suite_id,
          status: "generating",
          progress_message: `Generated ${testIds.length} tests — ${remaining} scenarios skipped due to time budget`,
        });
        break;
      }

      await ctx.runMutation(internal.suites.mutations.updateSuiteStatus, {
        suite_id: args.suite_id,
        status: "generating",
        progress_message: `Generating test ${i + 1}/${args.scenarios.length}: ${scenario.name}`,
      });

      try {
        const liveSnapshots = await fetchLiveSnapshotsForScenario(
          ctx,
          scenario.relevant_page_urls,
          exploration.project_id,
          exploration.workspace_id,
        );
        const hasSnapshots = liveSnapshots.length > 0;

        const feedbackResult = await runFeedbackDiscovery(
          ctx, scenario, capturedPages,
          exploration.project_id, exploration.workspace_id,
          "generateExplorationTestsForArea",
        );

        const pagesCtx = buildFilteredPagesContext(capturedPages, scenario.relevant_page_urls, 6000);
        const pagesSection = mergeLiveAndExplorationContext(liveSnapshots, pagesCtx);
        const feedbackContext = buildFeedbackPromptContext(feedbackResult, scenario.flow_summary || scenario.name);

        const agent = createTestGenerationAgent(model);
        const { thread } = await agent.createThread(ctx, {
          title: `Test — ${scenario.name}`,
        });

      const authContext = buildAuthPromptContext(project, scenario, discoveredPages, capturedPages);
        const prompt = buildPlaywrightTestPrompt(
          exploration.url, authContext, navMenuContext, scenario, pagesSection, flowContextSection, prdSection,
        ) + feedbackContext;

        await aiDelay();
        const result = await withTimeout(
          thread.generateText({ prompt, maxRetries: aiMaxRetries }),
          SCENARIO_TIMEOUT_MS,
          scenario.name,
        );

        const blocks = extractMultipleTests(result.text);

        for (let j = 0; j < blocks.length; j++) {
          const { validated } = await validateGeneratedTest(ctx, {
            app_url: exploration.url,
            project_id: exploration.project_id,
            workspace_id: exploration.workspace_id,
            code: blocks[j],
            hasSnapshots,
          });

          const testId: string = await ctx.runMutation(internal.tests.mutations.createTestFromGeneration, {
            suite_id: args.suite_id,
            name: deriveTestName(blocks[j], j),
            playwright_code: blocks[j],
            source_type: "url_exploration",
            validated: hasSnapshots ? validated : undefined,
          });
          testIds.push(testId);
        }

        console.log(`[generateExplorationTestsForArea] ${scenario.name}: ${blocks.length} test(s) generated (live snapshots: ${hasSnapshots})`);
      } catch (err) {
        failed++;
        failedScenarioNames.push(scenario.name);
        console.error(`[generateExplorationTestsForArea] Failed for "${scenario.name}":`, err);
      }
    }

    if (testIds.length > 0) {
      if (failedScenarioNames.length > 0) {
        await ctx.runMutation(internal.suites.mutations.updateSuiteStatus, {
          suite_id: args.suite_id,
          status: "ready",
          failed_scenarios: failedScenarioNames,
        });
      } else {
        await markSuiteReady(ctx, args.suite_id);
      }
    } else {
      await markSuiteFailed(ctx, args.suite_id, failed > 0 ? `AI failed to generate tests for all ${args.scenarios.length} scenarios` : "No test blocks generated", failedScenarioNames);
    }

    return { testIds, failed };
  },
});

export const retryExplorationGeneration = action({
  args: {
    suite_id: v.id("suites"),
  },
  handler: async (ctx, args) => {
    const suite = await ctx.runQuery(api.suites.queries.getSuite, {
      suite_id: args.suite_id,
    });
    if (!suite) {
      throw new ConvexError("Suite not found");
    }

    if (!suite.exploration_id) {
      throw new ConvexError("Suite has no associated exploration");
    }

    if (!suite.area) {
      throw new ConvexError("Suite has no area");
    }

    const exploration = await ctx.runQuery(api.explorations.queries.getExploration, {
      exploration_id: suite.exploration_id as Id<"explorations">,
    });
    if (!exploration) {
      throw new ConvexError("Exploration not found");
    }

    const allScenarios = exploration.proposed_scenarios ?? [];
    const areaScenarios = allScenarios.filter((s: { area: string }) => s.area === suite.area);

    if (areaScenarios.length === 0) {
      throw new ConvexError(`No scenarios found for area "${suite.area}"`);
    }

    await ctx.runAction(api.ai.exploreApp.generateExplorationTestsForArea, {
      exploration_id: suite.exploration_id as Id<"explorations">,
      scenarios: areaScenarios,
      suite_id: args.suite_id,
      area: suite.area,
    });
  },
});

export const retryFailedScenarios = action({
  args: {
    suite_id: v.id("suites"),
  },
  handler: async (ctx, args) => {
    const suite = await ctx.runQuery(api.suites.queries.getSuite, {
      suite_id: args.suite_id,
    });
    if (!suite) {
      throw new ConvexError("Suite not found");
    }

    if (!suite.exploration_id) {
      throw new ConvexError("Suite has no associated exploration");
    }

    if (!suite.area) {
      throw new ConvexError("Suite has no area");
    }

    if (!suite.failed_scenarios || suite.failed_scenarios.length === 0) {
      throw new ConvexError("No failed scenarios to retry");
    }

    const exploration = await ctx.runQuery(api.explorations.queries.getExploration, {
      exploration_id: suite.exploration_id as Id<"explorations">,
    });
    if (!exploration) {
      throw new ConvexError("Exploration not found");
    }

    const allScenarios = exploration.proposed_scenarios ?? [];
    const failedNames = new Set(suite.failed_scenarios);
    const failedScenarios = allScenarios.filter(
      (s: { name: string; area: string }) =>
        s.area === suite.area && failedNames.has(s.name),
    );

    if (failedScenarios.length === 0) {
      throw new ConvexError("Failed scenarios no longer found in exploration data");
    }

    await ctx.runMutation(internal.suites.mutations.updateSuiteStatus, {
      suite_id: args.suite_id,
      status: "generating",
      failed_scenarios: undefined,
      progress_message: `Retrying ${failedScenarios.length} failed scenario(s)...`,
    });

    ctx.scheduler.runAfter(0, api.ai.exploreApp.generateExplorationTestsForArea, {
      exploration_id: suite.exploration_id as Id<"explorations">,
      scenarios: failedScenarios,
      suite_id: args.suite_id,
      area: suite.area,
    });
  },
});

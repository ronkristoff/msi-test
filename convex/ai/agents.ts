import { Agent, type Config } from "@convex-dev/agent";
import { components } from "../_generated/api";
import { z } from "zod/v3";

type AgentModel = Config extends { languageModel?: infer M } ? M : never;
import { createToolDefinitions } from "./tools/definitions";
import { TEST_GEN_KB_CONTEXT_CHARS } from "../lib/constraints";
import type { ReadKnowledgeBaseResult, ReadBaselineRdResult } from "./tools/logic";

export const explorationScenarioSchema = z.object({
  name: z.string(),
  description: z.string(),
  flowSummary: z.string(),
  area: z.string(),
  relatedFlows: z.array(z.string()).optional(),
  relevantPageUrls: z.array(z.string()).optional(),
  kbModule: z.string().optional(),
});

export const failureAnalysisSchema = z.object({
  rootCause: z.string(),
  suggestedFix: z.string(),
  confidenceScore: z.number().min(0).max(1),
});

export const hybridTestStepSchema = z.object({
  instruction: z.string(),
  assertion_code: z.string().optional(),
  expected_outcome: z.string().optional(),
});

export const TEST_GENERATION_PROMPT = `You are MSITest's Test Generation Agent. You write Playwright test code for web applications.

Given a description of user flows, page structure, or product requirements, you generate complete, runnable Playwright test code.

## LIVE PAGE CONTEXT

When live page context is provided in the prompt, you MUST use elements and locators from this context. The context includes an accessibility tree and interactive elements with suggested locators. Use those exact locators.

## Locator Strategy

Each interactive element in the context includes a "→" line with the recommended Playwright locator. USE THAT EXACT LOCATOR. Do NOT invent alternatives.

When no suggested locator exists, use this priority order:
1. getByRole — e.g. page.getByRole('button', { name: 'Login' })
2. getByLabel / getByPlaceholder — e.g. page.getByLabel('Username'), page.getByPlaceholder('Password')
3. getByTestId — when data-test attributes are provided in the page context
4. NEVER use raw CSS selectors (page.locator('.class')), XPath, or guess selectors not provided in context

## Duplicate Element Rules

When the page context shows multiple elements with the same role and text (e.g. repeated CTA buttons across sections), Playwright's strict mode will throw an error. You MUST handle this.

Preferred approach — use the EXACT scoped suggested locators from the page context. The suggested locators are pre-scoped when duplicates are detected:
- page.locator('#features').getByRole('button', { name: 'Sign up' })

If a suggested locator includes .nth(N), use it exactly as provided — the index is computed from the element's DOM position among its duplicates:
- page.getByRole('button', { name: 'Sign up' }).nth(0)

If no scoped locator is available, scope the locator yourself using the nearest unique ancestor in this priority order:
1. Parent section with an id: page.locator('#section-id').getByRole('button', { name: 'Sign up' })
2. Landmark role (when unique on the page): page.getByRole('banner').getByRole('button', { name: 'Sign up' }) or page.getByRole('region', { name: 'Features' }).getByRole('button', { name: 'Sign up' })
3. .first() or .nth(N) as a last resort: page.getByRole('button', { name: 'Sign up' }).first()

NEVER use unscoped getByRole/getByText/getByPlaceholder when the page context shows the same element repeated — Playwright will fail with "strict mode violation: resolved to N elements".

## Grounding Rules

Every selector must originate from the page context, the suggested locator, or the approved locator strategy. Every asserted text value must originate from the page context.

Never invent routes, URLs, API responses, credentials, table values, labels, headings, buttons, links, validation messages, status text, or user data.

If required information is missing for an assertion, omit that assertion entirely rather than guessing. Generate the test for the flows and verifications that can be grounded in the page context.

## Authentication Rules

If credentials are provided in the page context, perform login using the provided flow. Never invent usernames, emails, passwords, tokens, API keys, or authentication values. If authentication is required but credentials are not provided, generate only the authenticated portion as comments explaining what information is missing.

## Assertion Rules

Use ONLY text values that appear in the page context. Do NOT fabricate text that isn't shown.

Use web-first assertions: await expect(locator).toBeVisible(), toHaveText(), toContainText(), toHaveURL(), toBeEnabled(). Never use generic expect() for DOM state — always use expect(locator).matcher().

Never use waitForTimeout() or arbitrary sleeps — Playwright auto-waits for actionability. Do NOT use waitForLoadState() — it fires while loading skeletons are still visible. Wait for real content instead.

## Text Assertion Duplicate Rules

When the page context shows the same text or similar text patterns appearing in multiple places (e.g. the same tagline in both a hero section and a footer, or a CTA phrase repeated across sections), getByText with a regex or substring will match ALL of them — Playwright strict mode will throw "resolved to N elements".

To avoid this:
1. Prefer getByRole('heading', { name: /exact text/ }) over getByText — headings are usually unique per section
2. If you must assert on non-heading text, scope to the nearest parent section: page.locator('#hero').getByText('14-day free trial')
3. NEVER use unscoped getByText with a regex or substring unless you are certain the text is unique on the page
4. If the page context includes a "Duplicate Text Patterns" warning, treat every listed pattern as a strict mode hazard — always scope or use a more specific locator

When the page context includes a "Page Sections" list with IDs, use those section IDs for scoping text assertions.

## Assertion Anti-Patterns

NEVER guard assertions with if (await locator.count() > 0) — this makes assertions optional so the test passes even when the page shows only skeletons. NEVER use conditional patterns like "if visible, assert visible" — every assertion must be unconditional. Do NOT assert on skeleton/loading elements — only assert on real content. Every test MUST have at least one unconditional assertion that would FAIL if only a skeleton were shown.

## Dynamic Content Rules

When content is user-specific, environment-specific, date-specific, or data-driven, avoid asserting exact values. Prefer asserting stable headings, labels, status indicators, section visibility, and known UI structure.

## Table Rules

Prefer asserting column headers, stable statuses, table structure, and row existence. Avoid asserting IDs, invoice numbers, order numbers, timestamps, or user-generated values unless explicitly required by the page context.

## URL Assertion Rules

Use flexible URL matching: toHaveURL(/settings/) NOT toHaveURL(/\\/settings\\//) — prefer substring patterns over path-segment patterns. Do NOT assert exact URL paths unless the page context shows the exact route. After clicking a navigation link, prefer asserting on visible page content (heading, key element) over the URL.

NEVER derive URL paths from page titles. A page titled "Dashboard" may live at "/", "/home", or any other path. ALWAYS use the exact URL shown in parentheses in the page context, not a path invented from the title. After login, do NOT assert toHaveURL(/\/dashboard/) unless the auth context explicitly provides the post-login URL containing "dashboard". The not.toHaveURL assertion is sufficient to confirm successful login.

## Landmark Role Rules

NEVER use getByRole('main'), getByRole('navigation'), getByRole('banner'), or getByRole('contentinfo') as assertion targets — these are ARIA landmarks that frequently appear multiple times on a page (e.g. one in the app shell layout and one in the content area). Use specific headings, visible text, or URL assertions to verify page load instead. Example: replace await expect(page.getByRole('main')).toBeVisible() with await expect(page.getByRole('heading', { name: /welcome/i })).toBeVisible() or await expect(page).toHaveURL(/settings/).

## Password Field Rules

For password fields, ALWAYS use page.locator('input[type="password"]') — do NOT use getByLabel('Password') because it may match a "Show password" toggle button whose aria-label contains "Password".

## Strict Mode Enforcement

STRICT MODE IS NON-NEGOTIABLE: When the page context shows the same button or link text repeated across sections (e.g. "Start your free trial" in hero, features, integration, how-it-works, and footer), you MUST scope the locator to a specific section. Example: page.locator('#hero').getByRole('button', { name: 'Start your free trial' }).first(). Unscoped locators for known duplicates WILL cause strict mode failure.

When a button or link appears multiple times, ALWAYS append .first() even after scoping. Scoping to getByRole('main') is NOT sufficient if duplicates exist in multiple sections within main — only section ID scoping (#hero, #features) eliminates duplicates. When no section ID is available, .first() is mandatory.

## Element Visibility Rules

Before asserting toBeVisible(), check if the page context shows the element as hidden or aria-hidden. If so, do NOT assert visibility unless your test triggers the element to appear. Do NOT assert on framework-internal elements (id containing "__next", role="status" with empty content, __next-route-announcer__). Do NOT test ARIA live regions unless the page context shows them populated. Do NOT test keyboard shortcuts unless explicitly documented.

## Dialog Rules

When interacting with dialogs or modals: assert the dialog is visible first, scope all interactions to the dialog, and assert it is hidden after closing. Dialogs are a special case of the Duplicate Element Rules — always scope locators to the dialog to avoid matching elements outside it.

## Error State Rules

Generate negative-path tests only when validation messages, error states, or failure behavior are explicitly shown in the page context. Never invent validation messages, error states, or failure scenarios.

## Navigation and Loading Rules

For SPA apps, after login navigate to internal pages by clicking navigation links (sidebar/menu items), NOT by using page.goto() for internal routes. After page.goto() or navigation, do NOT use waitForLoadState('networkidle') or waitForLoadState('domcontentloaded'). Instead, wait for a specific meaningful element: await expect(page.getByRole('heading', { name: /settings/i })).toBeVisible({ timeout: 15000 }). The element must be real content, not a loading indicator.

## Form Submission Resilience

When a test submits a form (clicks Create/Save/Submit), wrap the submission in a retry loop to handle intermittent backend timeouts.
Pattern: click submit, check if dialog closes (success) or stays open (failure). If still open, retry up to 3 times.
Example:
  for (let attempt = 0; attempt < 3; attempt++) {
    await submitBtn.click();
    const closed = await expect(dialog).toBeHidden({ timeout: 10000 }).then(() => true).catch(() => false);
    if (closed) break;
  }
  await expect(dialog).toBeHidden({ timeout: 5000 });

## Structure Rules

Always use @playwright/test imports. Each code fence must contain exactly ONE top-level test() call — do NOT use test.describe(), test.beforeEach(), test.afterEach(). When multiple user flows are requested, generate multiple code fences with one test() each. Each test should be self-contained and independently runnable, starting with page.goto(url). Prefer simple linear flows: navigate → interact → assert. Use descriptive test names. Wrap test code in a markdown code fence with language "typescript". Only interact with elements and assert on values explicitly shown in the page context — do NOT invent, guess, or fabricate selectors, text, or values.`;

export const EXPLORATION_ANALYSIS_PROMPT = `You are MSITest's Exploration Analysis Agent. You analyze web application pages and identify testable user scenarios.

Given structured page data including semantic descriptions, interactive elements, and discovered navigation flows, you produce a list of distinct test scenarios. For each scenario, provide:
- A clear, concise name
- A description of what the scenario tests
- A step-by-step flow summary a test would follow
- An area label categorizing which part of the app this scenario belongs to (e.g. "Authentication", "Dashboard", "Project Management", "Settings", "Navigation", "User Profile", etc.)
- An optional "relatedFlows" array listing the names of discovered navigation flows that this scenario directly tests or exercises. Only include a flow name if the scenario clearly covers that flow's steps. Omit the field if no discovered flows match.

You may also receive discovered navigation flows that show how pages connect. Use these to identify multi-page user journeys and tag scenarios with the flows they cover.

When PRD / product requirements are provided:
- Cross-reference discovered pages and flows against PRD features
- Prioritize scenarios that test PRD-described features
- If a PRD feature was not found during exploration, include a scenario for it anyway (marked in the description as "PRD requirement — not found during exploration")
- Note coverage gaps in your scenario descriptions

When Knowledge Base module context is provided in the user prompt, cross-reference the discovered pages against those modules. For each scenario that clearly corresponds to a Knowledge Base module, set "kbModule" to the EXACT module name (verbatim from the context block). Omit "kbModule" when no Knowledge Base is provided or no module is a clear match.

Focus on critical user flows, edge cases, and error states. Prioritize by business impact.`;

export const FAILURE_ANALYSIS_PROMPT = `You are MSITest's Failure Analysis Agent. You diagnose why Playwright tests fail.

Given test code, error output, and optionally screenshots or traces, you determine the root cause and suggest a fix.

For each analysis, provide:
- rootCause: A clear technical explanation of why the test failed
- suggestedFix: Specific, actionable code or configuration change to resolve the failure
- confidenceScore: 0-1 scale indicating how certain you are of the diagnosis

Common failure patterns to check:
- Timing issues (element not yet rendered)
- Selector changes (DOM restructured)
- Network dependencies (API flaky or down)
- State leakage between tests
- Environment differences (viewport, auth state)`;

export const HYBRID_TEST_GENERATION_PROMPT = `You are MSITest's Hybrid Test Generation Agent. You generate tests in a hybrid natural-language + code format for browser-based test execution.

For each test, you produce an array of steps. Each step has:
- "instruction": A clear natural language instruction describing a browser interaction (e.g. "Click the 'Login' button", "Navigate to /dashboard", "Fill in the email field with 'test@example.com'")
- "assertion_code": (optional) A Playwright code assertion for complex data checks (e.g. "expect(await page.textContent('.count')).toBe('5')"). Only include when a simple visual check is insufficient.
- "expected_outcome": (optional) A human-readable description of what should happen after this step

Rules for instructions:
- Each instruction should be a single, atomic browser action
- Use exact text labels, button names, and field names from the page context
- Navigation steps: "Navigate to /path" or "Click the 'Settings' link"
- Interaction steps: "Click the 'Submit' button", "Type 'hello' into the search field"
- Verification steps: "Verify the success message is visible"

Rules for assertion_code:
- Only use for data assertions that go beyond simple visibility checks
- Use Playwright-style assertions: expect(locator).toBeVisible(), toHaveText(), toContainText()
- Use semantic locators: page.getByRole(), page.getByText(), page.getByLabel()
- NEVER use raw CSS selectors or XPath

Format: Respond with ONLY a valid JSON array of step objects. No markdown, no code fences, no explanation.`;

export function createTestGenerationAgent(model: AgentModel) {
  return new Agent(components.agent, {
    name: "Test Generation",
    languageModel: model,
    instructions: TEST_GENERATION_PROMPT,
    tools: createToolDefinitions(),
  });
}

export function createHybridTestGenerationAgent(model: AgentModel) {
  return new Agent(components.agent, {
    name: "Hybrid Test Generation",
    languageModel: model,
    instructions: HYBRID_TEST_GENERATION_PROMPT,
  });
}

export const TEST_HEALING_PROMPT = `You are MSITest's Test Healing Agent. You repair failing Playwright tests while preserving the original test intent.

Your goal is to make the smallest safe change necessary to resolve the failure. Do NOT rewrite the entire test when a localized fix is sufficient.

## Root Cause Analysis

Before modifying the test:
1. Determine the most likely root cause from the error message and page context.
2. Prefer the smallest possible fix.
3. Preserve the original user flow and existing validated assertions whenever possible.
4. Fix locators, waits, or timing issues before changing assertions.

## Test Intent Preservation

The repaired test must validate the same user behavior as the original test. Do NOT:
- Remove assertions solely to make the test pass
- Replace business assertions with weaker assertions
- Replace workflow validation with visibility-only assertions
- Convert functional verification into existence checks
- Remove an assertion solely because it is failing without evidence that the assertion itself is wrong

If an assertion cannot be repaired with available evidence, preserve it rather than inventing a replacement.

## Healing Scope Rules — CRITICAL

You are REPAIRING an existing test, not writing a new one. This means:

1. NEVER add new test steps (clicks, fills, navigations) that were not in the original test. Only modify existing steps.
2. NEVER add new assertions that were not in the original test. Only fix the assertions that are already there.
3. NEVER add new form interactions (fill, type, select) that were not in the original test code.
4. NEVER add email inputs, login steps, or signup flows that were not part of the original test.
5. If the original test has 5 steps, the healed test must have exactly 5 steps (or fewer if a step is truly unreachable). It must NEVER have 6+ steps.

The ONLY changes allowed are:
- Fixing a locator (e.g. scoping a duplicate, updating a selector)
- Adding or adjusting a wait/timeout
- Fixing an assertion's expected value (only with evidence from the error or page context)
- Removing a step ONLY if it is provably unreachable after other fixes

## Grounding Rules

Use only information from the original test, the runtime error, the page context, user feedback, and authentication context. Never invent routes, URLs, credentials, API responses, validation messages, status text, page content, selectors, or expected values. If required information is unavailable, preserve the failing step and explain why rather than guessing.

Only use locators for elements that can be verified from the test code, the page context, the error message, or user feedback. Do not invent or guess locators.

## Locator Rules

When the page context provides recommended locators, use those exact locators. Preserve existing scoped locators whenever possible. When no recommended locator exists, use: getByRole, getByLabel, getByPlaceholder, getByText, getByTestId — in that priority order. Never use raw CSS selectors, XPath, or guessed selectors.

## Strict Mode Violation Rules

When the error contains "strict mode violation" or "resolved to N elements":
The locator matches multiple elements on the page. You MUST scope the locator to be unique.

Fix strategy in priority order:
1. Scope to a parent section with an id: page.locator('#features').getByRole('button', { name: 'Sign up' })
2. Scope to a unique landmark: page.getByRole('banner').getByRole('button', { name: 'Sign up' }) or page.getByRole('region', { name: 'Features' }).getByRole('button', { name: 'Sign up' })
3. Use .first() or .nth(N) as a last resort: page.getByRole('button', { name: 'Sign up' }).first()

MANDATORY SAFETY: After applying any scoping strategy above, ALWAYS append .first() as an additional safety net if the scoping might still match multiple elements. For example: page.locator('#hero').getByRole('button', { name: 'Sign up' }).first(). This ensures the test never fails with the same strict mode error again.

Check the live page context for section ids, landmark roles, or headings to use as scope. Do NOT remove or weaken the assertion — fix the locator instead. Do NOT leave the locator unscoped — it will fail again with the same error. When the error shows which element index is needed, use .nth(N) with that index.

## Landmark Strict Mode Rules

When the failing locator is a landmark role (main, navigation, banner, complementary, contentinfo), do NOT try to scope or filter it — REPLACE the entire assertion. Landmarks are structural containers, not reliable test targets. Fix strategy:
1. Replace with a heading assertion: page.getByRole('heading', { name: /dashboard/i })
2. Replace with a URL assertion: await expect(page).toHaveURL(/pattern/)
3. Replace with specific visible text: page.getByText(/welcome/i).first()
Example: replace await expect(page.getByRole('main')).toBeVisible() with await expect(page.getByRole('heading', { name: /dashboard/i })).toBeVisible()

## URL Assertion Timeout Rules

When a toHaveURL() assertion times out, the expected URL path may be wrong — not just slow. Check the authentication context section above for the actual post-login redirect URL. If the test asserts toHaveURL(/\/dashboard/) or any hardcoded path but the auth context provides a different post-login URL, replace the URL pattern with the correct one. If no post-login URL is provided in the auth context, replace toHaveURL with: await expect(page).not.toHaveURL(/\/(login|sign-in|signin)/) which is sufficient to confirm login succeeded.

## Anti-Pattern Cleanup Rules

While you should make minimal changes, you MUST also fix these known anti-patterns when you spot them in the code, even if they are not the direct cause of the reported error:
- toHaveURL(/\/dashboard/) or any hardcoded URL path when the auth context provides a different post-login URL — replace with the correct URL or remove the assertion
- getByRole('main'), getByRole('navigation'), getByRole('banner'), getByRole('contentinfo') used as assertion targets — replace with heading, text, or URL assertions
- After login, do NOT assume URL paths from page titles. A page titled "Dashboard" may live at /, /home, /app, or any other path.

## Text Assertion Duplicate Rules

When the original test uses getByText with a regex or substring that matches multiple non-interactive elements (e.g. the same tagline in a hero section and body text):
1. Replace getByText with getByRole('heading', { name: /pattern/ }) if one of the matches is a heading
2. Scope to the nearest parent section: page.locator('#hero').getByText('pattern')
3. As a last resort, use .first(): page.getByText('pattern').first()
NEVER leave an unscoped getByText regex that the error shows matches multiple elements.

## Assertion Rules

Use web-first assertions: await expect(locator).toBeVisible(), toHaveText(), toContainText(), toHaveURL(), toBeEnabled(). Prefer toContainText() over toHaveText() when exact matching is unnecessary. Never use waitForTimeout() or arbitrary sleeps. Never use waitForLoadState('networkidle') or waitForLoadState('domcontentloaded') — wait for meaningful page content instead.

## Text and Value Mismatch Errors

Do NOT automatically replace expected values with received values. When a mismatch occurs, determine whether the expected value came from the original test intent, page context, or runtime evidence. Only use the received value if evidence confirms it is the correct expected behavior. If correctness cannot be determined, preserve the original assertion and prefer fixing timing, navigation, or locator issues first.

## TimeoutError Rules

When an element cannot be found within the timeout, the fix is ONLY to adjust timing, waits, or locators for EXISTING steps. Specifically:

ALLOWED fixes for TimeoutError:
- Add a wait for meaningful content after navigation: await expect(page.getByRole('heading', { name: /pattern/i })).toBeVisible({ timeout: 15000 })
- Fix a locator that no longer matches the DOM
- Increase a timeout on an existing wait
- Fix navigation (ensure page.goto() targets the correct URL)

FORBIDDEN fixes for TimeoutError:
- NEVER add new form fill/submit steps that were not in the original test
- NEVER add new email input fields, login steps, or signup interactions
- NEVER add new page.goto() calls to different pages that were not in the original test
- NEVER replace a missing element assertion with an entirely different interaction

If the element truly does not exist on the page (verified from the page context), preserve the assertion with a comment explaining the element was not found. Do NOT substitute a different element or interaction.

## Assertion Failure Rules

For visibility, enabled-state, and text assertion failures: fix only the failing assertion, preserve all unrelated assertions, use runtime evidence when available, and do not weaken assertions unnecessarily. If an element is not visible, verify locator correctness and navigation completion before considering scrolling or timeout adjustments.

## Dynamic Content Rules

When content is user-specific, date-specific, environment-specific, or data-driven, avoid asserting exact values. Prefer asserting stable headings, labels, status indicators, structural UI elements, and known workflow states.

## Form Submission and Mutation Rules

Do NOT automatically introduce retries. Only add retry logic when the error indicates a transient backend timeout, user feedback mentions backend flakiness, or runtime context indicates eventual consistency behavior. Do NOT add retries for validation failures, assertion failures, missing elements, incorrect locators, or navigation failures.

## Structure Rules

Keep it as a single test() call. Do NOT use test.describe(), beforeEach(), or afterEach(). Navigate to the app URL using page.goto() at the start. Wrap the repaired test in a single markdown code fence with language "typescript". Preserve the original test structure and flow as much as possible.`;

export function createHealAgent(model: AgentModel) {
  return new Agent(components.agent, {
    name: "Test Heal",
    languageModel: model,
    instructions: `${TEST_GENERATION_PROMPT}\n\n${TEST_HEALING_PROMPT}`,
  });
}

export function createExplorationAnalysisAgent(model: AgentModel) {
  return new Agent(components.agent, {
    name: "Exploration Analysis",
    languageModel: model,
    instructions: EXPLORATION_ANALYSIS_PROMPT,
  });
}

export function createFailureAnalysisAgent(model: AgentModel) {
  return new Agent(components.agent, {
    name: "Failure Analysis",
    languageModel: model,
    instructions: FAILURE_ANALYSIS_PROMPT,
  });
}

export const TEST_REFINEMENT_PROMPT = `You are MSITest's Test Refinement Agent. You modify existing Playwright test code based on user requests.

Given the current test code and a user's change request, you return the modified test code along with a summary of what changed.

Rules:
1. Understand the current test structure and intent before making changes
2. Apply the user's requested change precisely — do not refactor unrelated code
3. Return the FULL modified test code (not just the changed portion)
4. Never break existing imports, test structure, or unrelated functionality
5. Keep the test as a single test() call — no test.describe(), beforeEach(), or afterEach()
6. Use semantic locators (getByRole, getByLabel, getByPlaceholder, getByText) first, then getByTestId
7. Never use raw CSS selectors or XPath
8. Use web-first assertions: await expect(locator).toBeVisible(), toHaveText(), toContainText()
9. Never use waitForTimeout() or arbitrary sleeps
10. Wrap the modified test in a markdown code fence with language "typescript"
11. When page context is provided, use the actual elements, text, and structure from that context. NEVER fabricate selectors, text content, or assertions that aren't present in the page context.

After the code fence, provide a brief summary of changes in this format:
---CHANGES---
- Description of change 1
- Description of change 2
---END CHANGES---`;

export function createRefineAgent(model: AgentModel) {
  return new Agent(components.agent, {
    name: "Test Refinement",
    languageModel: model,
    instructions: `${TEST_GENERATION_PROMPT}\n\n${TEST_REFINEMENT_PROMPT}`,
  });
}

const CODE_FENCE_RE = /```(?:typescript|ts|tsx|javascript|js|jsx)?\s*\r?\n([\s\S]*?)```/;

export function extractPlaywrightCode(response: string): string | null {
  const match = response.match(CODE_FENCE_RE);
  if (match) return match[1].trim();
  const looseMatch = response.match(/```\s*\r?\n([\s\S]*?)```/);
  if (looseMatch) return looseMatch[1].trim();
  return null;
}

const PLAYWRIGHT_CODE_HINTS = /(?:import\s.*@playwright\/test|test\s*\(|expect\s*\(|page\.(goto|click|fill|locator|getBy))/;

export function extractMultipleTests(response: string): string[] {
  const patterns = [
    CODE_FENCE_RE,
    /```(?:typescript|ts|tsx|javascript|js|jsx)?\s*([\s\S]*?)```/,
    /```\s*\r?\n([\s\S]*?)```/,
  ];

  for (const pattern of patterns) {
    const regex = new RegExp(pattern.source, "g");
    const results: string[] = [];
    let match;
    while ((match = regex.exec(response)) !== null) {
      const code = match[1].trim();
      if (code.length > 0 && PLAYWRIGHT_CODE_HINTS.test(code)) results.push(code);
    }
    if (results.length > 0) return results;
  }

  const blocks = response.split(/(?=import\s*\{[^}]*\}\s*from\s*['"]@playwright\/test['"])/);
  const results: string[] = [];
  for (const block of blocks) {
    const trimmed = block.trim();
    if (trimmed && /test\s*\(/.test(trimmed)) {
      results.push(trimmed);
    }
  }

  return results;
}

export function deriveTestName(code: string, index?: number): string {
  const match = code.match(/test\s*\(\s*['"\x60]([^'"\x60]+?)['"\x60]/);
  if (match) return match[1];
  return index !== undefined ? `Generated Test ${index + 1}` : "Generated Test";
}

const TEST_GENERATION_INSTRUCTIONS = `Generate complete, runnable Playwright tests. Each test must be in its own markdown code fence with the "typescript" language tag. Each code fence must contain exactly ONE top-level test() call — do NOT use test.describe(), test.beforeEach(), or test.afterEach(). Each test should navigate to the project URL using page.goto() at the start.

CRITICAL — When live page context is provided, it includes interactive elements with "→" suggested locators. You MUST use those EXACT suggested locators. Do NOT invent your own locators or scope. The suggested locators are pre-scoped when duplicates exist on the page — copy them verbatim.

Duplicate element handling:
- If the page context shows multiple elements with the same role and text, the suggested locators will already be scoped (e.g. page.locator('#features').getByRole('button', { name: 'Sign up' }))
- NEVER use unscoped getByRole/getByText/getByPlaceholder for elements that appear multiple times on the page
- If no scoped suggested locator exists, use .nth(N) or scope to a parent section with an id
- When a button or link appears multiple times, ALWAYS append .first() even after scoping. Scoping to getByRole('main') is NOT sufficient if duplicates exist in multiple sections within main — only section ID scoping (#hero, #features) eliminates duplicates. When no section ID is available, .first() is mandatory.
- Playwright locators match case-insensitively by substring by default. getByRole('link', { name: 'How It Works' }) will ALSO match "See how it works". When a link/button name could be a substring of another element's text, use { exact: true }: getByRole('link', { name: 'How It Works', exact: true }).
- NEVER use getByRole('main'), getByRole('navigation'), getByRole('banner'), or getByRole('contentinfo') as assertion targets — these ARIA landmarks frequently appear multiple times on a page. Use specific headings, visible text, or URL assertions instead.

Locator strategy (priority order):
1. Use the suggested locator from the page context exactly as provided
2. Semantic locators: getByRole, getByLabel, getByPlaceholder, getByText
3. getByTestId for data-test/data-testid attributes
4. NEVER use raw CSS selectors or XPath

Assertion rules:
- Use web-first assertions: await expect(locator).toBeVisible(), toHaveText(), toContainText(), toHaveURL()
- Never use waitForTimeout() or arbitrary sleeps
- Do NOT use waitForLoadState('networkidle') or waitForLoadState('domcontentloaded')
- After navigation, wait for a specific real element: await expect(page.getByRole('heading', { name: /pattern/ })).toBeVisible({ timeout: 15000 })
- URL assertions — use flexible patterns: toHaveURL(/settings/) not toHaveURL(/\\/settings\\//)

Assertion anti-patterns — NEVER:
- Do NOT guard assertions with if (await locator.count() > 0)
- Do NOT use conditional patterns like "if visible, assert visible"
- Every test MUST have at least one unconditional assertion

Only use locators for elements that are reasonable for the described feature. Do NOT invent or guess selectors without basis.`;

function buildContextToolHints(projectId?: string): string {
  if (!projectId) return "";
  return `\nProject ID: ${projectId}\nIf the project has a Knowledge Base, use the readKnowledgeBase tool with this exact project_id to look up its modules, APIs, data models, and user flows before generating tests.\nIf the project has a Baseline Requirements Document, use the readBaselineRd tool with this exact project_id to look up its RD sections and confidence scores before generating tests.\n`;
}

const TRUNCATION_MARKER = "… [truncated]";

export function truncateContext(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const boundaryIndex = text.lastIndexOf("\n\n", maxChars);
  if (boundaryIndex > 0) {
    return text.slice(0, boundaryIndex + 1) + TRUNCATION_MARKER;
  }
  return text.slice(0, maxChars) + TRUNCATION_MARKER;
}

function renderApis(apis: unknown): string {
  const list = Array.isArray(apis)
    ? apis
    : apis && typeof apis === "object" && Array.isArray((apis as Record<string, unknown>).endpoints)
      ? ((apis as Record<string, unknown>).endpoints as unknown[])
      : null;
  if (!list) return "";
  const rendered = list
    .filter((e): e is Record<string, unknown> => e != null && typeof e === "object")
    .map((e) => {
      const method = typeof e.method === "string" ? e.method : "";
      const path = typeof e.path === "string" ? e.path : "";
      return `${method} ${path}`.trim();
    })
    .filter((s) => s.length > 0);
  return rendered.length > 0 ? `  APIs: ${rendered.join(", ")}` : "";
}

function renderUserFlows(flows: unknown): string {
  if (!Array.isArray(flows)) return "";
  const rendered = flows
    .filter((f): f is Record<string, unknown> => f != null && typeof f === "object")
    .map((f) => {
      const route = typeof f.route === "string" ? f.route : "";
      const name = typeof f.name === "string" ? f.name : "";
      return [route, name].filter((s) => s.length > 0).join(" ");
    })
    .filter((s) => s.length > 0);
  return rendered.length > 0 ? `  Flows: ${rendered.join(", ")}` : "";
}

export function buildKbContextBlock(
  kb: ReadKnowledgeBaseResult | null,
  rd: ReadBaselineRdResult | null,
): string {
  const parts: string[] = [];

  if (kb && kb.modules.length > 0) {
    const moduleBlocks = kb.modules.map((m) => {
      const lines = [`- **${m.name}**: ${m.description ?? ""}`];
      if (m.dependencies.length > 0) {
        lines.push(`  Dependencies: ${m.dependencies.join(", ")}`);
      }
      const apis = renderApis(m.apis);
      if (apis) lines.push(apis);
      const flows = renderUserFlows(m.user_flows);
      if (flows) lines.push(flows);
      return lines.join("\n");
    });

    const headerLines = [
      "### Knowledge Base",
      kb.architecture_type ? `Architecture: ${kb.architecture_type}` : "",
      kb.tech_stack && kb.tech_stack.length > 0 ? `Tech Stack: ${kb.tech_stack.join(", ")}` : "",
      kb.architecture_summary ? `Summary: ${kb.architecture_summary}` : "",
    ].filter((line) => line.length > 0);

    parts.push(
      moduleBlocks.length > 0
        ? `${headerLines.join("\n")}\n\n${moduleBlocks.join("\n\n")}`
        : headerLines.join("\n"),
    );
  }

  if (rd) {
    const sectionBlocks = rd.sections.map(
      (s) => `**${s.title}** (confidence ${s.confidence})\n${s.content}`,
    );
    const rdHeader = [
      "### Baseline Requirements Document",
      `Version: v${rd.version}`,
      `Status: ${rd.status}`,
    ].join("\n");
    parts.push(sectionBlocks.length > 0 ? `${rdHeader}\n\n${sectionBlocks.join("\n\n")}` : rdHeader);
  }

  if (parts.length === 0) return "";

  const joined = `## Project Knowledge Context\n\n${parts.join("\n\n")}`;
  return truncateContext(joined, TEST_GEN_KB_CONTEXT_CHARS);
}

export function computeKbCoverageGaps(
  moduleNames: string[],
  scenarios: { kbModule?: string }[],
): string[] {
  const coveredSet = new Set(
    scenarios
      .map((s) => s.kbModule?.trim().toLowerCase())
      .filter((v): v is string => typeof v === "string" && v.length > 0),
  );
  return moduleNames.filter((name) => !coveredSet.has(name.trim().toLowerCase()));
}

export function buildNlGenerationPrompt(opts: {
  projectName: string;
  appUrl: string;
  authContext: string;
  prdContext: string;
  snapshotContext: string;
  retryContext: string;
  prompt: string;
  projectId?: string;
  kbContext?: string;
}): string {
  return `Generate Playwright tests from the following test description.

Project: ${opts.projectName}
URL: ${opts.appUrl}
${buildContextToolHints(opts.projectId)}${opts.kbContext?.trim() ?? ""}${opts.authContext}${opts.prdContext}${opts.snapshotContext}${opts.retryContext}

Test Description:
${opts.prompt}

${TEST_GENERATION_INSTRUCTIONS}`;
}

export function buildNlFormatRetryPrompt(opts: {
  projectName: string;
  appUrl: string;
  authContext: string;
  prdContext: string;
  snapshotContext: string;
  prompt: string;
}): string {
  return `Your previous response did not contain valid Playwright test code in markdown code fences.

Return ONLY the Playwright test code. Each test must be wrapped in a \`\`\`typescript code fence. No explanation, no commentary — just the code fences.

Project: ${opts.projectName}
URL: ${opts.appUrl}
${opts.authContext}${opts.prdContext}${opts.snapshotContext}

Test Description:
${opts.prompt}`;
}

export function buildPrdGenerationPrompt(opts: {
  projectName: string;
  appUrl: string;
  authContext: string;
  prdText: string;
  snapshotContext: string;
  retryContext: string;
  projectId?: string;
  kbContext?: string;
}): string {
  return `Generate Playwright tests for the following application.

Project: ${opts.projectName}
URL: ${opts.appUrl}
${buildContextToolHints(opts.projectId)}${opts.kbContext?.trim() ?? ""}${opts.authContext}${opts.snapshotContext}${opts.retryContext}

Product Requirements:
${opts.prdText}

${TEST_GENERATION_INSTRUCTIONS}`;
}

export function buildPrdFormatRetryPrompt(opts: {
  projectName: string;
  appUrl: string;
  authContext: string;
  prdText: string;
  snapshotContext: string;
}): string {
  return `Your previous response did not contain valid Playwright test code in markdown code fences.

Return ONLY the Playwright test code. Each test must be wrapped in a \`\`\`typescript code fence. No explanation, no commentary — just the code fences.

Project: ${opts.projectName}
URL: ${opts.appUrl}
${opts.authContext}${opts.snapshotContext}

Product Requirements:
${opts.prdText}`;
}

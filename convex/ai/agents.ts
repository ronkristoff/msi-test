import { Agent, type Config } from "@convex-dev/agent";
import { components } from "../_generated/api";
import { z } from "zod/v3";

type AgentModel = Config extends { languageModel?: infer M } ? M : never;
import { createToolDefinitions } from "./tools/definitions";

export const explorationScenarioSchema = z.object({
  name: z.string(),
  description: z.string(),
  flowSummary: z.string(),
  area: z.string(),
  relatedFlows: z.array(z.string()).optional(),
  relevantPageUrls: z.array(z.string()).optional(),
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

Locator strategy — USE THE SUGGESTED LOCATORS from the page context when available:
Each interactive element in the context includes a "→" line with the recommended Playwright locator. USE THAT EXACT LOCATOR. Do NOT invent alternatives.

When no suggested locator exists, use this priority order:
1. getByRole — e.g. page.getByRole('button', { name: 'Login' })
2. getByLabel / getByPlaceholder — e.g. page.getByLabel('Username'), page.getByPlaceholder('Password')
3. getByTestId — when data-test attributes are provided in the page context
4. NEVER use raw CSS selectors (page.locator('.class')), XPath, or guess selectors not provided in context

Assertion rules:
- Use ONLY text values that appear in the page context (headings, table data, status text, button labels). Do NOT fabricate text that isn't shown.
- Use web-first assertions: await expect(locator).toBeVisible(), toHaveText(), toContainText(), toHaveURL(), toBeEnabled()
- Never use generic expect() for DOM state — always use expect(locator).matcher()
- Never use waitForTimeout() or arbitrary sleeps — Playwright auto-waits for actionability

Navigation rules:
- For SPA apps, after login navigate to internal pages by clicking navigation links (sidebar/menu items), NOT by using page.goto() for internal routes
- After any page.goto() or navigation click, wait for the page to settle: await page.waitForLoadState('networkidle')

Structure rules:
- Always use @playwright/test imports
- Each code fence must contain exactly ONE top-level test() call — do NOT use test.describe(), test.beforeEach(), test.afterEach()
- Each test should be self-contained and independently runnable
- Use page.goto(url) at the start of each test — do not rely on baseURL or config
- Prefer simple, linear test flows: navigate → interact → assert
- Use descriptive test names that reflect the user flow being tested
- Wrap test code in a markdown code fence with language "typescript"
- Only interact with elements and assert on values explicitly shown in the page context — do NOT invent, guess, or fabricate selectors, text, or values`;

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

export function createHealAgent(model: AgentModel) {
  return new Agent(components.agent, {
    name: "Test Heal",
    languageModel: model,
    instructions: TEST_GENERATION_PROMPT,
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
    instructions: TEST_REFINEMENT_PROMPT,
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

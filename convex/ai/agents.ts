import { Agent, type Config } from "@convex-dev/agent";
import { components } from "../_generated/api";
import { z } from "zod/v3";

type AgentModel = Config extends { languageModel?: infer M } ? M : never;
import { createToolDefinitions } from "./tools/definitions";

export const explorationScenarioSchema = z.object({
  name: z.string(),
  description: z.string(),
  flowSummary: z.string(),
});

export const failureAnalysisSchema = z.object({
  rootCause: z.string(),
  suggestedFix: z.string(),
  confidenceScore: z.number().min(0).max(1),
});

export const TEST_GENERATION_PROMPT = `You are MSITest's Test Generation Agent. You write Playwright test code for web applications.

Given a description of user flows, page structure, or product requirements, you generate complete, runnable Playwright test code.

Locator strategy (use in this priority order):
1. getByRole — e.g. page.getByRole('button', { name: 'Login' })
2. getByLabel / getByPlaceholder — e.g. page.getByLabel('Username'), page.getByPlaceholder('Password')
3. getByText / getByTitle — e.g. page.getByText('Welcome')
4. getByTestId — when data-test attributes are provided in the page context, e.g. page.getByTestId('username')
5. NEVER use raw CSS selectors (page.locator('.class')), XPath, or guess selectors not provided in context

Assertion rules:
- Use web-first assertions: await expect(locator).toBeVisible(), toHaveText(), toContainText(), toHaveURL(), toBeEnabled()
- Never use generic expect() for DOM state — always use expect(locator).matcher()
- Never use waitForTimeout() or arbitrary sleeps — Playwright auto-waits for actionability

Structure rules:
- Always use @playwright/test imports
- Each code fence must contain exactly ONE top-level test() call — do NOT use test.describe(), test.beforeEach(), test.afterEach()
- Each test should be self-contained and independently runnable
- Use page.goto(url) at the start of each test — do not rely on baseURL or config
- Prefer simple, linear test flows: navigate → interact → assert
- Use descriptive test names that reflect the user flow being tested
- Wrap test code in a markdown code fence with language "typescript"
- Only interact with elements and assert on values explicitly shown in the page context — do NOT invent, guess, or fabricate selectors, attributes, or text`;

export const EXPLORATION_ANALYSIS_PROMPT = `You are MSITest's Exploration Analysis Agent. You analyze web application pages and identify testable user scenarios.

Given a URL or page description, you produce a list of distinct test scenarios. For each scenario, provide:
- A clear, concise name
- A description of what the scenario tests
- A step-by-step flow summary a test would follow

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

export function createTestGenerationAgent(model: AgentModel) {
  return new Agent(components.agent, {
    name: "Test Generation",
    languageModel: model,
    instructions: TEST_GENERATION_PROMPT,
    tools: createToolDefinitions(),
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
    tools: createToolDefinitions(),
  });
}

const CODE_FENCE_RE = /```(?:typescript|ts|tsx|javascript|js|jsx)?\s*\r?\n([\s\S]*?)```/;

export function extractPlaywrightCode(response: string): string | null {
  const match = response.match(CODE_FENCE_RE);
  if (!match) return null;
  return match[1].trim();
}

export function extractMultipleTests(response: string): string[] {
  const regex = new RegExp(CODE_FENCE_RE.source, "g");
  const results: string[] = [];
  let match;
  while ((match = regex.exec(response)) !== null) {
    results.push(match[1].trim());
  }
  return results;
}

export function deriveTestName(code: string, index?: number): string {
  const match = code.match(/test\s*\(\s*['"`]([^'"`]+?)['"`]/);
  if (match) return match[1];
  return index !== undefined ? `Generated Test ${index + 1}` : "Generated Test";
}

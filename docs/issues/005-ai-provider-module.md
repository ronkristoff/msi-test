# 005 — AI Provider Module (Three Agents)

**Type**: AFK
**Blocked by**: 001, 002

## What to build

Configure `@convex-dev/agent` with the workspace's BYOK AI settings. Define three specialized agents: Test Generation Agent (generates Playwright test files), Exploration Analysis Agent (analyzes page structure and proposes testable scenarios), Failure Analysis Agent (analyzes failures and produces root cause + suggested fixes). All agents use `createOpenAI({ baseURL, apiKey })` from `@ai-sdk/openai` with workspace config. Unit tests mock the AI SDK layer.

End-to-end: Convex actions instantiate agents with workspace AI config → agents receive prompts → return structured output (test code, scenarios, or root cause analysis) → unit tests verify correct agent configuration, prompt construction, and response parsing.

## Acceptance criteria

- [ ] `@convex-dev/agent` and `@ai-sdk/openai` packages installed and configured
- [ ] Test Generation Agent produces complete Playwright test files from exploration scenarios, PRD content, or natural language prompts
- [ ] Exploration Analysis Agent receives DOM snapshots/screenshots and returns proposed testable scenarios (name, description, flow summary)
- [ ] Failure Analysis Agent receives test code, error message, screenshot, console output and returns root cause analysis, suggested fix, and confidence score
- [ ] All agents use workspace-level AI config (endpoint URL, API key, model name) from the `workspaces` table
- [ ] Agent instances are created per-request using `createOpenAI({ baseURL, apiKey })` with the workspace's BYOK settings
- [ ] Unit tests mock AI SDK layer and verify correct prompt construction for each agent
- [ ] Unit tests verify response parsing extracts test code, scenario lists, root cause text, and confidence scores
- [ ] Unit tests verify error handling: rate limits, invalid API keys, timeouts, malformed responses

## Blocked by

- 001 — Auth & Onboarding Flow (workspace context with AI config)
- 002 — Convex Schema Foundation (workspaces, ai_insights tables)

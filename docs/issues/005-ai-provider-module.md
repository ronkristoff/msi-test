# 005 — AI Provider Module (Three Agents)

**Type**: AFK
**Blocked by**: 001, 002

## What to build

Configure `@convex-dev/agent` (v0.6.x) with `ai` (v6.x) and `@ai-sdk/openai` (v3.x). Define three specialized agents with system prompts, structured output schemas, and tools. Create the model bootstrapping layer that fetches workspace BYOK config and injects it per-call. Define five agent tools backed by internal queries.

## Design Decisions

- **Agent instantiation**: Module-level agent definitions (prompts, schemas, tools). AI model injected per-call via `getWorkspaceModel(ctx)` helper.
- **Thread scope**: Test Generation → per suite (derived `testGen:${suiteId}`). Exploration Analysis → caller-managed threadId. Failure Analysis → one-shot, no thread.
- **Structured output**: Test Generation uses `generateText` (Playwright code in markdown fence). Exploration Analysis and Failure Analysis use `generateObject` with zod schemas.
- **Tools**: `readExistingTests`, `readProjectContext` (shared), `readTestCode` (Tier 1 — real queries). `readPreviousExplorations`, `readRecentFailures` (Tier 2 — stubs returning empty arrays).
- **Error handling**: `ConvexError` with `{ type: "ai_error", code: "invalid_api_key"|"rate_limit"|"timeout"|"malformed_response", message }`.
- **Usage tracking**: Enable Agent component's built-in tracking, no UI.
- **Rate limiting**: Skip for MVP (BYOK handles own limits).
- **Token limits**: Skip for now (provider defaults).

## Files to create

| File | Purpose |
|------|---------|
| `convex/ai/agents.ts` | Three agent definitions: system prompts, zod schemas, tool registrations |
| `convex/ai/model.ts` | `getWorkspaceModel(ctx)` helper + internal query for workspace AI config |
| `convex/ai/tools.ts` | 5 tool definitions (3 Tier 1 with real queries, 2 Tier 2 stubs) |
| `convex/ai/errors.ts` | `createAiError(code, message)` → throws structured `ConvexError` |
| `convex/ai/__fixtures__/test-generation-response.md` | Canned Playwright test code fixture |
| `convex/ai/__fixtures__/exploration-scenarios.json` | Canned scenario array fixture |
| `convex/ai/__fixtures__/failure-analysis.json` | Canned root cause analysis fixture |
| `convex/ai/agents.test.ts` | Unit tests: agent config, prompt construction, response parsing, error handling |

## Packages to install

- `@convex-dev/agent` (v0.6.x)
- `ai` (v6.x)
- `@ai-sdk/openai` (v3.x)

## Acceptance criteria

- [x] `@convex-dev/agent`, `ai`, and `@ai-sdk/openai` packages installed
- [x] Three agent definitions in `convex/ai/agents.ts` with MSITest-specific system prompts
- [x] Test Generation Agent configured for `generateText` (returns Playwright code in markdown fence)
- [x] Exploration Analysis Agent configured for `generateObject` with zod schema: `z.array(z.object({ name, description, flowSummary }))`
- [x] Failure Analysis Agent configured for `generateObject` with zod schema: `z.object({ rootCause, suggestedFix, confidenceScore })`
- [x] `getWorkspaceModel(ctx)` in `convex/ai/model.ts` fetches workspace AI config via internal query and returns AI SDK model instance
- [x] `createAiError(code, message)` in `convex/ai/errors.ts` throws structured `ConvexError` with `{ type: "ai_error", code, message }`
- [x] 5 agent tools defined: `readExistingTests`, `readProjectContext`, `readTestCode` (Tier 1 with real internal queries), `readPreviousExplorations` (stub), `readRecentFailures` (stub)
- [x] Unit tests mock AI SDK model layer (not Agent component) and verify correct agent configuration and prompt construction
- [x] Unit tests verify response parsing: Playwright code extraction, scenario array parsing, root cause + confidence score
- [x] Unit tests verify error handling: invalid_api_key, rate_limit, timeout, malformed_response
- [x] Unit tests verify Tier 1 tools return data from test DB
- [x] Unit tests verify Tier 2 stub tools return empty arrays

## Not in scope

- Convex actions that invoke agents (issues 008, 010, 014)
- UI changes
- Schema migrations
- Rate limiting
- `max_tokens` configuration

## Blocked by

- 001 — Auth & Onboarding Flow (workspace context with AI config)
- 002 — Convex Schema Foundation (workspaces, ai_insights tables)

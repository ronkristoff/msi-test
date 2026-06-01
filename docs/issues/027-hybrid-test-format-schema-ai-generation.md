# 027 — Hybrid test format — schema + AI generation

**Type**: AFK
**Status**: done
**Blocked by**: 025

## What to build

Add `execution_type` and `steps` fields to the `tests` table. Update the Test Generation Agent to produce hybrid NL+code tests: natural language instructions for browser interaction, inline code for complex assertions. Store tests in the new `steps` format where each step has an NL instruction and optional code assertion. Legacy tests with `playwright_code` continue to work unchanged.

## Acceptance criteria

- [x] `execution_type` field added to tests table: `"playwright"` | `"stagehand"` (default: `"playwright"` for backward compat)
- [x] `steps` field added to tests table: array of `{instruction: string, assertion_code?: string, expected_outcome?: string}`
- [x] Test Generation Agent updated to produce hybrid NL+code format
- [x] Agent generates NL steps for navigation/interaction, code for data assertions
- [x] Legacy tests with `playwright_code` still work — `execution_type` defaults to `"playwright"`
- [x] Stagehand tests have `steps` populated, `playwright_code` empty
- [x] Test editor UI can display both formats (NL steps view + code view toggle)
- [x] Convex tests for new schema, agent generation output validation

## Implementation Summary

### Schema changes
- `tests.playwright_code`: changed from `v.string()` to `v.optional(v.string())`
- New `tests.execution_type`: optional `"playwright"` | `"stagehand"`, defaults to `"playwright"`
- New `tests.steps`: optional array of `{instruction, assertion_code?, expected_outcome?}`
- All new fields optional — zero migration, backward compatible

### Shared validators
- `testStepValidator` in `convex/lib/validation.ts` — single canonical definition, imported by schema and both mutations

### AI agent changes
- `convex/ai/agents.ts`: Added `HYBRID_TEST_GENERATION_PROMPT`, `hybridTestStepSchema`, `createHybridTestGenerationAgent()`
- `convex/ai/exploreApp.ts`: `generateExplorationTests` runs Playwright + hybrid generation in parallel per scenario via `Promise.all`; uses `extractJsonFromAiResponse` from `parse.ts` (canonical JSON extraction, not a duplicate)
- Steps stored as metadata alongside Playwright code; `execution_type` stays `"playwright"` until Stagehand runner (issue 028) is ready

### Mutation changes
- `createTestFromGeneration`: accepts `execution_type` and `steps`, defaults execution to `"playwright"`
- `updateTestCode`: accepts optional `steps` alongside `playwright_code`

### Frontend changes
- Suite detail page: Steps/Code toggle for tests with `execution_type === "stagehand"` and steps
- Steps view shows numbered instructions with assertion code and expected outcomes
- Execution type pill in accordion header

### Tests
- 5 new tests: stagehand creation, hybrid creation, steps update, backward compat, defaults
- New `seedStagehandTest` helper in testHelpers
- All 250 Convex + 108 frontend tests pass

## Blocked by

- 025 — Exploration output schema + flow discovery

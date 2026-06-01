# 027 — Hybrid test format — schema + AI generation

**Type**: AFK
**Status**: needs-triage
**Blocked by**: 025

## What to build

Add `execution_type` and `steps` fields to the `tests` table. Update the Test Generation Agent to produce hybrid NL+code tests: natural language instructions for browser interaction, inline code for complex assertions. Store tests in the new `steps` format where each step has an NL instruction and optional code assertion. Legacy tests with `playwright_code` continue to work unchanged.

## Acceptance criteria

- [ ] `execution_type` field added to tests table: `"playwright"` | `"stagehand"` (default: `"playwright"` for backward compat)
- [ ] `steps` field added to tests table: array of `{instruction: string, assertion_code?: string, expected_outcome?: string}`
- [ ] Test Generation Agent updated to produce hybrid NL+code format
- [ ] Agent generates NL steps for navigation/interaction, code for data assertions
- [ ] Legacy tests with `playwright_code` still work — `execution_type` defaults to `"playwright"`
- [ ] Stagehand tests have `steps` populated, `playwright_code` empty
- [ ] Test editor UI can display both formats (NL steps view + code view toggle)
- [ ] Convex tests for new schema, agent generation output validation

## Blocked by

- 025 — Exploration output schema + flow discovery

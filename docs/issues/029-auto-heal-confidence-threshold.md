# 029 — Auto-heal with confidence threshold

**Type**: AFK
**Status**: needs-triage
**Blocked by**: 028

## What to build

When a Stagehand test step fails (element not found), the Runner calls `observe()` to discover candidate elements on the page. If Stagehand's confidence in a match exceeds a configurable threshold (e.g., 80%), the step is auto-healed — the Runner uses the new element and continues the test. Healed selectors and the LLM's reasoning are saved to Convex as artifacts. Users see a "healed" status on steps with a human-readable explanation of what changed and why the system chose the replacement.

## Acceptance criteria

- [ ] Failed NL step triggers `observe()` to find candidate elements
- [ ] Confidence score evaluated against configurable threshold (default 80%)
- [ ] Above threshold: auto-heal, continue test, mark step as "healed"
- [ ] Below threshold: mark step as failed, include candidates in error output for human review
- [ ] Healing artifacts saved: before/after screenshots, LLM reasoning text, confidence score
- [ ] Step result includes `healed: true`, `heal_reason`, `heal_confidence` fields
- [ ] Run summary shows "3 passed, 1 healed, 2 failed" breakdown
- [ ] Confidence threshold configurable per workspace (workspace settings)
- [ ] Runner tests for heal logic: mock observe results, verify threshold behavior

## Blocked by

- 028 — Stagehand test executor in Runner

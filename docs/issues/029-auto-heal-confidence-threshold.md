# 029 — Auto-heal with confidence threshold

**Type**: AFK
**Status**: done
**Blocked by**: 028

## What to build

When a Stagehand test step fails (element not found), the Runner calls `observe()` to discover candidate elements on the page. If Stagehand's confidence in a match exceeds a configurable threshold (e.g., 80%), the step is auto-healed — the Runner uses the new element and continues the test. Healed selectors and the LLM's reasoning are saved to Convex as artifacts. Users see a "healed" status on steps with a human-readable explanation of what changed and why the system chose the replacement.

## Acceptance criteria

- [x] Failed NL step triggers `observe()` to find candidate elements
- [x] Confidence score evaluated against configurable threshold (default 80%)
- [x] Above threshold: auto-heal, continue test, mark step as "healed"
- [x] Below threshold: mark step as failed, include candidates in error output for human review
- [x] Healing artifacts saved: before/after screenshots, LLM reasoning text, confidence score
- [x] Step result includes `healed: true`, `heal_reason`, `heal_confidence` fields
- [x] Run summary shows "3 passed, 1 healed, 2 failed" breakdown
- [x] Confidence threshold configurable per workspace (workspace settings)
- [x] Runner tests for heal logic: mock observe results, verify threshold behavior

## Implementation Summary

### Schema changes
- `workspaces` table: added `heal_confidence_threshold` (optional number, 0-1)
- `steps` table: added `healed` to status union, added `heal_reason`, `heal_confidence`, `before_screenshot_file_id` fields
- `runs` table: added `healed_count` field for run summary breakdown
- `run_results` table: added `healed` to status union

### Runner heal logic (`runner/src/stagehand-executor.ts`)
- `executeStep`: on element-not-found errors, captures before-screenshot then delegates to `attemptHeal()`
- `attemptHeal()`: calls `stagehand.observe(instruction)` to find candidates, then `evaluateHealConfidence()` via `stagehand.extract()` to score the top candidate
- Above threshold: executes `act(candidateAction)`, captures after-screenshot, marks step as "healed"
- Below threshold: marks step as failed with candidate info in error message
- Only triggers on element-not-found errors (pattern-matched), not timeouts or other errors
- Default threshold: 0.8 (80%)

### Convex backend
- `writeStepResult` internal mutation accepts heal fields (`heal_reason`, `heal_confidence`, `before_screenshot_file_id`)
- `writeRunResult` accepts `healed` status
- `aggregateAndFinalize` counts healed results into `healed_count` on runs
- `getPendingWork` returns `heal_confidence_threshold` from workspace
- `updateWorkspace` mutation accepts `heal_confidence_threshold` with 0-1 validation

### Settings UI
- Workspace settings tab: slider control for auto-heal confidence threshold (0-100%)
- Zod schema updated with `heal_confidence_threshold` validation

### Tests
- 9 new Runner tests for heal logic (21 total in stagehand-executor.test.ts)
- Tests cover: successful heal, no candidates, below threshold, default threshold, custom threshold, before/after screenshots, continuation after heal, failure after heal, non-element-not-found errors
- All existing tests pass: 65 runner, 250 convex, 108 frontend

## Blocked by

- 028 — Stagehand test executor in Runner

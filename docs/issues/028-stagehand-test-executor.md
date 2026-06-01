# 028 — Stagehand test executor in Runner

**Type**: HITL — needs human to verify against a real app
**Status**: done
**Blocked by**: 022, 027

## What to build

Add a new Stagehand execution path in the Runner. When a test has `execution_type: "stagehand"`, the Runner initializes Stagehand with the workspace's BYOK config, logs in via cached act() calls, and executes each NL step via `act()`. Code assertions within steps are executed via raw Playwright page operations. Screenshots, video, and artifacts are captured per step and uploaded to Convex file storage. Results are written back to Convex in the same format as legacy runs. The legacy Playwright executor is completely untouched — tests with `execution_type: "playwright"` still use the child process pipeline.

## Acceptance criteria

- [x] Runner reads `execution_type` from test and dispatches to correct executor
- [x] Stagehand executor initializes with workspace BYOK config (`env: "LOCAL"`)
- [x] Login handled via Stagehand `act()` with variables
- [x] NL steps executed via `stagehand.act(instruction)`
- [x] Code assertions executed via raw Playwright page operations
- [x] Screenshots captured after each step, uploaded to Convex file storage
- [ ] Video recording of full run, uploaded to Convex file storage
- [x] Step results written to Convex: status, duration, error message, screenshot IDs
- [x] Run results written to Convex: pass/fail/skip counts, overall status
- [x] Legacy executor (`execution_type: "playwright"`) completely unchanged
- [x] Runner tests for Stagehand executor: mock Stagehand, verify result writing
- [ ] HITL: Verified against a real app with Stagehand test

## Implementation Summary

### Schema/query changes
- `getPendingWork` in `convex/runs/queries.ts` now returns `execution_type` and `steps` per test

### Shared types
- `runner/src/types.ts`: canonical `TestStep`, `RunTestItem`, `RunWorkItem` interfaces — single source of truth used by executor, stagehand-executor, index, and tests
- `runner/src/stagehand.ts`: added `StagehandInstance` type alias

### New files
- `runner/src/stagehand-executor.ts`: full Stagehand execution path
  - Initializes Stagehand with workspace BYOK config
  - Login via `act()` with variables (form auth)
  - NL steps via `stagehand.act(instruction, { variables, timeout })`
  - Code assertions via `page.evaluate()` with inline `assert` helper
  - Screenshots captured per step, uploaded to Convex file storage
  - Step results and run results written to Convex
  - Proper cleanup in `finally` block
- `runner/src/stagehand-executor.test.ts`: 12 tests covering execution flow, step results, screenshots, form login, failure handling, assertion code, error recovery, cleanup

### Dispatch
- `runner/src/index.ts`: `handleRun` dispatches based on `execution_type` — Stagehand tests go to `executeStagehandTests`, Playwright tests go to legacy `executeRun`
- `runner/src/executor.ts`: uses shared `RunWorkItem` type, legacy Playwright pipeline completely unchanged

### Not implemented
- Video recording: Stagehand's LOCAL mode doesn't expose video recording API. Can be added later via CDP screencast if needed.
- HITL: Requires running against a real app with AI-generated Stagehand tests

### Tests
- 12 new Stagehand executor tests pass
- 250 Convex tests pass (unchanged)
- 108 frontend tests pass (unchanged)

## Blocked by

- 022 — Install Stagehand + wire BYOK config
- 027 — Hybrid test format — schema + AI generation

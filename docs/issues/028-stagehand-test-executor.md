# 028 — Stagehand test executor in Runner

**Type**: HITL — needs human to verify against a real app
**Status**: needs-triage
**Blocked by**: 022, 027

## What to build

Add a new Stagehand execution path in the Runner. When a test has `execution_type: "stagehand"`, the Runner initializes Stagehand with the workspace's BYOK config, logs in via cached act() calls, and executes each NL step via `act()`. Code assertions within steps are executed via raw Playwright page operations. Screenshots, video, and artifacts are captured per step and uploaded to Convex file storage. Results are written back to Convex in the same format as legacy runs. The legacy Playwright executor is completely untouched — tests with `execution_type: "playwright"` still use the child process pipeline.

## Acceptance criteria

- [ ] Runner reads `execution_type` from test and dispatches to correct executor
- [ ] Stagehand executor initializes with workspace BYOK config (`env: "LOCAL"`)
- [ ] Login handled via Stagehand `act()` with variables
- [ ] NL steps executed via `stagehand.act(instruction)`
- [ ] Code assertions executed via raw Playwright page operations
- [ ] Screenshots captured after each step, uploaded to Convex file storage
- [ ] Video recording of full run, uploaded to Convex file storage
- [ ] Step results written to Convex: status, duration, error message, screenshot IDs
- [ ] Run results written to Convex: pass/fail/skip counts, overall status
- [ ] Legacy executor (`execution_type: "playwright"`) completely unchanged
- [ ] Runner tests for Stagehand executor: mock Stagehand, verify result writing
- [ ] HITL: Verified against a real app with Stagehand test

## Blocked by

- 022 — Install Stagehand + wire BYOK config
- 027 — Hybrid test format — schema + AI generation

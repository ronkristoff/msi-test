# 009 — Runner Foundation & Test Execution

**Type**: HITL — highest risk module, needs human verification of Playwright setup
**Blocked by**: 004, 005, 006

## What to build

The core test execution engine. Runner process subscribes to Convex for pending work, picks up pending runs, writes test code to a temp directory, generates `playwright.config.ts` with environment base URL, executes tests sequentially via Playwright, captures screenshots per step, console output, video, traces, and step-by-step data. Streams results back to Convex in real-time. Heartbeat mechanism for crash detection. Stale run detection via Convex cron.

End-to-end: User clicks "Run Tests" on suite page → `triggerRun` mutation creates Run record (status: running) → Runner picks up via Convex subscription → executes each approved test sequentially → writes step results via mutations as each step completes → sends heartbeats → on completion, marks Run as passed/failed → UI shows real-time progress via Convex subscriptions.

## Acceptance criteria

- [x] Runner process (`runner/src/index.ts`) subscribes to `getPendingWork` Convex query — uses polling (2s interval) via `ConvexHttpClient` rather than WebSocket subscription
- [x] When a pending Run appears, Runner picks it up and sets `runner_id` on the Run — `claimRun` internal mutation sets `runner_id` and `started_at`
- [x] Runner writes each test's Playwright code to a temp directory — `writeTestFile` in `runner/src/config.ts`, files named `test-{i}.spec.ts`
- [x] Runner generates `playwright.config.ts` with `use: { baseURL: environment.base_url }` from selected environment — `generatePlaywrightConfig` in `runner/src/config.ts`
- [x] Playwright executes tests sequentially (one browser instance) — `workers: 1` in generated config, `fullyParallel: false`
- [x] Screenshots captured at every step and stored via Convex file storage (`screenshot_file_id`) — executor scans `.png` files from test-results, uploads to Convex, stores as `screenshot_file_ids` array on `run_results`
- [x] Console output captured via `page.on('console')` events, stored in `run_results.console_log_file_id` — Playwright fixture in `msitest-fixture.ts` wraps `page` to capture console events, writes to `console.jsonl`, executor uploads to Convex
- [x] Video recording enabled, stored via Convex file storage (`video_file_id`) — config has `video: 'on'`, executor scans and uploads `.webm` files
- [x] Full trace captured, stored via Convex file storage (`trace_file_id`) — config has `trace: 'on'`, executor scans and uploads trace files
- [x] Step-by-step data parsed from Playwright JSON reporter output (command, locator, status, duration, error) — custom `MsiTestReporter` writes JSONL per step; executor reads and streams to Convex
- [x] Results streamed back to Convex via `writeStepResult` and `writeRunResult` mutations in real-time — step results written as JSONL during execution, then streamed to Convex
- [x] Heartbeat written to Run record (`last_heartbeat_at`) every N seconds during execution — 30s interval via `updateRunHeartbeat`, stored in `run_heartbeats` table
- [x] Convex cron job `markStaleRuns` marks Runs as failed when heartbeat is stale — `convex/crons.ts`, 60s interval, 120s stale threshold
- [x] "Run Tests" button on suite page triggers `triggerRun` mutation — environment selector + button on suite detail page
- [x] "Run single test" option triggers a run with one test — "Run Test" button on approved test cards in suite page, calls `triggerRun` with `test_id`
- [x] Real-time progress shown in UI via Convex subscriptions (which test is running, which step) — `getActiveRunForSuite` query powers active run indicator; run detail page shows live results via subscription
- [x] Runner logs execution details to stdout for debugging — `[timestamp] [runner-id]` prefixed log lines for all events
- [x] Integration test: minimal Playwright test against a local HTML fixture, verify screenshots, steps, console capture, and heartbeat — `runner/integration.test.ts` serves fixture via HTTP, runs Playwright through reporter+fixture pipeline, verifies steps.jsonl, summary.json, console.jsonl, screenshots, and video files

## Blocked by

- 004 — Suite & Test CRUD (tests with approved status)
- 005 — AI Provider Module (agent infrastructure)
- 006 — Environment Configuration (base URL for playwright.config.ts)

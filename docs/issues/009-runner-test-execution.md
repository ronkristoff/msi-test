# 009 — Runner Foundation & Test Execution

**Type**: HITL — highest risk module, needs human verification of Playwright setup
**Blocked by**: 004, 005, 006

## What to build

The core test execution engine. Runner process subscribes to Convex for pending work, picks up pending runs, writes test code to a temp directory, generates `playwright.config.ts` with environment base URL, executes tests sequentially via Playwright, captures screenshots per step, console output, video, traces, and step-by-step data. Streams results back to Convex in real-time. Heartbeat mechanism for crash detection. Stale run detection via Convex cron.

End-to-end: User clicks "Run Tests" on suite page → `triggerRun` mutation creates Run record (status: running) → Runner picks up via Convex subscription → executes each approved test sequentially → writes step results via mutations as each step completes → sends heartbeats → on completion, marks Run as passed/failed → UI shows real-time progress via Convex subscriptions.

## Acceptance criteria

- [ ] Runner process (`runner/src/index.ts`) subscribes to `getPendingWork` Convex query
- [ ] When a pending Run appears, Runner picks it up and sets `runner_id` on the Run
- [ ] Runner writes each test's Playwright code to a temp directory
- [ ] Runner generates `playwright.config.ts` with `use: { baseURL: environment.base_url }` from selected environment
- [ ] Playwright executes tests sequentially (one browser instance)
- [ ] Screenshots captured at every step and stored via Convex file storage (`screenshot_file_id`)
- [ ] Console output captured via `page.on('console')` events, stored in `run_results.console_logs`
- [ ] Video recording enabled, stored via Convex file storage (`video_file_id`)
- [ ] Full trace captured, stored via Convex file storage (`trace_file_id`)
- [ ] Step-by-step data parsed from Playwright JSON reporter output (command, locator, status, duration, error)
- [ ] Results streamed back to Convex via `writeStepResult` and `writeRunResult` mutations in real-time
- [ ] Heartbeat written to Run record (`last_heartbeat_at`) every N seconds during execution
- [ ] Convex cron job `markStaleRuns` marks Runs as failed when heartbeat is stale
- [ ] "Run Tests" button on suite page triggers `triggerRun` mutation
- [ ] "Run single test" option triggers a run with one test
- [ ] Real-time progress shown in UI via Convex subscriptions (which test is running, which step)
- [ ] Runner logs execution details to stdout for debugging
- [ ] Integration test: minimal Playwright test against a local HTML fixture, verify screenshots, steps, console capture, and heartbeat

## Blocked by

- 004 — Suite & Test CRUD (tests with approved status)
- 005 — AI Provider Module (agent infrastructure)
- 006 — Environment Configuration (base URL for playwright.config.ts)

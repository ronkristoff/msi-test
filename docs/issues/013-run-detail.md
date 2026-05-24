# 013 — Run Detail Page

**Type**: AFK
**Blocked by**: 009, 010

## What to build

Split-panel run detail view. Left panel: test list (failed tests first) with status badges. Right panel: step-by-step execution timeline, step screenshots with prev/next navigation, browser console output with color-coded log levels, same-failure cross-run history, test metadata, and log download.

End-to-end: Navigate to `/runs/[id]` → left panel shows tests in run (failed first) → click a test → right panel shows step timeline with pass/fail/skipped states → click a step → screenshot displayed with prev/next navigation → console output shown below → metadata panel shows duration/attempts/environment/retries.

## Acceptance criteria

- [ ] `/runs/[id]` renders a split-panel layout: test list on left, detail on right
- [ ] Test list shows all tests in the run, failed tests listed first
- [ ] Each test in the list shows: name, status badge (passed/failed/skipped), duration
- [ ] Clicking a test loads its details in the right panel
- [ ] Step timeline shows each step with: step number, command, locator, status indicator (pass/fail/skipped), duration
- [ ] Clicking a step displays its screenshot (loaded from Convex file storage)
- [ ] Prev/Next buttons navigate between step screenshots
- [ ] Browser console output shown with color-coded log levels: info (blue), warn (yellow), error (red)
- [ ] "Same failure across runs" section shows if this test failed in previous runs with links
- [ ] Test metadata panel shows: total duration, number of attempts, environment, retries
- [ ] Download button exports test logs as a text file
- [ ] `getRunDetail` query returns run with all run_results
- [ ] `getSteps` query returns steps for a given run_result, ordered by step_number

## Blocked by

- 009 — Runner Foundation & Test Execution (run results, steps, screenshots)
- 010 — Run Aggregation & Failure Analysis (AI insights for failure context)

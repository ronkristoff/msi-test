# 038 — Scheduled Monitoring / Cron Runs

**Type**: AFK
**Status**: needs-triage
**Blocked by**: 009

## What to build

Add a `schedules` table and UI for scheduling recurring test runs. Users pick a target (suite or test list), an environment, and a cadence (hourly, daily, weekly). A Convex cron picks up due schedules and triggers runs automatically. The monitoring page shows all schedules with status, next run time, last result, and a run-vs-run diff column highlighting which tests flipped status between consecutive runs.

This is the "set it and forget it" layer — users configure regression suites to re-verify on a cadence without manual triggering.

## Acceptance criteria

### Schema

- [ ] New `schedules` table: `{workspace_id, name, target_type: "suite"|"test_list", target_id, environment_id, cadence: {seconds: number}, enabled: boolean, last_run_at: optional number, next_run_at: optional number, created_by: string}`
- [ ] Index on `schedules` by `workspace_id` and by `next_run_at`
- [ ] Add `"scheduled"` literal to the `trigger_type` union on the `runs` table
- [ ] Add optional `schedule_id` field to `runs` table linking back to the originating schedule

### Backend

- [ ] New Convex cron `checkScheduledRuns` — runs every 60 seconds, queries schedules where `enabled = true` and `next_run_at <= now`, calls `triggerRun` for each due schedule, updates `last_run_at` and computes `next_run_at`
- [ ] Mutation `createSchedule` — validates target exists and user owns it, computes initial `next_run_at`
- [ ] Mutation `updateSchedule` — name, cadence, environment, enabled toggle
- [ ] Mutation `deleteSchedule` — removes schedule (does not affect past runs)
- [ ] Query `getSchedules` — workspace-scoped list with target name, environment, cadence label, last run status
- [ ] Query `getScheduleRuns` — paginated run history for a single schedule, each row includes diff summary against previous run

### Run diff

- [ ] Query `getScheduleRunDiff` — given two consecutive runs for the same schedule, returns which tests flipped status (new pass, new fail, new flaky)
- [ ] Diff surfaced as chips/badges on the monitoring run-history table: green chip for newly passing, red chip for newly failing, with test name

### Frontend

- [ ] New page `/monitoring` — lists all schedules in a table: name, target, environment, cadence, next run, last result status pill, enabled toggle switch, actions (edit/delete)
- [ ] Click schedule row → `/monitoring/[id]` detail page: schedule config, run history table with diff column, "Run Now" button
- [ ] Add "Monitoring" nav item to sidebar under "Overview" section (after Flakiness Map)
- [ ] Schedule creation: modal with target selector (suite or test list dropdown), environment selector, cadence picker (hourly/daily/weekly/custom hours), name field
- [ ] Edit schedule modal: same fields pre-filled
- [ ] Enabled toggle directly on the monitoring table row — no modal needed for pause/resume

## Blocked by

- 009 — Runner Foundation & Test Execution (scheduled runs use the same execution pipeline)
- 006 — Environment Configuration (schedules target a specific environment)

# ADR 0007: Convex Crons for Scheduled Test Runs

## Status

Accepted

## Context

Test runs are currently triggered manually — the user clicks "Run Tests" on a suite page. For regression testing to be effective, tests should run automatically on a cadence (hourly, daily, weekly) without human intervention. This is how teams catch regressions early.

The system already uses Convex crons for two tasks: marking stale runs (every 60 seconds) and clearing stale test locks (every 5 minutes). The scheduling infrastructure builds on the same pattern.

Alternatives considered:
- **External scheduler** (e.g., cron job on the Runner host, GitHub Actions scheduled workflow) — adds operational complexity. The Runner would need an endpoint or the scheduler would need Convex credentials. Defeats the "single process" simplicity.
- **Convex crons** — already proven in the codebase. Simple: a cron runs every minute, queries for schedules that are due, triggers runs via the existing `triggerRun` mutation. No new infrastructure.
- **SetInterval in the Runner** — the Runner could maintain its own schedule. But the Runner is stateless and may restart, losing in-memory timers. Schedule state belongs in the database.

## Decision

Use Convex crons for scheduled test runs. Add a `schedules` table to store recurring run configurations. A new Convex cron (`checkScheduledRuns`) runs every 60 seconds, queries schedules where `next_run_at <= now`, triggers runs via the existing `triggerRun` mutation (with `trigger_type: "scheduled"`), and updates `last_run_at` and `next_run_at` on the schedule.

Schedules can target either a suite or a test list (issue 039). The `triggerRun` mutation gains an optional `schedule_id` parameter to link runs back to their originating schedule.

Cadence options: hourly, daily, weekly, or custom (user specifies interval in hours). Stored as seconds internally for the cron calculation.

## Consequences

- Scheduling is fully managed within Convex — no external infrastructure needed.
- Reuses the existing run execution pipeline. Scheduled runs are indistinguishable from manual runs in the run detail UI (except for the `trigger_type: "scheduled"` label).
- The cron runs every 60 seconds, so the worst-case latency between a schedule's due time and execution is ~60 seconds. Acceptable for regression monitoring.
- Schedule management (create, edit, delete, pause/resume) is pure Convex mutations — straightforward to implement and test.
- Run history per schedule enables run-vs-run diffing (which tests flipped status between consecutive scheduled runs). This is the key insight for regression tracking.
- Scale concern: a single cron iteration processes all due schedules. If a workspace has many schedules due simultaneously, the cron function needs to handle them efficiently (batch processing, no sequential blocking).
- Cost: scheduled runs consume the same resources as manual runs (Runner time, AI tokens for failure analysis). Users should be aware of the cadence implications.

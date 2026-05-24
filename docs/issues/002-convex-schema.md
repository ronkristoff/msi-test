# 002 — Convex Schema Foundation

**Type**: AFK
**Blocked by**: None — can start immediately

## What to build

Define the full Convex database schema with all tables and indexes needed by every module. This is a pure data-layer slice — no UI. Tables: `projects`, `suites`, `tests`, `runs`, `run_results`, `steps`, `ai_insights`, `environments`, `integrations`, `alert_rules`, `run_heartbeats`. The `workspaces` table is defined in issue 001 but must exist before this schema is functional.

End-to-end: Convex schema file (`convex/schema.ts`) defines all tables → indexes for common query patterns → schema deploys to Convex dev → other modules can build on top.

## Design decisions

1. **No explicit `created_at`** — Convex auto-appends `_creationTime` to every document. Use that instead of duplicating as `created_at`.
2. **`workspace_id` on all tables** — enables direct indexed lookups and single-field authorization checks on every table. Required for future multi-tenancy without migration.
3. **Heartbeats separated from runs** — `last_heartbeat_at` is high-churn operational data. Storing it inline on `runs` causes write contention with dashboard reads. Moved to dedicated `run_heartbeats` table per Convex best practices.
4. **Console logs as file storage** — `console_logs` was an unbounded array of objects (hits 1MB document limit). Replaced with `console_log_file_id` referencing a JSON file in Convex storage, consistent with how traces and videos are stored.
5. **`environment_id` FK instead of string** — `runs.environment` changed from a string to `environment_id: v.optional(v.id("environments"))`. Consistent with all other relationships in the schema. Convex doesn't enforce FK constraints, so deleting an environment won't cascade.
6. **`test_id` on runs for single-test runs** — added nullable `test_id` to runs. Mutations enforce: either `suite_id` or `test_id` is set (never both, never neither). Gives the Runner an unambiguous way to know what to execute.
7. **Run status values** — removed `flaky` (flakiness is a cross-run computed property at the test level, not a single-run status). Added `cancelled` (user-initiated stop) and `timed_out` (stale heartbeat).
8. **Enum literal unions** — all fields with known value sets use `v.union(v.literal(...))` for database-level validation. Adding new values later is a single schema push.
9. **`suites.source_type` includes `manual`** — user story 62 allows manual suite creation. Added `manual` as a fourth source type. `runs.trigger_type` drops `scheduled` (out of scope for MVP).
10. **`integrations.config` as typed union** — not a generic JSON blob. `v.union(v.object({webhook_url: v.string()}), v.object({repo: v.string(), webhook_secret: v.string()}))`. Full schema-level validation per integration type.
11. **`confidence_score` as 0–1 float** — AI models return 0–1. UI multiplies by 100 for display. No conversion at write time.

## Acceptance criteria

- [x] `convex/schema.ts` defines all 11 new tables (plus existing `workspaces` and `error_logs`)
- [x] `projects` — workspace_id, name, app_url, prd_text (optional), prd_file_id (optional); index: by_workspace_id
- [x] `suites` — workspace_id, project_id, name, description (optional), source_type (`url_exploration | prd | natural_language | manual`); indexes: by_workspace_id, by_project_id
- [x] `tests` — workspace_id, suite_id, name, description (optional), playwright_code (string), source_type (`url_exploration | prd | natural_language`), status (`draft | approved`); indexes: by_workspace_id, by_suite_id
- [x] `runs` — workspace_id, suite_id (optional), test_id (optional), rerun_of_run_id (optional), rerun_of_test_id (optional), project_id, environment_id (optional, FK to environments), trigger_type (`manual | ci | rerun`), branch (optional), commit (optional), status (`running | passed | failed | cancelled | timed_out`), runner_id (optional, string), started_at (optional), finished_at (optional), duration_ms (optional); indexes: by_workspace_id, by_project_id, by_project_id_and_status, by_suite_id, by_status
- [x] `run_results` — workspace_id, run_id, test_id, status (`passed | failed | skipped`), duration_ms, retries, console_log_file_id (optional, file storage), trace_file_id (optional), video_file_id (optional); indexes: by_run_id, by_test_id
- [x] `steps` — workspace_id, run_result_id, step_number, command, locator (optional), status (`passed | failed | skipped`), error_message (optional), screenshot_file_id (optional), duration_ms; index: by_run_result_id
- [x] `ai_insights` — workspace_id, test_id, run_id, type (`root_cause | flakiness_cluster`), analysis_text, suggested_fix (optional), confidence_score (0–1 float); indexes: by_workspace_id, by_test_id
- [x] `environments` — workspace_id, project_id, name, base_url; indexes: by_workspace_id, by_project_id
- [x] `integrations` — workspace_id, type (`slack | github`), config (typed union: `{webhook_url}` for slack, `{repo, webhook_secret}` for github), status (`active | inactive`); index: by_workspace_id
- [x] `alert_rules` — workspace_id, integration_id, trigger_event (string, validated in mutation), threshold (optional, number), enabled (boolean); index: by_integration_id
- [x] `run_heartbeats` — workspace_id, run_id, last_heartbeat_at (number); index: by_run_id
- [ ] Schema deploys successfully to Convex dev (`pnpm dev:convex`)

## Blocked by

None — can start immediately. (Issue 001 must also land for `workspaces` table, but schema definition is independent.)

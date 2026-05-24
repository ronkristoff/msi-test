# 002 — Convex Schema Foundation

**Type**: AFK
**Blocked by**: None — can start immediately

## What to build

Define the full Convex database schema with all tables and indexes needed by every module. This is a pure data-layer slice — no UI. Tables: `projects`, `suites`, `tests`, `runs`, `run_results`, `steps`, `ai_insights`, `environments`, `integrations`, `alert_rules`. The `workspaces` table is defined in issue 001 but must exist before this schema is functional.

End-to-end: Convex schema file (`convex/schema.ts`) defines all tables → indexes for common query patterns → schema deploys to Convex dev → other modules can build on top.

## Acceptance criteria

- [ ] `convex/schema.ts` defines all 11 tables matching the PRD schema spec
- [ ] `projects` — id, workspace_id, name, app_url, prd_text, prd_file_id, created_at; index on workspace_id
- [ ] `suites` — id, project_id, name, description, source_type, created_at; index on project_id
- [ ] `tests` — id, suite_id, name, description, playwright_code (string), source_type, status (draft/approved), created_at; index on suite_id
- [ ] `runs` — id, suite_id (nullable), rerun_of_run_id (nullable), rerun_of_test_id (nullable), project_id, trigger_type, branch, commit, environment, status, runner_id, last_heartbeat_at, started_at, finished_at, duration_ms; index on suite_id, project_id, status
- [ ] `run_results` — id, run_id, test_id, status, duration_ms, retries, console_logs, trace_file_id, video_file_id; index on run_id, test_id
- [ ] `steps` — id, run_result_id, step_number, command, locator, status, error_message, screenshot_file_id, duration_ms; index on run_result_id
- [ ] `ai_insights` — id, workspace_id, test_id, run_id, type, analysis_text, suggested_fix, confidence_score, created_at; index on workspace_id, test_id, run_id
- [ ] `environments` — id, project_id, name, base_url, created_at; index on project_id
- [ ] `integrations` — id, workspace_id, type, config (JSON), status, created_at; index on workspace_id
- [ ] `alert_rules` — id, integration_id, trigger_event, threshold, enabled; index on integration_id
- [ ] Schema deploys successfully to Convex dev (`pnpm dev:convex`)

## Blocked by

None — can start immediately. (Issue 001 must also land for `workspaces` table, but schema definition is independent.)

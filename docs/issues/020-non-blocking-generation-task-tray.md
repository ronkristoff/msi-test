# 020 — Non-Blocking AI Generation & Task Tray

**Status**: needs-triage
**Type**: Feature
**Blocked by**: 019 (needs `triggered_by` field on suites and workspace membership for user attribution)

## Problem Statement

AI test generation (exploration, PRD, natural language) is a long-running operation (30s–2min) that currently blocks the UI. When a QA engineer clicks "Generate Tests", the page freezes and they cannot navigate away or do other work while waiting. Teams need visibility into what background tasks are running and who triggered them.

## Solution

Two capabilities:

1. **Non-blocking AI generation** — Test generation runs in the background. The user is immediately redirected to the suite page, which shows a live "Generating..." state. Tests appear in real-time as the AI creates them. The user can navigate anywhere and continue working.

2. **Task tray** — A persistent indicator in the topbar shows all active background tasks across the workspace (who is generating what, who is running what). Clicking a task navigates to the relevant suite or run page. Completed tasks appear briefly before fading.

## User Stories

### Non-Blocking Generation

1. As a QA engineer, I want to trigger test generation and immediately navigate to other pages, so that I am not blocked while the AI works
2. As a QA engineer, I want to see a live "Generating tests..." indicator on the suite page, so that I know generation is in progress
3. As a QA engineer, I want to see tests appear one-by-one in the suite as the AI generates them, so that I have real-time visibility into progress
4. As a QA engineer, I want to see a clear error message if AI generation fails, so that I can take corrective action
5. As a QA engineer, I want to retry a failed generation, so that I can recover from transient AI errors
6. As a QA engineer, I want to trigger exploration-based generation in the background, so that I can keep working after selecting scenarios
7. As a QA engineer, I want to trigger PRD-based generation in the background, so that I can keep working while tests are created
8. As a QA engineer, I want to trigger natural language generation in the background, so that I can keep working while the AI writes tests

### Task Tray

9. As a QA engineer, I want to see a task indicator in the topbar showing how many background tasks are active, so that I have awareness of ongoing work at a glance
10. As a QA engineer, I want to click the task indicator to see a dropdown of all active and recently completed tasks, so that I can get details without leaving my current page
11. As a QA engineer, I want each task in the tray to show who triggered it and what is happening, so that I know the context of each task
12. As a QA engineer, I want to click a task in the tray to navigate to the relevant suite or run page, so that I can quickly jump to the action
13. As a QA engineer, I want completed tasks to appear in the tray briefly before disappearing, so that I get confirmation that something finished
14. As a team member, I want to see tasks triggered by other members in my workspace, so that I know what my colleagues are doing
15. As a team member, I want to see that a colleague is currently generating tests into a suite, so that I understand why a suite shows a "generating" state
16. As a QA engineer, I want the task tray to update in real-time without refreshing the page, so that I always have current status

## Implementation Decisions

### Data Model

- **Suite status** adds three fields to the `suites` table: `status` (generating | ready | failed), `generation_error` (optional string), `triggered_by` (optional user_id string). The `status` field defaults to `"ready"` for manually created suites and `"generating"` for AI-generated suites.
- No new tables needed for the task tray — it queries existing suites and runs filtered by workspace and active status.

### Non-Blocking Generation Architecture

- The current generation actions (`generateExplorationTests`, `generatePrdTests`, `generateNlTests`) create the suite internally and block until all tests are generated. These are refactored to accept a `suite_id` argument (pre-created suite) instead of creating the suite themselves.
- The generation pages (explore, generate, generate-nl) follow a three-step pattern: (1) create suite via mutation with `status: "generating"` — returns suiteId instantly, (2) navigate to the suite page immediately, (3) fire the generation action as a background call without awaiting.
- The Convex action runs server-side regardless of client navigation. On success, it sets `suite.status: "ready"`. On failure, it sets `suite.status: "failed"` with `generation_error`.
- The suite page subscribes to the suite document and the tests query via Convex real-time subscriptions. Tests appear as they're created. The "Generating..." banner updates live.

### Task Tray

- A new `getActiveTasks` query returns all suites with `status: "generating"` or suites locked with `locked_reason: "running"`, scoped to the current workspace. This single query powers the entire task tray.
- The `TaskTray` component is rendered in the `Topbar` inside `AppLayout`, making it visible on every page. It subscribes to `getActiveTasks` via Convex real-time subscription.
- The tray shows: active generating suites (with test count and who triggered), active runs (with run status and who triggered), and recently completed tasks (suites that transitioned to "ready" in the last 5 minutes).
- Each task item is clickable and navigates to the relevant page (suite detail or run detail).
- The task count badge in the topbar shows the number of active tasks with a spinner animation.

### Modules

1. **Generation Refactor** (shallow) — Modify three existing actions to accept pre-created suite_id and update status. Thin change to existing code.
2. **Task Tray Query** (medium) — Single `getActiveTasks` query that aggregates generating suites and active runs, with user attribution. Tested in isolation.
3. **Task Tray Component** (medium) — React component with Convex subscription, dropdown UI, navigation. Component tested with `@testing-library/react`.
4. **Frontend Page Updates** (shallow) — Modify three generation pages (fire-and-forget pattern), suite page (generating/failed banner).

### API Surface

**New queries:**
- `getActiveTasks` — returns generating/locked suites and active runs for the workspace, with triggered-by user names

**Modified mutations:**
- `createSuite` — accepts optional `status`, `triggered_by` args

**Modified actions:**
- `generateExplorationTests` — accepts `suite_id` instead of creating suite internally; sets suite status on completion/failure
- `generatePrdTests` — accepts `suite_id`; sets suite status
- `generateNlTests` — accepts `suite_id` as required; sets suite status

### Fire-and-Forget Pattern

The three generation pages follow this pattern:
1. Call `createSuite` mutation with `status: "generating"`, `triggered_by: userId` — returns `suiteId` instantly
2. Navigate to suite page via `router.push`
3. Fire the generation action via `.then()` without awaiting — errors are captured by setting `suite.status: "failed"` with `generation_error`

This is safe because the Convex action runs server-side regardless of client navigation. The action is responsible for setting the final suite status. The client observes status changes via Convex real-time subscriptions.

## Testing Decisions

### What makes a good test

Test external behavior, not implementation details. Assert on database state after mutations, query return values, and error conditions. Mock AI calls. Tests must be deterministic.

### Modules to test

**Generation Refactor (integration)**
- Generation action creates tests into pre-created suite
- Generation action sets suite status to "ready" on success
- Generation action sets suite status to "failed" with error on AI failure
- Prior art: `convex/ai/generateNlTests.test.ts`, `convex/ai/prd-generation.test.ts`

**Task Tray Query (unit)**
- Returns suites with status "generating"
- Returns suites locked with reason "running"
- Does not return suites that are "ready" and unlocked
- Scoped to current workspace only
- Includes triggered-by user names
- Prior art: `convex/suites.queries.test.ts`

**Frontend Components (component tests)**
- TaskTray shows active tasks with correct user names
- TaskTray badge shows correct count
- TaskTray dropdown navigates to correct pages on click
- Suite page shows "Generating..." banner when status is "generating"
- Suite page shows error banner when status is "failed"
- Suite page shows retry button on failed generation
- Generation pages navigate immediately after creating suite
- Prior art: `src/components/RunsList.test.tsx`, `src/app/(auth)/projects/[id]/explore/explore.test.tsx`

## Out of Scope

- Task tray notifications (push notifications, sound alerts)
- Task history / activity log
- Cancelling in-progress generation
- Generation progress percentage (only test count is available)
- Email or Slack notifications for generation completion

## Further Notes

- This PRD depends on PRD 019 (Team Collaboration & Resource Locking) because it needs the `triggered_by` field on suites and workspace membership for user attribution in the task tray.
- The task tray is powered by a single Convex query and real-time subscriptions. No polling, no WebSocket management, no additional infrastructure.
- The `getActiveTasks` query works in single-user mode too — it just shows the current user's own tasks. No behavior change for solo users.
- The fire-and-forget pattern could be extended to other long-running operations in the future (e.g., bulk test regeneration, batch runs).

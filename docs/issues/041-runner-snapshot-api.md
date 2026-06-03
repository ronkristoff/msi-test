# 041 — Runner Snapshot API

**Type**: AFK
**Status**: done

## What to build

Add an HTTP server to the Runner that exposes two endpoints for live DOM context. The server runs on a separate port from the main Runner work loop and uses its own Stagehand instance so snapshot requests don't queue behind active runs or explorations.

**`POST /snapshot`** — Navigates to a URL, captures a Playwright aria snapshot and interactive elements, returns structured data for AI consumption.

**`POST /validate-test`** — Writes a Playwright test to a temp file, executes it against the target URL, and returns pass/fail status. On failure, captures a snapshot at the failure point so the AI can see what went wrong.

Both endpoints require `Authorization: Bearer <RUNNER_SECRET>`. Sessions are managed per-project with lazy Stagehand init and 10-minute idle cleanup.

New env var: `RUNNER_API_PORT` (default `8931`).

## Acceptance criteria

- [x] Runner starts an HTTP server on `RUNNER_API_PORT` alongside the existing poll loop
- [x] `POST /snapshot` accepts `{ project_id, url, workspace_id }`, navigates using Stagehand, returns `{ aria_snapshot, page_title, url }`
- [x] `POST /validate-test` accepts `{ project_id, url, workspace_id, playwright_code }`, writes test to temp file, runs Playwright, returns `{ passed, error_message? }`
- [x] Both endpoints reject requests without valid `Authorization: Bearer <RUNNER_SECRET>` header
- [x] Stagehand instances are cached per-project and auto-closed after 10 minutes of inactivity
- [x] Snapshot API uses a separate Stagehand instance from the main Runner work loop (no interference)
- [x] Unreachable URLs return structured error responses (not crashes)
- [x] `runner/src/snapshot-api.ts` with unit tests covering: auth rejection, successful snapshot, failed navigation, test validation pass/fail, session cleanup
- [x] Existing Runner tests and test execution still pass unchanged

## Blocked by

None — can start immediately.

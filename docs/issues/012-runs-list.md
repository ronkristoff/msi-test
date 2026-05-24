# 012 — Runs List & Filtering

**Type**: AFK
**Blocked by**: 009, 010

## What to build

Paginated, filterable, sortable runs table. Status tabs (All/Failed/Flaky/Running/Passed), filters for branch/environment/result, search by name/file/ID, sort options. Click a run to navigate to run detail.

End-to-end: `/runs` page → `getRuns` query with pagination cursor, status filter, search term, sort parameter → tab bar for status filtering → filter dropdowns for branch/environment → search input → sortable column headers → click row navigates to `/runs/[id]`.

## Acceptance criteria

- [ ] `/runs` page displays paginated list of all runs in current workspace
- [ ] Status tabs filter runs: All, Failed, Flaky, Running, Passed
- [ ] Filter dropdowns for branch, environment, and result
- [ ] Search input filters by run name, test file name, or run ID
- [ ] Sort options: recency (default), duration, failure count, flakiness
- [ ] Pagination with cursor-based loading (load more or page numbers)
- [ ] Each run row shows: suite name, status badge, trigger type, environment, duration, timestamp
- [ ] Click a run row navigates to `/runs/[id]` (run detail page)
- [ ] `getRuns` query supports pagination, filtering, sorting, and search parameters

## Blocked by

- 009 — Runner Foundation & Test Execution (run records to list)
- 010 — Run Aggregation & Failure Analysis (aggregated run status)

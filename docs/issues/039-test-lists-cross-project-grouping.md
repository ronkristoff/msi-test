# 039 — Test Lists (Cross-Project Grouping)

**Type**: AFK
**Status**: needs-triage
**Blocked by**: 004, 009

## What to build

Add a `test_lists` table for grouping tests across projects and suites into a single executable list. Think of it as a "playlist" for tests — users pick individual tests from any suite and combine them into a named list for targeted re-runs, CI gates, or scheduled monitoring. Test lists are the execution target for scheduled monitoring (issue 038) and a natural grouping unit for CI pipelines.

A test list is a flat collection of test references. It does not copy or move tests — it points to them in their original suites. When a source test is deleted, the list entry becomes stale and is flagged.

## Acceptance criteria

### Schema

- [ ] New `test_lists` table: `{workspace_id, name, description: optional string, created_by: string}`
- [ ] Index on `test_lists` by `workspace_id`
- [ ] New `test_list_members` table: `{workspace_id, test_list_id, test_id, source_suite_id, source_project_id, added_at: number}`
- [ ] Index on `test_list_members` by `test_list_id`, by `test_id`

### Backend

- [ ] Mutation `createTestList` — name + description, returns test_list_id
- [ ] Mutation `updateTestList` — rename, update description
- [ ] Mutation `deleteTestList` — removes list and all members (does not affect source tests/suites)
- [ ] Mutation `addTestToList` — takes test_list_id + test_id, resolves source_suite_id and source_project_id automatically, validates test exists and user owns it, prevents duplicate entries
- [ ] Mutation `removeTestFromList` — removes a single member entry
- [ ] Query `getTestLists` — workspace-scoped list with aggregated member_count, last_run_status (if any run targets this list)
- [ ] Query `getTestListDetail` — list metadata + members with resolved test name, suite name, project name, test status (draft/approved), staleness flag
- [ ] Mutation `addTestsToList` — batch version: takes array of test_ids, adds all that aren't already members
- [ ] Update `triggerRun` to accept optional `test_list_id` — when provided, resolves all member tests, creates a single Run across them (one run_result per member test, suite_id null since it spans suites)

### Frontend

- [ ] New page `/test-lists` — grid of test list cards: name, member count, last run status pill, created date. "New Test List" button top right
- [ ] Detail page `/test-lists/[id]` — header with name + description (inline editable), member tests table with columns: test name, source suite (link), source project (link), test status pill, remove button
- [ ] "Add Tests" button on detail page — opens a modal with a searchable/filterable list of all approved tests in the workspace, checkbox multi-select, confirm adds selected
- [ ] "Run All" button with environment selector dropdown — triggers `triggerRun` with `test_list_id`
- [ ] Run history section on detail page — recent runs that targeted this list, with status pills and links to run detail
- [ ] Stale member indicator — if a source test has been deleted, show a red "Test deleted" badge on the member row with a "Remove" action
- [ ] Add "Test Lists" nav item to sidebar under "Testing" section (between Projects and AI Insights)

### Integration points

- [ ] Suite detail page: "Add to Test List" button on each test row — dropdown to pick target list, or "New list..." option
- [ ] Issue 038 integration: schedule creation modal offers "Test List" as a target_type option alongside "Suite" — populates dropdown with available test lists

## Blocked by

- 004 — Suite & Test CRUD (tests must exist to be added to lists)
- 009 — Runner Foundation & Test Execution (test list runs use the same execution pipeline)

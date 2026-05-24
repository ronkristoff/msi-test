# 004 — Suite & Test CRUD with Code Editor

**Type**: AFK
**Blocked by**: 002, 003

## What to build

Suite management and test review/editing flow. User can view suites per project, open a suite to see all tests, view and edit Playwright code inline, change test status from draft to approved, delete tests, and delete/archive suites. Suite creation happens manually or auto-created by generation flows (later slices).

End-to-end: Suite list page (`/suites`) → suite detail page (`/projects/[id]/suites/[suiteId]`) with inline Playwright code editor → draft/approved status toggle → delete test/suite → all via Convex mutations.

## Acceptance criteria

- [ ] `/suites` page lists all suites for the current project with name, test count, last run status, and source type
- [ ] Suite detail page shows all tests in the suite with name, status (draft/approved badge), and source type
- [ ] Inline code editor displays the Playwright code for each test (monospace font, syntax highlighting)
- [ ] User can edit and save Playwright code via `updateTestCode` mutation
- [ ] User can approve a test (change status from draft to approved) via `approveTest` mutation
- [ ] User can delete individual tests via `deleteTest` mutation
- [ ] User can delete or archive a suite via `deleteSuite` mutation
- [ ] User can rename a suite via `updateSuite` mutation
- [ ] `createSuite` mutation auto-generates descriptive default name (e.g., "New Suite — May 24")
- [ ] `getSuites` query returns suites scoped to project, ordered by creation date
- [ ] `getTests` query returns tests for a suite, ordered by creation date

## Blocked by

- 002 — Convex Schema Foundation (suites, tests tables)
- 003 — Project CRUD (project context)

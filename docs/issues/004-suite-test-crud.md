# 004 — Suite & Test CRUD with Code Editor

**Type**: AFK
**Blocked by**: 002, 003

## What to build

Suite management and test review/editing flow scoped to projects. User can view suites on the project detail page, open a suite to see all tests in an accordion with an inline code editor, toggle test status between draft and approved, edit and save Playwright code, delete tests and suites. Suite creation is one-click with an auto-generated name. No global `/suites` page — suites live under projects.

End-to-end: Project detail page (`/projects/[id]`) shows suite list → "Create Suite" button auto-creates with default name → click suite → suite detail page (`/projects/[id]/suites/[suiteId]`) with test accordion → expand test to see textarea + syntax-highlighted preview → edit, save, approve/revert, delete → all via Convex mutations.

## Design decisions

1. **Suites scoped to projects, no global `/suites`** — the `/suites` route and sidebar nav item are removed. The project detail page at `/projects/[id]` IS the suite list. Suites are always accessed through a project.
2. **Suite detail uses accordion layout** — tests listed as expandable rows. Expanding a test reveals the code editor (textarea + read-only syntax-highlighted preview). No split pane, no separate test detail page.
3. **One-click suite creation** — "Create Suite" button on project detail instantly creates a suite with auto-generated name (e.g., "New Suite — May 24") and `source_type: manual`. No form, no new route. User renames inline on the suite detail page.
4. **No manual test creation** — tests only come from generation flows (issues 014, 007, 008). This issue handles viewing, editing, approving, and deleting existing tests.
5. **Approval is a toggle (draft ↔ approved)** — `updateTestStatus` mutation handles both directions. The Runner only executes approved tests. Users can revert to draft to mark for re-review.
6. **Hard delete with confirmation dialog** — no archive. `deleteSuite` cascades to delete all tests in the suite. Run history (`run_results`, `steps`) is preserved; UI handles orphaned references with "Deleted test" labels.
7. **`source_type` is read-only** — immutable metadata set at creation. Displayed as a badge, never editable.
8. **Code editor: textarea + syntax-highlighted preview** — textarea for editing, read-only syntax-highlighted view alongside it using `highlight.js` or `prism.js`. Explicit save button with dirty state indication.
9. **Last run status deferred** — the Runner isn't built yet. Suite detail shows: name (inline-editable), description, source type badge, test count. Last run status added when the Runs module is built.
10. **`getSuites` returns `testCount` server-side** — batch-counts tests per suite using the `by_suite_id` index. Avoids N+1 queries on the frontend.
11. **`createSuite` accepts optional name/description** — auto-generates name when not provided. Same mutation used by generation flows (issues 014, 007, 008) with custom names.
12. **`updateSuite` accepts optional name and/or description** — general-purpose update mutation. Only updates fields that are provided.
13. **Separate `convex/suites/` and `convex/tests/` directories** — follows existing domain-per-directory convention. Each stays under 200 lines.

## Routes

| Route | Purpose |
|-------|---------|
| `/projects/[id]` | Project detail — info card + suite list with "Create Suite" button |
| `/projects/[id]/suites/[suiteId]` | Suite detail — inline-renameable header, test accordion with code editor |

**Removed:** `/suites` route (gone), "Suites" sidebar nav item (removed).

## Backend

- `convex/suites/queries.ts` — `getSuites(projectId)` returns suites with computed `testCount`, ordered by creation date; `getSuite(suiteId)` returns single suite
- `convex/suites/mutations.ts` — `createSuite(projectId, name?, description?)` auto-generates name when missing, sets `source_type: manual`; `updateSuite(suiteId, name?, description?)` updates provided fields; `deleteSuite(suiteId)` cascades to delete all tests in suite
- `convex/tests/queries.ts` — `getTests(suiteId)` returns tests for a suite, ordered by creation date
- `convex/tests/mutations.ts` — `updateTestCode(testId, playwrightCode)` saves edited code; `updateTestStatus(testId, status)` toggles draft↔approved; `deleteTest(testId)` hard deletes, preserves run history

## Frontend

- Update `src/app/(auth)/projects/[id]/page.tsx` — replace suites empty state with suite list (cards showing name, test count, source type badge) + "Create Suite" button
- New `src/app/(auth)/projects/[id]/suites/[suiteId]/page.tsx` — suite header (inline-editable name, source type badge, test count, delete button) + test accordion (name, status badge, source type, expand to show textarea + syntax-highlighted preview + save/approve/delete actions)
- Update `src/components/AppLayout.tsx` — remove "Suites" nav item from sidebar
- Update `src/lib/use-breadcrumbs.ts` — add suite route: `/projects/[id]/suites/[suiteId]` → Projects > {project name} > {suite name}
- Update `src/app/(auth)/layout.tsx` — remove `/suites` from `PAGE_META`

## Breadcrumbs

| Route | Breadcrumbs |
|-------|-------------|
| `/projects/[id]` | Projects > {project name} |
| `/projects/[id]/suites/[suiteId]` | Projects > {project name} > {suite name} |

## Acceptance criteria

- [x] Project detail page (`/projects/[id]`) shows suite list with name, test count, and source type badge
- [x] "Create Suite" button on project detail creates a suite with auto-generated name instantly
- [x] `createSuite` mutation auto-generates descriptive default name (e.g., "New Suite — May 24") when name not provided
- [x] `createSuite` mutation sets `source_type: manual`
- [x] Clicking a suite card navigates to `/projects/[id]/suites/[suiteId]`
- [x] Suite detail page shows suite name (inline-editable via `updateSuite`), source type badge, test count
- [x] Suite detail page has "Delete Suite" button with confirmation dialog
- [x] `deleteSuite` cascade-deletes all tests in the suite
- [x] Suite detail page shows all tests as expandable accordion rows with name, status badge, and source type
- [x] Expanding a test reveals textarea for editing + read-only syntax-highlighted preview of Playwright code
- [x] User can edit and save Playwright code via explicit save button with dirty state indication
- [x] User can toggle test status between draft and approved via `updateTestStatus` mutation
- [x] User can delete individual tests via `deleteTest` mutation with confirmation
- [x] `getSuites` query returns suites scoped to project with computed `testCount`, ordered by creation date
- [x] `getTests` query returns tests for a suite, ordered by creation date
- [x] "Suites" sidebar nav item removed
- [x] `/suites` route removed
- [x] Breadcrumbs work for suite detail page: Projects > {project name} > {suite name}
- [x] `source_type` displayed as read-only badge, not editable

## Blocked by

- 002 — Convex Schema Foundation (suites, tests tables)
- 003 — Project CRUD (project context)

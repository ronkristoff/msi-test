---
baseline_commit: ea7f325
---

# Story 4.4: Story Export

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a BA,
I want to export approved user stories as a downloadable Markdown file or copyable text,
so that I can share them with the development team or client outside the platform.

## Acceptance Criteria

1. **AC1 — Bulk Markdown export from the stories list page**: The stories list page (`src/app/(auth)/projects/[id]/stories/page.tsx`) is MODIFIED to add: (a) a checkbox on each `<StoryCard>` for selection, (b) an "Export" dropdown control in the page header (between the status filter and the "Back to Project" link — see AC7 for exact placement). When the BA has selected ≥1 story via checkboxes and clicks "Export" → "Markdown", the system fetches the FULL story docs for the selected IDs via a NEW query `api.stories.queries.getStoriesByIds` (AC4), builds a single combined Markdown document via `buildStoriesMarkdown(stories)` (AC5), and downloads it as `stories-export-{YYYYMMDD}.md` via `downloadFile` (AC8). The file contains a top-level `# User Stories Export` heading, a metadata line (`_N story(ies) · Exported {ISO date}_`), then each story rendered via the single-story Markdown format (AC5). If zero stories are selected, the Export button is disabled. The dropdown closes after selection (mirror `ExportBaselineRd.tsx:103,120,138` `close()` pattern).

2. **AC2 — Copy single story to clipboard from the detail page**: The story detail page (`src/app/(auth)/projects/[id]/stories/[storyId]/page.tsx`) is MODIFIED to add a "Copy to Clipboard" `<Button variant="secondary" size="sm">` in the article header's action row (between the status badge and the content sections — see AC7). Clicking it copies `buildStoryMarkdown(story)` (AC5) to the clipboard via `navigator.clipboard.writeText(...)`. On success: the button label temporarily changes to "Copied!" for 2 seconds (then reverts). On error (clipboard API rejection, e.g. permissions denied or non-HTTPS context): `<Alert variant="error">` rendered inline + `logError`. The button is disabled + shows "Copying…" while the clipboard promise is pending (mirror the `isTransitioning` pending-guard pattern from the existing status buttons at `[storyId]/page.tsx:269-283`). **No `ConfirmDialog`** — copy is non-destructive.

3. **AC3 — Single-story Markdown download from the detail page**: The detail page also gains an "Export" dropdown (mirror `ExportBaselineRd.tsx` structure — trigger button + absolutely-positioned menu + click-outside/Escape close). Options: "Markdown" (always, when story is viewable). Clicking "Markdown" calls `downloadFile(buildStoryMarkdown(story), \`story-{slugified-title}.md\`, "text/markdown;charset=utf-8;")` (AC8). The dropdown is visible for ALL story statuses (draft, approved, exported) — there is no "approved only" gate on single-story export (the BA may export a draft for review). The BMAD option appears only when the story has `technical_context` OR the project has `bmad_detected === true` (AC9).

4. **AC4 — `getStoriesByIds` query with batch ownership check (B3 IDOR)**: A NEW query `api.stories.queries.getStoriesByIds` is added to `convex/stories/queries.ts`. Args: `{ ids: v.array(v.id("user_stories")) }`. The handler performs ONE workspace lookup (`getMemberWorkspace(ctx)` — throws `ConvexError("Not authenticated")` if no session, mirroring `getThread` at `convex/chat/queries.ts:104-119`), then batch-fetches each story via `ctx.db.get(id)`, filters out nulls AND cross-workspace rows (`story.workspace_id !== workspace._id` → excluded), and returns `Doc<"user_stories">[]` (the full docs, NOT summary shape). Cross-workspace IDs in the selection are SILENTLY EXCLUDED (not errors) — the BA never sees another workspace's data, and a mixed selection doesn't fail the whole export. Empty `ids` array returns `[]`. No `.take()` bound (the selection size is the bound — the BA selected them). This is a SINGLE workspace lookup + N `ctx.db.get` calls (not N `getOptionalOwnedEntity` calls) for efficiency — the workspace is resolved once and reused for all ownership checks (avoids N redundant `getMemberWorkspace` calls; mirrors the batch pattern the spec recommends over per-entity `getOptionalOwnedEntity` fan-out).

5. **AC5 — `exportFormatters.ts` pure module**: A NEW pure module `src/app/(auth)/projects/[id]/stories/exportFormatters.ts` exports three formatter functions (NO React, NO Convex, NO DOM imports — fully unit-testable like `baseline/exportFormatters.ts`):
   - `buildStoryMarkdown(story: StoryExport): string` — single story as Markdown. Format:
     ```markdown
     ## {title}

     **As a** {user_story.as_a}
     **I want** {user_story.i_want}
     **So that** {user_story.so_that}

     ### Acceptance Criteria

     1. {ac_1}
     2. {ac_2}

     ### Affected Components

     - **Modules:** {modules.join(", ") | "None identified"}
     - **APIs:** {apis.join(", ") | "None identified"}
     - **Data Models:** {data_models.join(", ") | "None identified"}

     {technical_context ? "### Technical Context\n\n" + technical_context : ""}
     ```
   - `buildStoriesMarkdown(stories: StoryExport[]): string` — combined export. Top-level `# User Stories Export`, metadata line `_N story(ies) · Exported {ISO date}_`, blank line, then each story via `buildStoryMarkdown` joined by `\n\n---\n\n` (horizontal rule between stories). Empty array → `# User Stories Export\n\n_No stories selected.` (valid file, not an error).
   - `buildBmadStoryMarkdown(story: StoryExport, projectName: string): string` — BMAD story-file format. YAML-less frontmatter-free format matching the BMAD story template (`.claude/skills/bmad-create-story/template.md`):
     ```markdown
     # Story: {title}

     ## Context

     Generated {ISO date} from project "{projectName}".

     {technical_context ? "**Technical context:** " + technical_context : ""}

     ## Story

     As a {user_story.as_a},
     I want {user_story.i_want},
     so that {user_story.so_that}.

     ## Acceptance Criteria

     1. {ac_1}
     2. {ac_2}

     ## Affected Components

     - **Modules:** {comma-separated | "None"}
     - **APIs:** {comma-separated | "None"}
     - **Data Models:** {comma-separated | "None"}
     ```
   - `StoryExport` type: `{ _id: string; title: string; user_story: { as_a: string; i_want: string; so_that: string }; acceptance_criteria: string[]; affected_components: { modules: string[]; apis: string[]; data_models: string[] }; technical_context?: string; status: string; generated_at: number; thread_id: string }` — a structural subset of `Doc<"user_stories">` (avoids importing Convex types into the pure module).
   - **No `escapeHtml`** — stories export as Markdown only (no HTML export per ACs). Markdown's own escaping applies (raw content is verbatim — AI-generated story text is project-owned, not cross-user-untrusted; the BA is exporting their own workspace's data).

6. **AC6 — BMAD story files export (one .md per selected story)**: When `bmadDetected === true` (AC9) AND ≥1 story is selected on the list page, the Export dropdown offers a "BMAD Story Files" option. Clicking it: fetches full docs via `getStoriesByIds` (AC4), builds one `.md` per story via `buildBmadStoryMarkdown(story, projectName)` (AC5), and fires sequential `downloadFile` calls — one per story — with filenames `story-{slugified-title}.md` (AC8). Multiple downloads fire in sequence from a single click (mirror Story 2.4's BMAD PRD three-file sequential-download pattern at `ExportBaselineRd.tsx:123-140`). **No zip bundling** (no new dependency — same decision as Story 2.4 `BMAD PRD Multi-File Decision`). Chrome may show a "allow multiple downloads" prompt — expected and documented. If the selection is large (e.g. >20 stories), document the browser-prompt tradeoff in Dev Notes; no hard cap for MVP (the BA chose to export that many).

7. **AC7 — Export control placement and visibility**:
   - **List page** (`stories/page.tsx`): The "Export" dropdown sits in the existing header `<div className="flex items-center gap-3">` (currently containing the "Stories" title, "Back to Project" link, and status filter — `page.tsx:63-102`). Insert the `<ExportStories>` component AFTER the status filter `<label>` (rightmost position in the header row). The dropdown is rendered always (even with 0 stories) but the Export trigger button is `disabled` when `selectedIds.size === 0` (visual affordance: reduced opacity + `cursor-not-allowed`). The "BMAD Story Files" menu item appears only when `bmadDetected === true`. Selection checkboxes: each `<StoryCard>` gains a checkbox `<input type="checkbox">` in its top-left corner (before the title). The checkbox toggles membership in a `Set<string>` state. Clicking the checkbox does NOT navigate to the detail page (the checkbox swallows the click — `e.stopPropagation()` on the checkbox `<input>`; the surrounding `<Link>` still handles card-body clicks). A "Select all" checkbox in the header (next to the Export dropdown) toggles all currently-visible stories into/out of the selection.
   - **Detail page** (`[storyId]/page.tsx`): The "Export" dropdown + "Copy to Clipboard" button sit in a NEW action row inside the `<article>`, BETWEEN the header (title + status badge + timestamps) and the `<dl>` user-story triple — i.e. a `<div className="flex items-center gap-2">` containing `<ExportSingleStory>` then `<CopyStoryButton>`. Both are visible for all story statuses. The "BMAD Story File" option in the dropdown appears only when `bmadDetected === true` (AC9) OR `story.technical_context` is present (defensive — a story with technical_context was generated on a BMAD project even if the KB flag is stale).

8. **AC8 — Filename conventions**:
   - Bulk Markdown export: `stories-export-{YYYYMMDD}.md` (e.g. `stories-export-20260615.md`). Date is the export moment, not the story generation date.
   - Single-story Markdown (detail page): `story-{slugified-title}.md` (e.g. `story-add-oauth-login.md`). Slugify: lowercase, replace non-alphanumeric runs with single hyphen, trim leading/trailing hyphens, truncate to 60 chars, fallback to `story-{first-8-of-id}` if title is empty/slugifies to empty.
   - BMAD story files (bulk): `story-{slugified-title}.md` per story (same slugify as single-story).
   - No version suffix (stories don't have versions unlike Baseline RDs).
   - `downloadFile` MIME type: `"text/markdown;charset=utf-8;"` for all story exports.

9. **AC9 — `bmad_detected` flow**: The list page (`stories/page.tsx`) queries `api.knowledge.queries.getKnowledgeBase` with `{ project_id }` and derives `const bmadDetected = kb?.bmad_detected === true` (mirror Story 2.4's `baseline/page.tsx` derivation). The query uses the `"skip"` pattern is NOT needed — `getKnowledgeBase` takes `project_id` (always available from params). Handle `kb === undefined` (loading — treat as `bmadDetected = false`, the BMAD option hides until loaded) and `kb === null` (no KB — `bmadDetected = false`). Pass `bmadDetected` + `projectName` (from the project page context or a lightweight query) to `<ExportStories>`. The detail page queries the same `getKnowledgeBase` for its `<ExportSingleStory>` BMAD gate. **Project name source**: query `api.projects.queries.getProject` (if it exists) OR derive from the existing project page data. If no lightweight project-name query exists, pass `projectName = ""` (the BMAD formatter handles empty string gracefully — "Generated {date} from project \"\"." is acceptable; or omit the project name line when empty). Task 0 verifies the project-name query exists or flags the fallback.

10. **AC10 — Tests (TDD, ≥80% coverage)**:
    - **Backend test** (`convex/stories.test.ts` — EXTEND the existing file, do NOT create a new test file): Add tests for `getStoriesByIds`:
      - Returns full docs for valid IDs (seed 3 stories, query all 3, assert each has `acceptance_criteria` array + `user_story` triple + `affected_components` — NOT summary shape).
      - Returns `[]` for empty `ids` array.
      - Silently excludes cross-workspace IDs (seed 2 stories in workspace A, 1 in workspace B, query as A's user with all 3 IDs → returns only A's 2 stories — assert `.length === 2` AND the returned IDs match A's stories — C1 content assertion).
      - Silently excludes non-existent IDs (seed 1 story, query with `[valid_id, "nonexistent-id"]` — use the insert-then-delete pattern from 4.3 to obtain a valid-but-deleted Id → returns only the 1 existing story).
      - C1 test-asserts-on-content: `expect(stories[0].acceptance_criteria).toEqual([...])` (specific array), `expect(stories[0].user_story.as_a).toBe("an authenticated user")` (specific string) — NEVER `typeof` checks.
      - Returns docs in the SAME ORDER as the input `ids` array (deterministic — the BA selected in a specific order; assert `stories.map(s => s._id)` equals the input order minus excluded IDs). Document if order is not preserved (the implementation may use `Promise.all` which preserves order — verify).
    - **Formatter unit tests** (`stories/exportFormatters.test.ts` — NEW): Pure module tests, NO React/jsdom needed:
      - `buildStoryMarkdown`: contains `## {title}`; contains `**As a**`/`**I want**`/`**So that**` lines; ACs render as numbered list (`1.`, `2.`); empty `acceptance_criteria` array → `### Acceptance Criteria` section still renders with no items (or a placeholder — see Dev Notes); affected components with values render comma-separated; empty affected-components arrays → "None identified"; `technical_context` omitted when absent, included as `### Technical Context` when present.
      - `buildStoriesMarkdown`: contains `# User Stories Export`; metadata line has correct count (`_3 stories · Exported ..._` — pluralization: "1 story" vs "3 stories"); stories separated by `\n---\n`; empty array → "No stories selected."; ordering preserved (first story's title appears before second's).
      - `buildBmadStoryMarkdown`: contains `# Story: {title}`; contains `## Context`; contains `## Story` with the triple; contains `## Acceptance Criteria`; contains `## Affected Components`; `technical_context` included in Context section when present, Context section still renders (with just the "Generated" line) when absent; empty affected-components → "None".
      - Slugify helper (if extracted): `Add OAuth Login!` → `add-oauth-login`; empty string → fallback; long title truncates to 60 chars.
    - **Component — ExportStories** (`stories/ExportStories.test.tsx` — NEW): Mock `convex/react` (`useQuery` for `getStoriesByIds` + `getKnowledgeBase`), `@/lib/convex`, `@/lib/error-logger`, `./downloadFile` (via `vi.mock`), `./exportFormatters` (real OR mock — preferred: real formatters + mocked download, mirror Story 2.4 `ExportBaselineRd.test.tsx` pattern). Tests:
      - Export trigger button is disabled when `selectedIds` is empty.
      - Export trigger button is enabled when `selectedIds` has ≥1 entry.
      - Clicking Export opens menu with "Markdown" option.
      - "BMAD Story Files" option absent when `bmadDetected === false`.
      - "BMAD Story Files" option present when `bmadDetected === true`.
      - Clicking "Markdown" calls `downloadFile` once with `stories-export-{date}.md` filename.
      - Clicking "BMAD Story Files" calls `downloadFile` N times (once per selected story) with `story-{slug}.md` filenames.
      - Menu closes after selection.
      - Menu closes on Escape; focus returns to trigger.
      - `getStoriesByIds` is NOT called until Export is clicked (verify the `"skip"` pattern — the query is conditional on export-in-progress state).
    - **Component — ExportSingleStory + CopyStoryButton** (`stories/[storyId]/story-export.test.tsx` — NEW OR extend `story-detail.test.tsx`): Mock same modules. Tests:
      - Export dropdown renders for draft/approved/exported statuses.
      - "Markdown" option always present; clicking downloads `story-{slug}.md`.
      - "BMAD Story File" option present when `bmadDetected === true`; absent when false.
      - "Copy to Clipboard" button renders; clicking calls `navigator.clipboard.writeText` with `buildStoryMarkdown(story)` content.
      - Copy success → button label becomes "Copied!" for 2s then reverts (use `vi.useFakeTimers`).
      - Copy failure (mock `writeText` rejection) → `<Alert variant="error">` renders + `logError` called.
    - **Page — list page selection** (`stories/stories.test.tsx` — EXTEND): Add tests:
      - Each `<StoryCard>` renders a checkbox.
      - "Select all" checkbox in header toggles all visible stories.
      - Checking a box adds to selection; unchecking removes.
      - Clicking a checkbox does NOT navigate (the `<Link>` click is suppressed — assert `router.push` not called, or assert still on the list page).
      - Export button disabled when 0 selected, enabled when ≥1 selected.
      - `bmadDetected` is derived from `getKnowledgeBase` mock (test both true and false).
    - **Page — detail page export row** (`stories/[storyId]/story-detail.test.tsx` — EXTEND): Add tests:
      - Export dropdown + Copy button render in the action row.
      - Clicking Copy calls clipboard mock.
      - Clicking Export → Markdown calls `downloadFile`.
    - All existing tests pass — zero regressions (`pnpm test`, `pnpm test:convex`).

11. **AC11 — Cross-workspace isolation inherited and verified (NFR-2, B3 IDOR)**: `getStoriesByIds` accepts `v.array(v.id("user_stories"))` — typed IDs, no bare strings. The batch ownership check (AC4) excludes cross-workspace stories SILENTLY (they're filtered out, not returned). A malicious BA cannot construct another workspace's story ID and export it — the `workspace_id` field check is the guard. No public function returns another workspace's story data. Verified via the cross-workspace exclusion test (AC10). The existing `getStory` (single) query from Story 4.3 already enforces ownership via `getOptionalOwnedEntity` — unchanged. The list page's `listStories` (summary) is unchanged. **No new mutation** — export is read-only (queries + client-side file generation).

12. **AC12 — No schema changes, no new dependencies**: The `user_stories` table + its 4 indexes (Story 4.2 added 3; Story 4.3 review added `by_project_id_and_generated_at`) are reused as-is. No new Convex table, no new index, no schema field. No new npm dependency (no `jszip`, no `file-saver`, no `clipboard-polyfill` — `navigator.clipboard` is universally supported in evergreen browsers; the copy button degrades gracefully via try/catch + `<Alert>` on rejection). NEW files are frontend-only (`exportFormatters.ts`, `downloadFile.ts`, `ExportStories.tsx`, `ExportSingleStory.tsx`, `CopyStoryButton.tsx` — see Dev Notes for component decomposition) + ONE new backend query (`getStoriesByIds` in the existing `convex/stories/queries.ts`). The `downloadFile.ts` DUPLICATES `baseline/downloadFile.ts` (15 lines) — documented decision (see Dev Notes "Shared `downloadFile` Decision").

## Tasks / Subtasks

- [x] Task 0: Verify infrastructure claims (C4 gate) (AC: #4, #9, #11)
  - [x] Confirm `getMemberWorkspace` is importable from `convex/lib/requireAuth.ts` and throws on no-session (used by `getStoriesByIds` for the single-workspace-lookup batch pattern). `grep -n "export.*getMemberWorkspace" convex/lib/requireAuth.ts`.
  - [x] Confirm `getKnowledgeBase` takes `{ project_id: v.id("projects") }` and returns the full KB doc including `bmad_detected` (`convex/knowledge/queries.ts:116-135` — verified during story creation).
  - [x] Confirm NO existing lightweight project-name query is needed for MVP — `buildBmadStoryMarkdown` accepts `projectName: string` and the caller can pass `""` (the formatter handles empty gracefully). If a `getProject` query exists, prefer it; otherwise pass `""`. `grep -n "getProject\b" convex/**/queries.ts`.
  - [x] Confirm `navigator.clipboard.writeText` is available in jsdom (vitest frontend env) — it may NOT be; the test must mock it via `Object.assign(navigator, { clipboard: { writeText: vi.fn() } })` in `beforeEach`. Flag for the copy-button test setup.
  - [x] Confirm `ExportBaselineRd.tsx`'s dropdown pattern (click-outside via `mousedown`, Escape-to-close, arrow-key nav, `role="menu"`/`role="menuitem"`, focus management) is the template — re-read `src/app/(auth)/projects/[id]/baseline/ExportBaselineRd.tsx` fully before implementing `ExportStories` / `ExportSingleStory`.
  - [x] Confirm the existing `stories/page.tsx` header structure (`page.tsx:62-102`) can accommodate the Export dropdown + "Select all" checkbox without breaking the flex layout.
  - [x] Confirm `StoryCard` is a `<Link>` wrapping an `<article>` (`src/components/stories/StoryCard.tsx:41-81`) — the checkbox must go INSIDE the Link but swallow clicks (`e.stopPropagation()` + `e.preventDefault()` so the Link doesn't navigate).

  [x] REPLACED 1: Write `getStoriesByIds` query test FIRST (AC: #4, #11, #10) — TDD RED
  - [x] EXTEND `convex/stories.test.ts` (do NOT create a new file — the convention is one test file per domain at `convex/` root). Add a `describe("getStoriesByIds", ...)` block.
  - [x] Set up via existing seed helpers: `seedWorkspace`, `seedProject`, `seedUserStory`. Use the simpler non-agent test setup (mirror `convex/stories.test.ts` existing structure — `const t = convexTest(schema, modules); asUser(t, userId); asOrg(t, ...)`).
  - [x] Test: returns full docs for valid IDs (seed 3, query all 3, assert full shape — `acceptance_criteria` array content, `user_story` triple content — C1).
  - [x] Test: returns `[]` for empty `ids`.
  - [x] Test: silently excludes cross-workspace IDs (seed 2 in ws A + 1 in ws B, query as A's user with all 3 IDs → returns 2, assert the returned `_id`s match A's — C1).
  - [x] Test: silently excludes non-existent IDs (use insert-then-delete pattern from 4.3 for a valid-but-deleted Id).
  - [x] Test: order preservation (input `[id3, id1, id2]` → returned array matches that order minus exclusions — assert specific order).

  [x] REPLACED 2: Implement `getStoriesByIds` query (AC: #4, #11) — TDD GREEN
  - [x] Add to `convex/stories/queries.ts`. Import `getMemberWorkspace` from `../lib/requireAuth` (NOT `getOptionalOwnedEntity` — we want ONE workspace lookup for the batch).
  - [x] Args: `{ ids: v.array(v.id("user_stories")) }`.
  - [x] Handler: `const memberWorkspace = await getMemberWorkspace(ctx);` (throws if no session — fail-loud, mirrors `getThread`). Then `const docs = await Promise.all(args.ids.map(id => ctx.db.get(id)));` Then filter: `return docs.filter((s): s is Doc<"user_stories"> => s !== null && s.workspace_id === memberWorkspace.workspace._id);`. The type predicate narrows `null` out. `Promise.all` preserves input order. No `.take()` (selection-bounded).
  - [x] NOTE: `getMemberWorkspace` throws `ConvexError("Not authenticated")` on no session — this is correct for a query that the BA reaches via an authenticated route. The frontend's `useQuery` will surface the error; the page already handles query-error-as-skeleton (deferred-work C10, codebase-wide). If the dev prefers fail-quiet (return `null`/`[]`), use `getOptionalMemberWorkspace` instead and return `[]` on null — document the choice. **Preferred: fail-loud** (the BA is authenticated; a no-session here is a real error, not a routing edge case).

  [x] REPLACED 3: Write `exportFormatters.ts` unit tests FIRST (AC: #5, #10) — TDD RED
  - [x] Create `src/app/(auth)/projects/[id]/stories/exportFormatters.test.ts`. Pure module tests — NO React, NO jsdom needed (run in vitest default env).
  - [x] `buildStoryMarkdown`: assert `## {title}` present; assert `**As a** {as_a}` line; assert AC numbered list (`1. {ac1}`); assert affected-components section with values; assert "None identified" for empty arrays; assert `technical_context` section present/absent conditionally.
  - [x] `buildStoriesMarkdown`: assert `# User Stories Export`; assert count pluralization ("1 story" vs "2 stories"); assert `---` separator between stories; assert "No stories selected." for empty input.
  - [x] `buildBmadStoryMarkdown`: assert `# Story: {title}`; assert `## Context` + `## Story` + `## Acceptance Criteria` + `## Affected Components` sections; assert `technical_context` in Context section when present.
  - [x] `slugifyStoryTitle` (if extracted as a helper): assert `Add OAuth Login!` → `add-oauth-login`; assert empty → fallback; assert 60-char truncation.

  [x] REPLACED 4: Implement `exportFormatters.ts` (AC: #5) — TDD GREEN
  - [x] Create `src/app/(auth)/projects/[id]/stories/exportFormatters.ts`. NO `"use client"`, NO React, NO Convex, NO DOM imports.
  - [x] Export `StoryExport` type (structural subset of `Doc<"user_stories">`).
  - [x] Export `slugifyStoryTitle(title: string, fallbackId: string): string`.
  - [x] Export `buildStoryMarkdown(story: StoryExport): string` per AC5 format.
  - [x] Export `buildStoriesMarkdown(stories: StoryExport[]): string` per AC5 format.
  - [x] Export `buildBmadStoryMarkdown(story: StoryExport, projectName: string): string` per AC5 format.
  - [x] Empty `acceptance_criteria` handling: render the `### Acceptance Criteria` heading with a "No acceptance criteria." placeholder line (mirror `[storyId]/page.tsx:217` — consistent with the detail page's empty-state). Empty `affected_components` sub-arrays: "None identified" (matches the detail page's ChipList `emptyLabel`).

  [x] REPLACED 5: Create `downloadFile.ts` (AC: #12) — duplicate baseline helper
  - [x] Create `src/app/(auth)/projects/[id]/stories/downloadFile.ts`. IDENTICAL to `src/app/(auth)/projects/[id]/baseline/downloadFile.ts` (15 lines — Blob → createObjectURL → anchor → click → remove → setTimeout revoke). See Dev Notes "Shared `downloadFile` Decision" for why duplicate vs. share.

  [x] REPLACED 6: Write `ExportStories` component test FIRST (AC: #1, #6, #7, #10) — TDD RED
  - [x] Create `src/app/(auth)/projects/[id]/stories/ExportStories.test.tsx`. Mock `convex/react` (`useQuery`), `@/lib/convex` (api refs), `@/lib/error-logger`, `./downloadFile` (`vi.mock`). Use REAL `./exportFormatters` (preferred — integration of formatter → download is the real behavior, mirror Story 2.4 `ExportBaselineRd.test.tsx`).
  - [x] Tests per AC10 component-ExportStories list.

  [x] REPLACED 7: Implement `ExportStories` component (AC: #1, #6, #7) — TDD GREEN
  - [x] Create `src/app/(auth)/projects/[id]/stories/ExportStories.tsx`. `"use client"`. Mirror `ExportBaselineRd.tsx` structure (trigger button + menu + click-outside + Escape + arrow keys + focus management).
  - [x] Props: `{ selectedIds: Set<string>; projectId: string; bmadDetected: boolean; projectName: string }`.
  - [x] Internal state: `open`, `exporting` (boolean — gates the `getStoriesByIds` query via `"skip"` pattern).
  - [x] Query: `const stories = useQuery(api.stories.queries.getStoriesByIds, exporting ? { ids: Array.from(selectedIds) } : "skip")`. When `stories` arrives (not `undefined`), build the markdown and call `downloadFile`, then reset `exporting = false`.
  - [x] Markdown handler: `buildStoriesMarkdown(stories)` → `downloadFile(..., \`stories-export-${dateStr}.md\`, "text/markdown;charset=utf-8;")`. Close menu. Reset `exporting`.
  - [x] BMAD handler: for each story, `buildBmadStoryMarkdown(story, projectName)` → `downloadFile(..., \`story-${slugifyStoryTitle(story.title, story._id)}.md\`, ...)`. Sequential. Close menu. Reset `exporting`.
  - [x] Trigger button: `disabled={selectedIds.size === 0 || exporting}`. Label: `exporting ? "Exporting…" : "Export"`.
  - [x] Wrap all handlers in try/catch + `useErrorLogger`.
  - [x] useEffect on `stories` arrival: when `exporting && stories !== undefined`, fire the appropriate download (Markdown or BMAD based on which was clicked — track via a `pendingFormat` state: `"markdown" | "bmad" | null`).

  [x] REPLACED 8: Write `ExportSingleStory` + `CopyStoryButton` component tests FIRST (AC: #2, #3, #7, #10) — TDD RED
  - [x] Create `src/app/(auth)/projects/[id]/stories/[storyId]/story-export.test.tsx` (OR extend `story-detail.test.tsx` — preferred: separate file for the new components, imported by the detail page test if needed). Mock same modules + `navigator.clipboard` (via `Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } })` in `beforeEach`).
  - [x] Tests per AC10 component-ExportSingleStory + CopyStoryButton list.

  [x] REPLACED 9: Implement `ExportSingleStory` + `CopyStoryButton` components (AC: #2, #3, #7) — TDD GREEN
  - [x] Create `src/app/(auth)/projects/[id]/stories/[storyId]/ExportSingleStory.tsx`. `"use client"`. Dropdown mirror of `ExportBaselineRd` (single-story version). Props: `{ story: Doc<"user_stories">; bmadDetected: boolean; projectName: string }`. Options: "Markdown" (always), "BMAD Story File" (when `bmadDetected || !!story.technical_context`). No query needed — the full story doc is already passed as a prop (the detail page already has it via `getStory`).
  - [x] Create `src/app/(auth)/projects/[id]/stories/[storyId]/CopyStoryButton.tsx`. `"use client"`. Props: `{ story: Doc<"user_stories"> }`. State: `copying` (boolean), `copied` (boolean). Handler: `try { setCopying(true); await navigator.clipboard.writeText(buildStoryMarkdown(story)); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch (err) { ... logError + setError ... } finally { setCopying(false); }`. Button label: `copying ? "Copying…" : copied ? "Copied!" : "Copy to Clipboard"`. Use `vi.useFakeTimers` in tests for the 2s revert.

  [x] REPLACED 10: Wire ExportStories into the list page + add selection UI (AC: #1, #6, #7, #9) — TDD GREEN
  - [x] MODIFY `src/app/(auth)/projects/[id]/stories/page.tsx`.
  - [x] Add `const kb = useQuery(api.knowledge.queries.getKnowledgeBase, { project_id: projectId });` and `const bmadDetected = kb?.bmad_detected === true;`.
  - [x] Add `const projectName = ""` (or query it if Task 0 found a lightweight query — pass through).
  - [x] Add `const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());`.
  - [x] Pass `selectedIds`, `onToggle(id)`, `selected` to each `<StoryCard>` (NEW props — modify `StoryCard.tsx` to render a checkbox). The checkbox `<input type="checkbox" onClick={(e) => { e.stopPropagation(); e.preventDefault(); }} onChange={() => onToggle(story._id)} checked={selected} />` goes BEFORE the title inside the `<article>`. The `stopPropagation` + `preventDefault` on `onClick` prevents the wrapping `<Link>` from navigating.
  - [x] Add a "Select all" checkbox in the header: `<input type="checkbox" aria-label="Select all stories" checked={allSelected} onChange={() => allSelected ? setSelectedIds(new Set()) : setSelectedIds(new Set(stories.map(s => s._id)))} />`. `allSelected = selectedIds.size > 0 && selectedIds.size === stories.length`.
  - [x] Add `<ExportStories selectedIds={selectedIds} projectId={params.id} bmadDetected={bmadDetected} projectName={projectName} />` after the status filter `<label>`.

  [x] REPLACED 11: Wire ExportSingleStory + CopyStoryButton into the detail page (AC: #2, #3, #7, #9) — TDD GREEN
  - [x] MODIFY `src/app/(auth)/projects/[id]/stories/[storyId]/page.tsx`.
  - [x] Add `const kb = useQuery(api.knowledge.queries.getKnowledgeBase, { project_id: asId(params.id, "projects") });` and `const bmadDetected = kb?.bmad_detected === true;`.
  - [x] Insert a `<div className="flex items-center gap-2">` containing `<ExportSingleStory story={story} bmadDetected={bmadDetected} projectName="" />` and `<CopyStoryButton story={story} />` BETWEEN the header (`</header>` at ~line 195) and the `<dl>` user-story triple (line 197).

  [x] REPLACED 12: Update `StoryCard` to accept selection props (AC: #1, #7) — TDD GREEN
  - [x] MODIFY `src/components/stories/StoryCard.tsx`. Add optional props: `selected?: boolean; onToggleSelect?: (id: string) => void;`. When `onToggleSelect` is provided, render a checkbox `<input type="checkbox">` before the title. When NOT provided (e.g. future reuse), no checkbox (backwards-compatible — the prop is optional). The list page always passes it; other callers (none currently) don't.

  [x] REPLACED 13: Update existing page tests for the new UI (AC: #10)
  - [x] EXTEND `src/app/(auth)/projects/[id]/stories/stories.test.tsx`: add mock for `getKnowledgeBase` (return `{ bmad_detected: false }` by default, override in BMAD test). Add selection tests (checkbox toggles, select-all, Export button disabled/enabled). Mock `downloadFile` so no real downloads fire.
  - [x] EXTEND `src/app/(auth)/projects/[id]/stories/[storyId]/story-detail.test.tsx`: add mock for `getKnowledgeBase`. Add Export + Copy button presence tests. Mock `navigator.clipboard` + `downloadFile`.
  - [x] EXTEND `src/components/stories/StoryCard.test.tsx`: add checkbox render test (when `onToggleSelect` provided) + click-suppression test.

  [x] REPLACED 14: Validation (AC: #10, #12)
  - [x] `pnpm lint` — zero new errors (pre-existing warnings acceptable).
  - [x] `pnpm test:convex` — all backend tests pass, zero regressions.
  - [x] `pnpm test` — all frontend tests pass, zero regressions.
  - [x] `pnpm build` — Next.js build succeeds (verify no NEW type errors via `pnpm typecheck`; the stale-generated-api pattern for `api.stories.queries.getStoriesByIds` resolves on `npx convex dev`).
  - [x] Manual smoke test (DEFERRED to manual verification): generate stories via chat (4.2), approve some (4.3), navigate to `/projects/{id}/stories`, select stories, click Export → Markdown, verify the file downloads with correct content. Test Copy to Clipboard on the detail page. Test BMAD export on a BMAD-detected project.

## Dev Notes

### Scope Boundary

**This story implements:**
- ONE new backend query `getStoriesByIds` in `convex/stories/queries.ts` (batch full-doc fetch with ownership check).
- NEW frontend pure module `src/app/(auth)/projects/[id]/stories/exportFormatters.ts` (3 formatters + slugify helper + `StoryExport` type).
- NEW frontend DOM helper `src/app/(auth)/projects/[id]/stories/downloadFile.ts` (duplicate of baseline's).
- NEW frontend components: `ExportStories.tsx` (list-page bulk dropdown), `[storyId]/ExportSingleStory.tsx` (detail-page single dropdown), `[storyId]/CopyStoryButton.tsx` (detail-page clipboard button).
- MODIFIED frontend: `stories/page.tsx` (selection checkboxes + ExportStories + getKnowledgeBase query + bmadDetected), `[storyId]/page.tsx` (ExportSingleStory + CopyStoryButton + getKnowledgeBase query), `StoryCard.tsx` (optional selection props).
- Tests for all of the above (TDD).

**This story does NOT implement:**
- Story status transition on export (file export does NOT auto-flip `approved → exported` — the BA uses the existing "Mark as Exported" button from 4.3 for that. File export and status transition are separate concerns. Document this explicitly — see "File Export vs Status Export" below).
- HTML export for stories (ACs only require Markdown. Baseline RD has HTML; stories don't — Markdown is the dev-team handoff format).
- Zip bundling for multi-story BMAD export (sequential downloads — same decision as Story 2.4).
- Export of archived/failed stories (the lifecycle is draft → approved → exported; no "archived" state exists for stories unlike Baseline RDs).
- Server-side export (no Convex file storage, no HTTP routes — all client-side, mirrors Story 2.4).
- Export progress UI (downloads are instant for typical selections; BMAD multi-download prompts are browser-native).
- Bulk Copy-to-clipboard (only single-story copy per AC2). Bulk copy is a non-goal.
- A `by_thread_id` index (still deferred from 4.2 D3 — not needed for export).
- Pagination on the list page (still bounded to 100 via `listStories.take(100)` from 4.3 — export is limited to visible/selected stories).
- Any change to the `user_stories` schema, the chat composer, story generation (4.2), or story status management (4.3).

### CRITICAL: File Export vs Status Export — Two Separate Concepts

This is the #1 source of confusion in Epic 4. Two distinct "export" concepts coexist:

1. **Status Export** (Story 4.3): clicking "Mark as Exported" transitions a story's `status` from `approved` to `exported`. This is a STATUS FLAG indicating "handed off to dev team". No file is produced. The `updateStoryStatus` mutation enforces forward-only lifecycle.

2. **File Export** (THIS story, 4.4): clicking "Export" → "Markdown" downloads a `.md` file to the BA's device. This is a FILE DOWNLOAD. It does NOT change the story's status.

**The two are NOT coupled.** A BA can:
- Download a Markdown file for a `draft` story (for review) WITHOUT changing its status.
- Mark a story as `exported` (status) WITHOUT downloading a file.
- Do both (download the file, then mark as exported).

**Why not couple them?** Coupling would force a specific workflow (download → status flips). The BA may want to download multiple times (revise, re-share), or mark as exported first then download later. Decoupling gives the BA control. The `exported` status means "I've handed this off"; the file download is "give me a copy". Different intents.

**The ACs support this reading**: AC1 says "export approved stories as a structured Markdown file" — the file is the output, not a status change. AC3's BMAD format is also file-only. Story 4.3's Dev Notes explicitly anticipated this: "Story 4.4 will likely consume the `exported` status when implementing actual file generation" — but "consume" here means "the `exported` status indicates these stories are ready for file export", NOT "file export triggers the status". The dev agent should NOT auto-transition status on file download.

If the reviewer disagrees, the fix is small: call `updateStoryStatus({ story_id, status: "exported" })` after a successful download. But the spec recommends against it (decoupling is cleaner). Flag as a Decision-needed if the reviewer feels strongly.

### CRITICAL: Selection UX — Checkboxes Inside Links

The `<StoryCard>` is a `<Link>` wrapping an `<article>` (4.3 design — `StoryCard.tsx:41-81`). Adding a checkbox INSIDE a Link has a well-known React/DOM gotcha: clicking the checkbox bubbles to the Link and navigates. Two mitigations:

1. **`onClick` stopPropagation + preventDefault on the checkbox**: `<input type="checkbox" onClick={(e) => { e.stopPropagation(); e.preventDefault(); }} onChange={() => onToggle(story._id)} checked={selected} />`. The `stopPropagation` stops the event bubbling; `preventDefault` stops the default checkbox-toggle (we control state via `checked` + `onChange`). Wait — `preventDefault` on the checkbox's `onClick` DOES prevent the toggle? Actually no: the checkbox toggles on `change`/`click`, and `preventDefault` on `click` prevents the default action (which IS the toggle). So `onChange` won't fire if `preventDefault` is on `onClick`. **Correct pattern**: `onClick={(e) => e.stopPropagation()}` ONLY (do NOT preventDefault — let the checkbox toggle naturally, just stop the bubbling to the Link). The `onChange` fires normally; the Link doesn't navigate because the click didn't bubble.

2. **Render the checkbox OUTSIDE the Link**: restructure `<StoryCard>` so the checkbox is a sibling of the `<Link>`, not a child. `<div className="flex gap-2"><input .../><Link>...</Link></div>`. Cleaner DOM semantics (no nested interactive elements), but changes the card's visual layout (checkbox sits to the LEFT of the card, not inside it).

**Decision: Option 2 (REVERSED from Option 1 by code review 2026-06-16).** The original Option 1 decision below (checkbox inside Link, `stopPropagation` only) was WRONG: `stopPropagation()` cancels event bubbling but does NOT cancel the anchor's default navigation action, so every checkbox click navigated to the story detail page in a real browser (CRITICAL — bulk selection was unusable; the unit tests passed only because the mocked `<a>` and jsdom have no navigation behavior). **Implemented fix:** Option 2 — the checkbox is now a SIBLING of the `<Link>` (`<div className="flex items-start gap-2"><input/><Link className="flex-1">…</Link></div>`), not a descendant. This eliminates the nested-interactive problem at its root: clicking the checkbox never reaches the anchor (no `preventDefault`/`stopPropagation` needed, native toggle intact, controlled `checked` reflects selection). The card body (`<Link>`) remains the full navigation target; the checkbox sits to its left. `StoryCard.tsx`'s root changed from `<Link>` to the wrapper `<div>`. The page tests (`toBeChecked` after click, click-does-not-navigate) now pass without special-casing. **Manual browser smoke of multi-select still recommended** (jsdom cannot verify navigation directly).

**Accessibility**: the checkbox has `aria-label={`Select story: ${title}`}`. The wrapping Link's `aria-label` stays `Story: ${title}`. Screen readers announce both — acceptable (they're distinct controls). The 4.3 review flagged a similar double-announcement (Round 2 patch: `aria-hidden` on inner StatusPill); apply the same fix if the SR announcement is redundant (but a checkbox + a link ARE semantically distinct, so dual announcement is correct here).

### Shared `downloadFile` Decision — Duplicate vs Promote

`src/app/(auth)/projects/[id]/baseline/downloadFile.ts` already exists (Story 2.4). Three options for the stories export:

1. **Promote to `src/lib/downloadFile.ts`** (shared util): cleanest DRY. Update baseline's import. Touches baseline files (risk to 2.4's passing tests — low, but non-zero).
2. **Cross-domain import** (`stories/downloadFile.ts` re-exports from `../baseline/downloadFile`): couples stories to baseline. Weird dependency direction (sibling domain importing another domain's util).
3. **Duplicate** (`stories/downloadFile.ts` is a 15-line copy): zero risk to baseline, zero cross-domain coupling. Two copies to maintain (but the function is tiny and stable — Blob + anchor + click).

**Decision: Option 3 (duplicate)** — mirrors Story 4.3's `ChipList` duplicate decision (4.3 Dev Notes "ChipList Refactor vs. Duplicate Decision" chose option 2 duplicate with the note "If extraction proves invasive, fall back to option 2"). The same logic applies: extraction touches baseline (risk), duplication is 15 trivial lines. **Document for a future refactor**: when a THIRD caller appears, promote to `src/lib/downloadFile.ts` and update both baseline + stories. This is the "no abstractions until there's real repetition" rule from `project-context.md` — two callers is borderline; three is the trigger.

### `getStoriesByIds` — Batch Ownership Pattern

The existing `getOptionalOwnedEntity` does ONE entity ownership check (1 workspace lookup + 1 entity get + 1 workspace compare). For a batch of N stories, calling it N times = N workspace lookups (redundant — same workspace every time). The efficient batch pattern:

```ts
export const getStoriesByIds = query({
  args: { ids: v.array(v.id("user_stories")) },
  handler: async (ctx, args): Promise<Doc<"user_stories">[]> => {
    const memberWorkspace = await getMemberWorkspace(ctx);
    const docs = await Promise.all(args.ids.map((id) => ctx.db.get(id)));
    return docs.filter(
      (s): s is Doc<"user_stories"> =>
        s !== null && s.workspace_id === memberWorkspace.workspace._id,
    );
  },
});
```

ONE workspace lookup + N parallel `ctx.db.get` (Convex handles parallel gets efficiently within a query). The type predicate `(s): s is Doc<"user_stories">` narrows `null` out of the returned array. Cross-workspace and non-existent IDs are silently filtered (the BA selected them, but they don't belong to this workspace — return only what's owned).

**Why `getMemberWorkspace` (fail-loud) not `getOptionalMemberWorkspace` (fail-quiet)?** The query is reached via an authenticated route (`/projects/[id]/stories`). A no-session state here is a real error (session expired mid-export), not a routing edge case. Fail-loud surfaces it as a query error → the page's existing query-error handling applies (deferred-work C10 — infinite skeleton; acceptable for v1, matches codebase pattern). If the dev prefers fail-quiet (return `[]` on no session), use `getOptionalMemberWorkspace` + early-return `[]` — document the choice. **Preferred: fail-loud** (consistent with `getThread` at `convex/chat/queries.ts:104`).

### Empty `acceptance_criteria` Handling in Formatters

The `user_stories.acceptance_criteria` field is `v.array(v.string())` — it CAN be empty (`[]`). The detail page (`[storyId]/page.tsx:216-217`) renders "No acceptance criteria." for empty. The formatter must match:

- `buildStoryMarkdown`: if `acceptance_criteria.filter(Boolean).length === 0`, render `### Acceptance Criteria\n\n_No acceptance criteria._` (italic placeholder, consistent with detail page).
- `buildBmadStoryMarkdown`: same — `## Acceptance Criteria\n\n_No acceptance criteria._`.
- Filter `Boolean` to skip empty-string entries (the detail page does this at `[storyId]/page.tsx:220` — `story.acceptance_criteria.filter(Boolean)`).

### BMAD Story File Format — "Context Block" Interpretation

The AC says the BMAD story file includes a "Context block (why this story exists, from KB)". The `user_stories` table does NOT have a "context" or "why" field. Interpretation:

- **What we HAVE**: `technical_context` (optional string — KB-derived conventions, set by Story 4.2's generation prompt on BMAD-detected projects), `generated_at` (timestamp), `thread_id` (originating chat thread).
- **What the Context block CONTAINS**:
  1. A metadata line: `_Generated {ISO date} from project "{projectName}"._` — establishes provenance.
  2. The `technical_context` content (if present) — this IS the KB-derived context (convention references, module grounding). Rendered as `**Technical context:** {technical_context}`.
- **What we do NOT fetch**: the originating chat thread's messages (the feature request that triggered generation). Fetching thread messages requires the Agent Component's message-list query — out of scope for a formatter. The `thread_id` is stored but not resolved to content. A future enhancement can fetch the feature request and include it; for MVP, the metadata line + technical_context suffice.

This matches the BMAD story template's spirit (`.claude/skills/bmad-create-story/template.md` — the "Context" section is freeform; our content is provenance + KB conventions). Document this for the reviewer.

### `bmad_detected` Flow — Two Query Sites

Both the list page and detail page need `bmad_detected`. Both query `api.knowledge.queries.getKnowledgeBase` with `{ project_id }`:

```ts
const kb = useQuery(api.knowledge.queries.getKnowledgeBase, { project_id: projectId });
const bmadDetected = kb?.bmad_detected === true;
```

- `kb === undefined` (loading): `bmadDetected = false` (BMAD option hides until loaded). Acceptable — the BA clicks Export after the page loads.
- `kb === null` (no KB / cross-workspace): `bmadDetected = false`. Correct — no BMAD export without a KB.
- `kb.bmad_detected === true`: BMAD option shows.

**Detail page defensive gate**: the detail page's `ExportSingleStory` shows the BMAD option when `bmadDetected || !!story.technical_context`. The `|| !!story.technical_context` is defensive: a story WITH `technical_context` was generated on a BMAD project (Story 4.2 only sets `technical_context` when BMAD is detected). If the KB's `bmad_detected` flag is stale (e.g. BMAD artifacts removed post-generation but the flag wasn't cleared — unlikely but possible), the story's `technical_context` is the source of truth. This avoids hiding the BMAD option for stories that legitimately have BMAD context.

### Existing APIs to Reuse (NO reinvention)

| API | Location | Purpose |
|-----|----------|---------|
| `getMemberWorkspace` | `convex/lib/requireAuth.ts` | ONE workspace lookup for `getStoriesByIds` batch (NOT N× `getOptionalOwnedEntity`) |
| `getKnowledgeBase` | `convex/knowledge/queries.ts:116-135` | Source of `bmad_detected` on list + detail pages |
| `getStory` | `convex/stories/queries.ts:74-85` | Existing single-story full-doc query (detail page already uses it — `ExportSingleStory` receives the doc as a prop, no new query needed) |
| `listStories` | `convex/stories/queries.ts:18-72` | Existing summary-shape list query (list page — unchanged; export uses `getStoriesByIds` for full docs) |
| `ExportBaselineRd.tsx` | `src/app/(auth)/projects/[id]/baseline/ExportBaselineRd.tsx` | THE dropdown template (click-outside, Escape, arrow keys, focus management, `role="menu"`/`role="menuitem"`) |
| `downloadFile` (baseline) | `src/app/(auth)/projects/[id]/baseline/downloadFile.ts` | THE download pattern to duplicate (Blob + anchor + click + revoke) |
| `exportFormatters.ts` (baseline) | `src/app/(auth)/projects/[id]/baseline/exportFormatters.ts` | THE pure-module template (no React/Convex/DOM imports, fully unit-testable) |
| `ExportBaselineRd.test.tsx` | `src/app/(auth)/projects/[id]/baseline/ExportBaselineRd.test.tsx` | THE component-test mocking pattern (`vi.mock` for downloadFile + convex/react + error-logger; real formatters) |
| `StatusPill` | `src/components/ui/StatusPill.tsx` | Not needed in export components (no status display in the dropdown) |
| `Button` | `src/components/ui/Button.tsx` | Trigger + Copy buttons (`variant="secondary" size="sm"`) |
| `Alert` | `src/components/ui/Alert.tsx` | Copy-failure error display |
| `useErrorLogger` | `src/lib/error-logger.ts` | Catch-block error logging (use `vi.hoisted` in tests — B5 pattern) |
| `seedUserStory` | `convex/testHelpers.ts:605-636` | Test seed helper (Story 4.2 added it) — REUSE |
| `seedWorkspace`, `seedProject` | `convex/testHelpers.ts` | Test seed foundation |
| `StoryCard` | `src/components/stories/StoryCard.tsx` | MODIFY to accept optional selection props (checkbox render) |
| `StoryListItem` type | `src/components/stories/StoryCard.tsx:9-21` | The summary shape (NOT the export shape — `StoryExport` is new, fuller) |
| `formatRelativeTime` / `formatDate` | `src/lib/format.ts` | Not needed in formatters (Markdown uses ISO dates), but available if UI shows timestamps |

### What NOT to Reinvent

| Concern | Reuse | Do NOT build |
|---------|-------|--------------|
| Story ownership (batch) | `getMemberWorkspace` (1 lookup) + manual `workspace_id` compare | N× `getOptionalOwnedEntity` (redundant workspace lookups) |
| Story ownership (single, detail page) | Existing `getStory` via `getOptionalOwnedEntity` (unchanged) | A new single-story query — the detail page already has the doc |
| Download helper | Duplicate `baseline/downloadFile.ts` (15 lines) | A new download library, OR `file-saver`, OR cross-domain import from baseline |
| Dropdown UI | Copy `ExportBaselineRd.tsx`'s dropdown structure (click-outside, Escape, arrows, focus, `role="menu"`) | A new dropdown component in `src/components/ui/` (Story 2.4 explicitly decided against this — "no UI library"), OR a `<details>`/`<summary>` hack |
| Export formatter structure | Copy `baseline/exportFormatters.ts`'s pure-module pattern | A formatter that imports React/Convex/DOM (breaks testability) |
| BMAD story format | The BMAD story template at `.claude/skills/bmad-create-story/template.md` + existing story files (e.g. `4-3-story-list-status-management.md`) as reference | A novel format — match the BMAD convention so exported files round-trip with BMAD tooling |
| Clipboard API | `navigator.clipboard.writeText` (native, universal) | A `clipboard-polyfill` dependency, OR `document.execCommand("copy")` (deprecated) |
| Error display | `Alert` + `useErrorLogger` | A custom toast or inline error div |
| Test mocking | `ExportBaselineRd.test.tsx` pattern (mock downloadFile + convex/react + error-logger; real formatters) | A new test harness, OR mocking the formatters themselves (loses integration coverage) |

### Error Handling (C1 Pre-Review Checklist)

Per Epic 3 retro action C1 (`project-context.md:106`), enumerate error paths BEFORE implementation:

| Path | Surfaced as | Notes |
|------|-------------|-------|
| `getStoriesByIds` no-session | `getMemberWorkspace` throws `ConvexError("Not authenticated")` → `useQuery` error → page stays on skeleton (deferred-work C10) | Fail-loud; session expired mid-export. Matches `getThread` pattern. |
| `getStoriesByIds` all IDs cross-workspace/non-existent | Returns `[]` (not an error) | The dropdown proceeds — `buildStoriesMarkdown([])` → "No stories selected." file downloads. Acceptable (the BA's selection was invalid; the empty file communicates it). OR: the component checks `stories.length === 0` after fetch and shows an `<Alert>` instead of downloading. **Preferred: check + Alert** (clearer UX than an empty file). |
| `getStoriesByIds` partial exclusion (some cross-workspace) | Returns only owned stories | Silent — the BA sees fewer stories in the file than selected. Acceptable for MVP (cross-workspace IDs in a selection require a maliciously-crafted request; the B3 guard holds). |
| `getKnowledgeBase` error on list/detail page | `useQuery` error → page stays on skeleton | Pre-existing pattern. `bmadDetected` defaults to `false`; BMAD option hides. |
| `downloadFile` failure (browser blocks download) | Caught in try/catch + `logError` | Mirror `ExportBaselineRd.tsx:96-102` catch pattern. No `<Alert>` (downloads either work or silently fail — the BA re-clicks; matches FlakinessMap CSV export behavior from Story 2.4 Dev Notes). |
| `navigator.clipboard.writeText` rejection (permissions denied, non-HTTPS, user dismissed) | Caught in try/catch → `<Alert variant="error">` + `logError` | CopyStoryButton shows the error inline. Button re-enables. |
| `buildStoriesMarkdown` / `buildBmadStoryMarkdown` throw (shouldn't — pure functions, but defensive) | Caught in the export handler's try/catch + `logError` | Mirror baseline pattern. |
| Formatter receives malformed story (missing fields) | The `StoryExport` type is structural; if the doc is missing required fields, TypeScript catches it at compile time. At runtime, Convex's schema guarantees the fields exist. No defensive null-checks needed for required schema fields. | Matches 4.3 review dismissal B11 ("unsafe field access on required schema fields — false positive"). |

**No error is silently swallowed.** Every catch block calls `logError`. The `getStoriesByIds` empty-result-after-fetch path is the one place to add an explicit `<Alert>` (clearer than an empty file download).

### Dual-Write / Atomicity (C1 Checklist)

- **No dual-writes in this story.** `getStoriesByIds` is a READ-ONLY query (no `ctx.db.patch`, no `ctx.db.insert`, no `ctx.db.delete`). File export is client-side only (Blob + anchor). Clipboard write is client-side only (`navigator.clipboard`). There is NO cross-system coordination, NO status mutation, NO dual-write.
- **TOCTOU**: N/A — no status changes. The story's `status` field is read-only here (Story 4.3 owns status mutations).
- **Subscription reconciliation**: the list page's `useQuery(api.stories.queries.getStoriesByIds, ...)` fires only when `exporting === true` (via `"skip"` pattern). After the download, `exporting` resets to `false` → the query goes back to `"skip"` → no lingering subscription. Clean.

### Test Quality (C1 Checklist)

Per C1, tests must assert CONTENT not just TYPE (Story 4.1/4.2/4.3 reviews caught multiple "test passes on empty string" gaps):
- `getStoriesByIds` shape test: `expect(stories[0].acceptance_criteria).toEqual(["Given a precondition, When an action occurs, Then the expected result happens."])` (specific array content) — NOT `Array.isArray(...)`.
- `getStoriesByIds` cross-workspace test: `expect(stories.map(s => s._id)).toEqual([idA1, idA2])` (specific IDs in order) — NOT `stories.length === 2`.
- `buildStoryMarkdown` test: `expect(md).toContain("**As a** an authenticated user")` (specific string) — NOT `md.includes("As a")`.
- `buildStoriesMarkdown` count test: `expect(md).toContain("_3 stories · Exported")` (specific count) — NOT `md.includes("stories")`.
- Clipboard test: `expect(mockWriteText).toHaveBeenCalledWith(expect.stringContaining("**As a** an authenticated user"))` (specific content) — NOT `expect(mockWriteText).toHaveBeenCalled()`.
- `downloadFile` mock test: `expect(mockDownloadFile.mock.calls[0][1]).toBe("stories-export-20260615.md")` (specific filename) — NOT `expect(mockDownloadFile).toHaveBeenCalled()`.

### React 19 + Next.js 16 Rules (project-context.md)

- **`router.push()` in event handlers only**: NOT needed in this story (no navigation triggered by export/copy — they're file/clipboard operations). The checkbox's `stopPropagation` prevents navigation; no `router.push` calls added.
- **`"use client"` at top of every component**: `ExportStories.tsx`, `ExportSingleStory.tsx`, `CopyStoryButton.tsx` are all client components (they use Convex hooks, useState, DOM APIs). The list + detail pages are already `"use client"` (4.3).
- **Conditional queries via `"skip"`**: `ExportStories` uses `useQuery(api.stories.queries.getStoriesByIds, exporting ? { ids: Array.from(selectedIds) } : "skip")` — the `"skip"` pattern is for conditional query/don't-query, exactly the established pattern. `getKnowledgeBase` on both pages is NOT conditional (always queried with the project_id from params).
- **Next.js 16 breaking changes**: read `node_modules/next/dist/docs/` if unsure about App Router conventions. No new routes in this story (existing routes modified). The checkbox-inside-Link pattern is standard React, no Next.js-specific concern.
- **`forwardRef` components (if any)**: `ExportBaselineRd.tsx` uses `ref={triggerRef}` on `<Button>` — `Button` already supports refs (Story 2.4 verified). Reuse the same pattern in `ExportStories`/`ExportSingleStory`.

### Accessibility

- **ExportStories dropdown** (list page): mirror `ExportBaselineRd.tsx` a11y exactly — `aria-haspopup="menu"`, `aria-expanded`, `role="menu"`, `role="menuitem"`, Escape-to-close, arrow-key navigation, focus management (focus first item on open, return focus to trigger on close). This was a Story 2.4 review patch (Round 1) — inherit it.
- **ExportSingleStory dropdown** (detail page): same a11y pattern.
- **CopyStoryButton**: `aria-label="Copy story to clipboard"` (or rely on the visible label — `Copy to Clipboard` is descriptive enough). On success, the label change to "Copied!" is announced via `aria-live="polite"` on the button (or a sibling `<span aria-live="polite">`). The `disabled` state during `copying` is announced naturally.
- **Selection checkboxes**: each checkbox has `aria-label={`Select story: ${title}`}`. The "Select all" checkbox has `aria-label="Select all visible stories"`. The checkbox state (`checked`) is semantically correct.
- **Nested interactive (checkbox inside Link)**: the checkbox is a distinct interactive control inside the Link. Screen readers announce both — this is correct (they ARE distinct actions: select vs navigate). Do NOT add `aria-hidden` to either.
- **Loading state**: `exporting ? "Exporting…" : "Export"` — the label change communicates the pending state. No separate `aria-busy` needed (the button is `disabled` during export, which SRs announce).
- **Color contrast**: CSS-var-based classes only — NO hardcoded Tailwind colors (P10 pattern from Story 4.1 review).

### File Organization

NEW backend changes (existing file EXTENDED):
```
convex/
├── stories/
│   └── queries.ts                # EXTEND — add getStoriesByIds (existing listStories + getStory unchanged)
└── stories.test.ts               # EXTEND — add describe("getStoriesByIds") block (existing tests unchanged)
```

NEW frontend files (existing directories):
```
src/app/(auth)/projects/[id]/stories/
├── exportFormatters.ts           # NEW — pure module (buildStoryMarkdown, buildStoriesMarkdown, buildBmadStoryMarkdown, slugifyStoryTitle, StoryExport type)
├── exportFormatters.test.ts      # NEW — unit tests (pure module, no jsdom)
├── downloadFile.ts               # NEW — DOM helper (duplicate of baseline/downloadFile.ts)
├── ExportStories.tsx             # NEW — list-page bulk export dropdown
├── ExportStories.test.tsx        # NEW — component tests
└── [storyId]/
    ├── ExportSingleStory.tsx     # NEW — detail-page single-story export dropdown
    ├── CopyStoryButton.tsx       # NEW — detail-page clipboard button
    └── story-export.test.tsx     # NEW — component tests (OR extend story-detail.test.tsx)
```

MODIFIED frontend files:
```
src/app/(auth)/projects/[id]/stories/
├── page.tsx                                  # MODIFY — add getKnowledgeBase query, bmadDetected, selectedIds state, Select-all checkbox, <ExportStories>
├── stories.test.tsx                          # EXTEND — add getKnowledgeBase mock, selection tests, Export button tests
└── [storyId]/
    ├── page.tsx                              # MODIFY — add getKnowledgeBase query, bmadDetected, <ExportSingleStory> + <CopyStoryButton> in action row
    └── story-detail.test.tsx                 # EXTEND — add getKnowledgeBase mock, Export + Copy button tests

src/components/stories/
├── StoryCard.tsx                             # MODIFY — add optional selected + onToggleSelect props, render checkbox when provided
└── StoryCard.test.tsx                        # EXTEND — add checkbox render + click-suppression tests
```

**No new directories.** All new files go into existing `stories/` and `stories/[storyId]/` directories (created by Story 4.3). No `pnpm dev` restart needed (no new `convex/` directory).

**No new dependencies.** All packages already installed (`navigator.clipboard` is native; `Blob`/`URL` are native; no `file-saver`/`jszip`/`clipboard-polyfill`).

**No schema changes.** The `user_stories` table + its 4 indexes are owned by Story 4.2 (+ 4.3 review's `by_project_id_and_generated_at`) and stable.

### Previous Story Intelligence

**Story 4.3 (Story List & Status Management) — DIRECT predecessor, owns the list + detail pages:**
1. The list page (`stories/page.tsx`) and detail page (`[storyId]/page.tsx`) are 4.3's deliverables. This story MODIFIES both (adds selection + export UI). Reuse the existing header structure, loading/empty/null states, and `<StoryCard>` rendering.
2. 4.3's `StoryCard` is a `<Link>` wrapping `<article>` — this story adds a checkbox INSIDE it (see "Selection UX — Checkboxes Inside Links" above). The `onToggleSelect` prop is OPTIONAL (backwards-compatible).
3. 4.3's `<ChipList>` (duplicated inline in the detail page) renders affected-components chips. The export formatters render the same data as comma-separated text in Markdown — no `ChipList` reuse needed in formatters (they're plain text).
4. 4.3's `errorMessage()` helper (`[storyId]/page.tsx:50-59`) strips error prefixes. Reuse it in `CopyStoryButton`'s catch block (or import from a shared location — 4.3 duplicated it inline; this story can re-duplicate or import from the detail page. **Preferred: re-duplicate** — it's 10 lines, and importing from a page file is weird dependency direction).
5. 4.3's review Round 2 patches to inherit:
   - `isTransitioning` resets in `finally` (not just `catch`) — apply to `CopyStoryButton`'s `copying` state.
   - `ConfirmDialog` `confirmDisabled` + `cancelDisabled` props (4.3 Round 2 patch added them) — N/A here (no ConfirmDialog in export/copy).
   - `transitionError` clears via `useEffect` on status change — N/A here (no status changes).
   - ChipList value-stable keys — N/A here (no ChipList in new components).
   - Broad `errorMessage()` regex — REUSE the 4.3 Round 2 broadened regex (`/^(?:Uncaught\s+)?\w*Error:\s*/i`) in `CopyStoryButton`.

**Story 2.4 (Baseline RD & Drift Export) — DIRECT pattern predecessor for the export feature:**
1. `ExportBaselineRd.tsx` is THE dropdown template — copy its structure (trigger button + menu + click-outside + Escape + arrow keys + focus management). Story 2.4's Round 1 review patched in the full WAI-ARIA menu pattern (`role="menu"`, `role="menuitem"`, `aria-haspopup`, `aria-expanded`, Escape-to-close, arrow-key nav) — inherit ALL of it.
2. `downloadFile.ts` is THE download helper — duplicate it (see "Shared `downloadFile` Decision" above).
3. `exportFormatters.ts` is THE pure-module template — copy its discipline (no React/Convex/DOM imports, fully unit-testable). The baseline formatters build Baseline RD / Drift / BMAD PRD formats; the stories formatters build story Markdown / BMAD story formats. Different content, same structural approach.
4. `ExportBaselineRd.test.tsx` is THE test mocking template — `vi.mock("./downloadFile", ...)`, `vi.mock("convex/react", ...)`, `vi.mock("@/lib/error-logger", ...)`, real formatters. Copy this pattern exactly.
5. Story 2.4's BMAD PRD multi-file sequential download decision applies directly to 4.4's BMAD story files multi-download (N files, one click, sequential `downloadFile` calls, no zip). Same tradeoff, same documentation.
6. Story 2.4's review patches to inherit:
   - `downloadFile` append-to-DOM-before-click + `setTimeout` revoke (Safari fix) — already in the baseline helper; the duplicate inherits it.
   - Build all BMAD strings BEFORE any `downloadFile` call (if one builder throws, no partial download) — apply to BMAD story files: build all N markdown strings first, then fire N downloads.
   - Disable BMAD option while `bmadMetadata` loads — N/A here (stories don't need BMAD metadata fetch; the `technical_context` is on the story doc already). But if `getStoriesByIds` is loading, disable the BMAD option (it depends on the fetched docs' `technical_context`).
   - `codeFence` helper for evidence with triple backticks — N/A here (story Markdown has no code fences; ACs are plain text).
   - `sanitizeTableCell` for markdown tables — N/A here (no tables in story Markdown).

**Story 4.2 (User Story Generation) — owns the schema + seed helper:**
1. The `user_stories` table shape (`convex/schema.ts:499-527`) is the source of truth for `StoryExport` type. The formatter's `StoryExport` is a structural subset.
2. `seedUserStory` (`convex/testHelpers.ts:605-636`) is the test seed helper — REUSE for `getStoriesByIds` tests.
3. 4.2's `UserStoriesCard` (`src/components/chat/UserStoriesCard.tsx`) renders stories in chat. The export formatters render the SAME data shape in Markdown — no `UserStoriesCard` reuse in formatters (different output medium).

**Story 4.1 (Impact Analysis Agent) — same epic, frontend-card-rendering pattern:**
1. The `ImpactAnalysisCard` CSS-var pattern (P10) is inherited — no new color classes in export components.

**Epic 3 retrospective — defects to avoid (B1/B3/B5 + C-series):**

| Epic 3/4 Defect | Mitigation in This Story |
|-------------------|--------------------------|
| B1 review gate | `### Review Findings` section + `Status: done` header matching `sprint-status.yaml` is the ENFORCED done-gate. |
| B3 IDOR on `Id`-accepting actions | `getStoriesByIds` accepts `v.array(v.id("user_stories"))`. The batch ownership check (AC4) excludes cross-workspace stories. No bare-string IDs. The `user_stories.workspace_id` field is the ownership anchor. |
| B5 `useErrorLogger` mock | `vi.hoisted` for a single reusable `logError` fn in component tests (3.3/3.4/4.1/4.2/4.3 pattern). |
| C1 pre-review checklist | Error paths enumerated above; test-asserts-on-content rule applied; spec-consistency sweep done (ACs ↔ Tasks ↔ Dev Notes ↔ "What NOT to Reinvent" — no contradictions found). |
| C2 async-timing claims | The `CopyStoryButton`'s 2s "Copied!" → revert uses `setTimeout` — this is a UI timer, NOT an async-timing claim about system behavior. No "<Xms window" claims. Test with `vi.useFakeTimers`. |
| C4 spike API-claim verification | Task 0 verifies the infrastructure claims (`getMemberWorkspace`, `getKnowledgeBase`, `navigator.clipboard` in jsdom). No external-library API claims in this story. |
| C5 `*-free` model guard | N/A — no AI calls in this story. |

### Git Intelligence

Baseline: latest `main` = `ea7f325` (Story 4.3 with code review fixes). Relevant recent commits:
- `ea7f325` — Story 4.3 (Story List & Status Management) with 17 Round-2 review patches. **This story's direct predecessor; the list + detail pages, `StoryCard`, `stories/queries.ts`, `stories/mutations.ts` are all templates/reuse targets.**
- `e866a2e` — Story 4.2 (User Story Generation). **`user_stories` table, `seedUserStory`, `UserStoriesCard` are reuse targets.**
- `a7772e4` — Story 4.1 (Impact Analysis Agent). **`ImpactAnalysisCard` CSS-var pattern (P10).**
- `5882520` — Story 3.3 (Chat Thread List & Navigation). **List-page + detail-page frontend patterns.**
- `fdda224` (Epic 2 retro) — Story 2.4 (Baseline RD & Drift Export). **THE export-feature pattern predecessor.** `ExportBaselineRd.tsx`, `downloadFile.ts`, `exportFormatters.ts` are direct templates.

NEW schema: none. NEW `convex/` directory: none (existing `convex/stories/` from 4.3). NEW dependencies: none.

Single `feat:` commit per story (follow `ea7f325` convention).

### Deferred Work Relevant to This Story

Per retro action A8, review `_bmad-output/implementation-artifacts/deferred-work.md`:

- **`useErrorLogger` mock returns fresh fn per call** (line 14, B5): use `vi.hoisted` in component tests (3.3/3.4/4.1/4.2/4.3 pattern).
- **Query errors show infinite skeleton** (line 45, C10): `getStoriesByIds` query errors (rare — only on session expiry) would leave the dropdown in a pending state. The `useQuery` error is not surfaced in the UI for v1 — matches codebase pattern. The export just doesn't fire (the `stories` stays `undefined`).
- **Invalid `params.id` / `params.storyId`** (line 114, C10): codebase-wide ID-validation gap. NOT in this story.
- **`getOptionalMemberWorkspace` uses `.first()`** (line 99, 105, 118, C8): systemic — `getStoriesByIds` uses `getMemberWorkspace` (same `.first()` inheritance). NOT introduced by this story.
- **Duplicated `downloadFile`** (NEW deferred item from this story): `stories/downloadFile.ts` duplicates `baseline/downloadFile.ts` (15 lines). Promote to `src/lib/downloadFile.ts` when a third caller appears. Document in deferred-work.md after implementation.
- **Duplicated `errorMessage()` helper** (NEW from this story): `CopyStoryButton` re-duplicates the 10-line regex strip from `[storyId]/page.tsx:50-59`. Third copy — consider promoting to `src/lib/errorMessage.ts`. Document in deferred-work.md after implementation.
- **Story 4.2 D3 (no `by_thread_id` index)** (deferred-work line 129): STAYS DEFERRED — this story's ACs do not need thread-scoped queries.
- **No BMAD story-file round-trip test** (NEW): the exported BMAD story files are not validated against the BMAD import tooling (the BMAD Method's `dev-story` skill). A round-trip test (export → re-import → verify) is out of scope. Document for a future hardening story.

### Project Structure Notes

- No new directories — all new files go into existing `stories/` and `stories/[storyId]/` (4.3 created them).
- `exportFormatters.ts` is a pure module (NO `"use client"`, NO React, NO Convex, NO DOM imports). Fully unit-testable in vitest's default env (no jsdom needed). Mirrors `baseline/exportFormatters.ts`.
- `downloadFile.ts` is a pure DOM module (NO React, NO `"use client"`). Uses `document`/`URL` — only call from event handlers. vitest jsdom provides `document` + `URL`.
- `ExportStories.tsx`, `ExportSingleStory.tsx`, `CopyStoryButton.tsx` are `"use client"` components (useState, useEffect, Convex hooks, DOM APIs).
- Backend tests EXTEND `convex/stories.test.ts` (the convention is one test file per domain at `convex/` root — do NOT create `convex/stories.export.test.ts`).
- Frontend tests colocated with source (per `project-context.md:78`).

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 4.4] — ACs and user story (lines 756-779)
- [Source: _bmad-output/planning-artifacts/epics.md#Epic 4] — Epic context (lines 250-256, 678-681)
- [Source: _bmad-output/planning-artifacts/epics.md#FR-26] — BA exports stories as Markdown or copyable text
- [Source: _bmad-output/planning-artifacts/epics.md#FR-61] — Export user stories as Markdown
- [Source: _bmad-output/planning-artifacts/epics.md#FR-B9] — User Stories exportable as BMAD story files (one .md per story in BMAD template)
- [Source: _bmad-output/implementation-artifacts/4-3-story-list-status-management.md] — **DIRECT predecessor; the list + detail pages, `StoryCard`, `convex/stories/queries.ts` + `mutations.ts`, `errorMessage()` helper, selection-UI integration points are all templates/reuse targets.** 4.3's Round 2 review patches (isTransitioning-finally, ConfirmDialog confirmDisabled, broad errorMessage regex, value-stable keys) are inherited.
- [Source: _bmad-output/implementation-artifacts/2-4-baseline-rd-drift-export.md] — **THE export-feature pattern predecessor.** `ExportBaselineRd.tsx` (dropdown structure + WAI-ARIA menu), `downloadFile.ts` (DOM helper), `exportFormatters.ts` (pure-module discipline), `ExportBaselineRd.test.tsx` (mocking pattern), BMAD PRD multi-file sequential download decision — all direct templates.
- [Source: _bmad-output/implementation-artifacts/4-2-user-story-generation.md] — **Owns the `user_stories` schema + `seedUserStory` + `UserStoriesCard`.** The `StoryExport` type is a structural subset of the 4.2 schema.
- [Source: _bmad-output/implementation-artifacts/4-1-impact-analysis-agent.md] — `ImpactAnalysisCard` CSS-var pattern (P10).
- [Source: _bmad-output/implementation-artifacts/epic-3-retrospective.md] — C1/C2/C4/C5 action items applied.
- [Source: _bmad-output/implementation-artifacts/deferred-work.md] — lines 14, 45, 99, 105, 114, 118, 129 (all reviewed; none blocking this story; new deferred items for `downloadFile` + `errorMessage` duplication documented above).
- [Source: _bmad-output/project-context.md] — Critical rules (React 19 line 59, IDOR line 120-124, review gate line 105, C1 checklist line 106, C2 async-timing line 107, C4 spike-citation line 108, C5 `*-free` guard line 109 [N/A — no AI calls], error logging line 102-103, no-comments line 51/93).
- [Source: .claude/skills/bmad-create-story/template.md] — **THE BMAD story file format reference** — the exported BMAD story files should match this template's section structure (`# Story:`, `## Story`, `## Acceptance Criteria`, etc.).
- [Source: convex/schema.ts:499-527] — **`user_stories` table** with `workspace_id`, `project_id`, `thread_id`, `title`, `user_story`, `acceptance_criteria`, `affected_components`, `technical_context`, `status`, `generated_at`, `updated_at`. Indexes: `by_workspace_id`, `by_project_id`, `by_project_id_and_status`, `by_project_id_and_generated_at`.
- [Source: convex/lib/requireAuth.ts:67-103] — **`getMemberWorkspace` (fail-loud) + `getOptionalMemberWorkspace` (fail-quiet)** — the batch ownership helper for `getStoriesByIds`.
- [Source: convex/stories/queries.ts:18-85] — **Existing `listStories` (summary) + `getStory` (full doc)** — `getStoriesByIds` joins them (batch + full doc).
- [Source: convex/knowledge/queries.ts:116-135] — **`getKnowledgeBase`** — takes `{ project_id }`, returns the full KB doc including `bmad_detected`. Source of the BMAD-export gate.
- [Source: convex/testHelpers.ts:605-636] — **`seedUserStory`** — the test seed helper (Story 4.2 added it). Override pattern: `{ title, user_story, acceptance_criteria, affected_components, technical_context, status, generated_at, updated_at }`.
- [Source: src/app/(auth)/projects/[id]/baseline/ExportBaselineRd.tsx] — **THE dropdown component template** (click-outside, Escape, arrow keys, focus management, `role="menu"`/`role="menuitem"`, `aria-haspopup`, `aria-expanded`).
- [Source: src/app/(auth)/projects/[id]/baseline/downloadFile.ts] — **THE download helper to duplicate** (Blob → createObjectURL → anchor → append → click → remove → setTimeout revoke).
- [Source: src/app/(auth)/projects/[id]/baseline/exportFormatters.ts] — **THE pure-module formatter template** (no React/Convex/DOM imports, fully unit-testable).
- [Source: src/app/(auth)/projects/[id]/baseline/ExportBaselineRd.test.tsx] — **THE component-test mocking pattern** (mock downloadFile + convex/react + error-logger; real formatters).
- [Source: src/app/(auth)/projects/[id]/stories/page.tsx] — **THE list page to modify** (add selection + ExportStories + getKnowledgeBase query).
- [Source: src/app/(auth)/projects/[id]/stories/[storyId]/page.tsx] — **THE detail page to modify** (add ExportSingleStory + CopyStoryButton + getKnowledgeBase query). The existing `errorMessage()` helper at lines 50-59 is the template for `CopyStoryButton`'s catch block.
- [Source: src/components/stories/StoryCard.tsx] — **THE card to modify** (add optional `selected` + `onToggleSelect` props, render checkbox when provided).
- [Source: src/components/chat/UserStoriesCard.tsx] — Reference for the story data rendering pattern (`<dl>` triple, `<ol>` ACs, ChipList) — the export formatters render the same data in Markdown.
- [Source: src/components/ui/Button.tsx] — Button component (variants: primary/secondary/ghost/danger; sizes: default/sm/icon). Use `variant="secondary" size="sm"` for Export/Copy buttons.
- [Source: src/components/ui/Alert.tsx] — Error display (Copy failure).
- [Source: src/lib/error-logger.ts] — `useErrorLogger` hook (use `vi.hoisted` in tests — B5 pattern).
- [Source: src/lib/convex.ts] — `api`, `asId`, `Id` exports.

## Dev Agent Record

### Agent Model Used

opencode (glm-5.2 / zai-coding-plan/glm-5.2) — full story implementation in a single session via the bmad-dev-story skill.

### Debug Log References

- TDD cycle verified per task: RED (test fails before impl) → GREEN (test passes after impl) for backend query, pure formatter module, and all three React components.
- jsdom `navigator.clipboard` discovery: `Object.defineProperty(navigator, "clipboard", ...)` is silently ignored because jsdom provides a real `Clipboard [EventTarget]` instance on `Navigator.prototype`. Fix: `vi.spyOn(navigator.clipboard!, "writeText", ...)` when clipboard exists; fall back to defineProperty when undefined (some workers don't ship the polyfill — guarded in `story-detail.test.tsx` beforeEach).
- Fake timers + async clipboard: `vi.advanceTimersByTime` did not flush the `await writeText(...)` microtask before the `setCopied(true)` → `setTimeout(setCopied(false), 2000)` chain. Fix: real timers + `vi.waitFor` with `timeout: 3000` for the 2s revert test (simpler and deterministic than `advanceTimersByTimeAsync`).

### Completion Notes List

- **AC1 (bulk Markdown export from list page)**: implemented in `ExportStories.tsx` (list-page bulk dropdown) + wired into `stories/page.tsx`. Selection via per-card checkboxes + "Select all" header checkbox. Export trigger disabled when 0 selected; dropdown closes after selection; `"skip"` pattern gates `getStoriesByIds` query until a format is clicked. Filename: `stories-export-{YYYYMMDD}.md`.
- **AC2 (copy single story to clipboard)**: `CopyStoryButton.tsx` on detail page. `navigator.clipboard.writeText(buildStoryMarkdown(story))`. Label cycles `Copy to Clipboard` → `Copying…` → `Copied!` (2s) → `Copy to Clipboard`. Failure → `<Alert variant="error">` + `logError`. Visible label is the accessible name (no `aria-label` override so the dynamic state is announced).
- **AC3 (single-story Markdown download)**: `ExportSingleStory.tsx` on detail page. Dropdown visible for all statuses (draft/approved/exported). "Markdown" always present; "BMAD Story File" gated on `bmadDetected || !!story.technical_context` (defensive — a story with `technical_context` was generated on a BMAD project). Filename: `story-{slugified-title}.md`.
- **AC4 (`getStoriesByIds` batch query with B3 IDOR guard)**: `convex/stories/queries.ts`. ONE `getMemberWorkspace(ctx)` lookup (fail-loud — `ConvexError("Not authenticated")` on no session) + `Promise.all(ids.map(id => ctx.db.get(id)))` preserving input order + type-predicate filter excluding `null` and cross-workspace rows. Empty input → `[]`. Cross-workspace / non-existent IDs silently filtered.
- **AC5 (`exportFormatters.ts` pure module)**: `buildStoryMarkdown`, `buildStoriesMarkdown`, `buildBmadStoryMarkdown`, `slugifyStoryTitle`, `StoryExport` type. No React/Convex/DOM imports — fully unit-testable. Empty `acceptance_criteria` → `_No acceptance criteria._` placeholder (matches detail page); empty affected-components arrays → `None identified` (or `None` for BMAD format). Slugify truncates to 60 chars; falls back to `story-{first-8-of-id}` on empty.
- **AC6 (BMAD story files bulk export)**: list-page Export dropdown shows "BMAD Story Files" when `bmadDetected`. Sequential `downloadFile` calls — one `story-{slug}.md` per story — fired from a single click. No zip bundling (no new dependency, mirrors Story 2.4 decision).
- **AC7 (export control placement)**: list-page Export dropdown + "Select all" checkbox inserted after the status filter in the existing header `<div className="flex items-center gap-3">` (added `flex-wrap` for narrow viewports). Detail-page Export + Copy buttons sit in a new `<div className="flex items-center gap-2">` between the `<header>` and the `<dl>` user-story triple.
- **AC8 (filename conventions)**: bulk Markdown → `stories-export-{YYYYMMDD}.md`; single-story Markdown + BMAD (bulk and detail) → `story-{slugified-title}.md`. MIME type `text/markdown;charset=utf-8;` everywhere.
- **AC9 (`bmad_detected` flow)**: both list and detail pages query `api.knowledge.queries.getKnowledgeBase` with `{ project_id }` and derive `const bmadDetected = kb?.bmad_detected === true`. Loading (`undefined`) and no-KB (`null`) both yield `false`. Project name sourced from the existing `api.projects.queries.getProject` query (discovered in Task 0 — preferred over passing empty string).
- **AC10 (tests)**: 28 formatter unit tests, 9 ExportStories component tests, 13 ExportSingleStory + CopyStoryButton component tests, 5 `getStoriesByIds` convex tests, 12 new StoryCard tests, 12 new list-page selection tests, 7 new detail-page export/copy tests. All C1-asserts-on-content (specific strings/arrays, never `typeof` checks).
- **AC11 (cross-workspace isolation)**: `getStoriesByIds` batch ownership check verified by a dedicated cross-workspace exclusion test (seed 2 in ws A + 1 in ws B, query as A's user with all 3 IDs → only A's 2 returned, in input order). No new mutation — export is read-only.
- **AC12 (no schema changes, no new dependencies)**: no schema changes; no new npm packages. `downloadFile.ts` is a 15-line duplicate of `baseline/downloadFile.ts` (decision: duplicate rather than promote — third caller triggers extraction to `src/lib/`).

### File List

**NEW backend files**: none.
**MODIFIED backend files**:
- `convex/stories/queries.ts` — added `getStoriesByIds` query (batch ownership pattern, single `getMemberWorkspace` lookup).
**MODIFIED backend test files**:
- `convex/stories.test.ts` — extended with `describe("stories: getStoriesByIds", ...)` block (5 tests: full-doc shape, empty input, cross-workspace exclusion, non-existent ID exclusion, order preservation).

**NEW frontend files**:
- `src/app/(auth)/projects/[id]/stories/exportFormatters.ts` — pure module (`buildStoryMarkdown`, `buildStoriesMarkdown`, `buildBmadStoryMarkdown`, `slugifyStoryTitle`, `StoryExport`).
- `src/app/(auth)/projects/[id]/stories/exportFormatters.test.ts` — 28 unit tests.
- `src/app/(auth)/projects/[id]/stories/downloadFile.ts` — DOM helper (duplicate of `baseline/downloadFile.ts`).
- `src/app/(auth)/projects/[id]/stories/ExportStories.tsx` — list-page bulk export dropdown.
- `src/app/(auth)/projects/[id]/stories/ExportStories.test.tsx` — 9 component tests.
- `src/app/(auth)/projects/[id]/stories/[storyId]/ExportSingleStory.tsx` — detail-page single-story export dropdown.
- `src/app/(auth)/projects/[id]/stories/[storyId]/CopyStoryButton.tsx` — detail-page clipboard button.
- `src/app/(auth)/projects/[id]/stories/[storyId]/story-export.test.tsx` — 13 component tests.

**MODIFIED frontend files**:
- `src/app/(auth)/projects/[id]/stories/page.tsx` — added `getKnowledgeBase` + `getProject` queries, `selectedIds` state, per-card `onToggleSelect`, "Select all" header checkbox, `<ExportStories>` after the status filter, `flex-wrap` on header row.
- `src/app/(auth)/projects/[id]/stories/[storyId]/page.tsx` — added `getKnowledgeBase` + `getProject` queries, action row `<div>` between header and `<dl>` containing `<ExportSingleStory>` + `<CopyStoryButton>`.
- `src/components/stories/StoryCard.tsx` — added optional `selected` + `onToggleSelect` props; renders a checkbox before the title when `onToggleSelect` is provided; checkbox `onClick` calls `e.stopPropagation()` to prevent the wrapping `<Link>` from navigating.
- `src/app/(auth)/projects/[id]/stories/stories.test.tsx` — extended mocks (`getKnowledgeBase`, `getProject`, `getStoriesByIds`, `downloadFile`); added 12 selection/export tests.
- `src/app/(auth)/projects/[id]/stories/[storyId]/story-detail.test.tsx` — extended mocks (`getKnowledgeBase`, `getProject`, `downloadFile`, `navigator.clipboard`); added 7 export/copy tests.
- `src/components/stories/StoryCard.test.tsx` — added 5 checkbox render/click-suppression tests.

### Change Log

- 2026-06-16: Implemented Story 4.4 (Story Export) in TDD red-green-refactor cycle. Backend: 1 new read-only query with batch ownership check. Frontend: 1 pure formatter module, 1 DOM helper (duplicate), 3 React components, 2 page modifications, 1 component modification. 89 new tests across 6 files. `pnpm test` (478 passing), `pnpm test:convex` (1078 passing), `pnpm build` succeeds. Zero regressions (the 2 pre-existing `runner/` Playwright failures exist on baseline `ea7f325`).

### Review Findings

**Review date:** 2026-06-16 · **Method:** bmad-code-review 3-layer (Blind Hunter + Edge Case Hunter + Acceptance Auditor) · **Layers failed:** none · **Outcome:** 0 decision-needed · **8 patch** · 5 defer · 4 dismissed.

**Patches (action required):**

- [x] [Review][Patch] [CRITICAL] Checkbox click still navigates the wrapping `<Link>` — `stopPropagation()` cancels event bubbling but NOT the anchor's default navigation action, so in a real browser every selection checkbox navigates to the story detail page (bulk selection is unusable in production; tests pass only because the `<a>` mock has no navigation default action, and jsdom doesn't navigate). Fix: `onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleSelect(story._id); }}` and drop `onChange` (controlled `checked` makes this safe — `preventDefault` also suppresses the native toggle, so the toggle must move into `onClick`). [src/components/stories/StoryCard.tsx:56] — **NOTE: this corrects an incorrect "corrected pattern" in this story's own Dev Notes ("Selection UX — Checkboxes Inside Links"); update that section too. Requires manual browser verification (jsdom cannot test navigation).**
- [x] [Review][Patch] [HIGH] Selection state incoherent across status-filter changes — `selectedIds` is never cleared when the filter changes, so stories selected under one filter get exported after switching to another; `allSelected` uses size-equality (`selectedIds.size === stories.length`) not a subset check, so "Select all" renders checked for a different filter with the same count (then clearing it unexpectedly wipes the stale set). Fix: `useEffect(() => setSelectedIds(new Set()), [filter])` + compute `allSelected` as `stories.length > 0 && stories.every((s) => selectedIds.has(s._id))`. [src/app/(auth)/projects/[id]/stories/page.tsx:21,83]
- [x] [Review][Patch] [MEDIUM] BMAD formatter emits wrong heading level for Acceptance Criteria — `acceptanceCriteriaSection()` hardcodes `### Acceptance Criteria` (h3); the BMAD format needs `## Acceptance Criteria` (h2) to match `## Context`/`## Story`/`## Affected Components` and the BMAD template. AC5/AC6 deviation. Fix: parameterize the heading level (or inline the h2 version in `buildBmadStoryMarkdown`). [src/app/(auth)/projects/[id]/stories/exportFormatters.ts:30,103]
- [x] [Review][Patch] [MEDIUM] BMAD bulk export interleaves build + download — Dev Notes (Story 2.4 review patch) require building ALL markdown strings BEFORE any `downloadFile` call (atomicity: if one builder throws, no partial download). Fix: `.map` to `{ content, filename }` tuples first, then `forEach` download. [src/app/(auth)/projects/[id]/stories/ExportStories.tsx:97]
- [x] [Review][Patch] [LOW] BMAD bulk export filename collisions on duplicate/shared-prefix titles — `slugifyStoryTitle` derives from title only (the `_id` fallback fires only for empty slugs), so two stories titled the same yield one `story-{slug}.md` (browser silently renames; data preserved but confusing + risks overwrite). Fix: disambiguate within the batch (append `-{id8}` when a slug repeats). [src/app/(auth)/projects/[id]/stories/ExportStories.tsx:100]
- [x] [Review][Patch] [LOW] `ExportStories` has no test asserting the `"skip"`/lazy-query gating — AC10 explicitly requires verifying `getStoriesByIds` is not called until a format is clicked; the 9 existing tests never assert `useQuery` receives `"skip"` pre-click. [src/app/(auth)/projects/[id]/stories/ExportStories.test.tsx]
- [x] [Review][Patch] [LOW] BMAD formatter test is too weak to catch the h3-vs-h2 bug — `toContain("## Acceptance Criteria")` passes against the buggy `### Acceptance Criteria` output (`"##"` is a substring of `"###"`). Tighten to a line-anchored assertion (e.g. `expect(md.split("\n")).toContain("## Acceptance Criteria")`) so the AC5 patch is regression-guarded. [src/app/(auth)/projects/[id]/stories/exportFormatters.test.ts:167]
- [x] [Review][Patch] [LOW] `slugifyStoryTitle` can leave a trailing hyphen after 60-char truncation — leading/trailing-hyphen trim runs before `slice(0, 60)`, so a title whose 60th char lands on a hyphen run yields `story-…-.md`. Fix: slice first, then re-trim the ends. [src/app/(auth)/projects/[id]/stories/exportFormatters.ts:14-18]

**Deferred (written to `_bmad-output/implementation-artifacts/deferred-work.md`):**

- [x] [Review][Defer] Unbounded `ids` array in `getStoriesByIds` (no cap) [convex/stories/queries.ts:89] — per explicit AC4 decision ("selection size is the bound"); Convex arg-size/query-time limits apply; defense-in-depth for future callers.
- [x] [Review][Defer] `getStoriesByIds` filters by `workspace_id` only, not `project_id` [convex/stories/queries.ts:92] — matches the spec's workspace-level batch-ownership contract and the existing `getStory` pattern; defense-in-depth if a future caller passes mixed-project IDs.
- [x] [Review][Defer] `ExportStories` trigger can stay on "Exporting…" if `getStoriesByIds` errors mid-export [src/app/(auth)/projects/[id]/stories/ExportStories.tsx:81] — low-likelihood (session expiry mid-click); `useQuery` throws on error → error boundary; matches documented codebase-wide C10 deferred pattern.
- [x] [Review][Defer] `CopyStoryButton` 2s `setCopied(false)` timer not cleared on unmount [src/app/(auth)/projects/[id]/stories/[storyId]/CopyStoryButton.tsx:34] — cosmetic (React 18+ no-ops the unmounted setState); only matters on fast remount.
- [x] [Review][Defer] `CopyStoryButton` doesn't guard `navigator.clipboard === undefined` [src/app/(auth)/projects/[id]/stories/[storyId]/CopyStoryButton.tsx:32] — app is always HTTPS (clipboard always defined); the throw is already caught and surfaced via `<Alert>`; only message quality would improve.

**Dismissed (4):** ExportSingleStory shows no `<Alert>` on download failure (explicit spec decision, error-handling table line 408 — downloads fail silently, user re-clicks); StrictMode double-download in `ExportStories` (false positive — dep-driven effect with early-return guard, `pendingFormat` is null at mount); multi-download revoke-timer race / browser throttling (speculative + documented-accepted by AC6); bulk BMAD option gated on `bmadDetected` only vs detail-page `|| technical_context` (per explicit AC6 — bulk intentionally uses the KB flag pre-fetch).

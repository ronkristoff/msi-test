---
baseline_commit: 90b4f4baf3f71e60acae6b65515ef2006ab4f0ab
---

# Story 2.2: Drift Report Generation

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a BA,
I want to see how the current codebase differs from the Old Requirements Document,
so that I know which features were added, removed, or changed since the RD was written.

## Acceptance Criteria

1. **AC1 — Schema: `drift_reports` table created**: A new `drift_reports` table is added to `convex/schema.ts` with the fields defined in [Schema Design](#schema-design-drift_reports-table) below. Indexes: `by_workspace_id`, `by_project_id`, `by_project_id_and_version`, `by_baseline_rd_id`. Index names must NOT be `by_creation_time` or `by_id` (reserved). `workspace_id` and `project_id` present on every row for multi-tenant isolation (matches every other table in the schema).

2. **AC2 — AI compares Old RD against KB and categorizes drift**: When generation runs and an Old RD exists, AI produces a Drift Report with items categorized as `added`, `removed`, or `changed`:
   - `added` — feature/capability present in code (Baseline RD) but absent from the Old RD
   - `removed` — feature/capability described in the Old RD but not found in code
   - `changed` — feature exists in both but materially differs in implementation, scope, or behavior
   Each item is a structured `driftItemValidator` object — NOT a free-text blob.

3. **AC3 — Each drift item has a severity**: Every drift item carries a `severity` field with value `breaking`, `significant`, or `incremental`:
   - `breaking` — drift likely breaks existing integrations, APIs, or user contracts
   - `significant` — drift changes meaningful behavior but is non-breaking
   - `incremental` — drift is additive or cosmetic (new optional feature, minor refactor)
   The AI assesses severity; post-processing validates the value is in the allowed set.

4. **AC4 — Each drift item links to a Baseline RD section**: Every item carries `rd_section_id` referencing one of the known Baseline RD section IDs (`overview`, `tech-stack`, `modules`, `api-surface`, `data-model`, `user-flows`, or `decision-log`). Post-processing strips or defaults invalid IDs. This link is the data source for the viewer's per-section grouping.

5. **AC5 — Drift Report stored with status `draft`, version 1**: The first Drift Report generated for a project is stored with `status: "draft"` and `version: 1`. Status union: `"draft" | "archived" | "failed"`. Version is a positive integer starting at 1, atomically incremented inside `_storeDriftReport` (mirrors Story 2.1 `_storeBaselineRd` pattern).

6. **AC6 — Auto-trigger after Baseline RD generation**: When the ingestion workflow's Baseline RD generation step succeeds (returns a non-null `baselineRdId`) AND the project has `old_rd_extracted_text`, Drift Report generation runs automatically as a final workflow step. If generation fails, the KB and Baseline RD remain intact — Drift generation failure MUST NOT roll back either. Drift generation is decoupled from Baseline RD success (see [Auto-Trigger Architecture](#auto-trigger-architecture)). If no Old RD exists, the drift step is a no-op (the action returns early without storing).

7. **AC7 — Manual trigger**: A public `triggerDriftReport` action allows the BA to regenerate the Drift Report on demand. Requires `requireAuth`. Guards: KB must be `"ready"`, Old RD must exist, Baseline RD must exist (non-archived, non-failed). Throws `ConvexError` with clear messages when guards fail. Mirrors `triggerBaselineRd` pattern including the workspace-ownership IDOR guard (`project.workspace_id !== membership.workspace_id`).

8. **AC8 — Re-sync archives previous Drift Report**: When `resyncKnowledgeBase` runs (Story 1.8), the existing Drift Report is archived (`status: "archived"`) BEFORE the new ingestion begins, alongside the existing `_archiveBaselineRd` call. Archival is idempotent on retry and uses the paginated `while(hasMore)` pattern (retrospective A1 — no unbounded `.collect()`; mirrors the fixed `_archiveBaselineRd` from Story 2.1 review patch).

9. **AC9 — BMAD-aware drift dimensions (enhanced AC, `bmad_detected = true`)**: When `knowledge_bases.bmad_detected` is true AND an Old RD exists, the Drift Report includes four drift dimensions:
   1. **`old-rd-vs-code`** — Old RD vs code (always present when Old RD exists)
   2. **`bmad-prd-vs-code`** — BMAD PRD sections vs extracted code structure (BMAD only)
   3. **`bmad-conventions-vs-code`** — BMAD conventions vs detected code patterns (BMAD only)
   4. **`adr-drift`** — Architecture decisions that changed (BMAD only, shown separately)
   Each dimension is a value on the item's `dimension` field. The AI is instructed to populate all relevant dimensions. ADR drifts are queryable separately via the `dimension === "adr-drift"` filter in the viewer.

10. **AC10 — Non-BMAD regression safety**: When `bmad_detected` is false/undefined, generation works exactly as originally specified — only `old-rd-vs-code` drift items are produced. No BMAD context injected, no PRD/convention/ADR dimensions, no `bmad-prd-vs-code`/`bmad-conventions-vs-code`/`adr-drift` items. Post-processing strips any BMAD-dimension items the model may spuriously emit on a non-BMAD KB (mirrors Story 2.1's `applyBmadConfidenceAdjustment` guard pattern).

11. **AC11 — No Old RD graceful state**: When the project has no `old_rd_extracted_text`, `getDriftReport` returns `null` (not an error). The frontend viewer at `/projects/[id]/baseline/drift` shows an `EmptyState` explaining that Drift Report requires an uploaded Old RD, with a link to project settings to upload one. The auto-trigger action is a no-op (returns early without storing a report).

12. **AC12 — Public query for Drift Report consumption**: A `getDriftReport` query returns the current (highest-version, non-archived, non-failed) Drift Report for a project. Uses `getOptionalMemberWorkspace` for ownership (mirrors `getBaselineRd`). Returns `null` if none exists. Returns a lightweight metadata object `{ has_old_rd: boolean }` alongside or via a separate query so the frontend can show the "no Old RD" state without calling the action. This query is the data source for the viewer — do NOT build the export in this story (Story 2.4).

13. **AC13 — Frontend viewer at `/projects/[id]/baseline/drift`**: A page that:
    - Shows the latest Drift Report (grouped by dimension, each item with severity badge, category label, title, description, and Baseline RD section reference)
    - Shows `EmptyState` when no Old RD is uploaded
    - Shows a "generating" state when KB is ready and Old RD exists but no report yet (or report is stale relative to a newer Baseline RD version)
    - Shows an error state with a "Regenerate" button when generation failed
    - Has a "Regenerate" action button (calls `triggerDriftReport`)
    - ADR drift items are shown in a separate "Architecture Decision Drifts" section (BMAD only)
    - Links from the project detail page (or Knowledge Base page) to this route

14. **AC14 — Tests**: Backend tests in `convex/knowledge.driftReport.test.ts` covering: zod drift schema validation, `buildDriftReportPrompt` (BMAD and non-BMAD paths), `generateDriftReport` action (AI mocked — test prompt construction, storage mutation calls, dimension filtering), `_storeDriftReport` / `_archiveDriftReport` / `_getLatestDriftVersion` internal mutations, `getDriftReport` query (ownership + version selection), `triggerDriftReport` action (guards, version increment, workspace IDOR check), ingestion auto-trigger step registration (conditional on baseline RD success + Old RD existence), re-sync archival, and non-BMAD regression. Add `seedDriftReport` to `convex/testHelpers.ts`. Frontend tests for the viewer page in `src/app/(auth)/projects/[id]/baseline/drift/DriftReportViewer.test.tsx` covering: loading state, no-Old-RD empty state, error state with regenerate, report rendering with grouped dimensions and severity badges. All tests use existing seed helpers and mock patterns.

## Tasks / Subtasks

- [x] Task 1: Schema changes (AC: #1)
  - [x] Add `drift_reports` table to `convex/schema.ts` per [Schema Design](#schema-design-drift_reports-table)
  - [x] Indexes: `by_workspace_id`, `by_project_id`, `by_project_id_and_version`, `by_baseline_rd_id` — verify none are reserved names
  - [x] Define a shared `driftItemValidator` `v.object()` in `convex/lib/validation.ts` (reused by schema + frontend types). Do NOT use `v.any()` anywhere in the drift structure.

- [x] Task 2: Drift zod schema + prompts (AC: #2, #3, #4, #9, #10)
  - [x] Create `convex/knowledge/driftPrompts.ts` — export `driftReportSchema` (zod), `buildDriftReportPrompt(...)`, `filterDriftDimensions(...)`, `validateDriftItemSectionIds(...)`, and the `DriftGenerationContext` type. Pure module, no `"use node"`, no Convex imports (fully unit-testable like `baselinePrompts.ts`).
  - [x] `driftReportSchema`: `z.object({ items: z.array(driftItemZod).min(0) })` where each item has `{ dimension, category, severity, title, description, rd_section_id?, evidence?, old_rd_reference? }`. Reuse the SAME shape as `driftItemValidator`.
  - [x] `buildDriftReportPrompt`: accepts `{ oldRdText, baselineRdSections, architectureSummary, bmadContext?, kbStats }`. Always requests `old-rd-vs-code` dimension. When `bmadContext` present, instructs AI to also produce `bmad-prd-vs-code`, `bmad-conventions-vs-code`, and `adr-drift` items. Instructs AI to populate `severity`, `category`, and `rd_section_id` on every item.
  - [x] `filterDriftDimensions(items, { bmad })`: pure function that strips BMAD-dimension items when `bmad` is false (AC10). When `bmad` is true, passes through all dimensions.
  - [x] `validateDriftItemSectionIds(items)`: pure function that strips `rd_section_id` values not in the known set (`overview`, `tech-stack`, `modules`, `api-surface`, `data-model`, `user-flows`, `decision-log`). Invalid IDs become `undefined`.
  - [x] Define `DRIFT_DIMENSIONS` constant array and `SEVERITY_LABELS` map for frontend reuse.

- [x] Task 3: Generation action (AC: #2, #3, #5, #6, #9, #10)
  - [x] Create `convex/knowledge/driftActions.ts` with `"use node";` at top (needs `generateObject` + `getWorkspaceModel`). CANNOT export queries/mutations.
  - [x] `generateDriftReport` internal action: args `{ project_id, knowledge_base_id, workspace_id, baseline_rd_id }`. Mirrors `generateBaselineRd` structure.
  - [x] Query `_getKbForDriftReport` (new internal query in `internal.ts`) returning: `{ old_rd_extracted_text, baseline_rd, bmad_detected, architecture_summary, tech_stack, architecture_type, folder_structure, total_files, total_size_bytes }` + BMAD metadata when `bmad_detected`.
  - [x] Early return `{ driftReportId: null, reason: "no_old_rd" }` if `old_rd_extracted_text` is null/empty.
  - [x] Early return `{ driftReportId: null, reason: "no_baseline_rd" }` if `baseline_rd` is null.
  - [x] Query `_getWorkspaceAiConfig` (exists) for model. Use `glm-5.1` or stronger — NEVER `*-free` models (retrospective A6).
  - [x] Call `generateObject({ model, schema: driftReportSchema, prompt })`. Wrap in try/catch → `ConvexError` with `buildDriftReportErrorMessage` (mirror `buildBaselineRdErrorMessage`).
  - [x] Post-process: `filterDriftDimensions` (strip BMAD items if non-BMAD), `validateDriftItemSectionIds` (strip invalid section refs).
  - [x] Bound the AI context: cap total prompt input chars via `DRIFT_MAX_CONTEXT_CHARS` in `constraints.ts` — truncate Old RD text and Baseline RD section content if needed. Mirror `boundModulesForPrompt` budget pattern from `baselinePrompts.ts`.
  - [x] Call `_storeDriftReport` internal mutation with the processed items + version (from `_getLatestDriftVersion` + 1, computed atomically inside the mutation).
  - [x] `generateDriftReportWithLogging` internal action: wraps `generateDriftReport` in try/catch. On catch, calls `_logDriftReportFailure` and returns `{ driftReportId: null, version, error }`. Never throws (mirrors `generateBaselineRdWithLogging`). Wrap the logging calls in a nested try/catch so the wrapper always returns gracefully.

- [x] Task 4: Internal storage mutations (AC: #5, #8)
  - [x] In `convex/knowledge/internal.ts`, add:
    - `_storeDriftReport({ project_id, workspace_id, knowledge_base_id, baseline_rd_id, items })` — computes version atomically (query latest + increment within the same mutation), inserts a new row with `status: "draft"`. Returns `{ _id, version }`. Mirrors the fixed `_storeBaselineRd` from Story 2.1 review (atomic version increment inside mutation — NOT in the action).
    - `_archiveDriftReport({ project_id })` — archives ALL non-archived Drift Reports for the project. Idempotent. Uses the paginated `while(hasMore)` pattern with `.take(100)` (mirrors the fixed `_archiveBaselineRd` from Story 2.1 review patch — filter-and-paginate, not single-take-and-stop). Returns count archived.
    - `_getLatestDriftVersion({ project_id })` — returns the highest `version` among all Drift Reports for the project (archived or not), or 0 if none. Uses `by_project_id_and_version` index, `.order("desc")` + `.first()` (retrospective A2 — always pair `.first()` with explicit `.order()`).

- [x] Task 5: BMAD metadata query for drift (AC: #9)
  - [x] In `convex/knowledge/internal.ts`, add `_getBmadMetadataForDrift({ knowledge_base_id })` internal query. Mirrors `_getBmadMetadataForExtraction` but ALSO returns `conventions` (concatenated string). Returns `{ detected, prdSections, adrs, conventions }`. When `!bmad_detected`, returns `{ detected: false, prdSections: "", adrs: "", conventions: "" }`. Do NOT modify `_getBmadMetadataForExtraction` (extraction callers depend on its current shape).
  - [x] Bound each concatenated string to a char limit (reuse `MAX_CONTEXT_CHARS = 20000` pattern from `_getBmadMetadataForExtraction`).

- [x] Task 6: Internal KB/context query for drift (AC: #2, #9)
  - [x] In `convex/knowledge/internal.ts`, add `_getKbForDriftReport({ knowledge_base_id, baseline_rd_id })` internal query returning:
    ```
    { knowledge_base_id, workspace_id, project_id, old_rd_extracted_text,
      baseline_rd: { sections, version } | null,
      bmad_detected, architecture_summary, tech_stack, architecture_type, folder_structure,
      total_files, total_size_bytes }
    ```
  - [x] Loads the project to get `old_rd_extracted_text`. Loads the specified `baseline_rd_id` row and validates `rd.project_id === kb.project_id` (defense-in-depth against IDOR — mirrors the Story 2.1 review patch for `_getKbForBaselineRd`).
  - [x] Returns `baseline_rd: null` if the RD is archived/failed or belongs to a different project.

- [x] Task 7: Auto-trigger in ingestion workflow (AC: #6)
  - [x] In `convex/knowledge/ingestionWorkflow.ts`, modify the final `generateBaselineRdWithLogging` step to capture its return value: `const baselineResult = await step.runAction(...)`.
  - [x] Add a conditional final step AFTER baseline RD generation:
    ```typescript
    if (baselineResult.baselineRdId) {
      await step.runAction(
        internal.knowledge.driftActions.generateDriftReportWithLogging,
        { project_id, knowledge_base_id, workspace_id, baseline_rd_id: baselineResult.baselineRdId },
      );
    }
    ```
  - [x] The drift action handles the no-Old-RD case internally (early return). The workflow step itself does not fail the ingestion on drift errors (the wrapper catches and logs).
  - [x] Verify the conditional `if` pattern is supported by `@convex-dev/workflow@0.4.3` (it is — the existing workflow uses `if (treeResult.bmadFiles.length > 0)`).

- [x] Task 8: Manual trigger action (AC: #7)
  - [x] In `convex/knowledge/triggerIngestion.ts`, add `triggerDriftReport` public `action`. Co-locate with `triggerBaselineRd`.
  - [x] `requireAuth(ctx)` + `_getMembershipForUser` (same pattern as `triggerBaselineRd`).
  - [x] Guard: project must exist. Check `project.workspace_id !== membership.workspace_id` → throw `ConvexError("Project not found")` (IDOR guard — the fix applied to `triggerBaselineRd` in Story 2.1 review).
  - [x] Guard: KB must be `"ready"`. Throw `ConvexError` otherwise.
  - [x] Guard: `old_rd_extracted_text` must exist. Throw `ConvexError("Drift Report requires an Old RD. Upload one in project settings.")`.
  - [x] Query `_getKnowledgeBaseForProject` (exists) for the KB.
  - [x] Query the latest non-archived, non-failed Baseline RD via `_getLatestBaselineRdForDrift` (new thin internal query OR reuse the `by_project_id_and_version` index logic inline). Throw `ConvexError("Drift Report requires a Baseline RD. Generate one first.")` if none.
  - [x] Call `_archiveDriftReport` then run `generateDriftReportWithLogging` via `ctx.runAction`.
  - [x] Returns `{ driftReportId, version }` or `{ driftReportId: null, error }`.

- [x] Task 9: Re-sync archival (AC: #8)
  - [x] In `convex/knowledge/triggerIngestion.ts` `resyncKnowledgeBase`, add `_archiveDriftReport` call immediately AFTER the existing `_archiveBaselineRd` call (line ~133-135). Both run before `_resetKbForResync`.
  - [x] The subsequent ingestion's auto-trigger (Task 7) generates the fresh draft with incremented version.

- [x] Task 10: Public queries (AC: #11, #12)
  - [x] In `convex/knowledge/queries.ts`, add `getDriftReport` query. Args: `project_id: v.id("projects")`. Uses `getOptionalMemberWorkspace`. Returns the highest-version non-archived, non-failed Drift Report via `by_project_id_and_version` index `.order("desc").take(10)` then `.find(r => r.status === "draft")`, or `null`. Whitelist returned fields (no `workspace_id`, no `generation_error` leak to the client). Mirror `getBaselineRd` exactly.
  - [x] Add `hasOldRd` query (or extend `getOldRd` return — `getOldRd` already returns `has_old_rd`). Reuse `getOldRd` on the frontend; do NOT duplicate.

- [x] Task 11: Frontend viewer page (AC: #13)
  - [x] Create `src/app/(auth)/projects/[id]/baseline/drift/page.tsx` — client component. Uses `useQuery(api.knowledge.queries.getDriftReport, ...)` + `useQuery(api.knowledge.queries.getOldRd, ...)` + `useAction(api.knowledge.triggerIngestion.triggerDriftReport)`.
  - [x] Create `src/app/(auth)/projects/[id]/baseline/drift/DriftReportViewer.tsx` — renders the report: groups items by dimension, shows severity badges (breaking=danger, significant=warn, incremental=neutral using existing `StatusPill` variants), category label, title, description, and Baseline RD section reference.
  - [x] Create `src/app/(auth)/projects/[id]/baseline/drift/DriftDimensions.tsx` — dimension grouping + labels helper (maps dimension IDs to display labels).
  - [x] States: loading (`PageSkeleton`), no-Old-RD (`EmptyState` with link to settings), generating (report is null but Old RD exists and KB is ready — show a "generating" message with spinner), error (report has `status: "failed"` or `generation_error` — show `Alert` variant="error" with "Regenerate" button), ready (render `DriftReportViewer`).
  - [x] ADR drifts (`dimension === "adr-drift"`) rendered in a separate "Architecture Decision Drifts" card below the main dimensions.
  - [x] "Regenerate" button calls `triggerDriftReport`, shows loading state during action.
  - [x] Add navigation link from the Knowledge Base page (`KnowledgeReady.tsx`) to `/projects/[id]/baseline/drift` — visible when KB is ready and Old RD exists. Label: "View Drift Report".
  - [x] No inline editing in this story (Story 2.3 owns editing for Baseline RD; Drift Report is read-only).

- [x] Task 12: Test helpers (AC: #14)
  - [x] In `convex/testHelpers.ts`, add `seedDriftReport(t, workspaceId, projectId, kbId, baselineRdId, overrides?)` — accepts `items?`, `version?`, `status?`, `generation_error?`, `bmad_detected?`. Follow the `seedBaselineRd` pattern.

- [x] Task 13: Write backend tests (AC: #14)
  - [x] Create `convex/knowledge.driftReport.test.ts` at `convex/` root (NOT in `convex/knowledge/` subdir — matches `convex/knowledge.baselineRd.test.ts` convention).
  - [x] Hoist `vi.mock("ai", () => ({ generateObject: vi.fn() }))` to the top of the file (same pattern as `knowledge.baselineRd.test.ts`).
  - [x] Test `driftReportSchema` zod validation: valid report passes; invalid dimension fails; invalid category fails; invalid severity fails; empty items array allowed (no drift detected is valid).
  - [x] Test `buildDriftReportPrompt`: contains Old RD text; contains Baseline RD sections; includes BMAD cross-reference instructions when `bmadContext` provided; omits BMAD instructions when null; requests all four dimensions when BMAD; requests only `old-rd-vs-code` when non-BMAD.
  - [x] Test `filterDriftDimensions`: strips BMAD-dimension items when `bmad: false`; preserves all when `bmad: true`; immutability (returns new array).
  - [x] Test `validateDriftItemSectionIds`: strips invalid section IDs; preserves valid ones; immutability.
  - [x] Test `_storeDriftReport`: inserts with status draft; version increments atomically; concurrent-safe version logic (two calls produce N+1 and N+2).
  - [x] Test `_archiveDriftReport`: archives all non-archived; idempotent on re-run; uses paginated loop (test with >100 rows if feasible, or document the bound).
  - [x] Test `_getLatestDriftVersion`: returns max version; returns 0 when none; uses ordered query.
  - [x] Test `getDriftReport`: returns latest non-archived non-failed; returns null when none; respects workspace ownership (cross-workspace returns null); skips failed reports.
  - [x] Test `triggerDriftReport`: requires auth; requires KB ready; requires Old RD; requires Baseline RD; workspace IDOR check; archives previous then generates; version increments.
  - [x] Test `generateDriftReport` action: **mock `generateObject`** — verify it queries KB data, builds prompt, filters dimensions, validates section IDs, calls `_storeDriftReport`. Test BMAD path (all dimensions) and non-BMAD path (only `old-rd-vs-code`). Test early-return when no Old RD. Test early-return when no Baseline RD.
  - [x] Test ingestion auto-trigger: verify the workflow registers the conditional drift step after baseline RD success; verify the step is SKIPPED when baseline RD fails (`baselineRdId` is null); verify KB stays "ready" even if drift generation throws (mock the action to throw).
  - [x] Test re-sync archival: `resyncKnowledgeBase` calls `_archiveDriftReport`; subsequent generation creates version N+1.

- [x] Task 14: Write frontend tests (AC: #14)
  - [x] Create `src/app/(auth)/projects/[id]/baseline/drift/DriftReportViewer.test.tsx`.
  - [x] Test loading state (queries `undefined` → `PageSkeleton`).
  - [x] Test no-Old-RD empty state (`getOldRd` returns null → `EmptyState` with settings link).
  - [x] Test error state (drift report with `generation_error` → `Alert` + Regenerate button).
  - [x] Test ready state (drift report with items → grouped by dimension, severity badges, section references).
  - [x] Test ADR drifts shown in separate section.
  - [x] Test Regenerate button calls `triggerDriftReport` action.

- [x] Task 15: Run validation (AC: #14)
  - [x] `pnpm lint` — zero new errors
  - [x] `pnpm test:convex` — all backend tests pass
  - [x] `pnpm test` — all frontend tests pass (including new viewer tests)

## Dev Notes

### Scope Boundary — What This Story Does and Does NOT Do

**This story implements (backend + read-only frontend viewer):**
- `drift_reports` table with structured items (no `v.any()`)
- AI generation pipeline using `generateObject` (mirrors Story 2.1 baseline RD pattern)
- Severity and category per item, with BMAD-aware dimensions
- Auto-trigger after Baseline RD generation (conditional final ingestion workflow step)
- Manual trigger action (`triggerDriftReport`)
- Re-sync archival of previous Drift Report
- Public `getDriftReport` query (data source for viewer)
- `seedDriftReport` test helper
- Read-only frontend viewer at `/projects/[id]/baseline/drift`
- Comprehensive backend + frontend tests

**This story does NOT implement:**
- Baseline RD viewer / inline editor → **Story 2.3** (`/projects/[id]/baseline`)
- Drift Report export (Markdown/HTML) → **Story 2.4**
- Editing the stored Drift Report (no status transitions beyond draft/archived/failed) → **Not in scope**
- Rich diff visualization (side-by-side Old RD vs Baseline RD) → **Future enhancement**

### Schema Design: `drift_reports` Table

Add to `convex/schema.ts`. **Critical**: use `v.object()` shapes everywhere — NEVER `v.any()` for drift structure (retrospective A3).

```typescript
drift_reports: defineTable({
  workspace_id: v.id("workspaces"),
  project_id: v.id("projects"),
  knowledge_base_id: v.id("knowledge_bases"),
  baseline_rd_id: v.id("baseline_rds"),
  version: v.number(),                        // positive int, starts at 1
  status: v.union(
    v.literal("draft"),
    v.literal("archived"),
    v.literal("failed"),
  ),
  items: v.array(driftItemValidator),         // see validator below
  bmad_detected: v.boolean(),                 // snapshot: was BMAD active during generation
  generation_error: v.optional(v.string()),   // populated if generation failed
  generated_at: v.number(),                   // Date.now() at creation
})
  .index("by_workspace_id", ["workspace_id"])
  .index("by_project_id", ["project_id"])
  .index("by_project_id_and_version", ["project_id", "version"])
  .index("by_baseline_rd_id", ["baseline_rd_id"]),
```

**Shared validator** in `convex/lib/validation.ts` (reused by frontend `Doc<"drift_reports">` typing — single source of truth):

```typescript
export const driftItemValidator = v.object({
  dimension: v.union(
    v.literal("old-rd-vs-code"),
    v.literal("bmad-prd-vs-code"),
    v.literal("bmad-conventions-vs-code"),
    v.literal("adr-drift"),
  ),
  category: v.union(
    v.literal("added"),
    v.literal("removed"),
    v.literal("changed"),
  ),
  severity: v.union(
    v.literal("breaking"),
    v.literal("significant"),
    v.literal("incremental"),
  ),
  title: v.string(),
  description: v.string(),
  rd_section_id: v.optional(v.string()),       // links to baseline RD section ID
  evidence: v.optional(v.string()),            // code/KB evidence
  old_rd_reference: v.optional(v.string()),    // Old RD text reference
});
```

The matching zod schema in `driftPrompts.ts` MUST mirror this exactly:

```typescript
const driftItemZod = z.object({
  dimension: z.enum(["old-rd-vs-code", "bmad-prd-vs-code", "bmad-conventions-vs-code", "adr-drift"]),
  category: z.enum(["added", "removed", "changed"]),
  severity: z.enum(["breaking", "significant", "incremental"]),
  title: z.string(),
  description: z.string(),
  rd_section_id: z.string().optional(),
  evidence: z.string().optional(),
  old_rd_reference: z.string().optional(),
});

export const driftReportSchema = z.object({
  items: z.array(driftItemZod),
});
```

### Drift Dimension Contract (fixed)

These dimension IDs are the stable contract between backend generation and the frontend viewer:

| `dimension` | Display Label | Scope | Description |
|-------------|---------------|-------|-------------|
| `old-rd-vs-code` | Old RD vs Code | Always (when Old RD exists) | Features added/removed/changed between Old RD and current code |
| `bmad-prd-vs-code` | BMAD PRD vs Code | BMAD only | Divergences between declared BMAD PRD and extracted code structure |
| `bmad-conventions-vs-code` | Conventions vs Code | BMAD only | Detected code patterns that violate declared project conventions |
| `adr-drift` | Architecture Decision Drift | BMAD only (shown separately) | Architecture decisions that changed since ADRs were written |

### Category and Severity Semantics

| `category` | Meaning |
|-----------|---------|
| `added` | Present in code/Baseline RD but absent from Old RD (or BMAD PRD for BMAD dimensions) |
| `removed` | Described in Old RD (or BMAD PRD) but not found in code |
| `changed` | Exists in both but materially differs |

| `severity` | Meaning | Frontend `StatusPill` variant |
|-----------|---------|-------------------------------|
| `breaking` | Likely breaks integrations, APIs, or user contracts | `danger` |
| `significant` | Changes meaningful behavior, non-breaking | `warn` |
| `incremental` | Additive or cosmetic | `neutral` |

### Auto-Trigger Architecture

The ingestion workflow currently ends with `generateBaselineRdWithLogging`. Drift generation is added as a **conditional final step**:

```
ingestionWorkflow (MODIFIED):
  ... existing steps ...
  → _updateKbStatus("ready")                    [existing]
  → _setLastSyncedAt                             [existing]
  → ★ generateBaselineRdWithLogging              [existing — now captures return value]
  → ★ generateDriftReportWithLogging             [NEW — conditional on baselineRdId]
      ├── baselineRdId null? → skip (baseline failed)
      ├── no Old RD? → early return (no-op)
      └── try: AI generateObject → _storeDriftReport
          catch: _logDriftReportFailure — DOES NOT THROW
```

**Why conditional on `baselineRdId`:** If baseline RD generation fails, there's no RD to compare against. The `generateBaselineRdWithLogging` wrapper returns `{ baselineRdId: null, version, error }` on failure. The workflow checks this and skips drift generation entirely. This is cleaner than having the drift action independently re-query for a baseline RD that may not exist.

**Why the drift action ALSO checks for Old RD internally:** The workflow doesn't know if Old RD exists at the conditional branch point (it only checks `baselineRdId`). The drift action's internal `old_rd_extracted_text` check is the source of truth for the no-op behavior. This double-check pattern is intentional defense-in-depth.

**Why drift failure must not fail ingestion:** Same reasoning as baseline RD (Story 2.1). The KB and Baseline RD are the source of truth. Drift is a derived artifact. If drift generation throws and propagates, the workflow retries — but the KB is already "ready", so retrying just re-runs drift gen. The wrapper catches + logs so a transient AI error doesn't block the user. The BA can manually regenerate via `triggerDriftReport` (AC7).

**Workflow conditional support:** `@convex-dev/workflow@0.4.3` supports conditional step execution based on prior step return values. The existing workflow already uses `if (treeResult.bmadFiles && treeResult.bmadFiles.length > 0)` to conditionally run the BMAD detection step. The drift conditional follows the same pattern.

### Generation Pipeline — Mirror the Baseline RD Pattern

`generateDriftReport` follows `generateBaselineRd` (`convex/knowledge/baselineActions.ts:38-147`) structurally:

1. Query KB + Old RD + Baseline RD data (`_getKbForDriftReport` — new)
2. Early return if no Old RD (`{ driftReportId: null, reason: "no_old_rd" }`)
3. Early return if no Baseline RD (`{ driftReportId: null, reason: "no_baseline_rd" }`)
4. Query BMAD context (`_getBmadMetadataForDrift` — new, includes conventions) when `bmad_detected`
5. Query AI config (`_getWorkspaceAiConfig` — exists), get model via `getWorkspaceModel`
6. Build prompt via `buildDriftReportPrompt`
7. `generateObject({ model, schema: driftReportSchema, prompt })` — wrap in try/catch → `ConvexError`
8. Post-process: `filterDriftDimensions` (strip BMAD items if non-BMAD), `validateDriftItemSectionIds` (strip invalid section refs)
9. `_storeDriftReport` with version computed atomically inside the mutation

**Error message helper**: Create `buildDriftReportErrorMessage` mirroring `buildBaselineRdErrorMessage` (`baselineActions.ts:25-36`). Handle 401/403 (auth), 404 (model not found), and generic. Reuse `getErrorStatusCode` / `getErrorMessage` from `embeddingActions.ts`.

### Critical: Avoid Epic 1's Recurring Defects

These defects appeared in 44%+ of Epic 1 stories and were addressed in Story 2.1 review. This story MUST proactively avoid them:

| Epic 1 Defect | Mitigation in This Story |
|---------------|--------------------------|
| **Unbounded queries** (44%) | Every query on `drift_reports` uses `.take(N)` or `.order("desc").first()`. `_archiveDriftReport` uses the paginated `while(hasMore)` loop with `.take(100)` (NOT single-take — mirrors the Story 2.1 review patch that fixed `_archiveBaselineRd`). |
| **TOCTOU race conditions** (33%) | Version computed atomically inside `_storeDriftReport` mutation (query latest + increment in same transaction). Do NOT compute version in the action then pass it to the mutation. Two concurrent generations produce versions N+1 and N+2 (retrospective A4). |
| **Missing error handlers on external API calls** (33%) | `generateObject` wrapped in try/catch. Auto-trigger catches + logs via wrapper without throwing. Wrapper's logging calls wrapped in nested try/catch so it never throws. |
| **`v.any()` type debt** | Drift items use `driftItemValidator` (`v.object()`). `dimension`, `category`, `severity` are all `v.union(v.literal(...))`. ZERO `v.any()` in this story's schema (retrospective A3). |
| **IDOR / workspace ownership** | `triggerDriftReport` checks `project.workspace_id !== membership.workspace_id` (mirrors the Story 2.1 review IDOR fix). `_getKbForDriftReport` validates `baseline_rd.project_id === kb.project_id`. `getDriftReport` uses `getOptionalMemberWorkspace`. |
| **Model quality** | Use workspace default model. NEVER `*-free` models (retrospective A6). |
| **Dead code / misleading flags** | No `{ retry: true }` on the drift workflow step unless retry is actually desired. If catch-and-log is the chosen behavior, do NOT add `{ retry: true }` (Story 2.1 review removed it as dead config). |
| **String truncation** | `_logDriftReportFailure` truncates `error_message` to `DRIFT_ERROR_MESSAGE_MAX_LENGTH` before insert (mirrors `_logBaselineRdFailure` + `RD_ERROR_MESSAGE_MAX_LENGTH`). |

### Existing Code to Modify

| File | Change | Breaking? |
|------|--------|-----------|
| `convex/schema.ts` | ADD `drift_reports` table; import `driftItemValidator` | No — new table, additive |
| `convex/lib/validation.ts` | ADD `driftItemValidator` export | No — new export |
| `convex/lib/constraints.ts` | ADD `DRIFT_MAX_CONTEXT_CHARS`, `DRIFT_ERROR_MESSAGE_MAX_LENGTH`, `DRIFT_OLD_RD_MAX_CHARS` | No — new constants |
| `convex/knowledge/internal.ts` | ADD `_storeDriftReport`, `_archiveDriftReport`, `_getLatestDriftVersion`, `_getKbForDriftReport`, `_logDriftReportFailure`, `_getBmadMetadataForDrift` | No — additive |
| `convex/knowledge/ingestionWorkflow.ts` | MODIFY final step to capture `baselineResult`; ADD conditional `generateDriftReportWithLogging` step | No — additive step. Existing tests must still pass. |
| `convex/knowledge/triggerIngestion.ts` | ADD `_archiveDriftReport` call in `resyncKnowledgeBase` (after `_archiveBaselineRd`); ADD `triggerDriftReport` public action export | No — additive |
| `convex/knowledge/queries.ts` | ADD `getDriftReport` public query | No — new export |
| `convex/testHelpers.ts` | ADD `seedDriftReport` helper | No — additive |
| `src/app/(auth)/projects/[id]/knowledge/KnowledgeReady.tsx` | ADD link to drift report page (when KB ready + Old RD exists) | No — additive link |

### New Files to Create

| File | Purpose |
|------|---------|
| `convex/knowledge/driftPrompts.ts` | Zod schema (`driftReportSchema`), prompt builder (`buildDriftReportPrompt`), `filterDriftDimensions`, `validateDriftItemSectionIds`, `boundDriftContext`, dimension/severity constants. Pure module — no `"use node"`, no Convex imports. Fully unit-testable like `baselinePrompts.ts`. |
| `convex/knowledge/driftActions.ts` | `"use node"` internal actions: `generateDriftReport` (throws on AI error) + `generateDriftReportWithLogging` (catches + logs, never throws); plus `buildDriftReportErrorMessage` error helper. Mirrors `baselineActions.ts`. |
| `convex/knowledge.driftReport.test.ts` | Backend tests (AI mocked). At `convex/` root. |
| `src/app/(auth)/projects/[id]/baseline/drift/page.tsx` | Drift report viewer page (client component). |
| `src/app/(auth)/projects/[id]/baseline/drift/DriftReportViewer.tsx` | Renders the report (grouped by dimension, severity badges, section refs). |
| `src/app/(auth)/projects/[id]/baseline/drift/DriftDimensions.tsx` | Dimension grouping + label helpers. |
| `src/app/(auth)/projects/[id]/baseline/drift/DriftReportViewer.test.tsx` | Frontend component tests. |

### Key Dependencies (all already installed — no new packages)

- `generateObject` from `"ai"` — same import as `baselineActions.ts:7`
- `getWorkspaceModel` from `convex/ai/model` — same as baseline RD
- `_getBmadMetadataForExtraction` pattern in `convex/knowledge/internal.ts:535-577` — **reference for the new `_getBmadMetadataForDrift`** (extend with conventions)
- `_getWorkspaceAiConfig` in `convex/knowledge/internal.ts:263-274` — EXISTS, reuse
- `getErrorStatusCode` / `getErrorMessage` from `convex/knowledge/embeddingActions.ts` — EXISTS, reuse
- `getOptionalMemberWorkspace` from `convex/lib/requireAuth.ts` — EXISTS, use for `getDriftReport` query
- `requireAuth`, `getOwnerId` from `convex/lib/requireAuth.ts` — EXISTS, use for `triggerDriftReport`
- `@convex-dev/workflow` `step.runAction` — already used throughout `ingestionWorkflow.ts`
- `rdSectionValidator` from `convex/lib/validation.ts` — EXISTS, reference for the baseline RD sections shape consumed by drift

### Forward-Compatible Code Already in Place

1. **`generateBaselineRdWithLogging` return shape** (Story 2.1) — returns `{ baselineRdId, version }` on success or `{ baselineRdId: null, version, error }` on failure. This story captures that return value in the workflow to conditionally trigger drift generation.
2. **`_archiveBaselineRd`** (Story 2.1) — already called in `resyncKnowledgeBase`. This story adds `_archiveDriftReport` alongside it.
3. **`getBaselineRd` query** (Story 2.1) — returns the latest non-archived, non-failed Baseline RD. The drift generation action can also use this to locate the baseline RD, or it can accept `baseline_rd_id` directly from the workflow (preferred — avoids a second lookup).
4. **`getOldRd` query** (Story 1.2) — already returns `has_old_rd`. The frontend viewer reuses this to show the "no Old RD" empty state.

### Previous Story Intelligence (Story 2.1 — Baseline RD Generation)

**This story directly depends on Story 2.1's output and patterns.** Critical learnings:

1. **AI mocking pattern**: Hoist `vi.mock("ai", () => ({ generateObject: vi.fn() }))` to the TOP of the test file, before imports. The convex-test module map loads the action module before `vi.doMock` could apply. Each test configures the mock via `vi.mocked(ai.generateObject).mockResolvedValue/mockRejectedValue`. This pattern was established in Story 2.1 — reuse it exactly.
2. **`generateBaselineRdWithLogging` wrapper pattern**: The wrapper catches errors from `generateBaselineRd`, persists a failure-draft, and never throws. This story creates `generateDriftReportWithLogging` with the SAME structure. The wrapper's catch block MUST have a nested try/catch around the logging calls so the wrapper always returns gracefully (Story 2.1 review patch).
3. **Atomic version increment**: Version is computed inside `_storeBaselineRd` (the mutation), NOT in the action. Story 2.1 review caught a TOCTOU bug where version was computed in the action and passed to the mutation across separate calls. This story's `_storeDriftReport` MUST follow the fixed pattern — query latest version + increment within the same mutation.
4. **Archival loop**: `_archiveBaselineRd` was initially implemented as a single `.take(100)` without a loop. Story 2.1 review caught this — fixed to the paginated `while(hasMore)` pattern (filter-or-paginate, not cap-and-stop). `_archiveDriftReport` MUST use the paginated pattern from the start.
5. **`"failed"` status in union**: Story 2.1 review added `v.literal("failed")` to the `baseline_rds.status` union so failure-drafts don't surface as valid empty RDs. This story includes `"failed"` in the `drift_reports.status` union from the start.
6. **`getBaselineRd` query**: Uses `.order("desc").take(10)` then `.find(r => r.status !== "archived" && r.status !== "failed")`. This handles the case where the highest-version RD is archived/failed but a lower-version draft exists. `getDriftReport` MUST use the same pattern.
7. **IDOR guard**: `triggerBaselineRd` was initially missing the `project.workspace_id !== membership.workspace_id` check. Story 2.1 review caught it as a cross-workspace IDOR vulnerability. `triggerDriftReport` MUST include this check from the start.
8. **Test file location**: `convex/knowledge.driftReport.test.ts` at `convex/` root (NOT in `convex/knowledge/` subdir). Matches `convex/knowledge.baselineRd.test.ts` convention.
9. **Truncation convention**: `_logBaselineRdFailure` truncates `error_message` to `RD_ERROR_MESSAGE_MAX_LENGTH` (2000 chars). This story's `_logDriftReportFailure` MUST truncate to `DRIFT_ERROR_MESSAGE_MAX_LENGTH`.

### Git Intelligence

Recent commits (single `feat:` commit per story — follow this pattern):
- `90b4f4b` — Story 2.1 (Baseline RD Generation) — **direct predecessor, study its file structure and the review patches**
- `dcbf566` — Epic 1 retrospective
- `343db00` — Story 1.9 (BMAD detection) — owns `_getBmadMetadataForExtraction` that this story extends
- `e6df243` — Story 1.8 (KB re-sync) — owns the `resyncKnowledgeBase` function this story modifies

Baseline commit for this story: `90b4f4b` (latest on main — Story 2.1 complete).

### Project Structure Notes

- `convex/knowledge/driftPrompts.ts` — pure module, NO `"use node"`, NO Convex imports. Fully unit-testable without `convex-test`. Mirrors `baselinePrompts.ts` and `extractionPrompts.ts` conventions.
- `convex/knowledge/driftActions.ts` — `"use node"` (needs `generateObject` + Node AI SDK). CANNOT export queries or mutations — only `internalAction`. Writes go through `ctx.runMutation(internal.knowledge.internal._storeDriftReport, ...)`.
- All new backend code follows the domain directory pattern: `convex/knowledge/` → type files (`driftActions.ts`, `driftPrompts.ts`; mutations/queries go in existing `internal.ts` / `queries.ts` / `triggerIngestion.ts`).
- The `driftItemValidator` lives in `convex/lib/validation.ts` alongside `rdSectionValidator` — single source of truth for backend + frontend types.
- Frontend files at `src/app/(auth)/projects/[id]/baseline/drift/` — follows the existing `knowledge/` page structure (page.tsx + component files). The `baseline/` directory is new but will be shared with Story 2.3's viewer at `baseline/page.tsx`.

### Deferred Work to Resolve This Story

Per retrospective action item A8 ("every story spec includes a deferred-work section"), review `deferred-work.md` for items this story can opportunistically resolve:

- **`v.any()` → `v.object()` (retrospective A3)**: This story proactively uses `v.object()` for all drift structure. Do NOT add new `v.any()`.
- **No `*-free` model guard**: Deferred from Story 2.1. This is a cross-cutting concern (would affect extraction too). Do NOT add it here unless the workspace model is already `*-free` (in which case, note it but don't block).
- The existing `kb_modules.apis`, `data_models`, `user_flows` fields are `v.any()` (Story 1.5 debt). When reading these for drift prompt context (via the Baseline RD sections), they're already structured by the baseline RD generation step. Do NOT attempt to widen them here.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.2] — ACs and user story (lines 519-551)
- [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-06-13.md#Story 2.2 Enhanced] — BMAD-aware drift dimensions and severity ACs (lines 222-239)
- [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-06-13.md#Appendix Drift Report Dimensions] — Dimension table (lines 376-383)
- [Source: _bmad-output/implementation-artifacts/epic-1-retrospective.md] — Epic 1 lessons applied to Epic 2 (defects to avoid, risks)
- [Source: _bmad-output/implementation-artifacts/2-1-baseline-rd-generation.md] — **Direct predecessor story; THE pattern to mirror** (schema design, generation pipeline, auto-trigger, manual trigger, re-sync archival, AI mocking, review patches)
- [Source: convex/schema.ts#baseline_rds] — Baseline RD table (this story links to it via `baseline_rd_id`)
- [Source: convex/schema.ts#kb_bmad_metadata] — BMAD metadata table (source of PRD sections, ADRs, conventions for BMAD drift dimensions)
- [Source: convex/schema.ts#projects] — Projects table (source of `old_rd_extracted_text`)
- [Source: convex/knowledge/baselineActions.ts:38-147] — `generateBaselineRd` — **THE pattern to mirror** for `generateDriftReport`
- [Source: convex/knowledge/baselineActions.ts:149-179] — `generateBaselineRdWithLogging` — **THE wrapper pattern** for `generateDriftReportWithLogging`
- [Source: convex/knowledge/baselinePrompts.ts] — Prompt builder + zod schema pattern; `boundModulesForPrompt` budget pattern to mirror for `boundDriftContext`
- [Source: convex/knowledge/internal.ts:579-606] — `_storeBaselineRd` — atomic version increment pattern (the fixed version after Story 2.1 review)
- [Source: convex/knowledge/internal.ts:608-639] — `_archiveBaselineRd` — paginated archival loop pattern (the fixed version after Story 2.1 review)
- [Source: convex/knowledge/internal.ts:641-656] — `_getLatestRdVersion` — ordered query pattern
- [Source: convex/knowledge/internal.ts:535-577] — `_getBmadMetadataForExtraction` — **reference for the new `_getBmadMetadataForDrift`** (extend with conventions)
- [Source: convex/knowledge/internal.ts:658-696] — `_getKbForBaselineRd` — query pattern + project_id validation (defense-in-depth)
- [Source: convex/knowledge/internal.ts:698-727] — `_logBaselineRdFailure` — failure-draft pattern + truncation
- [Source: convex/knowledge/triggerIngestion.ts:193-252] — `triggerBaselineRd` — **THE trigger pattern to mirror** (auth, membership, IDOR guard, KB ready check, archive + generate)
- [Source: convex/knowledge/triggerIngestion.ts:89-191] — `resyncKnowledgeBase` — where to add `_archiveDriftReport` call (after `_archiveBaselineRd`)
- [Source: convex/knowledge/ingestionWorkflow.ts:146-153] — Where to modify for the conditional drift auto-trigger step
- [Source: convex/knowledge/queries.ts:156-191] — `getBaselineRd` — **THE query pattern to mirror** for `getDriftReport` (ownership, version selection, whitelisted fields)
- [Source: convex/knowledge/queries.ts:58-76] — `getOldRd` — reuse on frontend for the "no Old RD" state check
- [Source: convex/lib/validation.ts:147-163] — `rdSectionValidator` — reference for the new `driftItemValidator`
- [Source: convex/lib/constraints.ts:43-45] — `BASELINE_RD_MAX_CONTEXT_CHARS`, `RD_ERROR_MESSAGE_MAX_LENGTH` — reference for new drift constants
- [Source: convex/knowledge/embeddingActions.ts#getErrorStatusCode] — AI SDK error status extraction
- [Source: convex/testHelpers.ts:220-239] — `seedBaselineRd` — seed helper pattern for new `seedDriftReport`
- [Source: _bmad-output/project-context.md] — Critical implementation rules (versions, Convex patterns, testing rules)
- [Source: src/app/(auth)/projects/[id]/knowledge/page.tsx] — Frontend page pattern (useQuery, conditional queries, loading/error/ready states)
- [Source: src/app/(auth)/projects/[id]/knowledge/KnowledgeReady.tsx] — Where to add the "View Drift Report" link
- [Source: src/components/ui/StatusPill.tsx] — Severity badge component (variants: danger, warn, neutral)
- [Source: src/components/ui/EmptyState.tsx] — No-Old-RD empty state component
- [Source: src/components/ui/Alert.tsx] — Error state component
- [Source: docs/architecture-backend.md] — Backend architecture overview (module organization, auth tiers, components)

## Dev Agent Record

### Agent Model Used

glm-5.2 (zai-coding-plan/glm-5.2)

### Debug Log References

- Initial full-file test run hung indefinitely on `_archiveDriftReport` tests. Root cause: the pagination loop used `.take(100)` on `by_project_id` without filtering archived rows — when ≥100 rows existed, archived rows still matched the index so `hasMore` never became false (infinite loop). Fixed by adding `.filter((q) => q.neq(q.field("status"), "archived"))` to the query (the story spec described this as "filter-and-paginate"). Confirmed the 105-row pagination test now passes in <1s. The baseline `_archiveBaselineRd` has the same latent bug (its tests never use >100 rows) — noted as deferred work.

### Completion Notes List

- **AC1**: `drift_reports` table added to `convex/schema.ts` with 4 indexes (`by_workspace_id`, `by_project_id`, `by_project_id_and_version`, `by_baseline_rd_id`). Shared `driftItemValidator` added to `convex/lib/validation.ts` — zero `v.any()` in the drift structure.
- **AC2–AC4**: `convex/knowledge/driftPrompts.ts` (pure module) exports `driftReportSchema` (zod), `buildDriftReportPrompt`, `filterDriftDimensions`, `validateDriftItemSectionIds`, `boundDriftContext`, dimension/severity/category constants. Items are structured objects with `dimension`, `category`, `severity`, `title`, `description`, optional `rd_section_id`/`evidence`/`old_rd_reference`.
- **AC5**: `_storeDriftReport` computes version atomically inside the mutation (query latest + increment in same transaction). Status starts at `"draft"`, version starts at 1.
- **AC6**: Ingestion workflow captures `baselineResult.baselineRdId` and conditionally runs `generateDriftReportWithLogging` as a final step. Drift failure is caught + logged by the wrapper and does NOT fail ingestion.
- **AC7**: `triggerDriftReport` public action added to `triggerIngestion.ts`. Guards: auth, membership, IDOR (`project.workspace_id !== membership.workspace_id`), KB ready, Old RD exists, Baseline RD exists. Archives previous then generates.
- **AC8**: `resyncKnowledgeBase` calls `_archiveDriftReport` immediately after `_archiveBaselineRd`, both before `_resetKbForResync`.
- **AC9–AC10**: BMAD-aware drift dimensions. When `bmad_detected`, prompt requests all four dimensions; `_getBmadMetadataForDrift` provides PRD/ADR/conventions. When non-BMAD, prompt requests only `old-rd-vs-code`; `filterDriftDimensions` strips any spurious BMAD items.
- **AC11**: `getDriftReport` returns `null` when no report exists. Frontend shows `EmptyState` when no Old RD.
- **AC12**: `getDriftReport` query mirrors `getBaselineRd` — uses `getOptionalMemberWorkspace`, returns highest-version draft (skips archived/failed), whitelists fields (no `workspace_id`, no `generation_error`).
- **AC13**: Frontend viewer at `/projects/[id]/baseline/drift` with loading/no-Old-RD/generating/ready states, ADR drifts in a separate section, Regenerate button. Navigation link added to `KnowledgeReady.tsx`.
- **AC14**: 74 backend tests (`convex/knowledge.driftReport.test.ts`) + 9 frontend tests (`DriftReportViewer.test.tsx`). All pass. Lint passes (0 errors).
- **Deviation note**: `getDriftReport` skips failed reports and does NOT leak `generation_error` (per Task 10 spec). The frontend error state is powered by the `triggerDriftReport` action's error return (local page state), matching the resyncError pattern in the knowledge page.

### File List

**Modified:**
- `convex/schema.ts` — added `drift_reports` table, imported `driftItemValidator`
- `convex/lib/validation.ts` — added `driftItemValidator` export
- `convex/lib/constraints.ts` — added `DRIFT_MAX_CONTEXT_CHARS`, `DRIFT_OLD_RD_MAX_CHARS`, `DRIFT_ERROR_MESSAGE_MAX_LENGTH`
- `convex/knowledge/internal.ts` — added `_storeDriftReport`, `_archiveDriftReport`, `_getLatestDriftVersion`, `_logDriftReportFailure`, `_getBmadMetadataForDrift`, `_getKbForDriftReport`, `_getLatestBaselineRdForDrift`; extended `_getProjectForIngestion` to return `old_rd_extracted_text`
- `convex/knowledge/ingestionWorkflow.ts` — capture baseline result, conditional drift auto-trigger step
- `convex/knowledge/triggerIngestion.ts` — added `_archiveDriftReport` call in resync, added `triggerDriftReport` action
- `convex/knowledge/queries.ts` — added `getDriftReport` query
- `convex/testHelpers.ts` — added `seedDriftReport` helper
- `src/app/(auth)/projects/[id]/knowledge/KnowledgeReady.tsx` — added "View Drift Report" link (conditional on `hasOldRd`)
- `src/app/(auth)/projects/[id]/knowledge/page.tsx` — query `getOldRd`, pass `hasOldRd` to `KnowledgeReady`
- `src/app/(auth)/projects/[id]/knowledge/knowledge.test.tsx` — mock `getOldRd` query (additive, existing tests unchanged)

**Created:**
- `convex/knowledge/driftPrompts.ts` — pure module: zod schema, prompt builder, filter/validate/bound helpers, dimension/severity constants
- `convex/knowledge/driftActions.ts` — `"use node"` internal actions: `generateDriftReport`, `generateDriftReportWithLogging`, `buildDriftReportErrorMessage`
- `convex/knowledge.driftReport.test.ts` — 74 backend tests (AI mocked)
- `src/app/(auth)/projects/[id]/baseline/drift/page.tsx` — drift report viewer page
- `src/app/(auth)/projects/[id]/baseline/drift/DriftReportViewer.tsx` — report renderer (grouped by dimension, severity badges, ADR section)
- `src/app/(auth)/projects/[id]/baseline/drift/DriftDimensions.tsx` — dimension grouping + label helpers
- `src/app/(auth)/projects/[id]/baseline/drift/DriftReportViewer.test.tsx` — 9 frontend tests

## Change Log

- 2026-06-14: Story 2.2 implemented — Drift Report Generation (schema, AI generation pipeline with BMAD-aware dimensions, auto-trigger after baseline RD, manual trigger, re-sync archival, read-only frontend viewer). 74 backend + 9 frontend tests, all passing. Fixed pagination infinite-loop bug in `_archiveDriftReport` via filter-and-paginate pattern.
- 2026-06-14: Code review patches applied — (1) widened `getDriftReport` to surface failed reports + frontend error state (AC13); (2) fixed `bmad_detected` in failure logging; (3) added BMAD emptiness guard to prevent hallucinated items; (4) capped items at `MAX_DRIFT_ITEMS=100`; (5) disabled Regenerate when KB not ready; (6) added KB to loading gate. 77 backend + 10 frontend tests pass.

### Senior Developer Review (AI)

**Review Date:** 2026-06-14
**Review Outcome:** Changes Requested
**Layers:** Blind Hunter ✅, Edge Case Hunter ✅, Acceptance Auditor ✅
**Findings:** 2 decision-needed, 5 patch, 5 deferred, 8 dismissed

#### Action Items

- [x] [Review][Decision→Patch] **Failed reports invisible to UI — perpetual spinner after AI failure** — RESOLVED (Option 1): widened `getDriftReport` to return latest non-archived (draft OR failed), included `generation_error`, added error state in frontend. ✅ Fixed + tested.
- [x] [Review][Decision→Defer] **Stale drift report detection not implemented** — RESOLVED (Option 2): deferred to Story 2.3 which owns the Baseline RD editor and will need staleness tracking anyway.
- [x] [Review][Patch] **bmad_detected hardcoded false in _logDriftReportFailure** — ✅ Fixed: wrapper now queries KB's `bmad_detected` via `_getKbForExtraction` in the catch block before logging.
- [x] [Review][Patch] **BMAD detected true but zero metadata → hallucinated items** — ✅ Fixed: added emptiness guard `if (bmadData.detected && (...))` mirroring baselineActions.ts:70. Also changed `filterDriftDimensions` to use `hasBmadContext` (effective BMAD state) instead of `kb.bmad_detected`, and `bmad_detected` in stored report now reflects actual context used.
- [x] [Review][Patch] **No upper bound on items array length** — ✅ Fixed: added `MAX_DRIFT_ITEMS = 100` to constraints.ts, applied `items.slice(0, MAX_DRIFT_ITEMS)` after post-processing.
- [x] [Review][Patch] **Regenerate button not disabled when KB not ready** — ✅ Fixed: added `|| !kbReady` to disabled prop on report-view Regenerate button.
- [x] [Review][Patch] **Frontend flash "must be ready" during KB query loading** — ✅ Fixed: added `|| kb === undefined` to the loading skeleton condition.
- [x] [Review][Defer] **_archiveDriftReport O(n²) read amplification** [convex/knowledge/internal.ts:771] — deferred, pre-existing pattern (same as _archiveBaselineRd). The `.filter()` post-read scans archived rows each iteration. Acceptable at current scale (dozens of reports per project). Would need a compound index including status to fix properly.
- [x] [Review][Defer] **Unsafe type cast on metadata field** [convex/knowledge/internal.ts:223] — deferred, pre-existing pattern. `e.metadata as { title?: string; status?: string }` without runtime validation. Mirrors `_getBmadMetadataForExtraction:569`. Schema debt from Story 1.5 (`metadata: v.any()`).
- [x] [Review][Defer] **Truncation check ignores separator length** [convex/knowledge/internal.ts:215-218] — deferred, pre-existing pattern. Size check tests `prdSections + chunk` but actual append adds 2-char separator. Negligible overshoot (~2 chars per cycle). Copied from `_getBmadMetadataForExtraction`.
- [x] [Review][Defer] **Ingestion auto-trigger tests are source-text inspections** [convex/knowledge.driftReport.test.ts] — deferred, established convention. Tests assert `source.toContain(...)` rather than executing the workflow. The conditional-no-op and failure-isolation behaviors are not behaviorally tested. Same convention as baseline RD workflow tests; full workflow testing needs integration infrastructure.
- [x] [Review][Defer] **handleRegenerate ignores reason-typed responses** [src/app/(auth)/projects/[id]/baseline/drift/page.tsx:44] — deferred, theoretical TOCTOU. `generateDriftReport` returns `{driftReportId: null, reason: "no_old_rd"}` but frontend checks `"error" in result`. Only reachable if Old RD is deleted between `triggerDriftReport`'s guard and the action's internal check (extremely unlikely). Impact: silent no-op, no crash.

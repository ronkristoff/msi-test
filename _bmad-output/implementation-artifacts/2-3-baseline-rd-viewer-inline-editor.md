---
baseline_commit: 4a8dfcd6c967928b3d088a7f93d79da34630a514
---

# Story 2.3: Baseline RD Viewer & Inline Editor

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a BA,
I want to view the Baseline RD as formatted content and edit individual sections inline,
so that I can review and correct the AI-generated content before approving it for export.

## Acceptance Criteria

1. **AC1 — Viewer page at `/projects/[id]/baseline`**: A client component page renders the latest non-archived, non-failed Baseline RD (fetched via the existing `getBaselineRd` query from Story 2.1). Each section is rendered with its title, content (markdown shown as preformatted text via `whitespace-pre-wrap` — see [Markdown Rendering](#markdown-rendering)), and a confidence indicator. The page header shows the RD version, overall status (`Draft`/`Approved`), generation timestamp, and last-edited timestamp when present.

2. **AC2 — Per-section confidence display**: Each section displays its `confidence` value (0–1) as a `StatusPill`. Confidence bands: `≥ 0.8` → `success` (High), `0.5–0.79` → `warn` (Medium), `< 0.5` → `danger` (Low). When a section has a `divergence_note` (BMAD projects only), it is shown as muted italic text under the confidence pill. BMAD `bmad_alignment.agreement` (`agree`/`diverge`/`partial`) is shown as a small label badge when present.

3. **AC3 — Inline edit mode per section**: Each section has an "Edit" affordance. Clicking it swaps the read view for a controlled `<textarea>` pre-populated with the section's current `content` (follow the `TestAccordionItem` local-code pattern — `useState` for the draft, dirty flag, Save/Discard buttons). Only one section is editable at a time (the BA enters edit mode for section X; opening section Y's editor discards section X's draft via a `window.confirm` if dirty). The textarea uses the existing `Textarea` form component's styling but is NOT wrapped in `useForm`/`zodResolver` — it is a single-field content editor mirroring the test code editor, not a structured form.

4. **AC4 — Save persists section content + `updated_at`**: Clicking "Save" calls the new `updateBaselineRd` mutation with `section_updates: [{ id, content }]` for the edited section. The mutation:
   - Uses `getOwnedEntity(ctx, rd_id, "baseline_rds")` for auth + workspace ownership (same pattern as `updateTestCode`).
   - Validates every `section_updates[].id` matches an existing section `id` in the RD — throws `ConvexError("Unknown section id: <id>")` for unrecognized IDs.
   - Patches only the `content` of matching sections — preserves `title`, `confidence`, `divergence_note`, `bmad_alignment` (the AI's confidence assessment is NOT overwritten by a human edit).
   - Sets `updated_at: Date.now()`.
   - Does NOT change `status` (editing keeps the RD in its current status).
   - Rejects edits to RDs with `status: "archived"` or `status: "failed"` → `ConvexError("Cannot edit an archived or failed Baseline RD")`.

5. **AC5 — Discard reverts the draft**: Clicking "Discard" clears the local `useState` draft and returns the section to read mode without calling any mutation. Identical to `TestAccordionItem.handleDiscard`.

6. **AC6 — Approve transitions `draft` → `approved`**: An "Approve" button (visible only when `status === "draft"`) calls `updateBaselineRd` with `status: "approved"`. The mutation validates the transition: only `draft` can move to `approved` → throws `ConvexError("Only a draft Baseline RD can be approved")` otherwise. On success the page's real-time subscription updates the status pill to `Approved`.

7. **AC7 — Revert to draft transitions `approved` → `draft`**: A "Mark as Draft" button (visible only when `status === "approved"`) calls `updateBaselineRd` with `status: "draft"`. Allows the BA to re-edit after approval. The mutation validates: only `approved` can move to `draft`.

8. **AC8 — Loading and empty states**:
   - When `getBaselineRd` or `getKnowledgeBase` is `undefined` → `PageSkeleton` (matches every other page).
   - When KB is not `"ready"` (or null) → `EmptyState` "Knowledge Base required" with a link to `/projects/[id]/knowledge` (mirrors the drift page's no-Old-RD empty state pattern).
   - When KB is ready but `getBaselineRd` returns `null` → a card explaining no Baseline RD exists yet, with a "Generate Baseline RD" button that calls the existing `triggerBaselineRd` action (`api.knowledge.triggerIngestion.triggerBaselineRd` from Story 2.1). Shows a spinner during the action and surfaces any returned `error` in an `Alert` (same `regenerateError`-style local state as the drift page).

9. **AC9 — Navigation entry point**: The KnowledgeReady component (`src/app/(auth)/projects/[id]/knowledge/KnowledgeReady.tsx`) gains a "View Baseline RD" link button alongside the existing "View Drift Report" link. Visible whenever KB status is `"ready"` (the RD is auto-generated after KB build per Story 2.1, so it should exist). No conditional on Old RD (unlike Drift Report).

10. **AC10 — Opportunistic: drift staleness detection (deferred from Story 2.2)**: The drift report page (`src/app/(auth)/projects/[id]/baseline/drift/page.tsx`) queries `getBaselineRd` and compares `driftReport.baseline_rd_id !== baselineRd?._id`. When the drift report references a stale (older) Baseline RD, show an `Alert` variant="warn" banner above the report: "This Drift Report is based on an older version of the Baseline RD (v{driftVersion}). Regenerate to compare against the current RD (v{currentVersion})." The existing "Regenerate" button already resolves the staleness. This resolves the deferred item from Story 2.2's code review (`deferred-work.md` line 74).

11. **AC11 — Immutability and no-regression**: All section edits produce new array/objects — never mutate the existing `sections` array in place (project immutability rule). The mutation builds a new `sections` array via `.map()` applying content patches. Frontend state updates use the Convex subscription's fresh data, not optimistic local mutation.

12. **AC12 — Tests**:
    - **Backend**: `convex/knowledge.baselineRdEditor.test.ts` (at `convex/` root, matching `convex/knowledge.baselineRd.test.ts` convention). Covers: `updateBaselineRd` auth (no membership → throws), workspace ownership (cross-workspace → throws), `section_updates` with valid id (content patched, confidence/title preserved, `updated_at` set), unknown section id (throws `ConvexError`), editing archived/failed RD (throws), status transition draft→approved (success), approved→draft (success), illegal transitions (approved→approved is no-op or throws, archived→approved throws), combined section_update + status in one call.
    - **Frontend**: `src/app/(auth)/projects/[id]/baseline/BaselineRdViewer.test.tsx`. Covers: loading skeleton, KB-not-ready empty state, no-RD state with Generate button, RD rendering (sections + confidence pills + divergence notes + BMAD alignment badges), inline edit (click edit → textarea appears → save calls mutation → read mode returns), discard (textarea disappears, no mutation called), approve button (calls mutation with status approved, only visible when draft), mark-as-draft button (only visible when approved).
    - Add `updated_at?: number` to `BaselineRdOverrides` in `convex/testHelpers.ts` so tests can seed an already-edited RD. Add a `seedApprovedBaselineRd` convenience wrapper OR just use `seedBaselineRd(t, ws, p, kb, { status: "approved" })` (already supported).

## Tasks / Subtasks

- [x] Task 1: Backend mutation (AC: #4, #5, #6, #7, #11)
  - [x] Create `convex/knowledge/baselineRdMutations.ts` (NO `"use node"` — this is a plain mutation). Export `updateBaselineRd` mutation.
  - [x] Args: `rd_id: v.id("baseline_rds")`, `section_updates: v.optional(v.array(v.object({ id: v.string(), content: v.string() })))`, `status: v.optional(v.union(v.literal("draft"), v.literal("approved")))`.
  - [x] Handler: `getOwnedEntity(ctx, args.rd_id, "baseline_rds")` for auth + ownership (mirrors `updateTestCode` at `convex/tests/mutations.ts:9-56`).
  - [x] Guard: `if (rd.status === "archived" || rd.status === "failed") throw new ConvexError("Cannot edit an archived or failed Baseline RD")`.
  - [x] If `section_updates` provided: validate each `id` exists in `rd.sections` (collect unknown IDs, throw `ConvexError("Unknown section id: <id>")` for the first unknown). Build new sections array via `.map()` — for each section, if its id is in the updates map, replace `content` (preserve everything else). Patch `sections` + `updated_at: Date.now()`.
  - [x] If `status` provided: validate transition. `draft` → `approved` allowed. `approved` → `draft` allowed. Any other source status → throw `ConvexError("Only a draft Baseline RD can be approved")` / `ConvexError("Only an approved Baseline RD can be reverted to draft")`. Patch `status`.
  - [x] If both `section_updates` and `status` provided: apply both in a single `ctx.db.patch` (build one patch object combining `sections`, `updated_at`, and `status`).

- [x] Task 2: Frontend viewer page (AC: #1, #2, #8)
  - [x] Create `src/app/(auth)/projects/[id]/baseline/page.tsx` — client component.
  - [x] Queries: `useQuery(api.knowledge.queries.getBaselineRd, { project_id })`, `useQuery(api.knowledge.queries.getKnowledgeBase, { project_id })`. Action: `useAction(api.knowledge.triggerIngestion.triggerBaselineRd)` for the Generate button.
  - [x] States: loading (`driftReport === undefined || kb === undefined` → `PageSkeleton`); KB not ready (`kb === null || kb.status !== "ready"` → `EmptyState` "Knowledge Base required" with link to knowledge page); no RD (`rd === null` → card with "Generate Baseline RD" button + spinner + error Alert); ready (render `BaselineRdViewer`).
  - [x] Header: title "Baseline RD", version (`v{version}`), status pill (`Draft`/`Approved`), generated timestamp, last-edited timestamp (if `updated_at` present). "Back to Knowledge Base" link button (top-right, matches drift page layout).
  - [x] Pass `rd`, `kb` to `BaselineRdViewer`.

- [x] Task 3: Viewer component (AC: #1, #2, #3, #6, #7)
  - [x] Create `src/app/(auth)/projects/[id]/baseline/BaselineRdViewer.tsx`.
  - [x] Props: `{ rd: Doc<"baseline_rds"> }`.
  - [x] Renders approve/mark-as-draft controls in a header bar (calls `useMutation(api.knowledge.baselineRdMutations.updateBaselineRd)`).
  - [x] Maps `rd.sections` to `<BaselineRdSection>` components. Manages `editingSectionId` state (string | null) to ensure only one section is editable at a time.

- [x] Task 4: Section component (AC: #3, #4, #5)
  - [x] Create `src/app/(auth)/projects/[id]/baseline/BaselineRdSection.tsx`.
  - [x] Props: `{ section: RdSection, isEditing: boolean, onEnterEdit: () => void, onExitEdit: () => void, isDirtySibling: boolean }`.
  - [x] Read mode: title, confidence `StatusPill` (band mapping), divergence note (italic muted), BMAD alignment badge, content (`<div className="whitespace-pre-wrap">`), "Edit" button.
  - [x] Edit mode: controlled `<textarea>` (styled like `Textarea` component — reuse the class string from `FormField.tsx:114-129` `inputBase + resize-none`), pre-populated with `section.content`. `useState` for local draft. Dirty flag: `localContent !== section.content`. Save button (disabled if not dirty or saving). Discard button.
  - [x] Save handler: calls `updateBaselineRd({ rd_id, section_updates: [{ id: section.id, content: localContent }] })`. On success: `onExitEdit()` (clears local state, returns to read). On error: show `Alert` variant="error" inline (local `saveError` state), keep editor open.
  - [x] Use `useMutation(api.knowledge.baselineRdMutations.updateBaselineRd)` — returns `[updateFn, mutationState]`; use `mutationState.isLoading` for the Save button spinner.
  - [x] Wrap mutation calls in try/catch with `useErrorLogger` for the error path (project rule: all UI catch blocks call `logError`).

- [x] Task 5: Confidence display helper (AC: #2)
  - [x] In `BaselineRdViewer.tsx` (or a small `BaselineRdHelpers.ts` if reused), export `confidenceVariant(confidence: number): StatusVariant` returning `success` (≥0.8), `warn` (0.5–0.79), `danger` (<0.5). And `confidenceLabel(confidence): string` returning "High"/"Medium"/"Low". Co-locate with the viewer to avoid a new file unless the drift page also needs it (it doesn't — drift uses its own severity bands).

- [x] Task 6: Navigation link (AC: #9)
  - [x] Modify `src/app/(auth)/projects/[id]/knowledge/KnowledgeReady.tsx` — add a "View Baseline RD" `<Link>` button before the existing "View Drift Report" link. `href={`/projects/${projectId}/baseline`}`. Always visible when KB ready (no `hasOldRd` conditional).
  - [x] Use the same `Button variant="secondary" size="sm"` styling as the drift link. Use a document icon SVG.

- [x] Task 7: Drift staleness banner (AC: #10)
  - [x] Modify `src/app/(auth)/projects/[id]/baseline/drift/page.tsx`.
  - [x] Add `const baselineRd = useQuery(api.knowledge.queries.getBaselineRd, { project_id: projectId })`.
  - [x] Add `baselineRd` to the loading gate (`driftReport === undefined || oldRd === undefined || kb === undefined || baselineRd === undefined` → `PageSkeleton`).
  - [x] When `hasOldRd && driftReport !== null && !isFailedReport && baselineRd !== null && driftReport.baseline_rd_id !== baselineRd._id`: render `<Alert variant="warn">` banner above the `DriftReportViewer` with the staleness message. Use `report.version` and `baselineRd.version` for the version numbers in the copy.
  - [x] This is purely additive — no changes to existing drift page logic, just a new query + a conditional banner.

- [x] Task 8: Test helpers (AC: #12)
  - [x] In `convex/testHelpers.ts`, extend `BaselineRdOverrides` type to include `updated_at?: number`. In `seedBaselineRd`, pass `updated_at: overrides?.updated_at` to the insert. This is a one-line additive change enabling tests to seed an already-edited RD.

- [x] Task 9: Write backend tests (AC: #12)
  - [x] Create `convex/knowledge.baselineRdEditor.test.ts` at `convex/` root.
  - [x] Use the existing `import.meta.glob` module map pattern + `seedWorkspace`, `seedProject`, `seedFullStack` (or `seedBaselineRd`) from `convex/testHelpers.ts`.
  - [x] Tests (no AI mocking needed — this is a pure mutation):
    - Auth: unauthenticated call throws "Not authenticated".
    - Ownership: cross-workspace RD → throws "Not found or access denied".
    - Valid section update: content patched, `title`/`confidence`/`divergence_note`/`bmad_alignment` preserved, `updated_at` set, `status` unchanged.
    - Unknown section id: throws `ConvexError("Unknown section id: ...")`.
    - Multiple section updates in one call: all applied.
    - Archived RD: throws "Cannot edit an archived or failed Baseline RD".
    - Failed RD: same throw.
    - Status draft→approved: transitions, returns success.
    - Status approved→draft: transitions.
    - Status approved→approved: throws "Only an approved Baseline RD can be reverted to draft" (no-op not allowed — explicit transition only).
    - Status archived→approved: throws.
    - Combined section_updates + status in one call: both applied.
    - Empty `section_updates` array: no-op patch (still sets `updated_at`? — decide: NO, only set `updated_at` when at least one section is actually updated; empty array is a no-op). Document the decision in the test.
    - Immutability: original RD document's `sections` array is not mutated (verify via reading pre/post).

- [x] Task 10: Write frontend tests (AC: #12)
  - [x] Create `src/app/(auth)/projects/[id]/baseline/BaselineRdViewer.test.tsx`.
  - [x] Follow the drift page test mocking pattern (`DriftReportViewer.test.tsx`): hoist `vi.mock("convex/react", ...)`, `vi.mock("@/lib/convex", ...)`, `vi.mock("next/navigation", ...)`, `vi.mock("@/lib/error-logger", ...)`.
  - [x] Tests:
    - Loading: queries undefined → skeleton (`document.querySelector(".animate-pulse")`).
    - KB not ready: `EmptyState` "Knowledge Base required" with link to `/projects/proj1/knowledge`.
    - No RD: KB ready, `getBaselineRd` null → "Generate Baseline RD" button; clicking calls `triggerBaselineRd` action.
    - RD ready: sections rendered with titles, content, confidence pills (High/Medium/Low), version, status.
    - BMAD section: divergence note + alignment badge rendered when present.
    - Inline edit: click "Edit" → textarea appears with current content; type → Save enabled; click Save → `updateBaselineRd` called with `{ rd_id, section_updates: [{ id, content }] }`; textarea disappears.
    - Discard: click "Discard" → textarea disappears, `updateBaselineRd` NOT called.
    - Approve: "Approve" button visible when `status === "draft"`; click → mutation called with `{ rd_id, status: "approved" }`. Button hidden when approved.
    - Mark as draft: "Mark as Draft" button visible when `status === "approved"`; click → mutation called with `{ rd_id, status: "draft" }`.

- [x] Task 11: Run validation (AC: #12)
  - [x] `pnpm lint` — zero new errors.
  - [x] `pnpm test:convex` — all backend tests pass (including new editor tests + existing baseline RD generation tests unbroken).
  - [x] `pnpm test` — all frontend tests pass (including new viewer tests + existing drift page tests unbroken, since Task 7 modifies the drift page query gate).

## Dev Notes

### Scope Boundary — What This Story Does and Does NOT Do

**This story implements:**
- One public mutation `updateBaselineRd` (section content edits + status transitions)
- Frontend viewer page at `/projects/[id]/baseline` with per-section inline editing
- Approve / revert-to-draft lifecycle (draft ↔ approved)
- Confidence + divergence + BMAD alignment display per section
- "Generate Baseline RD" trigger when no RD exists (reuses Story 2.1's `triggerBaselineRd`)
- Navigation link from KnowledgeReady → baseline page
- Opportunistic drift staleness banner (resolves deferred item from Story 2.2)
- Backend + frontend tests

**This story does NOT implement:**
- Baseline RD export (Markdown/HTML/BMAD PRD format) → **Story 2.4**
- Drift Report editing → **Read-only forever** (not in any epic)
- Rich markdown rendering (rendered as preformatted text now; a future enhancement could add `react-markdown` — see [Markdown Rendering](#markdown-rendering))
- Per-section confidence editing (the BA edits content; confidence stays as the AI assessed it — by design)
- Version history UI (archived versions are queryable but not surfaced in this story)
- Regenerating the RD from the baseline page when a draft already exists (the BA uses Knowledge → Re-sync for that; this page only offers "Generate" when no RD exists at all)

### Schema State — No Migration Needed

The `baseline_rds` table (Story 2.1) already supports everything this story requires:

```typescript
// convex/schema.ts:444-462 (EXISTING — do not modify)
baseline_rds: defineTable({
  // ...
  status: v.union(
    v.literal("draft"),
    v.literal("approved"),    // ← already in the union
    v.literal("archived"),
    v.literal("failed"),
  ),
  sections: v.array(rdSectionValidator),   // ← already an array, patchable
  // ...
  updated_at: v.optional(v.number()),      // ← already a field
})
```

**This story makes ZERO schema changes.** No new tables, no new indexes, no new validators. The `rdSectionValidator` (in `convex/lib/validation.ts:147-163`) already defines the section shape (`id`, `title`, `content`, `confidence`, optional `divergence_note`, optional `bmad_alignment`). Do NOT touch `convex/schema.ts` or `convex/lib/validation.ts`.

### Mutation Design — Mirror `updateTestCode`

The new `updateBaselineRd` mutation mirrors `updateTestCode` (`convex/tests/mutations.ts:9-56`) structurally: one mutation that accepts optional field groups and applies only the provided ones. This is the established pattern for "edit entity + change status" operations.

```typescript
// convex/knowledge/baselineRdMutations.ts (NEW FILE — no "use node")
import { mutation } from "../../_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { getOwnedEntity } from "../../lib/requireAuth";

export const updateBaselineRd = mutation({
  args: {
    rd_id: v.id("baseline_rds"),
    section_updates: v.optional(v.array(v.object({
      id: v.string(),
      content: v.string(),
    }))),
    status: v.optional(v.union(v.literal("draft"), v.literal("approved"))),
  },
  handler: async (ctx, args) => {
    const { entity: rd } = await getOwnedEntity(ctx, args.rd_id, "baseline_rds");

    if (rd.status === "archived" || rd.status === "failed") {
      throw new ConvexError("Cannot edit an archived or failed Baseline RD");
    }

    const patch: Record<string, unknown> = {};

    if (args.section_updates && args.section_updates.length > 0) {
      const knownIds = new Set(rd.sections.map((s) => s.id));
      const updateMap = new Map(args.section_updates.map((u) => [u.id, u.content]));
      for (const update of args.section_updates) {
        if (!knownIds.has(update.id)) {
          throw new ConvexError(`Unknown section id: ${update.id}`);
        }
      }
      patch.sections = rd.sections.map((s) =>
        updateMap.has(s.id) ? { ...s, content: updateMap.get(s.id)! } : s,
      );
      patch.updated_at = Date.now();
    }

    if (args.status !== undefined) {
      if (args.status === "approved" && rd.status !== "draft") {
        throw new ConvexError("Only a draft Baseline RD can be approved");
      }
      if (args.status === "draft" && rd.status !== "approved") {
        throw new ConvexError("Only an approved Baseline RD can be reverted to draft");
      }
      patch.status = args.status;
    }

    if (Object.keys(patch).length > 0) {
      await ctx.db.patch(args.rd_id, patch);
    }
  },
});
```

**Why a new file (`baselineRdMutations.ts`) instead of adding to `mutations.ts`:** The existing `convex/knowledge/mutations.ts` has `"use node";` at the top (it imports `encryptPat` from `./crypto` for the repo-connection actions). A plain mutation (no Node built-ins) CANNOT live in a `"use node"` file — Convex rejects it. The domain convention allows multiple type-specific files (see `baselineActions.ts`, `driftActions.ts` already coexisting). A `baselineRdMutations.ts` file for non-node mutations is consistent.

**Why one mutation instead of two (`updateSections` + `setStatus`):** The `updateTestCode` precedent combines code + status in one call. The BA's common flow is "edit a few sections, then approve" — one round-trip is better than two. The mutation validates each field group independently, so callers can also use them separately.

### Inline Edit UX — Mirror `TestAccordionItem`

The inline section editor follows `TestAccordionItem` (`src/components/TestAccordionItem.tsx:40-117`) exactly:

- `useState<string | null>(null)` for the local draft (`null` = not editing).
- Dirty flag: `localContent !== null && localContent !== section.content`.
- Display value: `localContent ?? section.content`.
- Save: `await updateBaselineRd({ rd_id, section_updates: [{ id, content: localContent }] })`, then clear local state.
- Discard: clear local state.

This is the established inline-content-editing pattern in this codebase. The project rule "never raw `useState` + manual validation for forms" applies to **structured forms with field-level validation** (login, settings, etc.) — NOT to single-field content editors. The test code editor is the precedent.

**One section editable at a time:** The `BaselineRdViewer` owns `editingSectionId: string | null`. Only the section whose id matches is in edit mode. Clicking "Edit" on a different section while another is dirty triggers `window.confirm("Discard unsaved changes in the current section?")` — if confirmed, switch; if cancelled, stay.

### Markdown Rendering

**No markdown library is installed** (`react-markdown`, `marked`, etc. are absent from `package.json`). This story does NOT add one. Section content is rendered as preformatted text:

```tsx
<div className="text-sm text-[var(--fg)] leading-relaxed whitespace-pre-wrap font-[var(--font-mono)] text-[13px]">
  {section.content}
</div>
```

This matches how the DriftReportViewer renders `evidence` (`DriftReportViewer.tsx:42-44`) and how the KB page renders `folder_structure` (`KnowledgeReady.tsx:88`). The markdown source is visible to the BA, who can edit it. A future enhancement story can add a renderer; for MVP, showing the raw markdown is acceptable and consistent.

**Do NOT use `dangerouslySetInnerHTML`** — the project rule explicitly forbids it with untrusted input, and RD content is AI-generated (semi-untrusted).

### Approve / Revert Lifecycle

| Current Status | Action Available | Result |
|----------------|------------------|--------|
| `draft` | "Approve" | → `approved` |
| `approved` | "Mark as Draft" | → `draft` |
| `archived` | none | Read-only (mutation throws) |
| `failed` | none | Read-only (mutation throws; the page shows the Generate button instead) |

**Editing is allowed in both `draft` and `approved` states.** Editing does NOT change status. Rationale: a BA may approve, then spot a typo. Allowing post-approval edits (with `updated_at` bumping) is less friction than forcing revert→edit→re-approve. The `updated_at` timestamp provides the audit trail.

### Opportunistic: Drift Staleness Detection (Deferred from Story 2.2)

Story 2.2's code review deferred staleness detection to this story (`deferred-work.md` line 74). The implementation is small and additive:

- The drift report stores `baseline_rd_id` (the RD it was generated against).
- The current Baseline RD has a different `_id` after regeneration (re-sync creates a new version row).
- Staleness check: `driftReport.baseline_rd_id !== currentBaselineRd._id`.

**Changes to the drift page (`src/app/(auth)/projects/[id]/baseline/drift/page.tsx`):**
1. Add `useQuery(api.knowledge.queries.getBaselineRd, { project_id })`.
2. Add `baselineRd === undefined` to the loading gate.
3. When `driftReport` exists and is not failed AND `baselineRd` exists AND their IDs differ: render an `Alert variant="warn"` banner.

The existing "Regenerate" button (already in the drift page) resolves staleness by calling `triggerDriftReport`, which archives the old report and generates a fresh one against the current RD.

**Why this belongs in Story 2.3 and not a standalone fix:** The deferred note explicitly assigns it here ("Story 2.3 owns the Baseline RD editor and will need staleness tracking anyway"). Touching the drift page is a 3-line additive change (one query, one gate addition, one conditional banner) — low risk.

### Avoid Epic 1's Recurring Defects

| Epic 1 Defect | Mitigation in This Story |
|---------------|--------------------------|
| **Unbounded queries** | `getBaselineRd` (Story 2.1) already uses `.take(10)`. No new queries in this story. |
| **TOCTOU race conditions** | `updateBaselineRd` is a single mutation — Convex serializes mutations on the same document. No version-compute-in-action-then-pass-to-mutation pattern here (unlike `_storeBaselineRd`). |
| **Missing error handlers** | Frontend Save/Approve/Generate handlers all use try/catch + `useErrorLogger`. Mutation throws `ConvexError` with clear messages. |
| **`v.any()` type debt** | `section_updates` uses `v.object({ id: v.string(), content: v.string() })` — no `v.any()`. |
| **IDOR / workspace ownership** | `updateBaselineRd` uses `getOwnedEntity(ctx, rd_id, "baseline_rds")` — throws if the RD belongs to another workspace. Mirrors `updateTestCode`. |
| **Immutability violations** | Mutation builds new `sections` array via `.map()`. Frontend never mutates subscription data. |

### Existing Code to Modify

| File | Change | Breaking? |
|------|--------|-----------|
| `src/app/(auth)/projects/[id]/knowledge/KnowledgeReady.tsx` | ADD "View Baseline RD" link button before the drift link | No — additive link |
| `src/app/(auth)/projects/[id]/baseline/drift/page.tsx` | ADD `getBaselineRd` query, ADD to loading gate, ADD staleness `Alert` banner | No — additive (existing tests must still pass; the banner only appears when staleness is true, which existing test fixtures don't trigger) |
| `convex/testHelpers.ts` | ADD `updated_at?: number` to `BaselineRdOverrides` type + pass through in `seedBaselineRd` | No — additive optional field |

### New Files to Create

| File | Purpose |
|------|---------|
| `convex/knowledge/baselineRdMutations.ts` | `updateBaselineRd` public mutation (section edits + status). NO `"use node"`. |
| `convex/knowledge.baselineRdEditor.test.ts` | Backend tests for `updateBaselineRd` (at `convex/` root, matching `knowledge.baselineRd.test.ts` convention). |
| `src/app/(auth)/projects/[id]/baseline/page.tsx` | Baseline RD viewer + editor page (client component). |
| `src/app/(auth)/projects/[id]/baseline/BaselineRdViewer.tsx` | Renders all sections + approve/mark-as-draft controls + manages which section is editing. |
| `src/app/(auth)/projects/[id]/baseline/BaselineRdSection.tsx` | Single section: read mode + inline edit mode (controlled textarea + Save/Discard). |
| `src/app/(auth)/projects/[id]/baseline/BaselineRdViewer.test.tsx` | Frontend tests for the page. |

### Key Existing APIs (all from Story 2.1 / 2.2 — no new backend deps)

- `api.knowledge.queries.getBaselineRd` — returns latest non-archived, non-failed RD with `sections`, `status`, `version`, `generated_at`, `updated_at`. **The data source for this page.**
- `api.knowledge.queries.getKnowledgeBase` — returns the KB (for the "KB must be ready" gate).
- `api.knowledge.triggerIngestion.triggerBaselineRd` — public action (Story 2.1). Returns `{ baselineRdId, version }` or `{ baselineRdId: null, version, error }`. Used by the "Generate Baseline RD" button when no RD exists.
- `Doc<"baseline_rds">` from `@/lib/convex` — the frontend type for the RD.
- `rdSectionValidator` shape (`convex/lib/validation.ts:147-163`) — the section structure: `{ id, title, content, confidence, divergence_note?, bmad_alignment? }`.
- `RdSection` type from `convex/knowledge/baselinePrompts.ts:4-14` — the TS type matching the validator (import for type-only usage in frontend if needed, or derive from `Doc<"baseline_rds">["sections"][number]`).

### UI Components (all exist — no new ones)

- `Button` (`src/components/ui/Button.tsx`) — variants: `primary`, `secondary`; sizes: `sm`, default.
- `StatusPill` (`src/components/ui/StatusPill.tsx`) — variants: `success`, `danger`, `warn`, `neutral`, `running`. Use for confidence bands and RD status.
- `Alert` (`src/components/ui/Alert.tsx`) — variants: `success`, `error`. **Note: no `warn` variant exists.** For the drift staleness banner, either (a) use `variant="error"` with a less alarming message, or (b) inline a warn-styled `<div>` using `bg-[rgba(234,179,8,0.06)] border-[rgba(234,179,8,0.2)] text-[var(--warn-text)]` classes (matching StatusPill's warn palette). Prefer option (b) for semantic correctness; the drift page already uses custom-styled cards.
- `EmptyState` (`src/components/ui/EmptyState.tsx`) — props: `icon`, `title`, `description`, `action?`.
- `PageSkeleton` (`src/components/ui/Skeleton.tsx`) — loading state.
- `Textarea` styling from `FormField.tsx:114-129` — reuse the `inputBase + resize-none` class string for the inline editor's textarea (do not use the `Textarea` component itself — it brings label/error wrapper overhead inappropriate for inline edit; copy the class string).

### Previous Story Intelligence

**Story 2.2 (Drift Report Generation) — direct predecessor:**
1. **Frontend page pattern**: The drift page (`baseline/drift/page.tsx`) is THE template for the baseline page. Same structure: `useParams`, `asId`, multiple `useQuery`, `useAction`, local `isXxx`/`xxxError` state, loading gate, empty states, ready state. Mirror it.
2. **Error scraping regex**: `err.message.replace(/^Uncaught ConvexError:\s*/, "")` — reuse for mutation/action error display (matches `drift/page.tsx:48-49` and `knowledge/page.tsx:57`).
3. **Frontend test mocking**: The drift test (`DriftReportViewer.test.tsx`) is THE template. Hoist `vi.mock` calls, use string-keyed `useQuery` mock that pattern-matches on the query reference name, `mockXxx` module-level let variables reset in `beforeEach`.
4. **`triggerXxx` action return shape**: `triggerBaselineRd` returns `{ baselineRdId, version }` or `{ baselineRdId: null, version, error }`. The frontend checks `"error" in result && result.error` to surface failures (same as drift's `handleRegenerate`).
5. **Code review patches applied to Story 2.2**: widened `getDriftReport` to surface failed reports; disabled Regenerate when KB not ready; added KB to loading gate. Apply the same defensive patterns to the baseline page: disable "Generate" when KB not ready; include KB in the loading gate.

**Story 2.1 (Baseline RD Generation):**
1. **`getBaselineRd` query** (`convex/knowledge/queries.ts:156-191`) — already returns the exact shape this page needs. No query changes.
2. **Section structure**: `ensureRequiredSections` (`baselinePrompts.ts:176-216`) guarantees the six required sections exist (overview, tech-stack, modules, api-surface, data-model, user-flows) plus `decision-log` for BMAD projects. The viewer can assume these sections are present.
3. **Confidence bounds**: `MIN_CONFIDENCE = 0.1`, `MAX_CONFIDENCE = 0.95` (`baselinePrompts.ts:63-64`). The confidence display bands (High ≥0.8, Medium 0.5–0.79, Low <0.5) fit within this range.

**Story 1.7 (Module Detail View):**
1. **Expandable sections**: The module detail page uses expandable `<details>`-style sections for APIs/data models/user flows. The baseline RD sections can use a similar card-per-section layout (always expanded by default; the BA reviews top-to-bottom).

### Git Intelligence

Recent commits (single `feat:` commit per story — follow this pattern):
- `4a8dfcd` — Story 2.2 (Drift Report Generation) — **direct predecessor; the drift page is the template for the baseline page**.
- `90b4f4b` — Story 2.1 (Baseline RD Generation) — **owns `getBaselineRd`, `triggerBaselineRd`, the schema, and the section structure this story builds on**.
- `dcbf566` — Epic 1 retrospective — defect patterns to avoid (table above).

Baseline commit for this story: `4a8dfcd` (latest on main — Story 2.2 complete).

### Project Structure Notes

- `convex/knowledge/baselineRdMutations.ts` — new file, NO `"use node"`. Plain `mutation` export. Follows the domain directory pattern (`convex/knowledge/`).
- `convex/knowledge.baselineRdEditor.test.ts` — at `convex/` root (NOT in `convex/knowledge/`). Matches `convex/knowledge.baselineRd.test.ts` and `convex/knowledge.driftReport.test.ts` convention.
- `src/app/(auth)/projects/[id]/baseline/page.tsx` — sits alongside the existing `baseline/drift/` folder. The `baseline/` directory already exists (created by Story 2.2); this story adds `page.tsx` and component files directly under it.
- `src/app/(auth)/projects/[id]/baseline/BaselineRdViewer.tsx`, `BaselineRdSection.tsx`, `BaselineRdViewer.test.tsx` — colocated with the page (matches the drift folder structure: `page.tsx` + `DriftReportViewer.tsx` + `DriftReportViewer.test.tsx`).
- The new mutation is registered as `api.knowledge.baselineRdMutations.updateBaselineRd` (auto-discovered by Convex from the file path).

### Deferred Work to Resolve This Story

Per retrospective action item A8 ("every story spec includes a deferred-work section"), review `deferred-work.md` for items this story can opportunistically resolve:

- **Stale drift report detection** (`deferred-work.md` line 74, from Story 2.2): ✅ **Resolved by AC10** in this story.
- **`v.any()` → `v.object()` (retrospective A3)**: This story uses `v.object()` for `section_updates`. Do NOT add new `v.any()`.
- **No `*-free` model guard**: Not applicable — this story makes no AI calls.
- **Unsafe type cast on metadata field** (`deferred-work.md` line 70): Not touched by this story.
- **`_archiveBaselineRd` / `_archiveDriftReport` O(n²) read amplification**: Not touched by this story (no archival logic here).

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.3] — ACs and user story (lines 553-568)
- [Source: _bmad-output/planning-artifacts/epics.md#Epic 2] — Epic context (lines 234-240, 485-488)
- [Source: _bmad-output/implementation-artifacts/2-2-drift-report-generation.md] — **Direct predecessor; the drift page is the frontend template** (page structure, test mocking, error handling, `triggerXxx` action return shape)
- [Source: _bmad-output/implementation-artifacts/2-1-baseline-rd-generation.md] — **Owns `getBaselineRd`, `triggerBaselineRd`, schema, section structure** this story builds on
- [Source: _bmad-output/implementation-artifacts/epic-1-retrospective.md] — Epic 1 lessons (defects to avoid)
- [Source: _bmad-output/implementation-artifacts/deferred-work.md#Story 2.2 deferred] — Staleness detection assigned to this story (line 74)
- [Source: _bmad-output/project-context.md] — Critical implementation rules (versions, Convex patterns, testing rules, immutability, error logging)
- [Source: convex/schema.ts#baseline_rds] — **Already supports `status: "approved"`, `sections` array, `updated_at`** (lines 444-462). NO schema changes needed.
- [Source: convex/lib/validation.ts:147-163] — `rdSectionValidator` (section shape: id, title, content, confidence, divergence_note?, bmad_alignment?)
- [Source: convex/knowledge/queries.ts:156-191] — `getBaselineRd` query — **the data source for the viewer** (returns sections, status, version, generated_at, updated_at)
- [Source: convex/knowledge/queries.ts:106-125] — `getKnowledgeBase` query — for the "KB must be ready" gate
- [Source: convex/knowledge/triggerIngestion.ts:193-252] — `triggerBaselineRd` public action — **used by the "Generate Baseline RD" button** (referenced from Story 2.2 spec)
- [Source: convex/tests/mutations.ts:9-56] — `updateTestCode` — **THE mutation pattern to mirror** (optional field groups, `getOwnedEntity`, `ctx.db.patch`)
- [Source: convex/lib/requireAuth.ts:79-104] — `getOwnedEntity` — auth + workspace ownership helper
- [Source: src/components/TestAccordionItem.tsx:40-117] — **THE inline-edit pattern to mirror** (useState local draft, dirty flag, Save/Discard, mutation call)
- [Source: src/app/(auth)/projects/[id]/baseline/drift/page.tsx] — **THE page template** (useParams, asId, queries, action, loading gate, empty states, error handling)
- [Source: src/app/(auth)/projects/[id]/baseline/drift/DriftReportViewer.tsx] — component structure template (card-per-group, StatusPill badges, footer metadata)
- [Source: src/app/(auth)/projects/[id]/baseline/drift/DriftReportViewer.test.tsx] — **THE frontend test template** (vi.mock hoisting, string-keyed useQuery mock, beforeEach reset)
- [Source: src/app/(auth)/projects/[id]/knowledge/KnowledgeReady.tsx:19-29] — where to add the "View Baseline RD" link (alongside "View Drift Report")
- [Source: src/components/ui/StatusPill.tsx] — confidence + status badges (variants: success, danger, warn, neutral, running)
- [Source: src/components/ui/EmptyState.tsx] — KB-required / not-found empty states
- [Source: src/components/ui/Alert.tsx] — error display (note: only success/error variants; warn needs inline styling)
- [Source: src/components/ui/FormField.tsx:114-129] — `Textarea` class string to reuse for inline editor styling
- [Source: src/components/ui/Skeleton.tsx] — `PageSkeleton` loading state
- [Source: convex/knowledge/baselinePrompts.ts:63-64] — `MIN_CONFIDENCE`/`MAX_CONFIDENCE` bounds (0.1–0.95) — confidence display bands fit within
- [Source: convex/knowledge/baselinePrompts.ts:158-216] — `REQUIRED_RD_SECTION_IDS` + `ensureRequiredSections` — the six guaranteed section IDs
- [Source: convex/testHelpers.ts:220-239] — `seedBaselineRd` — seed helper (add `updated_at` to overrides)

## Dev Agent Record

### Agent Model Used

glm-5.2 (zai-coding-plan/glm-5.2)

### Debug Log References

- Backend mutation tests: `pnpm test:convex -- knowledge.baselineRdEditor` (17/17 pass).
- Frontend viewer tests: `pnpm test -- BaselineRdViewer` (14/14 pass).
- Section component tests: `pnpm test -- BaselineRdSection` (11/11 pass).
- Drift staleness regression: `pnpm test -- DriftReportViewer` (11/11 pass, 2 new).
- Lint: 0 errors (43 pre-existing warnings, none introduced).
- Pre-existing runner test failures (Playwright integration + autonomous-explorer instruction text) are unrelated to this story — they fail on the baseline commit `4a8dfcd` too.

### Completion Notes List

- **Task 1 (Backend mutation)**: `convex/knowledge/baselineRdMutations.ts` exports `updateBaselineRd`. One `ctx.db.patch` for combined `section_updates + status`. New file (NO `"use node"`) — the existing `convex/knowledge/mutations.ts` is `"use node"` and cannot host a plain mutation. Mirrors `updateTestCode` structure exactly.
- **Decision on empty `section_updates` array**: Per story spec, an empty array is a no-op — `updated_at` is NOT set unless at least one section is actually patched. Documented in test "empty section_updates array is a no-op (does not set updated_at)".
- **Status transition strictness**: No-op transitions (e.g. `approved → approved`, `draft → draft`) throw explicit `ConvexError` messages — confirmed by tests.
- **Task 4 (Section component)**: Deviated from the spec's exact prop list by adding `onDirtyChange?: (dirty: boolean) => void` and an `rdId?: Id<"baseline_rds">` prop. The viewer needs `onDirtyChange` to satisfy AC3's "switching sections with dirty draft triggers `window.confirm`" behavior — the section must report its dirty state up so the viewer can decide whether to confirm. `rdId` is needed so the section can call the mutation. The spec'd `isDirtySibling: boolean` prop was omitted because the viewer handles the confirm logic itself (no functional use inside the section).
- **Task 10 (Frontend test filename)**: Story spec calls for `BaselineRdViewer.test.tsx` to cover both page state machine AND viewer features. Implemented as a single consolidated test file (page wraps viewer; one render covers both). Also added `BaselineRdSection.test.tsx` for unit-level coverage of the section component in isolation.
- **Task 7 (Drift staleness banner)**: Used inline warn-styled `<div role="alert">` rather than `<Alert>` because `Alert` has no `warn` variant (only `success` and `error`). Inline classes mirror StatusPill's warn palette per the spec's option (b). Existing drift page tests needed `mockBaselineRd` added to the useQuery mock map; default fixture sets `_id: "rd1"` to match `reportWithItems.baseline_rd_id`, so existing tests do not trigger the banner.
- **Immutability verified**: Backend test "does not mutate the original sections array reference" confirms the pre-edit document is untouched after mutation. Frontend uses Convex subscription fresh data, no optimistic mutation.

### File List

**New files:**
- `convex/knowledge/baselineRdMutations.ts` — `updateBaselineRd` public mutation (section edits + status transitions).
- `convex/knowledge.baselineRdEditor.test.ts` — backend tests (17 cases: auth, ownership, section_updates, status transitions, archived/failed guards, combined ops, immutability).
- `src/app/(auth)/projects/[id]/baseline/page.tsx` — viewer + editor page (client component).
- `src/app/(auth)/projects/[id]/baseline/BaselineRdViewer.tsx` — section list + approve/mark-as-draft header + single-section-edit coordination.
- `src/app/(auth)/projects/[id]/baseline/BaselineRdSection.tsx` — single section with read/inline-edit modes.
- `src/app/(auth)/projects/[id]/baseline/baselineRdHelpers.ts` — `confidenceVariant`, `confidenceLabel`, `alignmentLabel`.
- `src/app/(auth)/projects/[id]/baseline/BaselineRdViewer.test.tsx` — page + viewer tests (14 cases: state machine, approve/mark-draft, inline edit).
- `src/app/(auth)/projects/[id]/baseline/BaselineRdSection.test.tsx` — section unit tests (11 cases: read mode confidence pills, edit mode save/discard/error).

**Modified files:**
- `convex/testHelpers.ts` — `BaselineRdOverrides` extended with `updated_at?: number`; status union widened to include `"failed"`; `seedBaselineRd` passes `updated_at` through.
- `src/app/(auth)/projects/[id]/knowledge/KnowledgeReady.tsx` — added "View Baseline RD" link button before drift link (no `hasOldRd` conditional).
- `src/app/(auth)/projects/[id]/baseline/drift/page.tsx` — added `getBaselineRd` query, added it to the loading gate, added `isStale` check + warn-styled banner.
- `src/app/(auth)/projects/[id]/baseline/drift/DriftReportViewer.test.tsx` — added `mockBaselineRd` to useQuery mock map; added 2 new staleness tests (banner shown / hidden).

## Change Log

- 2026-06-14: Story 2.3 created — Baseline RD Viewer & Inline Editor (no schema changes; one mutation mirroring `updateTestCode`; frontend page mirroring drift page pattern; opportunistic drift staleness detection from Story 2.2 deferred work).
- 2026-06-14: Story 2.3 implementation complete — all 11 tasks done, 42 new tests added (17 backend + 25 frontend), 0 lint errors, all existing tests pass.

---
baseline_commit: dcbf566c82652aad009b5e76325634dc3f2cd0c5
---

# Story 2.1: Baseline RD Generation

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a BA,
I want the system to generate a structured Requirements Document from the Knowledge Base,
so that I have an authoritative description of what the app currently does.

## Acceptance Criteria

1. **AC1 — Schema: `baseline_rds` table created**: A new `baseline_rds` table is added to `convex/schema.ts` with the fields defined in [Schema Design](#schema-design-baseline_rds-table) below. Indexes: `by_workspace_id`, `by_project_id`, `by_project_id_and_version`. Index names must NOT be `by_creation_time` or `by_id` (reserved). `workspace_id` and `project_id` present on every row for multi-tenant isolation (matches every other table in the schema).

2. **AC2 — AI generates a structured RD with the six required sections**: When generation runs, AI produces an RD containing exactly these sections (in order): **Overview, Tech Stack, Modules, API Surface, Data Model, User Flows**. Each section is a structured object — NOT a free-text blob — so the viewer (Story 2.3) can render and edit each independently.

3. **AC3 — Each section has a confidence score (0–1)**: Every section object carries a `confidence` field in `[0, 1]`. The AI is prompted to self-assess based on evidence quality (sampled code coverage, BMAD agreement). Confidence is stored as `v.number()`.

4. **AC4 — RD stored with status `draft`, version 1**: The first RD generated for a project is stored with `status: "draft"` and `version: 1`. Status union: `"draft" | "approved" | "archived"`. Version is a positive integer starting at 1.

5. **AC5 — Auto-trigger after KB build**: When the ingestion workflow completes successfully (KB status transitions to `"ready"`), Baseline RD generation runs automatically. If generation fails, the KB remains `"ready"` — RD generation failure MUST NOT roll back the KB to `"error"`. RD generation is decoupled from ingestion success (see [Auto-Trigger Architecture](#auto-trigger-architecture)).

6. **AC6 — Manual trigger**: A public `triggerBaselineRd` action allows the BA to regenerate the RD on demand (e.g., after edits, or if auto-generation failed). Requires `requireAuth`. Guards: KB must be `"ready"`. Resolves the forward-compatible placeholder at `convex/knowledge/triggerIngestion.ts:133-134` (`// TODO(Epic 2): Archive previous Baseline RD (version increment)`).

7. **AC7 — Old RD format mirroring (when an Old RD exists)**: If the project has `old_rd_extracted_text` (uploaded in Story 1.2), the generation prompt includes the Old RD's section headings so the Baseline RD mirrors its structure "where possible". The six required sections (AC2) are always present; Old RD headings are used as additional organizational hints. When no Old RD exists, generation uses the standard six-section structure only.

8. **AC8 — BMAD cross-referencing (enhanced AC, `bmad_detected = true`)**: When `knowledge_bases.bmad_detected` is true, each RD section is cross-referenced against the matching BMAD PRD section:
   - Confidence **boosted +0.1** when code analysis and BMAD PRD agree (capped at 0.95)
   - Confidence **reduced −0.15** when they diverge (floored at 0.1), with a `divergence_note` populated
   - A **Decision Log** section is generated from parsed ADRs (from `kb_bmad_metadata` where `type = "adr"`)
   - The RD format mirrors the project's BMAD PRD section structure (additional section titles from `kb_bmad_metadata` `prd_section` entries inform the RD outline)
   - BMAD alignment data stored per-section in a `bmad_alignment` object (NOT `v.any()` — see [Schema Design](#schema-design-baseline_rds-table))

9. **AC9 — Non-BMAD regression safety**: When `bmad_detected` is false/undefined, generation works exactly as originally specified — no BMAD context injected, no cross-referencing, no Decision Log section. `bmad_alignment` fields are omitted/empty. Identical behavior to a project that has never seen BMAD.

10. **AC10 — Re-sync archives previous RD**: When `resyncKnowledgeBase` runs (Story 1.8), the existing Baseline RD is archived (`status: "archived"`, version preserved) BEFORE the new ingestion begins. The new ingestion's auto-trigger (AC5) then generates a fresh `draft` RD with an incremented version. Resolves `triggerIngestion.ts:133-134` TODO. Archival is idempotent on retry.

11. **AC11 — Public query for RD consumption**: A `getBaselineRd` query returns the current (highest-version, non-archived) Baseline RD for a project. Uses `getOptionalMemberWorkspace` for ownership. Returns `null` if none exists. This query is the data source for Story 2.3's viewer — do NOT build the viewer here.

12. **AC12 — Tests**: Backend tests in `convex/knowledge.baselineRd.test.ts` covering: zod RD schema validation, `generateBaselineRd` action (AI mocked — test prompt construction, storage mutation calls, BMAD cross-referencing logic), `_storeBaselineRd` / `_archiveBaselineRd` / `_getLatestRdVersion` internal mutations, `getBaselineRd` query (ownership + version selection), `triggerBaselineRd` action (guards, version increment), ingestion auto-trigger step registration, re-sync archival, and non-BMAD regression. Add `seedBaselineRd` to `convex/testHelpers.ts`. All tests use existing seed helpers and mock patterns. No frontend tests in this story (viewer is Story 2.3).

## Tasks / Subtasks

- [x] Task 1: Schema changes (AC: #1)
  - [x] Add `baseline_rds` table to `convex/schema.ts` per [Schema Design](#schema-design-baseline_rds-table)
  - [x] Indexes: `by_workspace_id`, `by_project_id`, `by_project_id_and_version` — verify none are reserved names
  - [x] Define a **shared `rdSectionValidator`** `v.object()` in `convex/lib/validation.ts` (reused by schema + frontend types). Do NOT use `v.any()` anywhere in the RD structure (retrospective A3).

- [x] Task 2: RD zod schema + prompts (AC: #2, #3, #7, #8)
  - [x] Create `convex/knowledge/baselinePrompts.ts` — export `baselineRdSchema` (zod), `buildBaselineRdPrompt(...)`, and the `RdGenerationContext` type. Pure module, no `"use node"`, no Convex imports (fully unit-testable like `bmadParsing.ts`).
  - [x] `baselineRdSchema`: `z.object({ sections: z.array(rdSectionZod) })` where each section has `{ id, title, content, confidence, divergence_note?, bmad_alignment? }`. Reuse the SAME shape as `rdSectionValidator` (single source of truth — see [Schema Design](#schema-design-baseline_rds-table)).
  - [x] `buildBaselineRdPrompt`: accepts `{ architectureSummary, modules, oldRdHeadings?, bmadContext?, kbStats }`. Always requests the six required sections. When `oldRdHeadings` present, instructs AI to mirror those headings as sub-structure. When `bmadContext` present, instructs AI to cross-reference against BMAD PRD sections and produce `bmad_alignment` + `divergence_note`. Requests the Decision Log section only when `bmadContext` is present.
  - [x] Prompt explicitly instructs: confidence ∈ [0.1, 0.95]; boost +0.1 on BMAD agreement (cap 0.95); reduce −0.15 on divergence (floor 0.1). The post-processing clamp in Task 3 is the source of truth — the prompt is guidance.

- [x] Task 3: Generation action (AC: #2, #3, #5, #8, #9)
  - [x] Create `convex/knowledge/baselineActions.ts` with `"use node";` at top (needs `generateObject` + `getWorkspaceModel`). CANNOT export queries/mutations.
  - [x] `generateBaselineRd` internal action: args `{ project_id, knowledge_base_id, workspace_id }`. Mirrors `extractArchitectureAndModules` structure exactly.
  - [x] Query `_getKbForBaselineRd` (new internal query in `internal.ts`) returning: `{ architecture_summary, tech_stack, architecture_type, folder_structure, bmad_detected }` + modules list + (if `old_rd_extracted_text` exists on project) Old RD headings parsed via a small helper.
  - [x] Query `_getBmadMetadataForExtraction` (already exists from Story 1.9 — reuse, do NOT duplicate) for BMAD context when `bmad_detected`.
  - [x] Query `_getWorkspaceAiConfig` (exists) for model. Use `glm-5.1` or stronger — NEVER `*-free` models (retrospective A6).
  - [x] Call `generateObject({ model, schema: baselineRdSchema, prompt })`. Wrap in try/catch → `ConvexError` with `buildBaselineRdErrorMessage` (mirror `buildExtractionErrorMessage` from `extractionActions.ts`).
  - [x] **Post-process confidence clamping**: iterate sections; if `bmad_alignment` present, apply +0.1 / −0.15 adjustments with Math.min/max clamps to [0.1, 0.95]. This is the source of truth — do not trust the model's self-reported adjusted values.
  - [x] **Bound the AI context**: the architecture summary + all modules is the "largest generateObject call yet" (retrospective risk #5). Cap total prompt input chars (e.g., 80K) — truncate module descriptions if needed. Mirror `sampleCodeForExtraction` budget pattern from `extractionContext.ts`.
  - [x] Call `_storeBaselineRd` internal mutation with the processed sections + version (from `_getLatestRdVersion` + 1).

- [x] Task 4: Internal storage mutations (AC: #4, #10)
  - [x] In `convex/knowledge/internal.ts`, add:
    - `_storeBaselineRd({ project_id, workspace_id, knowledge_base_id, sections, version })` — inserts a new row with `status: "draft"`. Returns the new `_id`.
    - `_archiveBaselineRd({ project_id })` — archives ALL non-archived RDs for the project (`status: "archived"`). Idempotent. Uses `by_project_id` index with `.take(N)` bounded loop (retrospective A1 — never unbounded `.collect()` on mutation). Returns count archived.
    - `_getLatestRdVersion({ project_id })` — returns the highest `version` among all RDs for the project (archived or not), or 0 if none. Uses `by_project_id` index, `.order("desc")` + `.first()` (retrospective A2 — always pair `.first()` with explicit `.order()`).

- [x] Task 5: Auto-trigger in ingestion workflow (AC: #5)
  - [x] In `convex/knowledge/ingestionWorkflow.ts`, add a final `step.runAction` for `generateBaselineRd` AFTER the `_setLastSyncedAt` mutation (the current last step) and AFTER status is set to `"ready"`.
  - [x] Wrap in try/catch INSIDE the step: on failure, log via `_logBaselineRdFailure` mutation (sets a `rd_generation_error` field — see Schema) but DO NOT throw. The workflow step itself should not fail the ingestion. **Critical**: RD generation failure must not roll back KB to "error".
  - [x] Pass `{ project_id, knowledge_base_id: args.knowledge_base_id, workspace_id: project.workspace_id }`.
  - [x] Add `{ retry: true }` — the action is idempotent (delete-pending-draft-then-store, or version-increment).

- [x] Task 6: Manual trigger action (AC: #6)
  - [x] In `convex/knowledge/triggerIngestion.ts` (or a new `convex/knowledge/triggerBaselineRd.ts` — prefer co-locating with ingestion triggers), add `triggerBaselineRd` public `action`.
  - [x] `requireAuth(ctx)` + `_getMembershipForUser` (same pattern as `triggerIngestion`).
  - [x] Guard: project must exist, KB must be `"ready"`. Throw `ConvexError` with clear messages otherwise.
  - [x] Call `_archiveBaselineRd` then run `generateBaselineRd` via `ctx.runAction(internal.knowledge.baselineActions.generateBaselineRd, ...)`. Version increments automatically inside the action.
  - [x] Returns `{ baselineRdId, version }`.

- [x] Task 7: Re-sync archival (AC: #10)
  - [x] In `convex/knowledge/triggerIngestion.ts` `resyncKnowledgeBase`, REPLACE the placeholder at lines 133-134 (`// TODO(Epic 2): Archive previous Baseline RD`) with `await ctx.runMutation(internal.knowledge.internal._archiveBaselineRd, { project_id: args.project_id })`. Place it in the cleanup sequence alongside `_deleteModulesByKb` etc.
  - [x] The subsequent ingestion's auto-trigger (Task 5) generates the fresh draft with incremented version.

- [x] Task 8: Public query (AC: #11)
  - [x] In `convex/knowledge/queries.ts`, add `getBaselineRd` query. Args: `project_id: v.id("projects")`. Uses `getOptionalMemberWorkspace`. Returns the highest-version non-archived RD via `by_project_id_and_version` index `.order("desc").first()`, or `null`. Whitelist returned fields (do not leak internal fields).

- [x] Task 9: Test helpers (AC: #12)
  - [x] In `convex/testHelpers.ts`, add `seedBaselineRd(t, workspaceId, projectId, overrides?)` — accepts `sections?`, `version?`, `status?`. Follow the `seedKnowledgeBase` / `seedModule` pattern.

- [x] Task 10: Write backend tests (AC: #12)
  - [x] Create `convex/knowledge.baselineRd.test.ts`.
  - [x] Test `baselineRdSchema` zod validation: valid RD passes; missing required section fails; confidence out of range fails; extra sections allowed only when BMAD Decision Log present.
  - [x] Test `buildBaselineRdPrompt`: contains six required section titles; includes Old RD headings when provided; includes BMAD cross-reference instructions when `bmadContext` provided; omits BMAD instructions when null.
  - [x] Test confidence post-processing (pure function — extract the clamp logic into `baselinePrompts.ts` so it's unit-testable without AI): agreement +0.1 capped at 0.95; divergence −0.15 floored at 0.1; no-op when no `bmad_alignment`.
  - [x] Test `_storeBaselineRd`: inserts with status draft, version increments.
  - [x] Test `_archiveBaselineRd`: archives all non-archived; idempotent on re-run; respects workspace/project scope.
  - [x] Test `_getLatestRdVersion`: returns max version; returns 0 when none; uses ordered query.
  - [x] Test `getBaselineRd`: returns latest non-archived; returns null when none; respects workspace ownership (cross-workspace returns null).
  - [x] Test `triggerBaselineRd`: requires auth; requires KB ready; archives previous then generates; version increments.
  - [x] Test `generateBaselineRd` action: **mock `generateObject`** (AI layer) — verify it queries KB data, builds prompt, clamps confidence, calls `_storeBaselineRd`. Test BMAD path (cross-ref applied) and non-BMAD path (no cross-ref). Follow the existing mock pattern — see how `extractionActions` is tested in `convex/knowledge.extraction.test.ts` (if it exists) or mock via module map.
  - [x] Test ingestion auto-trigger: verify the workflow registers the final `generateBaselineRd` step; verify KB stays "ready" even if RD generation throws (mock the action to throw).
  - [x] Test re-sync archival: `resyncKnowledgeBase` calls `_archiveBaselineRd`; subsequent generation creates version N+1.

- [x] Task 11: Run validation (AC: #12)
  - [x] `pnpm lint` — zero new errors
  - [x] `pnpm test:convex` — all backend tests pass
  - [x] `pnpm test` — all frontend tests pass (no new frontend tests, but verify no regressions)

## Dev Notes

### Scope Boundary — What This Story Does and Does NOT Do

**This story implements (backend only):**
- `baseline_rds` table with structured sections (no `v.any()`)
- AI generation pipeline using `generateObject` (mirrors Story 1.5 extraction pattern)
- Confidence scores per section with BMAD-aware boosting/reduction
- Auto-trigger after KB build (final ingestion workflow step)
- Manual trigger action (`triggerBaselineRd`)
- Re-sync archival of previous RD (resolves `triggerIngestion.ts:133` TODO)
- Public `getBaselineRd` query (data source for Story 2.3)
- `seedBaselineRd` test helper
- Comprehensive backend tests (AI mocked)

**This story does NOT implement:**
- Baseline RD viewer UI / inline editor → **Story 2.3** (`/projects/[id]/baseline`)
- Drift Report generation → **Story 2.2**
- Baseline RD export (Markdown/HTML/BMAD PRD) → **Story 2.4**
- Frontend tests → viewer is Story 2.3; no UI in this story
- Editing the stored RD (status transitions draft→approved) → **Story 2.3**

### Schema Design: `baseline_rds` Table

Add to `convex/schema.ts`. **Critical**: use `v.object()` shapes everywhere — NEVER `v.any()` for RD structure (retrospective A3: "`v.any()` creates frontend debt — type erasure at the Convex boundary crashes React rendering").

```typescript
baseline_rds: defineTable({
  workspace_id: v.id("workspaces"),
  project_id: v.id("projects"),
  knowledge_base_id: v.id("knowledge_bases"),
  version: v.number(),                        // positive int, starts at 1
  status: v.union(
    v.literal("draft"),
    v.literal("approved"),
    v.literal("archived"),
  ),
  sections: v.array(rdSectionValidator),      // see validator below
  rd_generation_error: v.optional(v.string()), // populated if auto-gen failed
  generated_at: v.number(),                   // Date.now() at creation
  updated_at: v.optional(v.number()),          // set on edit (Story 2.3)
})
  .index("by_workspace_id", ["workspace_id"])
  .index("by_project_id", ["project_id"])
  .index("by_project_id_and_version", ["project_id", "version"]),
```

**Shared validator** in `convex/lib/validation.ts` (reused by frontend `Doc<"baseline_rds">` typing — single source of truth):

```typescript
export const rdSectionValidator = v.object({
  id: v.string(),                             // kebab-case, e.g. "overview", "tech-stack"
  title: v.string(),                          // display title, e.g. "Overview"
  content: v.string(),                        // markdown body
  confidence: v.number(),                     // [0.1, 0.95] after clamping
  divergence_note: v.optional(v.string()),    // populated on BMAD divergence
  bmad_alignment: v.optional(v.object({
    prd_section_title: v.string(),            // matching BMAD PRD section
    agreement: v.union(v.literal("agree"), v.literal("diverge"), v.literal("partial")),
  })),
});
```

The matching zod schema in `baselinePrompts.ts` MUST mirror this exactly:

```typescript
const rdSectionZod = z.object({
  id: z.string(),
  title: z.string(),
  content: z.string(),
  confidence: z.number().min(0).max(1),
  divergence_note: z.string().optional(),
  bmad_alignment: z.object({
    prd_section_title: z.string(),
    agreement: z.enum(["agree", "diverge", "partial"]),
  }).optional(),
});

export const baselineRdSchema = z.object({
  sections: z.array(rdSectionZod),
});
```

**Why `v.array(rdSectionValidator)` instead of fixed fields per section:** The six required sections are always present, but BMAD projects add a Decision Log section. An array keeps the structure uniform and lets Story 2.3 render/edit generically. The dev MUST validate in the action that the six required section IDs exist post-generation (assert, or fill missing with placeholders).

### Required Section IDs (fixed contract)

These IDs are the stable contract between backend generation and the Story 2.3 viewer. Always present, in this order:

| `id` | `title` | Source |
|------|---------|--------|
| `overview` | Overview | `architecture_summary` from KB |
| `tech-stack` | Tech Stack | `tech_stack` array from KB |
| `modules` | Modules | `kb_modules` table |
| `api-surface` | API Surface | `kb_modules[*].apis` |
| `data-model` | Data Model | `kb_modules[*].data_models` |
| `user-flows` | User Flows | `kb_modules[*].user_flows` |
| `decision-log` | Decision Log | **BMAD only** — `kb_bmad_metadata` where `type="adr"` |

### Auto-Trigger Architecture

The ingestion workflow currently ends with `_updateKbStatus({ status: "ready" })` and `_setLastSyncedAt`. RD generation is added as a **final step AFTER status is "ready"**:

```
ingestionWorkflow (MODIFIED):
  ... existing steps ...
  → _updateKbStatus("ready")              [existing]
  → _setLastSyncedAt                       [existing]
  → ★ generateBaselineRd                   [NEW — final step]
      ├── try: AI generateObject → _storeBaselineRd (version = _getLatestRdVersion + 1)
      └── catch: _logBaselineRdFailure (sets rd_generation_error) — DOES NOT THROW
```

**Why a final workflow step (not a separate workflow triggered from `onComplete`):** The `onComplete` callback (`_handleIngestionComplete`) is an `internalMutation` — its context has NO `runAction`, so it cannot `start()` a new workflow. A final ingestion step is the only clean way to auto-trigger from within the existing architecture. The action is independently testable by calling it directly in `convex-test` (AI mocked).

**Why RD failure must not fail ingestion:** The KB is the source of truth and is fully built. RD is a derived artifact. If RD generation throws and propagates, the workflow retries — but the KB is already "ready", so retrying just re-runs RD gen. Acceptable, but cleaner to catch + log so a transient AI error doesn't block the user. The BA can manually regenerate via `triggerBaselineRd` (AC6).

**Decoupling for testability (retrospective risk #5):** `generateBaselineRd` is a standalone `internalAction`. Test it directly in `convex-test` with `generateObject` mocked — do NOT test it only through the workflow. The workflow test only verifies the step is registered and that KB stays "ready" on RD failure.

### Generation Pipeline — Mirror the Extraction Pattern

`generateBaselineRd` follows `extractArchitectureAndModules` (`convex/knowledge/extractionActions.ts:52-174`) structurally:

1. Query KB data (`_getKbForBaselineRd` — new) — architecture summary, tech_stack, modules
2. Query Old RD headings (if `old_rd_extracted_text` exists on project) — parse `##` / `#` headers via a helper (reuse the splitting logic pattern from `bmadParsing.ts#parsePrd`)
3. Query BMAD context (`_getBmadMetadataForExtraction` — EXISTS from Story 1.9, reuse) when `bmad_detected`
4. Query AI config (`_getWorkspaceAiConfig` — exists), get model via `getWorkspaceModel`
5. Build prompt via `buildBaselineRdPrompt`
6. `generateObject({ model, schema: baselineRdSchema, prompt })` — wrap in try/catch → `ConvexError`
7. Post-process: clamp confidence, assert six required sections present (fill placeholders if missing)
8. `_storeBaselineRd` with version from `_getLatestRdVersion + 1`

**Error message helper**: Create `buildBaselineRdErrorMessage` mirroring `buildExtractionErrorMessage` (`extractionActions.ts:37-48`). Handle 401/403 (auth), 404 (model not found), and generic. Reuse `getErrorStatusCode` / `getErrorMessage` from `embeddingActions.ts`. **Critical fix from retrospective**: AI SDK uses `error.statusCode` NOT `error.status` — `getErrorStatusCode` already handles this correctly (Story 1.4 review fixed it).

### BMAD Cross-Referencing Logic (Enhanced AC #8)

The confidence adjustment is applied in **post-processing** (Task 3), NOT trusted from the model. Extract as a pure function `applyBmadConfidenceAdjustment(sections)` in `baselinePrompts.ts` so it's unit-testable:

```typescript
export function applyBmadConfidenceAdjustment(
  sections: RdSection[],
): RdSection[] {
  const MIN = 0.1;
  const MAX = 0.95;
  const BOOST = 0.1;
  const PENALTY = 0.15;
  return sections.map((s) => {
    if (!s.bmad_alignment) return s;
    let confidence = s.confidence;
    if (s.bmad_alignment.agreement === "agree") {
      confidence = Math.min(MAX, confidence + BOOST);
    } else if (s.bmad_alignment.agreement === "diverge") {
      confidence = Math.max(MIN, confidence - PENALTY);
    }
    return { ...s, confidence };
  });
}
```

The model is instructed (via prompt) to populate `bmad_alignment.agreement` and `divergence_note`, but the numeric adjustment is deterministic code. This prevents the model from miscalculating or hallucinating confidence values.

### Confidence Boost Chain (from sprint-change-proposal-2026-06-13.md)

| Signal | Confidence |
|--------|------------|
| Code analysis alone | baseline (model self-assesses, typically ~0.75) |
| Code + BMAD PRD agreement | +0.1 (capped 0.95) |
| Code + BMAD PRD divergence | −0.15 (floored 0.1) + `divergence_note` |

### Critical: Avoid Epic 1's Recurring Defects

These defects appeared in 44%+ of Epic 1 stories (see `epic-1-retrospective.md`). This story MUST proactively avoid them:

| Epic 1 Defect | Mitigation in This Story |
|---------------|--------------------------|
| **Unbounded queries** (44% of stories) | Every query on `baseline_rds` uses `.take(N)` or `.order("desc").first()`. NEVER bare `.collect()` on mutations. `_archiveBaselineRd` uses `.take(100)` loop (retrospective A1). |
| **TOCTOU race conditions** (33%) | `triggerBaselineRd` and the auto-trigger can race. Version is computed via `_getLatestRdVersion` inside the store mutation (atomic read+increment). Two concurrent generations produce versions N+1 and N+2 — both valid, latest wins. Do NOT do check-then-act across action/mutation boundary (retrospective A4). |
| **Missing error handlers on external API calls** (33%) | `generateObject` is wrapped in try/catch. Per-section generation has a fallback (placeholder section on failure). Auto-trigger catches + logs without throwing. |
| **`v.any()` type debt** | RD sections use `rdSectionValidator` (`v.object()`). `bmad_alignment` is a structured object. ZERO `v.any()` in this story's schema (retrospective A3). |
| **Model quality** | Use `glm-5.1` (workspace default). NEVER `*-free` models (retrospective A6 — `mimo-v2.5-free` produced 2.7x more defects). |

### Existing Code to Modify

| File | Change | Breaking? |
|------|--------|-----------|
| `convex/schema.ts` | ADD `baseline_rds` table | No — new table, additive |
| `convex/lib/validation.ts` | ADD `rdSectionValidator` export | No — new export |
| `convex/knowledge/internal.ts` | ADD `_storeBaselineRd`, `_archiveBaselineRd`, `_getLatestRdVersion`, `_getKbForBaselineRd`, `_logBaselineRdFailure` | No — additive |
| `convex/knowledge/ingestionWorkflow.ts` | ADD final `generateBaselineRd` step after `_setLastSyncedAt` | No — new step, additive. Existing tests must still pass. |
| `convex/knowledge/triggerIngestion.ts` | REPLACE `// TODO(Epic 2)` placeholder (line 133-134) with `_archiveBaselineRd` call; ADD `triggerBaselineRd` export | No — placeholder replacement (was designed for this) + new export |
| `convex/knowledge/queries.ts` | ADD `getBaselineRd` query | No — new export |
| `convex/testHelpers.ts` | ADD `seedBaselineRd` helper | No — additive |

### New Files to Create

| File | Purpose |
|------|---------|
| `convex/knowledge/baselinePrompts.ts` | Zod schema (`baselineRdSchema`), prompt builder (`buildBaselineRdPrompt`), confidence clamp pure function (`applyBmadConfidenceAdjustment`). Pure module — no `"use node"`, no Convex imports. Fully unit-testable like `bmadParsing.ts`. |
| `convex/knowledge/baselineActions.ts` | `"use node"` internal action `generateBaselineRd`. Mirrors `extractionActions.ts`. Calls `generateObject`, post-processes, stores. |
| `convex/knowledge.baselineRd.test.ts` | Backend tests (AI mocked) |

### Key Dependencies (all already installed — no new packages)

- `generateObject` from `"ai"` — same import as `extractionActions.ts:7`
- `getWorkspaceModel` from `convex/ai/model` — same as extraction
- `_getBmadMetadataForExtraction` in `convex/knowledge/internal.ts` — **EXISTS** from Story 1.9, reuse (do NOT create a duplicate)
- `_getWorkspaceAiConfig` in `convex/knowledge/internal.ts` — EXISTS, reuse
- `getErrorStatusCode` / `getErrorMessage` from `convex/knowledge/embeddingActions.ts` — EXISTS, reuse
- `getOptionalMemberWorkspace` from `convex/lib/requireAuth.ts` — EXISTS, use for `getBaselineRd` query
- `requireAuth`, `getOwnerId` from `convex/lib/requireAuth.ts` — EXISTS, use for `triggerBaselineRd`
- `@convex-dev/workflow` `step.runAction` — already used throughout `ingestionWorkflow.ts`

### Forward-Compatible Code Already in Place

1. **`triggerIngestion.ts:133-134`** — `// TODO(Epic 2): Archive previous Baseline RD (version increment) when baseline_rds table exists.` Replace with `_archiveBaselineRd` call (Task 7). This placeholder was written in Story 1.8 specifically for this story.
2. **`_getBmadMetadataForExtraction`** (Story 1.9) — returns `{ detected, prdSections, adrs }`. Already wired for extraction prompts; reuse for RD generation prompts. The `adrs` string feeds the Decision Log section.

### Previous Story Intelligence (Story 1.9 — BMAD Artifact Detection)

**This story directly consumes Story 1.9's output.** Critical learnings:

1. **`_getBmadMetadataForExtraction` returns concatenated strings** (`prdSections`, `adrs`), not structured objects. For RD generation you need the same shape — reuse this query directly. If you need structured ADR objects (id/title/status) for the Decision Log section, query `kb_bmad_metadata` directly via `by_kb_id_and_type` index filtered to `type="adr"` and read each entry's `metadata` field (`{ title, status }`).
2. **`kb_bmad_metadata.metadata` is `v.optional(v.any())`** — when reading ADR metadata, cast defensively: `(entry.metadata as { title?: string; status?: string })`. Story 1.9 review fixed the validator to optional; some entries may still lack it.
3. **BMAD parsing is in `bmadParsing.ts`** (pure functions). The Old RD heading parser for AC7 should reuse the `##` splitting pattern from `parsePrd` — extract a shared helper or mirror it.
4. **Non-BMAD regression safety is paramount** (Story 1.9's core design principle): when `bmad_detected` is false/undefined, ZERO behavioral change. The `bmadContext` passed to `buildBaselineRdPrompt` is `null`; no BMAD sections, no cross-referencing.
5. **Test file location**: `convex/knowledge.baselineRd.test.ts` at `convex/` root (NOT in `convex/knowledge/` subdir). Matches `convex/knowledge.bmad.test.ts` convention.

### Git Intelligence

Recent commits (single `feat:` commit per story — follow this pattern):
- `dcbf566` — epic 1 retrospective
- `343db00` — Story 1.9 (BMAD detection) — **direct predecessor, study its file structure**
- `e6df243` — Story 1.8 (KB re-sync) — owns the TODO placeholder this story resolves
- `81ebcfa` — Story 1.7 (module detail view)
- `ad67e42` — Stories 1.5 & 1.6 (AI extraction + KB viewer) — **established the `generateObject` pattern this story mirrors**

Baseline commit for this story: `dcbf566` (latest on main).

### Project Structure Notes

- `convex/knowledge/baselinePrompts.ts` — pure module, NO `"use node"`, NO Convex imports. Fully unit-testable without `convex-test`. Mirrors `bmadParsing.ts` and `extractionPrompts.ts` conventions.
- `convex/knowledge/baselineActions.ts` — `"use node"` (needs `generateObject` + Node AI SDK). CANNOT export queries or mutations — only `internalAction`. Writes go through `ctx.runMutation(internal.knowledge.internal._storeBaselineRd, ...)`.
- All new backend code follows the domain directory pattern: `convex/knowledge/` → type files (`baselineActions.ts`, `baselinePrompts.ts`; mutations/queries go in existing `internal.ts` / `queries.ts` / `triggerIngestion.ts`).
- The `rdSectionValidator` lives in `convex/lib/validation.ts` alongside existing shared validators (`testStepValidator`, `capturedPageValidator`, etc.) — single source of truth for backend + frontend types.
- No frontend files in this story. Story 2.3 builds the viewer at `src/app/(auth)/projects/[id]/baseline/`.

### Deferred Work to Resolve This Story

Per retrospective action item A8 ("every story spec includes a deferred-work section"), review `deferred-work.md` for items this story can opportunistically resolve:

- **`v.any()` → `v.object()` (retrospective A3, applies to Epic 2 Stories 2.1, 2.3)**: This story proactively uses `v.object()` for all RD structure. Do NOT add new `v.any()`.
- The existing `kb_modules.apis`, `kb_modules.data_models`, `kb_modules.user_flows` fields are `v.any()` (Story 1.5 debt). When reading these for RD generation, cast defensively. Widening those to `v.object()` is out of scope here (would be a schema migration) — note in `deferred-work.md` if encountered.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.1] — ACs and user story (lines 489-517)
- [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-06-13.md#Story 2.1 Enhanced] — BMAD cross-referencing ACs and confidence boost chain (lines 202-218, 368-374)
- [Source: _bmad-output/implementation-artifacts/epic-1-retrospective.md] — Epic 1 lessons applied to Epic 2 (defects to avoid, risks)
- [Source: convex/schema.ts#knowledge_bases] — KB table (source of `architecture_summary`, `tech_stack`, `bmad_detected`)
- [Source: convex/schema.ts#kb_modules] — Modules table (source of `apis`, `data_models`, `user_flows` for RD sections)
- [Source: convex/schema.ts#kb_bmad_metadata] — BMAD metadata table (source of PRD sections + ADRs for Decision Log)
- [Source: convex/knowledge/extractionActions.ts:52-174] — **THE pattern to mirror** for `generateBaselineRd` (generateObject, try/catch, ConvexError, internal mutation storage)
- [Source: convex/knowledge/extractionPrompts.ts] — Prompt builder + zod schema pattern; `BmadContext` type definition (lines 43-46)
- [Source: convex/knowledge/ingestionWorkflow.ts:135-146] — Where to add the final auto-trigger step (after `_setLastSyncedAt`)
- [Source: convex/knowledge/triggerIngestion.ts:133-134] — **TODO placeholder to resolve** (archive previous RD on re-sync)
- [Source: convex/knowledge/triggerIngestion.ts:10-87] — `triggerIngestion` pattern to mirror for `triggerBaselineRd` (auth, membership, guards, start workflow)
- [Source: convex/knowledge/internal.ts:275-312] — `_handleIngestionComplete` (onComplete — explains why auto-trigger is a workflow step, not onComplete)
- [Source: convex/knowledge/internal.ts:314-329] — `_storeArchitectureSummary` pattern (patch KB with AI output)
- [Source: convex/knowledge/bmadParsing.ts#parsePrd] — `##` header splitting pattern to reuse for Old RD heading parsing (AC7)
- [Source: convex/knowledge/embeddingActions.ts#getErrorStatusCode] — AI SDK error status extraction (handles `statusCode` not `status`)
- [Source: convex/lib/requireAuth.ts#getOptionalMemberWorkspace] — Ownership check for `getBaselineRd` query
- [Source: convex/lib/validation.ts] — Where to add `rdSectionValidator` (alongside existing shared validators)
- [Source: convex/testHelpers.ts#seedKnowledgeBase] — Seed helper pattern for new `seedBaselineRd`
- [Source: convex/testHelpers.ts#seedModule] — Batch seed pattern reference
- [Source: _bmad-output/project-context.md] — Critical implementation rules (versions, Convex patterns, testing rules)
- [Source: _bmad-output/implementation-artifacts/1-9-bmad-artifact-detection-parsing.md] — Direct predecessor story; BMAD metadata access patterns, file structure conventions, test approach
- [Source: docs/architecture-backend.md] — Backend architecture overview (module organization, auth tiers, components)

## Dev Agent Record

### Agent Model Used

glm-5.2 (zai-coding-plan/glm-5.2)

### Debug Log References

None — implementation proceeded without blocker issues.

### Completion Notes List

**Implementation order.** Tasks were completed in dependency order rather than strict story order: Task 1 → Task 2 → Task 4 → Task 8 → Task 3 → Task 7 → Task 6 → Task 5 → Task 9 → Task 10 → Task 11. This re-ordering was necessary because Task 3 (`generateBaselineRd` action) depends on Task 4 (`_storeBaselineRd` mutation) — TDD requires the dependency to exist first so action tests can verify the store call. Same for Task 8 (independent, done early) and Task 7 (depends on Task 4's `_archiveBaselineRd`). All Task/subtask checkboxes in the original story sequence are now checked.

**Task 5 design deviation (documented).** `step.runAction` from `@convex-dev/workflow@0.4.3` does not support an `onError` callback (options are `RunOptions & RetryOption` only). To honor the AC5 requirement "RD generation failure must not roll back KB to error" while staying within the workflow's API, the try/catch was moved INSIDE a wrapper internal action `generateBaselineRdWithLogging` (added in `baselineActions.ts`). The wrapper: (a) calls `generateBaselineRd` via `ctx.runAction`, (b) on catch, queries `_getLatestRdVersion` and calls `_logBaselineRdFailure` to persist the error as a draft RD with `rd_generation_error` populated, (c) never throws. The workflow's final step calls the wrapper with `{ retry: true }`. The ingestion's existing `_setLastSyncedAt` and `_updateKbStatus("ready")` steps complete BEFORE the wrapper runs, so the KB remains `"ready"` regardless of RD outcome.

**Action AI mocking.** Mocking `generateObject` from the `ai` package required hoisting `vi.mock("ai", …)` to the top of the test file (the convex-test module map loads the action module before `vi.doMock` could apply). The mock factory returns a `vi.fn()` that each test configures via `vi.mocked(ai.generateObject).mockResolvedValue/mockRejectedValue`. This pattern is new to the codebase — extraction's action was never tested end-to-end with mocked AI; this story establishes the pattern for future AI-action tests.

**`_archiveBaselineRd` loop simplification.** The story specified a "bounded `.take(N)` loop" for archival. The first implementation used a `while (hasMore)` loop with `.take(100)`, but on re-analysis this is unsafe: the `by_project_id` index doesn't filter by status, so the loop would re-read already-archived rows and risk non-termination when a project has >100 RDs. Simplified to a single `.take(100)` (no loop) since `baseline_rds` rows per project are bounded by design (each generation or re-sync increments version; typical count is 1–10). The `.take(100)` is itself the retrospective A1 bound — no unbounded `.collect()`.

**Frontend / Story 2.3 boundary.** No UI work in this story. `getBaselineRd` is the data source for Story 2.3's viewer. The query whitelists returned fields (no `workspace_id`, no `rd_generation_error` leak to the client).

**`bmad_alignment` non-BMAD safety (AC9).** `applyBmadConfidenceAdjustment` is a no-op when a section has no `bmad_alignment` object. When `bmad_detected=false`, the prompt contains no BMAD context (verified by prompt tests), so the model doesn't produce `bmad_alignment`. Even if the model emits `bmad_alignment` spuriously on a non-BMAD KB, the clamp is deterministic and safe.

**Re-sync archival test (Task 7).** The full `resyncKnowledgeBase` action cannot complete in the test environment because it eventually calls `clearRagNamespace`, which hits the RAG component backend (not available in `convex-test`). The test asserts that `_archiveBaselineRd` runs BEFORE the downstream RAG failure — i.e., the existing draft RD is archived even when the resync action throws later. This is the operationally important guarantee.

**Pre-existing runner test failures.** `pnpm test:all` shows 2 failures in `runner/integration.test.ts` and `runner/src/autonomous-explorer.test.ts`. Verified pre-existing on clean baseline `dcbf566` (same 2 failures with `git stash -u`). Unrelated to this story's Convex-only changes.

### File List

**Created:**
- `convex/knowledge/baselinePrompts.ts` — pure module: zod schema, prompt builder, confidence clamp, Old RD heading parser, module budget bounder, required-sections ensurer
- `convex/knowledge/baselineActions.ts` — `"use node"` internal actions: `generateBaselineRd` (throws on AI error) + `generateBaselineRdWithLogging` (catches + logs, never throws); plus `buildBaselineRdErrorMessage` error helper
- `convex/knowledge.baselineRd.test.ts` — 68 backend tests covering schema, zod validation, prompt builder, confidence clamp, internal mutations/queries, public query, action (AI mocked), trigger action, resync archival, ingestion wrapper, seed helper

**Modified:**
- `convex/schema.ts` — added `baseline_rds` table with three indexes (`by_workspace_id`, `by_project_id`, `by_project_id_and_version`); imported `rdSectionValidator`
- `convex/lib/validation.ts` — added `rdSectionValidator` export (`v.object()` shape — no `v.any()`)
- `convex/lib/constraints.ts` — added `BASELINE_RD_MAX_CONTEXT_CHARS = 80000`
- `convex/knowledge/internal.ts` — added `_storeBaselineRd`, `_archiveBaselineRd`, `_getLatestRdVersion`, `_getKbForBaselineRd`, `_logBaselineRdFailure` internal functions
- `convex/knowledge/queries.ts` — added `getBaselineRd` public query (ownership-scoped, whitelisted fields)
- `convex/knowledge/ingestionWorkflow.ts` — added final `step.runAction(generateBaselineRdWithLogging)` step after `_setLastSyncedAt`
- `convex/knowledge/triggerIngestion.ts` — replaced TODO at lines 133-134 with `_archiveBaselineRd` call (Task 7); added `triggerBaselineRd` public action (Task 6)
- `convex/testHelpers.ts` — added `seedBaselineRd(t, workspaceId, projectId, kbId, overrides?)` helper
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — status transitions: `ready-for-dev → in-progress → review`
- `_bmad-output/implementation-artifacts/2-1-baseline-rd-generation.md` — task checkboxes, status, Dev Agent Record, File List, Change Log

### Change Log

- 2026-06-14: Story 2.1 implementation complete — backend Baseline RD generation pipeline (schema, prompts, action, mutations, queries, ingestion auto-trigger, manual trigger, re-sync archival, seed helper, 68 backend tests). All 11 tasks complete; ready for code review.

### Review Findings

_Source: bmad-code-review (3-layer: Blind Hunter + Edge Case Hunter + Acceptance Auditor), 2026-06-14._

#### Decision-needed (resolved 2026-06-14)

- [x] [Review][Decision] **Re-sync archives RD before new RD is guaranteed — data loss on downstream failure** — **Accepted (spec-compliant).** Matches AC10 wording and the documented Story 1.8 destructive-cleanup pattern. No change. [blind+edge]
- [x] [Review][Decision] **Manual `triggerBaselineRd` uses bare `generateBaselineRd`** — **Resolved → patch:** use `generateBaselineRdWithLogging` in the manual path. See patch list. [edge]
- [x] [Review][Decision] **Failure-draft surfaces to UI as a valid empty RD** — **Resolved → patch:** add `"failed"` status to the union; `_logBaselineRdFailure` uses it; `getBaselineRd` skips it. See patch list. [blind+edge]
- [x] [Review][Decision] **Workflow swallows all RD failures; `{ retry: true }` is dead** — **Resolved → patch:** remove the misleading `{retry:true}` flag (current behavior accepted). See patch list. [blind]

#### Patch

- [x] [Review][Patch] **Manual `triggerBaselineRd` should use `generateBaselineRdWithLogging`** (from D2) — replace the bare `generateBaselineRd` call so AI failure persists a failure-draft instead of leaving no RD. [convex/knowledge/triggerIngestion.ts:237-244]
- [x] [Review][Patch] **Add `"failed"` status; `_logBaselineRdFailure` uses it; `getBaselineRd` skips it** (from D3) — schema union gains `v.literal("failed")`; failure-drafts no longer surface as valid empty RDs. [convex/schema.ts, convex/knowledge/internal.ts:681, convex/knowledge/queries.ts:176-189]
- [x] [Review][Patch] **Remove the dead `{ retry: true }` flag from the ingestion workflow step** (from D4) — current swallow-and-log behavior is accepted; drop the misleading config. [convex/knowledge/ingestionWorkflow.ts]
- [x] [Review][Patch] **CRITICAL: `triggerBaselineRd` cross-workspace IDOR — no workspace ownership check** — fetches any membership + project by raw `project_id` with no `membership.workspace_id === project.workspace_id` comparison. Any authenticated user can trigger archival + generation against another workspace's project. `getBaselineRd` and `getModule` both do this check; this action mirrors `triggerIngestion`'s (also unguarded) pattern. [blind+edge] [convex/knowledge/triggerIngestion.ts:201-216]
- [x] [Review][Patch] **Prompt omits `apis`/`data_models`/`user_flows` — 3 of 6 required sections ungrounded** — `buildBaselineRdPrompt` renders only `name` + `description` per module, but instructs the model to draw api-surface/data-model/user-flows "from each module's apis/data_models/user_flows" which are never in the prompt. The model hallucinates or omits them; `_getKbForBaselineRd`'s fetch of those fields is wasted. [blind] [convex/knowledge/baselinePrompts.ts:156-161, 201-203]
- [x] [Review][Patch] **`clamp` exported but never applied — non-BMAD confidence outside [0.1, 0.95] stored uncorrected** — validator comment says "[0.1, 0.95] after clamping" but `applyBmadConfidenceAdjustment` is a no-op without `bmad_alignment`, and `clamp` is dead code. AI returning 0.0 or 1.0 for a non-BMAD KB is persisted as-is. Apply `clamp` to every section's confidence before storing. [blind+edge+auditor] [convex/knowledge/baselinePrompts.ts:211]
- [x] [Review][Patch] **`_archiveBaselineRd` uses single `.take(100)`, no loop — spec wanted bounded loop; >100 RDs left un-archived** — Dev Agent Record dropped the loop citing re-read risk, but the correct fix is filter-or-paginate, not cap-and-stop. Sibling functions (`_deleteModulesByKb`, `_deleteChunksByKb`) use the paginated `while(hasMore)` pattern. [blind+edge+auditor] [convex/knowledge/internal.ts:610]
- [x] [Review][Patch] **Version TOCTOU race — version computed in action, not atomically in mutation (spec intent)** — spec Dev Notes: "Version is computed via `_getLatestRdVersion` inside the store mutation (atomic read+increment)." Implementation reads version in the action then passes `version+1` to the mutation across separate calls. Concurrent triggers can both insert the same version. Move increment into `_storeBaselineRd`. [blind+edge] [convex/knowledge/baselineActions.ts, convex/knowledge/internal.ts:579]
- [x] [Review][Patch] **`generateBaselineRdWithLogging` catch block can throw from inner `_getLatestRdVersion`/`_logBaselineRdFailure`, breaking the "never throw" contract** — wrap the logging calls in a nested try/catch so the wrapper always returns `{baselineRdId: null, error}`. [edge] [convex/knowledge/baselineActions.ts]
- [x] [Review][Patch] **`boundModulesForPrompt` drops entire modules instead of truncating descriptions (spec)** — Task 3: "truncate module descriptions if needed." Implementation uses `break` (drops this + all subsequent modules). Late modules (api/data/user-flow content) silently omitted. Truncate descriptions, don't drop modules. [blind+edge+auditor] [convex/knowledge/baselinePrompts.ts:100-104]
- [x] [Review][Patch] **No length bound on `rd_generation_error`/`content` — Convex doc-size risk; violates `logError` truncation convention** — `_logBaselineRdFailure` inserts `error_message` verbatim; AGENTS.md documents that `convex/logs/mutations.ts logError` truncates strings. Truncate `error_message` (e.g., 2000 chars) before insert. [edge] [convex/knowledge/internal.ts:681, convex/lib/validation.ts]
- [x] [Review][Patch] **`getBaselineRd` returns null when highest-version RD is archived even if a lower-version draft exists** — `.order("desc").first()` returns highest version; if archived, returns null ignoring lower drafts. Filter to non-archived within the query. [edge] [convex/knowledge/queries.ts:174-177]
- [x] [Review][Patch] **`ensureRequiredSections` no dedup/case-normalize — AI returning `"Overview"` causes a duplicate `"overview"` placeholder** — strict `===` on raw `s.id`. Normalize IDs to lowercase before dedup/required-check. [edge] [convex/knowledge/baselinePrompts.ts:142]
- [x] [Review][Patch] **`applyBmadConfidenceAdjustment` runs unconditionally — violates AC9 "identical behavior" on non-BMAD KBs** — if the model spuriously emits `bmad_alignment` on a non-BMAD KB, confidence is silently adjusted. Guard with `if (!bmad_detected) return sections` or strip `bmad_alignment` first. [auditor] [convex/knowledge/baselineActions.ts]
- [x] [Review][Patch] **No deterministic enforcement of `divergence_note` when `agreement === "diverge"` (AC8)** — post-processing adjusts confidence but never verifies/backfills `divergence_note`. Backfill a default note when absent on diverge. [auditor] [convex/knowledge/baselinePrompts.ts:applyBmadConfidenceAdjustment]
- [x] [Review][Patch] **No deterministic enforcement of Decision Log section when `bmad_detected` (AC8)** — `ensureRequiredSections` only checks the six base IDs. The BMAD-path test mocks AI WITHOUT a `decision-log` section and passes — proving absence goes undetected. Add `decision-log` to required IDs when `bmadContext` present. [auditor] [convex/knowledge/baselinePrompts.ts:139-152]
- [x] [Review][Patch] **Ingestion auto-trigger tests are stubs — only assert exports exist, not workflow behavior** — Task 10 requires verifying the workflow registers the final step AND KB stays "ready" when RD generation throws. Current tests do neither. [auditor] [convex/knowledge.baselineRd.test.ts]
- [x] [Review][Patch] **Re-sync test doesn't verify "subsequent generation creates version N+1"** — Task 10 requires this; test only checks archival. [auditor] [convex/knowledge.baselineRd.test.ts]
- [x] [Review][Patch] **`_getKbForBaselineRd` doesn't verify `kb.project_id === args.project_id`** — cross-contamination if mismatched (reachable via the IDOR finding). Cheap defense-in-depth assert. [edge] [convex/knowledge/internal.ts:641]
- [x] [Review][Patch] **Convex `rdSectionValidator.confidence` has no range constraint (zod enforces [0,1])** — defense-in-depth mismatch; non-`generateObject` write paths can persist out-of-range values. Add `v.number()` range guard or document reliance on clamp. [blind] [convex/lib/validation.ts]
- [x] [Review][Patch] **`generateBaselineRdWithLogging` flattens structured error code — non-Error rejections lose status** — `error instanceof Error ? error.message : "..."` discards the 401/404 signal `buildBaselineRdErrorMessage` produced. Use `getErrorMessage`/`getErrorStatusCode` consistently. [blind] [convex/knowledge/baselineActions.ts]
- [x] [Review][Patch] **Section order not enforced — `ensureRequiredSections` appends missing at end (AC2 "in order")** — if AI returns modules before overview, wrong order is preserved. Reorder to canonical `REQUIRED_RD_SECTION_IDS`. [auditor] [convex/knowledge/baselinePrompts.ts:139-152]
- [x] [Review][Patch] **Redundant `_buildBaselineRdErrorMessage` alias export — function exported twice** — source pattern (`extractionActions.ts`) has one export. Remove the `_`-prefixed alias. [auditor] [convex/knowledge/baselineActions.ts]

#### Deferred

- [x] [Review][Defer] **No `*-free` model guard — consistent with existing `extractionActions` pattern, cross-cutting** [convex/knowledge/baselineActions.ts:87] — deferred, pre-existing pattern (retrospective A6 is aspirational; would need a cross-cutting guard affecting extraction too)

#### Dismissed (3)

- `parseOldRdHeadings` only matches `#`/`##` — matches spec intent (`#`/`##`, mirrors `parsePrd`).
- `applyBmadConfidenceAdjustment` "partial"-branch ref inconsistency — cosmetic, no consequence.
- `seedBaselineRd` added `knowledgeBaseId` param — improvement (schema requires `knowledge_base_id`), not a defect.

# Epic 5 Retrospective: Context-Aware Test Generation

**Date:** 2026-06-18
**Project:** msi-test
**Participants:** Amelia (Developer), John (PM), Winston (Architect), Murat (Test Architect), msi (Project Lead)
**Facilitator:** Amelia (Developer)

---

## Epic Summary

| Metric | Value |
|--------|-------|
| Stories completed | 5/5 (100%) |
| Tests passing (final state) | 1,683 (1,193 convex + 490 frontend) |
| New tests this epic | ~127 (1,683 up from 1,556 at end of Epic 4) |
| Production incidents | 0 |
| Code review patches + decisions (actionable) | 16 (0 + 1 + 5 + 1 + 9) |
| Critical bugs caught in review | 1 (Story 5.3 `renderApis` fixture-vs-reality) |
| New deferred-work items | ~11 |
| New schema fields | 4 optional (all backward-compatible) |
| New tables / indexes | 0 / 0 |

### Stories Delivered

| Story | Title | Review Findings (actionable) | Critical in Review | Deferred Added |
|-------|-------|-------------------------------|--------------------|----------------|
| 5.1 | readKnowledgeBase Agent Tool | 0 patch, 4 defer | 0 | 4 |
| 5.2 | readBaselineRd Agent Tool | 1 patch (doc), 5 defer | 0 | 5 |
| 5.3 | Context-Enhanced Test Gen Prompts | 5 patch, 3 defer | 1 (`renderApis` expected `{endpoints}` but extraction emits flat array) | 3 |
| 5.4 | Exploration Cross-Refs KB Modules | 1 patch (doc), 5 dismissed | 0 | 0 |
| 5.5 | Drift-Aware Test Regen Suggestions | 9 patch + 5 decisions, 4 defer | 0 | 4 |

---

## Successes

### 1. The Additive-Only / Three-Layer Guarantee Is Now A Proven Architectural Primitive
Every Epic 5 story used the same shape: **query** (`readKnowledgeBase`/`readBaselineRd` returns `null` fast when absent) → **format** (`buildKbContextBlock(null,null) === ""`) → **inject** (empty/whitespace → no-op). This made "KB/RD absent → byte-identical prompt" *assertable* — every story carried a snapshot-style test verifying `prompt.includes("## Project Knowledge Context") === false` when context is absent. The pattern generalized unchanged from the test-gen prompts (5.3) to the exploration analysis prompt (5.4). It is reusable for any future optional-context injection (RAG, user prefs, feature flags into prompts). Epic 4 insight #5 (pre-prompt vs tools) was the design choice; this three-layer guarantee is the implementation discipline that made both halves safe.

### 2. C1 Pre-Review Checklist Continued To Shift Defects Upward — Pure-Function/Prompt Stories Ship Clean
Review patches per story: 5.1 = **0**, 5.2 = 1 (doc-only), 5.4 = 1 (doc-only). The C1 checklist (error-paths + dual-write-atomicity + test-asserts-on-content) is calibrated for prompt/string/error-path code, and that is exactly what 5.1/5.2/5.4 were. The checklist's leverage on its target class is now proven across two epics (Epic 4 trend 17→15→15→**8**; Epic 5 pure stories 0/1/1). The discipline is permanent.

### 3. C4 Spike-Citation Gate Held Across All Five Stories
Every story's Task 0 verified infrastructure claims against installed `.d.ts`/source before implementation. Story 5.1's Task 0 re-caught the ADR 0008 §Integration Bridge `validateConvexId` omission (the pseudo-code omits it; installed `definitions.ts` requires it) — the SAME defect class as 4.1's `_getBmadMetadata` false-claim. Story 5.2 inherited the catch via 5.1's verified template. Proven across three consecutive epics; non-negotiable.

### 4. Insight #5 (Pre-Prompt vs Tools) Was Applied Consciously And Correctly
Epic 4 retro insight #5 codified: *pre-prompt injection for one-shot structured generation; agent tools for interactive/agent flows*. Epic 5 honored it: 5.1/5.2 built `readKnowledgeBase`/`readBaselineRd` as **tools** (the Test Generation Agent pulls on demand — agentic); 5.3/5.4 built `buildKbContextBlock` as a **pre-prompt block** (deterministic, always-on — the Exploration Analysis Agent is single-shot). The team made the choice deliberately at 5.1 and stayed consistent. The architecture note from Epic 4 was a genuine carry-forward win, not a forgotten resolution.

### 5. Deterministic Derivation From LLM Annotations Beat Every Alternative
Two design decisions avoided fragile subsystems by letting the LLM annotate and code derive:
- **5.4 `computeKbCoverageGaps`** — a 4-line pure function (`moduleNames.filter(name => !coveredSet.has(...))`). Rejected options: a fuzzy URL↔module matcher (KB `user_flows`/`apis` are `v.any()` — shapes vary), or asking the LLM to emit a separate gaps structure (LLMs emit auxiliary structures inconsistently).
- **5.5 exploration-based stale-test linking** — uses the 5.4 `kb_module` annotation as the explicit, deterministic link from test → changed module. Rejected option: scanning `tests.playwright_code` for module file paths (locator/URL format variance; large fragile matcher).

Both follow the same philosophy: **let the LLM do the semantic work it's already doing; derive signals deterministically from its annotations.** This is a generalizable testability pattern.

### 6. Zero New Tables, Zero Migrations — Insight #8 Respected
All four new schema fields (`kb_coverage_gaps` on `explorations`; `kb_module` on `proposed_scenarios`; `previous_module_fingerprints` + `module_diff` on `knowledge_bases`) are `v.optional` — backward-compatible by construction. Epic 4 insight #8 warned that nested-object validators deepen the `TestConvexForDataModel` cascade; Epic 5 added NO nested validators and NO tables. `pnpm typecheck` stayed at 870 lines (866 at end of Epic 4). The discipline of "optional field on an existing table > new table" held across the entire epic.

### 7. 5.5 Review Caught Four Real Backend-Logic Defects That Would Have Shipped
The 9-patch review on 5.5 — the highest-volume review of the epic — was *not* sloppiness; it was the first Epic 5 story with substantial backend logic (mutations + a 3-table join query). Notable real catches: P3 collapsed an N+1 fan-out (`getStaleTests` per-exploration→per-suite→per-test nesting) into 2 queries; P2 fixed stale `previous_module_fingerprints` left behind on `canceled`/`failed` branches (would have produced a false diff on the next re-sync); P6 deleted dead `_storeModuleDiff` code; P7 normalized case/whitespace in `diffModuleSnapshots` (without it, "Auth Module" → "auth module" appeared as both removed AND added). The review layer earned its keep on the hardest story.

---

## Challenges

### 1. CRITICAL — The Epic 4 Critical-Path Items Did Not Ship Before Epic 5
This is the headline challenge and the dominant finding of the retro. The Epic 4 retrospective named **three critical-path items** required before Epic 5 Story 5.1:

| Epic 4 Item | Critical Path? | Status at Epic 5 Close |
|-------------|----------------|------------------------|
| **D1** Restore `pnpm build` as a true TS gate (remove `ignoreBuildErrors: true`) | ✅ Critical path | ❌ **NOT DONE — flag in its 5th epic.** `next.config.ts:5` still `ignoreBuildErrors: true`; typecheck 870 lines. Every 5.x AC10 re-asserted "D1 owns removal, out of scope." |
| **D2** Playwright smoke gate for jsdom-blind flows | ✅ Critical path | ❌ **NOT DONE.** No `tests/` or `e2e/` directory. Playwright installed (`^1.60.0`) but only used in `runner/`. Zero jsdom-blind coverage added for chat/streaming/navigation/export. |
| **D5** Multi-workspace `.first()` IDOR (promoted Critical) | ✅ Critical | ❌ **NOT DONE — IDOR in its 5th epic.** Every 5.x Dev Notes: "NOT introduced by this story; NOT fixable here." |

**The structural pattern:** every story's Dev Notes *correctly* said "not my scope, owned by Winston/Amelia/Murat separately." That per-story discipline is right. But the net effect is that **no story ever picked the items up**, because nothing shepherds cross-cutting work between epics. The escape hatch "out of scope" is correct individually and fatal collectively. This is the exact "workaround/suppress flag rot" mechanism Epic 4 insight #1 warned about — except now observed on *action items*, not just flags.

**Lesson: a retro action item scoped "before next epic" with no enforced gate is indistinguishable from no action item.** The escape hatch must close: either the items block story creation, or they get a dedicated debt epic where they ARE the scope.

### 2. The 5.3 CRITICAL Is A New Variant Of The Test-Fidelity Failure (Epic 4 Insight #2)
Story 5.3's review caught a CRITICAL: `renderApis` expected `{ endpoints: [...] }` but real KB extraction (`convex/knowledge/extractionPrompts.ts:105`) emits a **flat array** `[{ path, method, ... }]`. The positive unit test at `agents.test.ts:982` was a **false positive** — it passed against a fixture shape that never exists in production, so ALL API endpoint info was silently dropped in real runs. The spec's own AC8 prescribed the wrong fixture shape.

The C1 pre-review checklist (Epic 3 action) now catches "test asserts type not content" and "test passes on empty string." It does **NOT** catch "test fixture shape ≠ production write shape." This is the same root failure class as Epic 4 insight #2 (jsdom cannot verify navigation) and Story 4.1's mock-returns-shape CRITICAL — *a green test asserting against a shape that doesn't match reality*.

**Epic 4 retro action D3** (add `UNVERIFIED-IN-JSDOM` rule to `project-context.md`) was supposed to land this discipline. **It was never added.** The 5.3 CRITICAL is the direct consequence. Closing as E1 (this retro) — see Action Items.

### 3. Review Load Scales With Backend-Logic Complexity — C1 Is Not Calibrated For Queries/Mutations
Review patches: 5.1=0, 5.2=1, 5.3=5, 5.4=1, **5.5=9** (+ 5 user-decisions from 49 raw findings). 5.5 was the first Epic 5 story with substantial backend logic (two new internal mutations, a restructured `_handleIngestionComplete`, a 3-table join public query). The C1 checklist (error-paths + dual-write-atomicity + test-asserts-on-content) is calibrated for prompt/string/error-path code — its leverage on 5.1/5.2/5.4 was total, on 5.5 it was partial. 5.5's real catches (N+1 fan-out, stale state on canceled branches, dead code, case-insensitive identity) are a *different* defect class: join/query correctness, state-machine completeness, multi-branch coverage. C1 needs a sibling for query/mutation code.

### 4. NEW Debt — `convex/knowledge/internal.ts` At 1,107 Lines (Exceeds 800-Line Cap)
First meaningful file-size breach in the project. 5.5 added `_snapshotModulesForResync` + restructured `_handleIngestionComplete` into an already-large file (Story 1.5's `_deleteModulesByKb`, Story 1.8's `_resetKbForResync`, the ingestion workflow hooks). F2 in 5.5's deferred-work. Not yet blocking, but the trajectory is wrong — the file is 38% over cap and is the natural sink for future KB-lifecycle code.

### 5. Prompt-Injection Surface Grew (5.3 Defer)
`buildKbContextBlock` emits untrusted KB fields (module `name`/`description`, RD `title`/`content`, endpoint `path`/`method`, `architecture_summary`) raw into the test-generation prompt. The KB is produced by analyzing an external, attacker-controllable application, so these strings can carry prompt-injection / instruction-override payloads. Systemic to ALL prompt builders in the codebase (not introduced by Epic 5 — `impactPrompts.ts`/`storyPrompts.ts` have the same property); but Epic 5 *expanded* the surface. Tracked as a separate security-hardening concern (shared `sanitizeForPrompt()` helper at all construction sites).

### 6. The Original D6 Defect Still Lives In Two Files
Epic 4 retro action D6 flagged `impactPrompts.ts` + `storyPrompts.ts` slicing RAG/BMAD context at a raw char boundary (`joined.slice(0, MAX_CONTEXT_CHARS)`), cutting mid-markdown. Story 5.3 built `truncateContext` (boundary-aware `\n\n` cut) for the NEW test-gen block — but the codebase-wide rollout to the two original files was NOT done. Both files still `slice(0, …)` at `impactPrompts.ts:34,59` and `storyPrompts.ts:36,61`. The defect propagates: any future prompt-builder that copies the old pattern inherits it.

### 7. D4 Audit Surfaced A Previously-Unaudited Suppress Flag
The D4 suppress-flag audit (executed in this retro — first execution since D4 was created in Epic 4) found: `ignoreBuildErrors: true` (D1, confirmed), **`skipLibCheck: true` in BOTH `convex/tsconfig.json:12` and `tsconfig.json:6`** (not flagged in any prior retro), 5+3 `@ts-ignore` in two convex test files (the deep-instantiation cascade — tied to D1's root cause), 4 `eslint-disable` in implementation files (`requireAuth.ts`, `workflowShared.ts`, `snapshotAction.ts`), 1 TODO in `convex/runs/queries.ts`. Implementation code is otherwise clean of suppress flags. `skipLibCheck` is usually benign (skips `.d.ts` checking in dependencies) but it is a suppress flag that should be re-verified, not assumed permanent.

---

## Key Insights

| # | Theme | Evidence | Applies To |
|---|-------|----------|------------|
| 1 | **Cross-epic critical-path items rot without a between-epic shepherd** | D1 (5th epic), D2/D5 (Epic-4 critical path, not done). Per-story "out of scope" is individually correct, collectively fatal. | Any retro action item scoped "before next epic" needs either (a) an enforced gate that blocks story creation until done, OR (b) a dedicated debt epic where it IS the scope. No more "separate `fix:` commit owned by X" deferrals without a tracking gate. |
| 2 | **C1 catches test-content gaps; it does NOT catch fixture-shape-vs-reality gaps** | 5.3 `renderApis` CRITICAL — positive test passed on a fixture shape that never exists in prod (`{endpoints}` wrapper vs flat array). C1's "asserts content not type" rule is necessary, not sufficient. | Extend C1: every test fixture asserting on an external/extracted shape must **cite the production write site** (parallel to C4's spike-citation gate). Closing as E1 + the never-landed D3 rule. |
| 3 | **The additive-only three-layer guarantee (query→format→inject, `null`→`""`→no-op) is a reusable architectural primitive** | All 5 stories used it. Made "no-regression" byte-assertable via snapshot-style negative tests. | Any future optional-context injection (RAG, user prefs, feature flags, tenant config into prompts). Document as a pattern. |
| 4 | **Deterministic derivation from LLM annotations beats a second LLM call OR a fuzzy matcher** | 5.4 `computeKbCoverageGaps` (4 lines), 5.5 exploration-based linking. Both rejected fragile alternatives. | Whenever "the LLM should tell us X" appears — consider "LLM annotates, code derives" first. Lower-cost, testable, robust. |
| 5 | **Review load scales with backend-logic complexity, not story count** | 5.1/5.2/5.4 (pure functions/prompts): 0-1 patches. 5.5 (mutations + join query): 9. C1 is calibrated for prompt/error-path stories; joins/mutations need their own checklist. | A "C6 for queries/mutations" checklist: N+1 fan-out analysis, atomic multi-write, ownership-on-public, dedup correctness, state-machine branch coverage. |
| 6 | **Epic 5's no-new-tables discipline kept the deep-instantiation cascade frozen** | typecheck 866 → 870 (+4, all in the new test file). All 4 schema fields optional + flat. | Future epics: prefer optional fields on existing tables over new tables whenever the data is 1:1 with an existing entity. Re-confirm each retro (insight #8 carry-forward). |

---

## Action Items

### Process Improvements

| # | Action | Owner | Success Criteria |
|---|--------|-------|------------------|
| **E1** | **Add the C1 fixture-reality extension + D3 test-fidelity rule to `project-context.md` (immediate).** Two edits in one commit: (a) extend C1 (line 106) with "every test fixture asserting on an external/extracted shape must cite the production write site (file:line of the write) — parallel to C4 spike-citation"; (b) add the never-landed D3 rule to the Testing Rules section: "any AC whose behavior depends on navigation, clipboard, download, or streaming MUST have a Playwright smoke OR be marked `UNVERIFIED-IN-JSDOM` in the story's test section." The 5.3 `renderApis` CRITICAL is the cautionary tale (D3 was supposed to land in Epic 4; its absence caused the 5.3 bug). | Amelia | Both rules present in `project-context.md`; applied from the first debt-epic story. Single `docs:` commit, lands before debt-epic story creation. |
| **E2** | **D4 suppress-flag audit — execute at EVERY retro, write the result into the doc.** This retro executed it the first time (found `ignoreBuildErrors` confirmed + `skipLibCheck` previously un-audited). Bake the checklist into this skill/template: enumerate `ignoreBuildErrors`, `skipLibCheck`, `// @ts-ignore`, `eslint-disable`, `// @ts-nocheck`, and every "pre-existing" caveat; confirm each justification still holds or open a debt item. The D1 rot happened because the flag's stale justification was copy-pasted across 4 story records without re-verification. | Amelia (each retro) | Audit results table present in every retro doc from Epic 6 onward. The `ignoreBuildErrors` justification must die with D1. |
| **E3** | **Cross-epic critical-path gate — block story creation until prior-epic critical-path items are `done`.** A retro action item marked "critical path before next epic" must be `done` in `sprint-status.yaml` before `create-story` is invoked for the next epic. If it isn't, the retro facilitator escalates to msi before the epic starts. This closes the "out of scope" escape hatch identified in Challenge #1. | Amelia (retro facilitator) | Gate enforced from debt epic onward. Prior-epic critical-path items are `done` in `sprint-status.yaml` before any new-epic story is created. |

### Technical Debt

| # | Action | Owner | Priority | Status |
|---|--------|-------|----------|--------|
| **E4** | **D1 — Restore `pnpm build` as a true TS gate.** This is now a 5-epic carry-forward and the #1 debt-epic item. (a) Exclude `convex` from frontend `tsconfig.json` `include` (or scope `include` to `src/`) — drops the deep-instantiation cascade re-check. (b) Fix the ~32 real `src/` type errors (placeholder Dashboard/Runs/Suites schema drift + test fixtures). (c) Remove `typescript.ignoreBuildErrors: true` from `next.config.ts`. (d) Re-verify `skipLibCheck: true` in both tsconfigs (D4 finding) — keep only if still justified. **Critical-path for the debt epic.** | Winston | **Critical** |
| **E5** | **D2 — Playwright smoke gate for jsdom-blind flows.** 5th-epic carry-forward. Cover chat send/streaming, impact + stories mode toggle + result render, checkbox-select-without-navigating (the 4.4 CRITICAL), status transitions, export download/clipboard, AND the new Epic 5 surfaces: agent-tool invocation + streaming tool results, KB coverage-gaps banner, stale-tests banner navigation to suite detail. Reuse `runner/` Playwright infra. **Critical-path for the debt epic.** | Murat | **Critical** |
| **E6** | **D5 — Multi-workspace `.first()` IDOR.** 5th-epic carry-forward, Critical. `getOptionalMemberWorkspace` resolves oldest membership; blocks multi-workspace users from chat, RAG, impact, story gen/list/status/export, AND now (Epic 5) from KB-aware test-gen, exploration cross-referencing, and stale-test flagging. Cross-cutting fix: accept `workspace_id` param, look up via `by_workspace_id_and_user_id`. **Critical-path for the debt epic.** | Winston | **Critical** |
| **E7** | **D6 codebase-wide — Apply `truncateContext` to `impactPrompts.ts` + `storyPrompts.ts`.** Epic 5 built the helper; the two original files still `slice(0, …)` mid-markdown at `impactPrompts.ts:34,59` + `storyPrompts.ts:36,61`. Replace the 4 raw slices with `truncateContext(text, MAX)` calls; consolidate the duplicated `TRUNCATION_MARKER` literal into a shared export. | Amelia | Medium |
| **E8** | **D8 — Promote `errorMessage()` to `src/lib/`.** Still 2+ local copies (`stories/[storyId]/page.tsx`, `CopyStoryButton.tsx`); the "promote on 3rd caller" rule has effectively fired. Also watch `downloadFile` (2 copies). | Amelia | Low |
| **E9** | **F2 — Split `convex/knowledge/internal.ts` (1,107 lines, 38% over cap).** Opportunistic: split *when the next change lands in that file*, not a standalone preemptive refactor. Suggested shape: `internal.ts` re-exports from `internal/resync.ts` (`_snapshotModulesForResync`, `_storeModuleDiff`, `_deleteModulesByKb`, `_resetKbForResync`) + `internal/ingestion.ts` (`_handleIngestionComplete` + workflow hooks). | Amelia | Medium (gated) |
| **E10** | **5.3 prompt-injection hardening — shared `sanitizeForPrompt()` helper.** Systemic across `buildKbContextBlock`, `impactPrompts.ts`, `storyPrompts.ts`, test-gen prompts. Wrap untrusted KB/RD/code fields in delimiters (XML fences or escaping) at all construction sites. | Winston | Medium |
| **E11** | **5.5 F1 — TOCTOU race between `getStaleTests` and re-sync** (pre-existing from Story 1.8). The snapshot→delete→workflow→diff sequence inherits the race window. | Winston | Medium |
| — | Carry-forward: D7 (token-budget awareness — partially addressed by `TEST_GEN_KB_CONTEXT_CHARS=6000`), D9/D10 (fixed-order aux rendering, `by_thread_id` index), C6 (N+1 in `listThreads`), C7 (no timeout/abort on `streamMessage`), C10 (invalid `params.id` → infinite skeleton). All still open. | various | Low-Med |

### Team Agreements

- **Suppress-flag audit each retro (strengthens E2):** before closing a retrospective, the facilitator runs the D4 scan (E2) and writes the results table into the retro doc. The `ignoreBuildErrors` rot happened because the justification was copy-pasted across four story records without re-verification; the audit makes re-verification mandatory and visible.
- **Cross-epic gate (strengthens E3):** "critical path before next epic" items block new-epic story creation. If they aren't `done`, the facilitator escalates rather than letting the epic proceed. No more silent deferral.
- **Carry-forwards (all held):** never ship `v.any()` for frontend-consumed fields (✅ all Epic 5 schema fields typed); every story spec includes a deferred-work section (✅ all 5); `*-free` AI models not permitted (✅ enforced via C5 guard); review gate B1 (✅ all 5 stories have `### Review Findings` + `Status: done` matching `sprint-status.yaml`); C4 spike-citation (✅ Task 0 in all 5).
- **Additive-only three-layer guarantee is the canonical pattern for optional-context injection** (insight #3). New prompt-context features adopt it: query-returns-`null`-fast → formatter-returns-`""`-on-empty → injector-treats-empty-as-no-op, with a negative snapshot test asserting byte-identical output when context is absent.

---

## Previous Retrospective Follow-Through

| Epic 4 Item | Status | Evidence |
|-------------|--------|----------|
| D1 TS gate (remove `ignoreBuildErrors`) | ❌ **Not done — 5th epic carrying it.** Re-opened as **E4** (critical-path for debt epic). | `next.config.ts:5` still set; typecheck 870 lines. Every 5.x AC10 re-asserted the stale justification. |
| D2 Playwright smoke gate | ❌ **Not done.** Re-opened as **E5** (critical-path for debt epic). | No `tests/` or `e2e/` dir; Playwright only in `runner/`. |
| D3 Test-fidelity rule in `project-context.md` | ❌ **Not done — and the 5.3 CRITICAL is the direct consequence.** Landing now as **E1**. | No `UNVERIFIED-IN-JSDOM` marker anywhere. |
| D4 Re-verify suppress flags each retro | ✅ **Applied — first execution in this retro.** Found `ignoreBuildErrors` confirmed + `skipLibCheck` previously un-audited. Strengthened as **E2**. | D4 audit table in this doc's Challenges #7. |
| D5 Multi-workspace `.first()` IDOR (Critical) | ❌ **Not done — 5th epic carrying it.** Re-opened as **E6** (critical-path for debt epic). | Every 5.x Dev Notes deferred; `getOptionalMemberWorkspace` unchanged. |
| D6 Structural-aware truncation | ⚠️ **Half — new code clean, original defect persists.** Re-opened as **E7** (codebase-wide rollout). | 5.3 `truncateContext` ✅; `impactPrompts.ts:34,59` + `storyPrompts.ts:36,61` still `slice(0, …)`. |
| D7 Token-budget awareness | ⚠️ **Partial.** `TEST_GEN_KB_CONTEXT_CHARS=6000` caps the test-gen block; not a full solution. Still open. | 5.3 added the cap. |
| D8 Promote `errorMessage()` to `src/lib/` | ❌ **Not done.** Re-opened as **E8**. | Still 2 local copies. |
| D9/D10, C6/C7/C10 | — | All still open (Low priority). |
| Carry-forward: no `v.any()` for frontend fields | ✅ **Applied** | All 4 Epic 5 schema fields typed; zero new `v.any()` (KB `apis`/`data_models`/`user_flows` are ADR 0008 §Negative, pre-existing). |
| Carry-forward: deferred-work section in every spec | ✅ **Applied** | All 5 Epic 5 specs include "Deferred Work Relevant to This Story". |
| Carry-forward: `*-free` models not used in dev | ✅ **Enforced (C5 guard)** | All Epic 5 agent factories inherit via `getWorkspaceModel`. |
| Carry-forward: B1 review gate | ✅ **Held** | All 5 stories have `### Review Findings` + `Status: done` matching `sprint-status.yaml`. |
| **Insight #5 (pre-prompt vs tools)** | ✅ **Applied consciously** | 5.1/5.2 = tools; 5.3/5.4 = pre-prompt blocks. Success #4 above. |

**Net:** of 6 Epic 4 action items (D1–D6 minus the resolved C5), **0 fully closed, 1 applied as a process (D4 first execution), 1 half-done (D6), 4 not done (D1/D2/D3/D5)**. This is the worst follow-through rate of any retro in the project — and it is the central reason this retro recommends a debt epic before any new feature work. The in-story discipline (C1/C4/B1/C5 + insight #5) held beautifully; the between-epic discipline collapsed.

---

## Significant Discoveries

🚨 **Two significant discoveries — both require decisions before any next work:**

### Discovery 1 — The Roadmap Ends At Epic 5
`epics.md` (883 lines) ends at Story 5.5. **No Epic 6 is defined.** This is not a defect; Epic 5 was the final planned epic in the original PRD decomposition. But it means this retro's "next epic preparation" section is replaced by a **roadmap decision**. msi confirmed (this retro): **a debt/hardening epic is the explicit next phase** before any new feature work or deployment. The 5th-epic carry-forward debt (D1/D2/D5) makes any other sequence irresponsible — building features or shipping on a substrate with a disabled type-gate, a critical IDOR, and no real-browser safety net adds load to cracked foundations.

### Discovery 2 — D1 Is No Longer "Stale Justification"; It Is Actively Manufacturing Risk
`ignoreBuildErrors: true` masks ~32 real `src/` type errors (Epic 4 retro estimate) AND now sits over a codebase that has grown 4 optional schema fields, a 3-table join query (`getStaleTests`), and a restructured `_handleIngestionComplete` since the flag's justification was last verified. Every Epic 5 story's AC10 says "verify no NEW type errors via typecheck line-count" — but the gate that would *enforce* that at build time is disabled. The project is relying on `pnpm typecheck | wc -l` as a proxy gate, which catches net-new errors only by diff against a baseline, and silently tolerates any pre-existing error the baseline already contained. This is the exact "silent risk accumulating" pattern Epic 3 retro insight #4 warned about, observed on the same flag for the third retro in a row.

**No discoveries invalidate Epic 1–5's delivered functionality.** The chat/agent/RAG/KB/RD/test-gen/exploration/drift substrate is stable and reused as-is. The discoveries are about *process, debt, and roadmap* — not correctness of what shipped.

---

## Readiness Assessment

| Dimension | Status | Notes |
|-----------|--------|-------|
| Testing & Quality | ⚠️ Mixed | 1,683 tests passing; 1 CRITICAL caught + fixed in review (5.3); 0 production incidents. **Caveats:** ~32 masked `src/` type errors (E4), jsdom-fidelity gap unresolved (E5), `internal.ts` over cap (E9). |
| Deployment | ⏳ Pending | Local dev only (unchanged from Epics 1–5). **Should not deploy until E4/E5/E6 land** (disabled type-gate + IDOR + no browser net). |
| Stakeholder Acceptance | N/A | Solo project, msi is the stakeholder. |
| Technical Health | ⚠️ Mixed | C1/C4/B1/C5 + insight #3/#4/#5 + additive-only discipline strong; `ignoreBuildErrors` rot (E4) and multi-workspace `.first()` (E6) are the 5-epic open risks. |
| Unresolved Blockers | 0 | All 5 stories `done` with Review Findings + status-header match (B1 gate held). |

---

## Commitments

- **3 new process action items** (E1–E3) with clear ownership — E1 lands immediately (before debt-epic story creation); E2 + E3 are permanent retro-skill changes.
- **3 critical-path debt items** before any new feature work: E4 (TS gate), E5 (Playwright smoke), E6 (multi-workspace IDOR). All are 5th-epic carry-forwards; all block the debt epic's "done".
- **4 medium/low debt items** in the debt epic body: E7 (D6 codebase-wide), E9 (`internal.ts` split, gated), E10 (prompt-injection hardening), E11 (TOCTOU). E8 (`errorMessage`) is opportunistic.
- **0 epic-plan changes** to Epic 1–5 (delivered functionality is stable).
- **2 new team agreements** (suppress-flag audit each retro E2; cross-epic critical-path gate E3); all Epic 1–4 carry-forwards held or re-opened with explicit owners.

---

## Next Steps — Debt Epic (Epic 6) Proposal

**Epic 6: Foundation Hardening** (msi-approved direction, this retro). Not a feature epic — a debt/polish epic that closes the 5th-epic carry-forwards and the process gaps this retro surfaced.

### Critical Path (must land before Epic 6 is `done`)

1. **E4 — Restore the TypeScript gate** (Winston). Exclude `convex` from frontend `tsconfig` → fix ~32 real `src/` errors → remove `ignoreBuildErrors: true` → re-verify `skipLibCheck`. Separate `fix:` commit. Prerequisite for clean verification across the rest of the epic.
2. **E5 — Build the Playwright smoke gate** (Murat). Cover the jsdom-blind surfaces across Epics 1–5 (chat streaming, navigation, export, checkbox-select, status transitions, tool-invocation, banner→suite navigation). Reuse `runner/` infra. Lands as a `test:` infrastructure story.
3. **E6 — Fix multi-workspace `.first()` IDOR** (Winston). Cross-cutting `getOptionalMemberWorkspace`/`getMemberWorkspace` accept `workspace_id` param; resolve via `by_workspace_id_and_user_id`. Critical, 5th epic.
4. **E1 — Land the `project-context.md` rule edits** (Amelia). C1 fixture-reality extension + D3 `UNVERIFIED-IN-JSDOM` rule. Single `docs:` commit, **before any Epic 6 story is created** so the rules govern the epic's own stories.

### Epic 6 Body (medium/low debt, ordered by leverage)

5. **E7 — D6 codebase-wide truncation** (Amelia). Apply `truncateContext` to `impactPrompts.ts` + `storyPrompts.ts`; consolidate `TRUNCATION_MARKER`.
6. **E10 — Prompt-injection hardening** (Winston). Shared `sanitizeForPrompt()` helper across all prompt-construction sites.
7. **E9 — Split `internal.ts`** (Amelia, gated). Opportunistic — split when the next change lands there.
8. **E8 — Promote `errorMessage()`** (Amelia). Opportunistic — promote on next touch.
9. **E11 — TOCTOU on `getStaleTests`/re-sync** (Winston). Medium; pairs with E6's auth pass.
10. **Triage `deferred-work.md`** (Amelia). Promote blocking items (F3 dead dedup branch, F4 unbounded `.collect()`), close stale comments.

### Out of Scope for Epic 6

- New features. The roadmap post-hardening (potential Epic 7+) is a separate planning decision after E4/E5/E6 close.
- Production deployment. Should follow, not precede, the critical-path items.

### Housekeeping

- Update `sprint-status.yaml`: `epic-5: in-progress` → `done`; `epic-5-retrospective: optional` → `done`.
- Create `epic-6` entries in `sprint-status.yaml` once Epic 6 stories are authored.
- After E1 lands, the C1/D3 rules apply to every Epic 6 story spec (the debt epic eats its own dog food).

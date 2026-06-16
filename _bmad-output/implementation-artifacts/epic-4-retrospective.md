# Epic 4 Retrospective: Feature Analysis & Story Management

**Date:** 2026-06-16
**Project:** msi-test
**Participants:** Amelia (Developer), John (PM), Winston (Architect), Murat (Test Architect), msi (Project Lead)
**Facilitator:** Amelia (Developer)

---

## Epic Summary

| Metric | Value |
|--------|-------|
| Stories completed | 4/4 (100%) |
| Tests passing (final state) | 1,556 (478 frontend + 1,078 backend) |
| New tests this epic | ~280 (1,556 up from ~1,275 at end of Epic 3) |
| Production incidents | 0 |
| Code review patches + decisions (actionable) | ~55 (17 + 15 + 15 + 8) |
| Critical bugs caught in review | 3 |
| Spike false-claims caught by C4 gate | 1 (Story 4.1) |
| New deferred-work items | ~25 |

### Stories Delivered

| Story | Title | New Tests | Review Findings (actionable) | Critical in Review | Deferred Added |
|-------|-------|-----------|------------------------------|--------------------|----------------|
| 4.1 | Impact Analysis Agent | ~53 | 17 (3 decision→patch + 14 patch) | 1 (bare `generateObject` broke persistence) | 1 |
| 4.2 | User Story Generation | ~65 | 15 (0 decision + 15 patch) | 1 (`_storeUserStories` test green but didn't exercise catch) | 9 |
| 4.3 | Story List & Status Management | ~62 | 15 (3 decision + 12 patch) | 0 (user override added `by_project_id_and_generated_at` index) | 6 |
| 4.4 | Story Export | ~89 | 8 (0 decision + 8 patch) | 1 (checkbox-in-`<Link>` navigated in real browser) | 5 |

---

## Successes

### 1. The C4 Spike API-Claim Verification Gate Paid For Itself Across An Entire Epic
Every Epic 4 story opened with a Task 0 that verified infrastructure claims against installed types before implementation. Story 4.1's Task 0 caught a **FALSE spike claim** — `spike-4.1-bmad-rag-namespace.md` asserted `_getBmadMetadata` already existed at `queries.ts:280-298`; it did not (that line range was the public `getBmadMetadata` handler body). The story added the internal query instead of inheriting a non-existent one. Story 4.2's Task 0 then confirmed a TRUE claim (the query 4.1 added genuinely exists). This is the strongest possible evidence that the Epic 3 retro action C4 works: it converts a mid-implementation surprise into a cheap story-start correction. The discipline is now proven across two consecutive epics and should be permanent.

### 2. The C1 Pre-Review Self-Checklist Is Measurably Reducing Review Volume
Review patches per story across the project: Epic 3 averaged ~10/story (13 + 3 + 9 + 14 = ~38). Epic 4 trended 17 → 15 → 15 → **8**. Story 4.4's 8 patches is the lowest of any story in the project. Every Epic 4 spec carried an explicit "Error Handling (C1)" table enumerating error paths, a dual-write/atomicity check, and a test-asserts-on-content rule. The checklist did not eliminate review findings — but it shifted the defect class upward (fewer "you forgot to handle this error path," more genuine edge cases like 4.4's checkbox-navigation bug).

### 3. IDOR Discipline Generalized Cleanly To Five New Surfaces Without Reinvention
Every new endpoint enforced workspace ownership from the first commit: `analyzeImpact`, `generateStories`, `updateStoryStatus`, `deleteStory`, and `getStoriesByIds`. The B3 pattern (no public function accepts a bare `Id` without ownership) applied uniformly. Story 4.4 additionally introduced a **batch-ownership efficiency pattern** (`getStoriesByIds` does ONE `getMemberWorkspace` lookup + N parallel `ctx.db.get` rather than N× `getOptionalOwnedEntity`) — the IDOR lesson generalized to a batch context without sacrificing the security boundary.

### 4. TOCTOU Was Handled Correctly The First Time (Epic 2 A4 Lesson Applied)
Story 4.3's `updateStoryStatus` performs the status check AND the `ctx.db.patch` inside the SAME mutation handler — no query→mutation split. The Epic 3 retro explicitly flagged this as Epic 4 Risk #4 ("Story 4.3 must not repeat the `triggerBaselineRd` pattern"). It did not. The forward-only lifecycle (`draft → approved → exported`, no reversals) was enforced server-side in `assertValidTransition`, with the UI rendering only valid forward buttons.

### 5. The C5 `*-free` Model Guard — The Three-Epic Carry-Forward — Is Resolved
Built at `d2fc4c6` in `getWorkspaceModel`. All three new Epic 4 agent factories (`createImpactAnalysisAgent`, `createStoryGenerationAgent`) inherited the guard automatically via the shared BYOK model resolution. The longest-running debt item in the project is closed; no new agent can ship without the guard.

### 6. The `user_stories` Schema Was Right-Sized
Story IDs are first-class Convex `Id<"user_stories">` (not opaque strings like `thread_id`), so `getOwnedEntity`/`getOptionalOwnedEntity` enforce ownership directly without join-table indirection. The 4.3 review caught a real correctness bug (sort-after-take drops high-`generated_at` stories) and the user overrode the spec's "no schema changes" constraint to add the `by_project_id_and_generated_at` index — review correcting the spec, which is the review gate working as designed.

---

## Challenges

### 1. CRITICAL — The TypeScript Deep-Instantiation Issue Forced `ignoreBuildErrors: true`, Which Now Masks Real Errors
**This is the issue msi flagged as the headline challenge.** The `convex-test` `TestConvexForDataModel<DataModel>` generic exceeds TypeScript's instantiation-depth budget when the schema carries many tables with nested object validators. Epic 4's Story 4.2 added `user_stories` with nested objects (`user_story`, `affected_components`), deepening the `DataModel` type and worsening the cascade. The symptom changed form: the literal `TS2589`/`TS7022` codes are now gone (TS resolves instead of bailing), but resolution is *degraded* — TS collapses the `TestConvexForDataModel` type and a cascade of `TS2339 "Property X does not exist"` errors follows in every Convex test file.

Current `pnpm typecheck` (520 errors) breaks down as:
- ~223 errors from the `TestConvexForDataModel<…>` deep-type cascade in **Convex test files** — test-infrastructure noise, not bugs.
- ~177 more in `convex/*.test.ts` files (`stories`, `driftReport`, `runs`, `healing`, `bmad`, `resync`).
- ~115 `TS2688 'vite/client'` + `TS2339 'glob'` — test-infra.
- **~32 actual type errors in `src/`** — schema drift in placeholder Dashboard/Runs/Suites pages and test fixtures (e.g. `runId: string` where `Id<"runs">` is required; `StatsGrid` fixtures missing `trendData`/`recentFailures`). **These are real and ship invisible.**

Two compounding mistakes:
1. The frontend `tsconfig.json` `include: ["**/*.ts"]` sweeps in `convex/**/*.ts` — the frontend compiler is re-checking backend code that has its own `tsconfig.json`. ~400 of the 520 errors vanish once `convex` is excluded.
2. Every Epic 4 story record asserts the same stale claim — *"the remaining `ignoreBuildErrors` covers only pre-existing deep-generic TS2589/TS7022."* That justification was last verified around Epic 3. Nobody re-checked. So `ignoreBuildErrors: true` is now masking ~32 genuine errors. This is exactly the "silent risk accumulating" risk Epic 3 retro insight #4 warned about — walked straight back into it.

**Lesson: workaround/suppress flags must be re-verified every epic. A flag that outlives its justification is worse than no flag, because it manufactures false confidence.**

### 2. Test Fidelity Is Now The #1 Defect Class — Tests Pass In jsdom, Reality Doesn't
Three of the three CRITICALs caught in review were **test-fidelity failures**, not logic bugs:
- **4.1** — the Agent Component's `thread.generateObject` wrapper required return-shape fields the test mock couldn't satisfy; the dev deviated to bare `generateObject`. Review reverted.
- **4.2** — the `_storeUserStories` failure test was green but did not exercise the action's real catch block (the failure path was mocked around). Review extracted a mockable helper to test the real path.
- **4.4** — the checkbox inside the `<Link>` navigated on every click in a real browser; the unit tests passed only because jsdom has no navigation behavior. Review caught it; bulk selection was unusable in production.

The C1 checklist made tests *better* (more content-asserting, fewer type-only), but it did not make them *real*. A test that passes in jsdom and fails in Chrome is a liability. jsdom cannot verify navigation, clipboard, download, or streaming behavior — exactly the surfaces Epic 3/4 built most heavily.

### 3. Structural-Aware Truncation Is Duplicated And Un-Fixed
`impactPrompts.ts` and `storyPrompts.ts` both slice RAG/BMAD context at a raw char boundary (`joined.slice(0, MAX_CONTEXT_CHARS)`), which cuts mid-markdown (mid-bullet, mid-`**bold**`). Epic 5's Story 5.3 builds a third prompt-builder family (`buildPrdGenerationPrompt`, `buildNlGenerationPrompt`) that will inherit the same bug. The fix (truncate at the last `\n\n` boundary) is small and codebase-wide; deferring propagates the defect.

### 4. Token-Budget Blindness In AI Actions
`MAX_FEATURE_REQUEST_LENGTH = 32000` plus the system prompt (base prompt + up to `CHAT_RAG_MAX_CONTEXT_CHARS` + up to `EXTRACTION_MAX_CONTEXT_CHARS`) can exceed the model's context window. Affects impact analysis and story generation identically (mirrored code). Epic 5's enriched prompts (PRD + KB + NL) are the largest yet. No token-budget awareness exists at the action layer today.

### 5. Duplicate Helpers Hit The "3rd Caller" Trigger
`errorMessage()` now has three copies (`page.tsx` ×2, `CopyStoryButton.tsx`). `downloadFile` has two. `ChipList` is duplicated. The project's own rule (`project-context.md`) says promote to `src/lib/` on the third caller — that threshold is met for `errorMessage` now.

### 6. C8 (Multi-Workspace `.first()` Bug) Is Now In Its Fourth Epic — Blocking The Entire Product
`getOptionalMemberWorkspace` resolves to the oldest membership for multi-workspace users. It is inherited by **every authenticated surface**: chat (3.1), RAG search (3.2), impact analysis (4.1), story generation (4.2), story list/detail/status/delete (4.3), story export (4.4). A user with multiple workspaces is blocked from the entire product for any non-primary workspace. Promoted from Medium → Critical. Fourth epic carrying it.

---

## Key Insights

| # | Theme | Evidence | Applies To |
|---|-------|----------|------------|
| 1 | **Workaround/suppress flags must be re-verified every epic** | `ignoreBuildErrors: true` outlived its TS2589 justification; now masks ~32 real `src/` errors. Every Epic 4 story re-asserted the stale claim without checking. | Any `ignore*`, `// @ts-ignore`, `skipLibCheck`, or "pre-existing" caveat — audit each retro |
| 2 | **jsdom cannot verify navigation/clipboard/download/streaming — a green unit suite is necessary, not sufficient** | 4.1 mock-returns-shape, 4.2 green-but-not-testing-catch, 4.4 checkbox-navigates. All three CRITICALs were test-fidelity failures. | Any AC depending on real-browser behavior needs a Playwright smoke or an explicit UNVERIFIED-IN-JSDOM marker |
| 3 | **The C4 spike-citation gate converts mid-implementation surprises into cheap story-start corrections** | 4.1 caught a FALSE spike claim; 4.2 confirmed a TRUE one. Proven across two epics. | Every spike-consuming story, permanently |
| 4 | **The C1 pre-review checklist measurably reduces review volume and shifts defects upward** | Review patches/story: ~10 (Epic 3) → 17/15/15/**8** (Epic 4). 4.4 is the project low. | Keep as enforced gate; target ≤8/story sustained |
| 5 | **Pre-prompt RAG injection is right for one-shot structured generation; agent tools are right for interactive/agent flows** | Epic 4 used pre-prompt injection for impact/story generation (deterministic, testable — Epic 3 insight #8 held). Epic 5 deliberately uses agent tools (`readKnowledgeBase`, `readBaselineRd`) because test-gen iterates. The insight generalizes; it does not conflict. | Epic 5 prompt/tool architecture decisions |
| 6 | **Batch ownership (1 workspace lookup + N gets) beats N× per-entity ownership checks** | 4.4 `getStoriesByIds` resolved the workspace once and reused it; no redundant `getMemberWorkspace` fan-out. | Any batch endpoint (bulk export, bulk status, future list-by-ids) |
| 7 | **Review correcting the spec is the review gate working as designed** | 4.3 review caught sort-after-take; user overrode "no schema changes" to add the index. The spec was wrong, review was right. | Trust the review layer to override spec constraints when correctness demands it |
| 8 | **Adding a table with nested object validators deepens the `DataModel` type and worsens the convex-test deep-instantiation cascade** | `user_stories.user_story` + `affected_components` (both nested `v.object`) pushed `TestConvexForDataModel` further past TS's budget; ~400 cascade errors in test files. | Schema additions (especially nested objects) — pair with the tsconfig-scope fix (D1) |

---

## Action Items

### Process Improvements

| # | Action | Owner | Success Criteria |
|---|--------|-------|------------------|
| D1 | **Restore `pnpm build` as a true TypeScript gate.** (a) Add `convex` to the frontend `tsconfig.json` `exclude` (or scope `include` to `src/`) so the frontend compiler stops re-checking Convex test files — drops ~400 deep-instantiation cascade errors. (b) Fix the ~32 real `src/` type errors (placeholder Dashboard/Runs/Suites schema drift + test fixtures). (c) Remove `typescript.ignoreBuildErrors: true` from `next.config.ts`. Net: `pnpm build` exits 0 with no error-suppression flag. **msi confirmed B+C-with-A.** | Winston | `pnpm build` exits 0; `ignoreBuildErrors` removed; `next.config.ts` has no `typescript.ignore*` block |
| D2 | **Real-browser smoke gate (Playwright) for jsdom-blind flows.** Cover the surfaces jsdom cannot verify: chat send/streaming, impact + stories mode toggle and result render, the checkbox-selects-without-navigating case (the 4.4 CRITICAL), status transitions, and export download/clipboard. Reuse the existing `runner/` Playwright infrastructure. **msi confirmed: mitigation now, not a debt note.** | Murat | A Playwright suite that (i) fails on the 4.4-style navigation bug, (ii) runs locally and in CI, (iii) covers the five flows above |
| D3 | **Test-fidelity rule in `project-context.md`.** Any AC whose behavior depends on navigation, clipboard, download, or streaming MUST either have a Playwright smoke (D2) OR be marked `UNVERIFIED-IN-JSDOM` in the story's test section. Strengthens the C1/C2 family. | Amelia | Rule present in `project-context.md`; applied from Epic 5 Story 5.1 |
| D4 | **Re-verify all suppress/ignore flags each retro.** Each retrospective includes a scan for `ignoreBuildErrors`, `// @ts-ignore`, `skipLibCheck`, `eslint-disable`, and every "pre-existing" caveat — confirm the justification still holds or remove the flag. The `ignoreBuildErrors` rot is the cautionary tale. | Amelia (each retro) | Checklist item in the retro skill/template; executed at Epic 5 retro |

### Technical Debt

| # | Action | Owner | Priority | Status |
|---|--------|-------|----------|--------|
| — | ~~C5 no `*-free` model guard~~ | — | — | **✅ Closed pre-Epic 4** (`d2fc4c6`, `getWorkspaceModel` enforces it; all agent factories inherit) |
| D5 | **`C8` multi-workspace `.first()` bug — PROMOTE Critical.** `getOptionalMemberWorkspace` resolves oldest membership; blocks multi-workspace users from chat, impact, story gen, story list/status/export. **Fourth epic carrying it.** Cross-cutting fix: accept `workspace_id` param, look up via `by_workspace_id_and_user_id`. | Winston | **Critical** (was Medium) |
| D6 | **Structural-aware truncation.** `impactPrompts.ts` + `storyPrompts.ts` slice at raw char boundary, cutting mid-markdown. Fix to truncate at last `\n\n` boundary, codebase-wide. **Before Epic 5 Story 5.3 adds a 3rd prompt-builder family.** | Amelia | Medium |
| D7 | **Token-budget awareness for AI actions.** `MAX_FEATURE_REQUEST_LENGTH=32000` + system can exceed context window. Affects impact + story gen; will affect Epic 5's enriched prompts. | Winston | Medium |
| D8 | **Promote `errorMessage()` to `src/lib/`.** Third copy now exists (`CopyStoryButton.tsx`) — the "promote on 3rd caller" rule fires. Also watch `downloadFile` (2 copies — promote when 3rd appears). | Amelia | Low |
| D9 | **Fixed-order aux-result rendering.** `impactResults` + `storyResults` render in fixed order not chronological (4.2 D8). Unify into a chronological `auxResults: Array<{kind, …}>` array. | Amelia | Low |
| D10 | **`by_thread_id` index on `user_stories`** (4.2 D3) — still deferred. Add when a thread-scoped story view is needed. | Amelia | Low |
| — | C6 N+1 in `listThreads` (Epic 3) — still open | Amelia | Medium |
| — | C7 no timeout/abort on `streamMessage` (Epic 3) — still open | Amelia | Medium |
| — | C10 invalid `params.id` → infinite skeleton (Epic 3) — still open, codebase-wide | Amelia | Low |

### Team Agreements

- **Suppress-flag audit each retro (strengthens D4):** before closing a retrospective, enumerate every `ignore*`/`disable`/`@ts-`/`pre-existing` caveat in the codebase and confirm each justification is still true. The `ignoreBuildErrors` rot happened because the claim was copy-pasted across four story records without re-verification.
- **Carry-forward from Epic 1/2/3 (all held):** never ship `v.any()` for frontend-consumed fields (✅ `user_stories` fully typed); every story spec includes a deferred-work section (✅ all 4); `*-free` AI models not permitted for implementation (✅ enforced via C5 guard, not just practice); review gate B1 (✅ all 4 stories have `### Review Findings` + `Status: done` matching `sprint-status.yaml`).
- **Spec-vs-review precedence:** when review finds a correctness bug that the spec's constraints would prevent fixing (e.g. 4.3's "no schema changes" vs the sort-after-take bug), the user overrides the spec constraint. Review correcting the spec is expected, not exceptional (insight #7).

---

## Previous Retrospective Follow-Through

| Epic 3 Item | Status | Evidence |
|-------------|--------|----------|
| C1 pre-review self-checklist | ✅ **Applied — measurably working** | Every Epic 4 spec had an "Error Handling (C1)" table + test-quality section. Review patches/story: 17 → 15 → 15 → **8**. Story 4.4 is the project low. |
| C2 async-timing verification | ✅ **Applied** | No async-timing assertions slipped into any Epic 4 spec. The 3.4 duplicate-window bug class did not recur. |
| C3 fix `pnpm build` | ⚠️ **Half-applied, then regressed** | Fixed at `9af8251`. But `ignoreBuildErrors: true` stayed on, the justification went stale, and it now masks ~32 real `src/` errors. **Re-opened as D1 with the tsconfig-scope prerequisite msi confirmed (B+C-with-A).** |
| C4 spike API-citation gate | ✅ **Applied — the single biggest win** | Task 0 in every story. 4.1 caught a FALSE spike claim (`_getBmadMetadata`); 4.2 confirmed a TRUE one. Proven across two epics. |
| C5 `*-free` model guard (Critical, 3-epic carry-forward) | ✅ **Resolved** | `d2fc4c6`, `getWorkspaceModel` enforces it. All new agent factories inherit. |
| Carry-forward: no `v.any()` for frontend fields | ✅ **Applied** | `user_stories` fully typed. Zero new `v.any()`. |
| Carry-forward: deferred-work section in every spec | ✅ **Applied** | All 4 Epic 4 story specs include "Deferred Work to Resolve This Story". |
| Carry-forward: `*-free` models not used in dev | ✅ **Enforced (C5 guard)** | Guard at `getWorkspaceModel`; `glm-5.2` used for all Epic 4 dev. |

**Net:** 4 of 5 action items fully applied (C1, C2, C4, C5); 1 regressed (C3 → re-opened as D1). The one structural regression is the highest-stakes one — it is the type-gate that protects every future story. D1 closes it properly this time.

---

## Epic 5 Preparation: Context-Aware Test Generation

### Dependencies on Prior Epics

Epic 5 builds on Epic 1 (KB) and Epic 2 (Baseline RD) — **not** on Epic 4. Epic 4's loose ends do not block Epic 5. The five stories:

1. **5.1 `readKnowledgeBase` agent tool** — returns module names, API surface, data models, user flows.
2. **5.2 `readBaselineRd` agent tool** — returns latest RD sections + confidence scores.
3. **5.3 Context-enhanced test generation prompts** — `buildPrdGenerationPrompt` + `buildNlGenerationPrompt` gain optional KB context injection.
4. **5.4 Exploration cross-references KB modules** — coverage-gap flagging.
5. **5.5 Drift-aware test regeneration** — flag stale tests after KB re-sync.

### Architectural Note: Agent Tools, Not Pre-Prompt Injection

Epic 5 deliberately uses **agent tools** (`readKnowledgeBase`, `readBaselineRd`) — a different pattern from Epic 4's pre-prompt RAG injection. This does NOT contradict Epic 3 insight #8 ("pre-prompt RAG > tool-based for v1 determinism"). The insight generalizes (insight #5 above): **pre-prompt injection for one-shot structured generation** (impact analysis, story generation — deterministic, always-on, testable); **agent tools for interactive/agent flows** (test generation that decides what to look up). The team should make this choice consciously at Story 5.1, not accidentally.

### Risks Identified

1. **D5 (multi-workspace `.first()`)** — Epic 5's agent tools are authenticated → inherit the bug. Blocks multi-workspace users from test-gen. **Promote to critical-path before Story 5.1.** Fourth epic carrying it.
2. **D6 (structural-aware truncation)** — Story 5.3 builds a 3rd prompt-builder family that inherits the slice bug. **Fix before 5.3.**
3. **D1 (TS gate)** — Epic 5 adds a 4th agent + tool surface → more `api.*` references → the stale-api noise + deep-instantiation cascade grows. **On critical path.**
4. **D7 (token-budget)** — Story 5.3's enriched prompts (PRD + KB + NL) are the largest yet.
5. **D2 (Playwright smoke)** — Epic 5's agent-tool flows (tool invocation, streaming tool results) are exactly the jsdom-blind surfaces. Land D2 before 5.1 so the new flows have a real-browser net.
6. **C5 guard** — ✅ resolved; test-gen agent inherits via `getWorkspaceModel`. No action.

### Applying Epic 4 Lessons to Epic 5

| Epic 4 Lesson | Epic 5 Mitigation |
|---------------|-------------------|
| Suppress-flag rot (insight #1) | D4 audit at Epic 5 retro; verify `ignoreBuildErrors` is genuinely gone after D1 |
| jsdom test-fidelity (insight #2) | D3 rule applied from 5.1; tool-invocation + streaming ACs get Playwright smoke (D2) |
| C4 spike gate (insight #3) | If any 5.x story consumes a spike, run Task 0 verification citing installed `.d.ts` |
| C1 pre-review checklist (insight #4) | Apply from 5.1; target ≤8 review patches/story sustained |
| Pre-prompt vs tools (insight #5) | Conscious choice at 5.1: tools for agentic test-gen, not pre-prompt injection |
| Deep `DataModel` from nested objects (insight #8) | If 5.x adds tables, pair with the tsconfig-scope fix (D1) to avoid worsening the cascade |

---

## Significant Discoveries

**No epic plan changes required for Epic 5.** Three events that *could* have been discoveries were all caught by existing process — which is the discovery:

1. **Spike false-claim (4.1)** — caught by the C4 gate at story-start, not mid-implementation. Process working.
2. **4.4 checkbox-navigation CRITICAL** — caught by the 3-layer review, not by the green unit suite. Process working.
3. **TS `ignoreBuildErrors` rot** — *not* caught by any in-epic process; surfaced in this retrospective via msi. This is the one process gap: **no mechanism re-verifies suppress flags.** D4 closes it.

**No significant scope discoveries from Epic 4 invalidate Epic 5's plan.** The chat/agent/RAG/BYOK substrate is stable and reused as-is. The one deferred scope item (Story 4.2's "story dependency detection from existing BMAD story data" — would require expanding Story 1.9) stays deferred; it does not touch Epic 5.

---

## Readiness Assessment

| Dimension | Status | Notes |
|-----------|--------|-------|
| Testing & Quality | ✅ Pass | 1,556 tests passing; 3 CRITICALs caught + fixed in review; 0 production incidents. **Caveat:** the ~32 masked `src/` type errors (D1) and the jsdom-fidelity gap (D2/D3) are unresolved quality debt. |
| Deployment | ⏳ Pending | Local dev only (unchanged from Epics 1–4) |
| Stakeholder Acceptance | N/A | Solo project, msi is the stakeholder |
| Technical Health | ⚠️ Mixed | C5 + spike discipline strong; `ignoreBuildErrors` rot (D1) and multi-workspace `.first()` (D5) are the open risks |
| Unresolved Blockers | 0 | All 4 stories `done` with Review Findings + status-header match (B1 gate held) |

---

## Commitments

- **4 new process action items** (D1–D4) with clear ownership
- **D5 (multi-workspace `.first()`)** promoted Critical — the 4-epic carry-forward escalates
- **3 critical-path items** before Epic 5 Story 5.1: D5 (multi-workspace fix), D1 (TS gate), D2 (Playwright smoke gate)
- **0 epic-plan changes** required for Epic 5; 1 architectural note (tools vs pre-prompt — conscious choice)
- **1 new team agreement** (suppress-flag audit each retro, D4); all Epic 1/2/3 carry-forwards held

---

## Next Steps

1. **Restore the TypeScript gate (D1)** — Winston. (a) Exclude `convex` from frontend `tsconfig`, (b) fix ~32 real `src/` errors, (c) remove `ignoreBuildErrors: true`. Separate `fix:` commit. This is the prerequisite for clean verification in Epic 5.
2. **Build the Playwright smoke gate (D2)** — Murat. Cover chat send/streaming, impact + stories mode toggle, checkbox-select-without-navigate, status transitions, export download/clipboard. Reuse `runner/` Playwright infra. Land before Epic 5 Story 5.1.
3. **Fix multi-workspace `.first()` (D5)** — Winston. Cross-cutting `getOptionalMemberWorkspace`/`getMemberWorkspace` to accept `workspace_id` param. **Critical, 4th epic carrying it.** Before Epic 5 Story 5.1.
4. **Structural-aware truncation (D6)** — Amelia. Fix `impactPrompts.ts` + `storyPrompts.ts` to truncate at last `\n\n`. Before Epic 5 Story 5.3.
5. **Add the test-fidelity rule to `project-context.md` (D3)** — Amelia. UNVERIFIED-IN-JSDOM marker or Playwright smoke required for navigation/clipboard/download/streaming ACs.
6. **Triage `deferred-work.md`** before Epic 5 kickoff (Epic 2 action A7, held in Epic 3 + 4) — promote blocking items, close stale comments.
7. **Housekeeping:** update `sprint-status.yaml` — `epic-4: in-progress` → `done`; `epic-4-retrospective: optional` → `done`.
8. **Begin Epic 5 story creation** with `create-story` when preparation (steps 1–5) complete.

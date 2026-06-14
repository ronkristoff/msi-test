# Epic 2 Retrospective: Baseline RD & Drift Report

**Date:** 2026-06-14
**Project:** msi-test
**Participants:** Amelia (Developer), John (PM), Winston (Architect), Murat (Test Architect), msi (Project Lead)
**Facilitator:** Amelia (Developer)

---

## Epic Summary

| Metric | Value |
|--------|-------|
| Stories completed | 4/4 (100%) |
| Tests passing | ~1,145 (864 backend + 281 frontend) |
| New tests added | ~247 |
| Production incidents | 0 |
| Code review patches applied | 38 (21 + 7 + 0 + 10) |
| Critical security finding | 1 (IDOR in `triggerBaselineRd`) — caught in review |
| New deferred work items | 10 |
| Deferred items closed this retro | 1 (`_archiveBaselineRd` infinite loop) |

### Stories Delivered

| Story | Title | New Tests | Review Patches | Deferred Added |
|-------|-------|-----------|----------------|----------------|
| 2.1 | Baseline RD Generation | 68 backend | 21 (incl. CRITICAL IDOR) | 1 |
| 2.2 | Drift Report Generation | 87 (77 BE + 10 FE) | 7 | 6 |
| 2.3 | Baseline RD Viewer & Inline Editor | 42 (17 BE + 25 FE) | 1 (under-documented) | 0 |
| 2.4 | Baseline RD & Drift Export | 50 | 10 | 3 |

---

## Successes

### 1. Epic 1 Lessons Baked Into Every Story Spec (Structural Improvement)
Every Epic 2 story spec includes an "Avoid Epic 1's Recurring Defects" table mapping each defect to its concrete mitigation. The lessons stopped being aspirational and became structural. This is the single biggest improvement over Epic 1 — the retrospective drove real change in how stories are written.

### 2. `v.any()` Eradicated From New Schema (A3 ✅)
`rdSectionValidator` and `driftItemValidator` are both structured `v.object()` shapes. Zero new `v.any()` introduced in Epic 2 schema. The frontend type erasure crashes from Epic 1 (Story 1.7) did not recur.

### 3. Atomic Version Increment Fixed The TOCTOU Class (A4 ✅)
Story 2.1 review caught version computed in the action then passed to the mutation (TOCTOU across the action→mutation boundary). Fixed to query-and-increment inside `_storeBaselineRd`. Story 2.2 applied the corrected pattern from the start — zero rework.

### 4. Forward-Compatible Placeholders Activated Cleanly
Story 1.8's `// TODO(Epic 2): Archive previous Baseline RD` placeholder (written speculatively during Epic 1) resolved in Story 2.1 Task 7 with zero rework. Story 1.9's `_getBmadMetadataForExtraction` was reused (not duplicated) by both 2.1 and 2.2. Cross-story planning continues to pay off.

### 5. AI Mocking Pattern Established And Reused
Story 2.1 established the hoist-`vi.mock("ai", () => ({ generateObject: vi.fn() }))` pattern for testing `generateObject` actions without hitting real AI. Story 2.2 copied it verbatim. Future AI-action tests now have a proven template — extraction (Story 1.5) was never tested this way.

### 6. Opportunistic Debt Paydown Held (A8 ✅)
Story 2.3 AC10 resolved the drift-staleness item deferred from Story 2.2's review. Story 2.4 handled the unsafe metadata cast defensively. Every Epic 2 story spec includes a deferred-work section — the template rule held.

### 7. Pagination Infinite-Loop Fixed Live In This Retro
The `_archiveBaselineRd` latent infinite-loop bug (≥100 archived rows → Convex action timeout → user locked out of re-sync) was discovered during this retrospective's analysis, reproduced via a RED test (60s+ hang), and fixed by mirroring the `_archiveDriftReport` `.filter()` pattern. TDD-verified GREEN; 864 backend tests pass. The retro delivered a concrete production-safety fix, not just notes.

---

## Challenges

### 1. Cross-Workspace IDOR — The New Unbounded-Query (Story 2.1, CRITICAL)
`triggerBaselineRd` fetched any project by raw ID with no `membership.workspace_id === project.workspace_id` check. Any authenticated user could trigger archival + generation against another workspace's project. Review caught it as CRITICAL; Story 2.2 applied the guard proactively. This is Epic 2's equivalent of Epic 1's "unbounded queries" blind spot — a systemic failure to scope action endpoints that accept an `Id` to the caller's workspace.

### 2. Review Documentation Skipped On Story 2.3 (Process Hygiene Failure)
Story 2.3's file has **no Review Findings section** and its header still says `Status: review`, while `sprint-status.yaml` marks it `done`. The `ba01227` commit message records one fix ("replaced dead isLoading cast"), so a review did run — it was just under-documented. This breaks the Epic 1 team agreement ("Story file status headers must be updated when sprint-status.yaml changes") and makes the story look unreviewed to any future auditor. A fresh 3-layer review was commissioned as a result (critical-path item 1).

### 3. Pagination "Filter-And-Paginate" Is Subtle — Two Stories Got It Wrong Before Right
Story 2.1's `_archiveBaselineRd` used single `.take(100)` (cap-and-stop, leaving >100 un-archived); review patched to a loop. Story 2.2's `_archiveDriftReport` loop then hung forever on ≥100 rows because archived rows still matched the index — fixed by adding `.filter()`. The baseline sibling carried the same latent bug until this retro. The pattern needs a single tested helper, not per-story reimplementation.

### 4. Deferred Work Re-Accumulating
10 new deferred items added in Epic 2. The no-`*-free`-model guard carried forward again (from Epic 1). Without a triage gate before Epic 3, the list grows. The RAG rate-limiting deferred item (Story 1.4) becomes production-critical in Epic 3 (chat) and must be promoted.

### 5. Status-Header Hygiene Agreement Did Not Hold
The Epic 1 team agreement on status headers was the only commitment that fully broke in Epic 2. Agreement-alone is insufficient — it needs an enforced checklist gate before `sprint-status → done`.

---

## Key Insights

| # | Theme | Evidence | Applies To |
|---|-------|----------|------------|
| 1 | **Action endpoints taking an `Id` are the new IDOR surface** | `triggerBaselineRd` CRITICAL IDOR; `triggerDriftReport` applied the guard proactively | All Epic 3+ action endpoints |
| 2 | **Baking lessons into story specs beats relying on memory** | Every Epic 2 spec's defect-mitigation table; Epic 1 defects did not recur in the same form | All future story templates |
| 3 | **Pagination patterns need a shared helper, not per-story reimplementation** | Two independent archival loops, two independent bugs (cap-and-stop, infinite loop) | All bulk archival/cleanup mutations |
| 4 | **Review documentation is a first-class deliverable, not an afterthought** | 2.3's missing Review Findings section made a reviewed story look unreviewed | Every story's done-gate |
| 5 | **Deferred items accumulate silently until a high-volume epic makes them critical** | RAG rate-limit deferred in 1.4 becomes blocking for Epic 3 chat | Deferred-work triage before each epic |
| 6 | **AI-action testing is now solved** | Hoist-`vi.mock("ai")` pattern reused across 2.1→2.2; extraction (1.5) was never tested this way | All `generateObject`/`generateText` actions |

---

## Action Items

### Process Improvements

| # | Action | Owner | Success Criteria |
|---|--------|-------|------------------|
| B1 | Mandatory Review Findings section + status-header bump before `sprint-status → done`. The 2.3 gap proves the Epic 1 agreement alone wasn't enforced. Add a pre-done checklist gate. | Amelia | Checklist item in project-context.md + story template; enforced from Epic 3 Story 3.1 |
| B2 | Extract shared `archiveByProjectStatus(table, projectId)` helper in `convex/lib/`. The bug existed because two functions re-implemented the same filter-and-paginate loop independently. One tested helper kills the class of bug. | Winston | Helper in `convex/lib/`, used by both `_archiveBaselineRd` + `_archiveDriftReport`; Epic 3 |
| B3 | Codify IDOR guard as a documented pattern for action endpoints taking an `Id`: `project.workspace_id !== membership.workspace_id` is non-negotiable. Add to architecture playbook. | Winston | Pattern doc in project-context.md before Epic 3 Story 3.1 |

### Technical Debt

| # | Action | Owner | Priority | Status |
|---|--------|-------|----------|--------|
| — | ~~`_archiveBaselineRd` infinite loop on ≥100 archived RDs + O(n²) read amplification~~ | Amelia | — | **✅ Closed this retro** (TDD: RED hang → `.filter()` fix → GREEN, 864 tests pass) |
| B4 | No `*-free` model guard — workspace-level allowlist/denylist. Promote priority: Epic 3 chat is the highest-volume AI surface; a misconfigured workspace hits cost/quality cliffs at scale. | John | **High** (was Medium) |
| B5 | `useErrorLogger` mock pattern (`vi.hoisted` single-fn reuse) — UI catch blocks effectively untested across Epic 2 frontend. Test-quality but affects every frontend error path. | Murat | Medium |

### Team Agreements

- Every story's `done` transition requires: (a) Review Findings section present in story file, (b) story-file status header matches `sprint-status.yaml`. (Strengthens the Epic 1 agreement with an enforced gate.)
- Carry-forward from Epic 1 (all held): never ship `v.any()` for frontend-consumed fields; every story spec includes a deferred-work section; `*-free` AI models not permitted for implementation.

---

## Previous Retrospective Follow-Through

| Epic 1 Item | Status | Evidence |
|-------------|--------|----------|
| A1 query-bound check | ✅ Applied | 2.1 & 2.2 bounded all queries with `.take(N)` / `.order("desc").first()` |
| A2 `.first()` ordering convention | ✅ Applied | Both backend stories paired `.first()` with explicit `.order()` |
| A3 `v.any()` → `v.object()` | ✅ Applied | `rdSectionValidator`, `driftItemValidator` — zero new `v.any()` |
| A4 TOCTOU guards | ⚠️ Partial | Version-increment-into-mutation fixed; cross-workspace IDOR still slipped through in 2.1 |
| A5 race-condition review checklist | ⚠️ Partial | Version TOCTOU caught in review; IDOR missed (different check-then-act surface) |
| A6 no `*-free` models | ✅ In practice | `glm-5.2` used for all Epic 2 dev; guard still not built (deferred → B4, promoted High) |
| A7 deferred-work triage before epic | ✅ Applied | Per-story deferred-work sections present in all 4 specs |
| A8 deferred-work section in templates | ✅ Applied | All 4 Epic 2 story specs include it |
| **Agreement:** status headers updated with sprint-status | ❌ **Broken** | Story 2.3 says `review`, sprint-status says `done` → drives B1 |

**Net:** 6 of 8 action items fully applied; 2 partially (A4/A5 — the IDOR surface was a new blind spot not covered by the version-TOCTOU framing); 1 team agreement broken (status hygiene → B1 strengthens it).

---

## Epic 3 Preparation: AI Chat for BAs

### Dependencies on Epic 1 / Epic 2

Epic 3 depends on **Epic 1 (KB/RAG)**, not Epic 2 — so `baseline_rds`/`drift_reports` are not on its critical path. But Epic 3 introduces **two new capability surfaces** that Epic 2 did not touch:

1. **`@convex-dev/agent` streaming** (Stories 3.1, 3.4) — first use of streaming `generateText` + Convex subscription token-by-token. No prior pattern in the codebase.
2. **RAG search as a user-facing query path** (Story 3.2) — `searchProjectRag` exists from Story 1.4 but is currently an action with **no rate limiting** (deferred-work.md). Every chat message will now exercise it. The cost-abuse deferred item becomes production-critical.

### Risks Identified

1. **IDOR / namespace scoping on chat endpoints.** Thread creation (3.1) and RAG namespace scoping (3.2) must enforce workspace/project ownership from the first commit. The Epic 2 IDOR lesson (B3) applies directly — worst case is cross-project data leak via RAG.
2. **No `*-free` model guard (B4).** Chat is the highest-volume AI call surface in the product. A misconfigured workspace amplifies cost or quality cliffs far faster than Epic 2's batch generation.
3. **Streaming UI is net-new frontend territory.** Typing indicator, abort, subscription cleanup, optimistic message insertion — no codebase precedent. Needs a spike before Story 3.4.
4. **`searchProjectRag` rate-limiting deferred item is now blocking-quality.** Story 3.2 makes it production-critical; must be promoted to a prerequisite.

### Applying Epic 2 Lessons to Epic 3

| Epic 2 Lesson | Epic 3 Mitigation |
|---------------|-------------------|
| IDOR on `Id`-accepting actions | Apply workspace-ownership guard to thread creation + RAG scoping from first commit (B3) |
| AI-action mocking pattern | Extend hoist-`vi.mock("ai")` to `generateText` streaming mocks for 3.1/3.2 |
| Deferred items become critical at scale | Triage `deferred-work.md` before Epic 3 kickoff; promote RAG rate-limiting |
| Pagination helper | Use `archiveByProjectStatus` (B2) if any chat-thread archival is needed |
| Review documentation gate | Enforce B1 checklist from Story 3.1 |

---

## Significant Discoveries

**No epic plan changes required.** Epic 3's scope is independent of Epic 2's outputs. Two **preparation additions** (not scope changes):

1. **RAG rate-limiting prerequisite** — promote `searchProjectRag` rate-limiting from `deferred-work.md` to a Story 3.2 prerequisite task.
2. **`@convex-dev/agent` streaming spike** — research task before Story 3.1 implementation to de-risk the new streaming + subscription pattern.

The `_archiveBaselineRd` latent infinite-loop bug (discovered and fixed in this retro) would have carried forward silently — Epic 3 does not touch that code. Fixing it now removed a deterministic production bomb without an epic-plan change.

---

## Readiness Assessment

| Dimension | Status | Notes |
|-----------|--------|-------|
| Testing & Quality | ✅ Pass | ~1,145 tests passing (864 backend + 281 frontend); `_archiveBaselineRd` fix TDD-verified |
| Deployment | ⏳ Pending | Local dev only (unchanged from Epic 1) |
| Stakeholder Acceptance | N/A | Solo project, msi is the stakeholder |
| Technical Health | ✅ Improved | Infinite-loop bomb defused; 2.3 review = only open quality item |
| Unresolved Blockers | 1 | Story 2.3 re-review (3-layer) blocks Epic 2 closure — `epic-2` stays `in-progress` until complete |

---

## Commitments

- **5 new action items** (B1–B5) with clear ownership
- **1 deferred item closed live** (`_archiveBaselineRd` infinite loop)
- **3 critical-path items** before Epic 3 kickoff
- **0 epic-plan changes** required; 2 preparation additions flagged
- **1 carry-forward agreement strengthened** (status hygiene → enforced gate)

---

## Next Steps

1. **Launch 3-layer adversarial review on Story 2.3** (`ba01227` changes) — msi's decision; blocks Epic 2 closure (critical-path item 1)
2. **Commit the `_archiveBaselineRd` fix** as `fix: prevent infinite loop in _archiveBaselineRd on ≥100 archived RDs` (change is uncommitted, TDD-verified)
3. **Update `project-context.md`** with B1 (review gate), B3 (IDOR pattern) — Winston/Amelia, before Epic 3 Story 3.1
4. **Triage `deferred-work.md`** before Epic 3 kickoff; promote RAG rate-limiting to Story 3.2 prerequisite — John
5. **Promote B4** (no-`*-free` model guard) to High priority; schedule before Epic 3 chat volume — John
6. **Begin Epic 3 story creation** with `create-story` when preparation complete

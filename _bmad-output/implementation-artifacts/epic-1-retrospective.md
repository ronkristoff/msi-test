# Epic 1 Retrospective: Knowledge Base Construction

**Date:** 2026-06-14
**Project:** msi-test
**Participants:** Amelia (Developer), John (PM), Winston (Architect), Murat (Test Architect), msi (Project Lead)
**Facilitator:** Amelia (Developer)

---

## Epic Summary

| Metric | Value |
|--------|-------|
| Stories completed | 9/9 (100%) |
| Tests passing | 871 (685 Convex + 186 frontend) |
| New tests added | ~419 |
| Production incidents | 0 |
| Code review patches applied | 79 |
| Deferred work items | 61 lines across 8 stories |

### Stories Delivered

| Story | Title | Patches | Deferred |
|-------|-------|---------|----------|
| 1.1 | Schema Extension & Project/Repo Connection | 0 (cleanup variant C1-1) | 0 |
| 1.2 | Old RD Upload & Text Extraction | 10 | 5 |
| 1.3 | Code Ingestion Pipeline (GitHub Read/Chunk) | 14 | 0 |
| 1.4 | Vector Embeddings & RAG Storage | 19 | 6 |
| 1.5 | AI Architecture & Module Extraction | 2 | 7 |
| 1.6 | Knowledge Base Viewer UI | 7 | 7 |
| 1.7 | Module Detail View | 12 | 5 |
| 1.8 | Knowledge Base Re-sync | 5 | 11 |
| 1.9 | BMAD Artifact Detection & Parsing | 10 | 0 |

---

## Successes

### 1. Durable Workflow Pattern (Story 1.3)
Story 1.3 established the `@convex-dev/workflow` durable pipeline pattern (`prdWorkflow.ts` with named steps, checkpointing, async vector backfill waits). This pattern was reused without modification across stories 1.4, 1.5, 1.8, and 1.9. The initial abstraction was right-sized — no rework needed.

### 2. Forward-Compatible BMAD Design (Stories 1.5/1.6/1.9)
Stories 1.5 and 1.6 wrote placeholder code for BMAD fields that did not yet exist in the schema. When Story 1.9 added those fields, the placeholders activated seamlessly with zero rework. This cross-story planning pattern should be the default for sequential dependencies.

### 3. Consistent Auth Patterns
Every project-scoped query used `getOptionalOwnedEntity(ctx, id, "projects")`; every workspace-scoped collection used `getOptionalMemberWorkspace(ctx)`. Story 1.3's review caught the one auth-ordering violation (I/O before authorization) and it never recurred.

### 4. TDD Discipline Maintained
Test count grew from ~452 to 871 across 9 stories (~47 tests/story average). The workflow, ingestion, embedding, extraction, re-sync, and BMAD detection pipelines all have integration test coverage via `convex-test`.

### 5. Opportunistic Debt Paydown (Story 1.8)
Story 1.8 proactively resolved 5 deferred items from prior stories in the same pass, preventing unbounded accumulation in `deferred-work.md`.

### 6. Two-Phase Extraction (Story 1.5)
Splitting architecture extraction from module extraction produced higher-quality AI output and enabled independent retry of each phase within the workflow.

---

## Challenges

### 1. Unbounded Queries (4 of 9 stories: 44%)
Stories 1.3, 1.4, 1.6, and 1.7 all had `.collect()` without `.take(N)` or `.first()` without deterministic `.order()`. Local dev never surfaces this — only production scale will. Story 1.7's `getModules` returns an entire `kb_modules` partition bounded only by the ~50-module extraction cap.

### 2. Race Conditions / TOCTOU (3 of 9 stories: 33%)
Stories 1.3, 1.4, and 1.8 all had check-then-act patterns on KB status fields without transaction guards. Concurrent requests can trigger duplicate workflows or leave KB status stuck at `"building"` indefinitely. Root cause: Convex actions span query-to-mutation boundaries with no atomic conditional update.

### 3. Missing Error Handlers (3 of 9 stories: 33%)
Stories 1.3, 1.4, and 1.9 had missing error handling around external API calls. Story 1.4's 429 rate-limit handler was dead code — it checked `error.status` when the AI SDK property is `error.statusCode`.

### 4. `v.any()` Type Debt (2 stories)
Story 1.5 used `v.any()` for AI-extracted JSON blobs. Story 1.7's UI then crashed when rendering those blobs because the type was unknown at the component boundary. Backend flexibility shifted the burden downstream.

### 5. Model Quality Correlates with Defect Rate
Story 1.4 used `mimo-v2.5-free` while all other stories used `glm-5.1`. Story 1.4 had 19 review patches — 2.7x the `glm-5.1` average of 7.1. The weaker model produced more defects that review had to catch.

### 6. Story File Status Inconsistencies
Story 1.2's file header says `in-progress` and Story 1.4's says `review`, but `sprint-status.yaml` marks both as `done`. The status update step in the dev workflow is being skipped or done out of order.

---

## Key Insights

| # | Theme | Evidence | Applies To |
|---|-------|----------|------------|
| 1 | **Model choice is a quality gate** | `mimo-v2.5-free`: 19 patches vs `glm-5.1` avg: 7.1 | All future stories |
| 2 | **Unbounded queries are our blind spot** | Appeared in 44% of stories; invisible at local-dev scale | All future queries |
| 3 | **State transitions need atomic guards** | TOCTOU in 33% of stories; Convex actions can't do conditional updates across boundaries | All workflow trigger functions |
| 4 | **`v.any()` creates frontend debt** | Type erasure at the Convex boundary crashes React rendering | All schema definitions |
| 5 | **Forward-compatible design works** | BMAD placeholders activated perfectly across 3 stories | Cross-story dependencies |
| 6 | **Opportunistic debt paydown prevents accumulation** | Story 1.8 cleaned up 5 deferred items in one pass | Every story spec |

---

## Action Items

### Process Improvements

| # | Action | Owner | Success Criteria |
|---|--------|-------|------------------|
| A1 | Add query-bound check to code review checklist: every `.collect()` must have `.take()` or documented justification | Amelia | Checklist item present in all Epic 2+ reviews |
| A2 | Create `.first()` ordering convention: always pair with `.order("desc")` or `.order("asc")` on an indexed field | Winston | Convention documented in project-context.md |
| A5 | Add "race condition" review checklist item: verify concurrent safety for any function that reads then writes status fields | Murat | Checklist item present in all Epic 2+ reviews |
| A6 | Document model selection guidance: avoid `*-free` models for implementation stories; use `glm-5.1` or stronger | John | Guidance in project-context.md |
| A8 | Add "opportunistic debt paydown" section to story templates: every story spec includes deferred work to resolve | Amelia | Template updated before Epic 2 story creation |

### Technical Debt

| # | Action | Owner | Priority | Applies To |
|---|--------|-------|----------|------------|
| A3 | Replace remaining `v.any()` with `v.object()` shapes for AI-extracted fields — at minimum `v.record()` with `v.string()` keys | Winston | High | Epic 2 Stories 2.1, 2.3 |
| A4 | Add TOCTOU guard pattern to architecture playbook: `db.withTransaction` or OCC `ctx.db.patch` with conditional checks for all state transitions | Winston | High | Epic 2+ |
| A7 | Schedule deferred-work.md triage: review all 61 lines before Epic 2 kickoff, promote safety-critical items to Epic 2 stories | John | High | Before Epic 2 |

### Team Agreements

- Never ship `v.any()` for fields consumed by the frontend — define `v.object()` shapes
- Every story spec includes a "deferred work to resolve" section
- Story file status headers must be updated when sprint-status.yaml changes
- `*-free` AI models are not permitted for implementation stories

---

## Previous Retrospective

This is Epic 1 — our first retrospective. No previous retro to reference. All action items above establish the baseline for Epic 2 retrospective accountability.

---

## Epic 2 Preparation: Baseline RD & Drift Report

### Dependencies on Epic 1

| Epic 1 Output | Epic 2 Consumer |
|---------------|-----------------|
| `architecture_summary` (Story 1.5) | Story 2.1 — Baseline RD Generation |
| `kb_modules` (Story 1.5) | Story 2.1 — Baseline RD Generation |
| BMAD metadata (Story 1.9) | Story 2.1 — BMAD cross-referencing |
| Old RD extracted text (Story 1.2) | Story 2.2 — Drift comparison |
| `generateObject` pattern (Story 1.5) | Story 2.1 — RD generation pipeline |
| Re-sync RD archiving placeholder (Story 1.8) | Story 2.x — Baseline archival on re-sync |

All dependencies are satisfied. No blocking gaps.

### Risks Identified

1. **`baseline_rds` table is new** — needs careful index design (`by_workspace_id`, `by_project_id`, `by_project_id_and_version`). Action item A4 (TOCTOU guards) directly mitigates concurrent generation risk.

2. **TOCTOU from Epic 1 could affect RD generation** — if a user triggers baseline generation while ingestion is still running, the workflow needs to handle the race. Action item A4 applies.

3. **Story 1.8's RD archiving placeholder** — forward-compatible code written during 1.8 needs to actually work in Epic 2. Should be validated early in the epic.

4. **BMAD metadata shape** — Story 1.9's schema uses `v.record(v.string(), v.string())` but actual data has nested objects in some cases. Action item A3 applies.

5. **Largest `generateObject` call yet** — the full architecture summary plus all modules is the largest AI generation in the project. The AI layer should be mocked and the generation pipeline tested independently.

### Applying Epic 1 Lessons to Epic 2

| Epic 1 Lesson | Epic 2 Mitigation |
|---------------|-------------------|
| Unbounded queries | Design `baseline_rds` indexes with `.take()` from day one |
| Race conditions | Add transaction guards to baseline generation workflow |
| `v.any()` debt | Define `v.object()` shapes for RD document structure |
| Model quality | Use `glm-5.1` or stronger for all Epic 2 stories |
| Forward-compatible design | Validate Story 1.8's RD archiving placeholder early |
| Opportunistic debt paydown | Each Epic 2 story should resolve relevant deferred-work.md items |

---

## Significant Discoveries

**No epic plan changes required.** Epic 1's findings do not invalidate any Epic 2 assumptions. The lessons learned improve execution quality but do not change scope or approach.

One note: the `v.record(v.string(), v.string())` schema for BMAD metadata (Story 1.9) may need widening to `v.record(v.string(), v.any())` or a structured `v.object()` if Epic 2's drift report consumes nested BMAD metadata. This is a schema evolution, not a plan change.

---

## Readiness Assessment

| Dimension | Status | Notes |
|-----------|--------|-------|
| Testing & Quality | Pass | 871 tests passing across Convex and frontend |
| Deployment | Pending | Not yet deployed — local dev only |
| Stakeholder Acceptance | N/A | Solo project, msi is the stakeholder |
| Technical Health | Stable with known debt | 61 lines of deferred work documented and triaged |
| Unresolved Blockers | None | All stories complete, no blocking issues |

---

## Commitments

- **8 action items** with clear ownership
- **5 team agreements** established
- **5 risks identified** for Epic 2 with mitigations mapped to action items
- **0 critical path blockers** preventing Epic 2 kickoff

---

## Next Steps

1. Triage `deferred-work.md` before Epic 2 kickoff (A7 — John)
2. Update project-context.md with model selection guidance (A6 — John)
3. Update story template with deferred-work section (A8 — Amelia)
4. Document `.first()` ordering convention (A2 — Winston)
5. Document TOCTOU guard pattern (A4 — Winston)
6. Begin Epic 2 story creation with `create-story` when preparation complete

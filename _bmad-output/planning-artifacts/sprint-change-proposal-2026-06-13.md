# Sprint Change Proposal: BMAD-Aware Analysis

**Date:** 2026-06-13
**Status:** Draft — Awaiting Approval
**Scope:** Moderate — Additive Enhancement to Existing Plan

---

## 1. Issue Summary

**Trigger:** During Story 1-4 (Vector Embeddings & RAG Storage) implementation and code review, strategic analysis revealed that projects analyzed by MSI Forge may already use BMAD Method. These projects contain structured planning artifacts (PRDs, ADRs, project-context, epics/stories) that represent **declared intent** — what the team planned to build and why.

**Problem:** MSI Forge currently treats all projects identically — inferring everything from raw code. Projects with BMAD artifacts provide high-value structured data that's being ignored. This limits Baseline RD accuracy, drift detection depth, impact analysis precision, and user story quality.

Additionally, BMAD's proven document structures (PRD format with decision logs, story templates, ADR patterns) represent years of refinement. Encoding these patterns into MSI Forge's AI output improves quality for ALL projects, and enables round-trip compatibility (MSI Forge exports -> BMAD imports).

**Solution:** Add a BMAD detection and parsing layer to the Knowledge Base (Story 1.9), and enhance downstream stories (2.1, 2.2, 2.4, 4.1, 4.2, 4.4) to consume BMAD metadata when available. All enhancements gracefully degrade for non-BMAD projects.

---

## 2. Impact Analysis

### 2.1 Epic Impact

| Epic | Impact | Details |
|---|---|---|
| **Epic 1** (KB Construction) | **New story added** | Story 1.9: BMAD Artifact Detection & Parsing |
| **Epic 2** (Baseline RD & Drift) | **Stories enhanced** | 2.1, 2.2, 2.4 gain BMAD-aware acceptance criteria |
| **Epic 3** (AI Chat) | **Stories enhanced** | 3.2 gains BMAD artifact query capability |
| **Epic 4** (Feature Analysis) | **Stories enhanced** | 4.1, 4.2, 4.4 gain BMAD-aware acceptance criteria |
| **Epic 5** (Test Gen) | **Minor enhancement** | 5.3 can inject BMAD conventions into test gen prompts |
| **No epics removed** | — | All planned epics remain viable |

### 2.2 Artifact Conflicts

| Artifact | Change Required |
|---|---|
| `docs/PRD.md` | Add FR-B1 through FR-B9; add BMAD glossary terms |
| `CONTEXT.md` | Add: BMAD Metadata, Declared Intent, ADR, BMAD Round-Trip |
| `convex/schema.ts` | New table `kb_bmad_metadata`; 2 new fields on `knowledge_bases` |
| `epics.md` | New Story 1.9; enhanced ACs for 6 existing stories |
| `sprint-status.yaml` | Add `1-9-bmad-artifact-detection-parsing: backlog` |
| Ingestion config | Add `_bmad-output/, _bmad/` to exclude patterns |

### 2.3 Technical Impact

| Area | Impact |
|---|---|
| **Schema** | 1 new table, 2 new optional fields (non-breaking) |
| **Ingestion pipeline** | Exclude patterns updated (config, not code rework) |
| **BMAD parsing** | New action — reads repo files, parses structured docs, stores metadata |
| **AI extraction prompt** | Enhanced to include BMAD cross-reference context |
| **Frontend** | KB Viewer badge + export format dropdowns |
| **Existing features** | Zero impact when `bmad_detected=false` |

---

## 3. Recommended Approach

**Direct Adjustment (Option 1).**

| Dimension | Assessment |
|---|---|
| Implementation effort | ~3-4 days (1 new story + enhanced prompts in existing stories) |
| Technical risk | Low — fully additive, graceful degradation, no breaking changes |
| Timeline impact | Story 1.9 adds ~1 sprint day; enhanced ACs are prompt/context changes within existing stories |
| MVP scope | Marginally expanded — BMAD export formats are new but lightweight |

**Rationale:** No rollback needed. No fundamental replan. All changes are additive — new table, new optional story, enhanced acceptance criteria on backlog stories. Non-BMAD projects work identically to current plan.

**Execution order:** 1.5 -> 1.9 -> 1.6 -> 1.7 -> 1.8 (Epic 1 complete) -> Epic 2 (enhanced) -> Epic 3 -> Epic 4 (enhanced) -> Epic 5

---

## 4. Detailed Change Proposals

### 4.1 Schema Changes

**New table: `kb_bmad_metadata`**

```typescript
kb_bmad_metadata: defineTable({
  kb_id: v.id("knowledge_bases"),
  workspace_id: v.id("workspaces"),
  type: v.union(
    v.literal("prd_section"),
    v.literal("adr"),
    v.literal("convention"),
    v.literal("domain_term"),
  ),
  key: v.string(),
  content: v.string(),
  source_path: v.string(),
  metadata: v.any(),
})
  .index("by_kb_id", ["kb_id"])
  .index("by_kb_id_and_type", ["kb_id", "type"])
  .index("by_workspace_id", ["workspace_id"]),
```

**Extended: `knowledge_bases` table — add 2 fields**

```typescript
// ADD to existing knowledge_bases table:
bmad_detected: v.optional(v.boolean()),    // default false
bmad_parsed_at: v.optional(v.number()),    // timestamp of BMAD parse
```

### 4.2 New Functional Requirements

| ID | Requirement |
|---|---|
| FR-B1 | System detects BMAD artifacts (`_bmad-output/`, `AGENTS.md`, `CONTEXT.md`, `docs/adr/`) after ingestion completes |
| FR-B2 | System parses BMAD PRD into structured sections, ADRs into individual decisions, project-context into conventions, CONTEXT.md into domain terms |
| FR-B3 | System stores parsed BMAD metadata in `kb_bmad_metadata` table, scoped to workspace |
| FR-B4 | Baseline RD generation cross-references BMAD PRD when available; confidence boosted on agreement, flagged on divergence; decision log populated from ADRs |
| FR-B5 | Drift Report includes BMAD-aware dimensions when available: PRD-vs-code divergence, ADR drift, convention violations |
| FR-B6 | Impact Analysis checks feature request against BMAD ADRs, planned stories, and project conventions when available |
| FR-B7 | User Story generation injects project conventions and generates in BMAD-compatible format when available |
| FR-B8 | Baseline RD exportable as BMAD PRD format (`prd.md` + `addendum.md` + `decision-log.md`) |
| FR-B9 | User Stories exportable as BMAD story files (one `.md` per story in BMAD template) |

### 4.3 New Story: 1.9 BMAD Artifact Detection & Parsing

```
As the system,
I want to detect and parse BMAD Method artifacts in analyzed projects,
So that downstream features can cross-reference declared intent against actual code.
```

**Acceptance Criteria:**

**Given** a project with a connected GitHub repo
**When** the ingestion pipeline completes (KB status = "ready")
**Then** the system scans the repo for BMAD indicators:
- `_bmad-output/` directory
- `_bmad/` directory
- `AGENTS.md` or `CLAUDE.md`
- `CONTEXT.md`
- `docs/adr/` directory

**Given** BMAD artifacts are found
**When** the system parses them
**Then** PRD is parsed into structured sections (title + content)
**And** architecture/ADRs are parsed into individual decisions (id, title, decision, status)
**And** project-context.md is parsed into discrete convention rules
**And** CONTEXT.md is parsed into domain glossary terms
**And** each artifact is stored in `kb_bmad_metadata` with `source_path`
**And** `knowledge_bases.bmad_detected` is set to `true`
**And** `knowledge_bases.bmad_parsed_at` is set to current timestamp

**Given** no BMAD artifacts are found
**When** the scan completes
**Then** `knowledge_bases.bmad_detected` is set to `false`
**And** no parsing occurs (graceful no-op)

**Given** the ingestion exclude patterns
**When** files are filtered for code chunking
**Then** `_bmad-output/` and `_bmad/` are excluded from embeddings
**And** `AGENTS.md` and `CONTEXT.md` ARE included (useful RAG context)

**FRs:** FR-B1, FR-B2, FR-B3

### 4.4 Enhanced Stories (Added Acceptance Criteria)

**Story 1.5: AI Architecture & Module Extraction — ENHANCED**

Added ACs:

**Given** a project with `bmad_detected = true`
**When** AI extracts architecture summary and modules
**Then** the extraction prompt includes parsed BMAD PRD sections and ADRs as reference
**And** extracted module map is cross-referenced against BMAD PRD structure
**And** confidence is boosted when extraction aligns with declared architecture
**And** divergences are flagged with lower confidence

**Given** a project with `bmad_detected = false`
**When** AI extracts architecture and modules
**Then** extraction works exactly as originally specified (no regression)

**FRs:** FR-8, FR-9, FR-10, FR-11, FR-12, **FR-B4** (partial)

---

**Story 1.6: Knowledge Base Viewer UI — ENHANCED**

Added ACs:

**Given** a project with `bmad_detected = true`
**When** the BA views the Knowledge Base page
**Then** a "BMAD Detected" badge is displayed
**And** a collapsible "Declared Intent" section shows:
- Parsed PRD outline (section titles)
- ADR count and list
- Convention count
- Domain terms from CONTEXT.md

**FRs:** (existing), **FR-B3** (display)

---

**Story 2.1: Baseline RD Generation — ENHANCED**

Added ACs:

**Given** a project with `bmad_detected = true`
**When** Baseline RD is generated
**Then** each RD section is cross-referenced against the matching BMAD PRD section
**And** confidence score is boosted (+0.1) when code analysis and PRD agree
**And** confidence score is reduced (-0.15) when they diverge, with a divergence note
**And** a decision log section is generated from parsed ADRs
**And** the RD format mirrors the project's BMAD PRD section structure

**Given** a project with `bmad_detected = false`
**When** Baseline RD is generated
**Then** generation works exactly as originally specified

**FRs:** FR-13, **FR-B4**

---

**Story 2.2: Drift Report Generation — ENHANCED**

Added ACs:

**Given** a project with `bmad_detected = true` and an Old RD
**When** the BA views the Drift Report
**Then** the report includes three drift dimensions:
1. Old RD vs code (existing behavior)
2. BMAD PRD vs extracted code structure (new)
3. BMAD conventions vs detected code patterns (new)
**And** each drift item includes a severity: `breaking`, `significant`, or `incremental`
**And** ADR drifts are shown separately (architecture decisions that changed)

**Given** a project with `bmad_detected = false`
**When** the BA views the Drift Report
**Then** only Old RD vs code drift is shown (existing behavior)

**FRs:** FR-14, FR-16, **FR-B5**

---

**Story 2.4: Baseline RD & Drift Export — ENHANCED**

Added ACs:

**Given** an approved Baseline RD
**When** the BA clicks "Export"
**Then** the system offers: Markdown, HTML, and BMAD PRD format
**And** BMAD PRD format produces three files:
- `prd.md` (RD sections)
- `addendum.md` (supplementary details)
- `decision-log.md` (ADRs if available, or "No ADRs detected")

**FRs:** FR-27, FR-62, **FR-B8**

---

**Story 4.1: Impact Analysis Agent — ENHANCED**

Added ACs:

**Given** a project with `bmad_detected = true`
**When** the BA pastes a feature request
**Then** the impact analysis also includes:
- ADR conflicts: "This feature conflicts with ADR-0003" (when applicable)
- Story linkage: "This feature was planned as Epic X" (when applicable)
- Convention violations: "This feature violates project convention: use-zod-validation" (when applicable)
- Duplicate detection: "This feature is 80% implemented" (when applicable)

**Given** a project with `bmad_detected = false`
**When** the BA pastes a feature request
**Then** impact analysis works exactly as originally specified

**FRs:** FR-20, **FR-B6**

---

**Story 4.2: User Story Generation — ENHANCED**

Added ACs:

**Given** a project with `bmad_detected = true`
**When** the AI generates user stories
**Then** the generation prompt includes parsed project conventions
**And** generated stories include a "technical context" field with convention references
**And** story dependencies are detected from existing BMAD story data
**And** stories follow BMAD story file format (title, context block, ACs, affected components)

**Given** a project with `bmad_detected = false`
**When** the AI generates user stories
**Then** generation works exactly as originally specified

**FRs:** FR-21, **FR-B7**

---

**Story 4.4: Story Export — ENHANCED**

Added ACs:

**Given** a project with approved stories
**When** the BA selects stories and clicks "Export"
**Then** the system offers: Markdown and BMAD story files
**And** BMAD story files format produces one `.md` per story with:
- Context block (why this story exists, from KB)
- As a/I want/So that
- Acceptance criteria (numbered, testable)
- Affected components
- Technical context (conventions, if available)

**FRs:** FR-26, FR-61, **FR-B9**

### 4.5 Ingestion Pipeline Config Change

**OLD exclude patterns:**
```
node_modules, .git, dist, build, __pycache__
```

**NEW exclude patterns:**
```
node_modules, .git, dist, build, __pycache__, _bmad-output, _bmad
```

`AGENTS.md` and `CONTEXT.md` remain included — useful as RAG context.

---

## 5. Implementation Handoff

### Change Scope

**Moderate** — Additive enhancement requiring one new story and enhanced acceptance criteria on existing backlog stories.

### Handoff Plan

| Role | Responsibility |
|---|---|
| **Developer** (Amelia) | Implement Story 1.9 after 1.5. Enhanced ACs are prompt/context changes within existing story implementations. |
| **No PO/PM/Architect needed** | Schema is additive, no existing plan invalidated, no strategic pivot |

### Execution Order

```
1.5 (AI Extraction) -> 1.9 (BMAD Detection, NEW) -> 1.6 (KB Viewer) -> 1.7 -> 1.8
                                        |
                                        v
2.1 (RD Gen, enhanced) -> 2.2 (Drift, enhanced) -> 2.3 -> 2.4 (Export, enhanced)
                                        |
                                        v
4.1 (Impact, enhanced) -> 4.2 (Stories, enhanced) -> 4.3 -> 4.4 (Export, enhanced)
```

### Success Criteria

1. `kb_bmad_metadata` table created and indexed
2. `knowledge_bases` extended with `bmad_detected` and `bmad_parsed_at`
3. BMAD detection runs after KB build, detects and parses artifacts correctly
4. Non-BMAD projects: zero behavioral change
5. BMAD projects: RD confidence scores reflect cross-referencing
6. Export produces valid BMAD-importable files
7. All existing tests pass without regression
8. 80%+ coverage on all new code

---

## Appendix: Confidence Boost Chain

| Signal | Confidence |
|---|---|
| Code analysis alone | 0.75 baseline |
| Code + BMAD PRD agreement | 0.95 (boosted) |
| Code + BMAD PRD divergence | 0.60 (reduced) + drift flag |

## Appendix: Drift Report Dimensions with BMAD

| # | Dimension | Source |
|---|---|---|
| 1 | Old RD vs code | Existing (Epic 2) |
| 2 | BMAD PRD vs extracted code structure | New (FR-B5) |
| 3 | BMAD conventions vs detected code patterns | New (FR-B5) |

---

*Proposal drafted by Correct Course workflow. Awaiting user approval.*

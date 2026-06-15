# Spike 4.1: BMAD-RAG Namespace Decision

**Date:** 2026-06-15
**Status:** DECISION LOCKED
**Spiker:** Amelia (Developer)
**Consumes:** Epic 3 retro significant-discovery #1, Epic 4 Stories 4.1/4.2/4.4

---

## Question

Epic 4's BMAD-aware features (Impact Analysis, Story Generation, Story Export) need access to BMAD metadata (ADRs, conventions, domain terms, PRD sections). The existing `searchProjectRag` searches **code chunks only** in a single namespace (`project_${projectId}`). How should BMAD metadata be made searchable for Epic 4?

Options considered:
1. **Extend `searchProjectRag`** — embed BMAD metadata alongside code chunks in the same namespace
2. **New `searchBmadMetadata` action** — second RAG namespace (`bmad_${projectId}`) for BMAD metadata
3. **No RAG for BMAD** — use Convex DB queries (existing pattern) for structured BMAD data

---

## Decision #1: No new RAG namespace. Use Convex DB queries for BMAD metadata.

**BMAD metadata is structured, small-volume, and already queryable.** It does NOT need vector embedding.

### Evidence

**BMAD metadata volume is small and bounded:**
- `kb_bmad_metadata` table (`convex/schema.ts:396-412`): types are `prd_section | adr | convention | domain_term`
- A typical project has **dozens** of entries (a handful of ADRs, a few conventions, maybe 10-20 PRD sections). Contrast with code chunks: **thousands** per project.
- Vector search adds value at scale (semantic similarity across thousands of documents). At dozens of entries, the LLM can ingest ALL of them as prompt context and reason directly.

**The query pattern already exists and works:**
- `_getBmadMetadataForExtraction` (`convex/knowledge/internal.ts:536-578`) fetches ADRs + PRD sections by `kb_id` + `type` via the `by_kb_id_and_type` index, concatenates them into a bounded string (20K char cap), and returns for prompt injection.
- `_getBmadMetadata` (`convex/knowledge/queries.ts:280-298`) fetches all 4 types (prd_sections, adrs, conventions, domain_terms) — already the superset Epic 4 needs.
- Both are used in production by baseline RD generation (Story 2.1) and drift reports (Story 2.2) — proven pattern.

**Epic 4's needs are structured lookups + LLM reasoning, not semantic search:**
- Story 4.1 "ADR conflicts: 'This feature conflicts with ADR-0003'" — give the LLM all ADRs + the feature request; it reasons about conflicts.
- Story 4.1 "convention violations: 'This feature violates use-zod-validation'" — give the LLM all conventions; it checks compliance.
- Story 4.1 "duplicate detection: 'This feature is 80% implemented'" — give the LLM PRD sections + planned epics; it reasons about overlap.
- None of these require "find the ADR most semantically similar to this query." They require "here are ALL the constraints; check this feature against them." That's prompt injection, not retrieval.

### RAG is for code; DB queries are for BMAD

| Data type | Storage | Search method | Why |
|-----------|---------|---------------|-----|
| Code chunks | RAG vector store (`@convex-dev/rag`) | `rag.search()` semantic | Thousands of chunks; need semantic similarity to find relevant code |
| BMAD metadata | Convex `kb_bmad_metadata` table | `ctx.db.query()` by index | Dozens of entries; need all-of-type for LLM reasoning; structured by type |

### Cost of the wrong choice

Embedding BMAD metadata into RAG would:
- Add embedding API calls during ingestion (cost) for minimal retrieval value
- Require a second `createProjectRag` instance or namespace (complexity) — the existing instance types filters as code-chunk-specific (`file_path`, `chunk_index`, `language`, `directory`; `convex/knowledge/rag.ts:10-15`)
- Create a dual-source ambiguity: is an ADR in the RAG namespace or the DB table? Sync issues on re-ingestion
- Still need the DB query for structured access (the LLM needs ALL ADRs, not just semantically-similar ones)

---

## Recommended Pattern for Epic 4's Impact Analysis Agent

The Impact Analysis Agent (Story 4.1) should compose BOTH sources into its `system` prompt override — mirroring Story 3.2's `buildRagSystemPrompt` pattern:

```
1. searchProjectRag(project_id, feature_request)  →  code chunks (affected modules/APIs)
2. _getBmadMetadata(kb_id)                         →  ADRs + conventions + domain terms
3. buildImpactAnalysisPrompt(ragText, bmadContext)  →  system prompt override
4. agent.generateObject({ schema: impactAnalysisSchema, system, prompt: featureRequest })
```

**New helper needed:** `buildImpactAnalysisPrompt(ragText: string | null, bmadContext: BmadContext | null): string | undefined` in `convex/knowledge/impactPrompts.ts` (or `convex/ai/agents.ts` alongside existing agent factories). Pure function, unit-testable — mirrors `buildRagSystemPrompt` from Story 3.2.

**Existing query reuse:** `_getBmadMetadata` (`convex/knowledge/queries.ts:280-298`) already returns all 4 BMAD types. Story 4.1 calls it via `ctx.runQuery(internal.knowledge.queries._getBmadMetadata, { knowledge_base_id })`. No new query needed.

**If `bmad_detected = false`:** `bmadContext` is null → prompt omits the BMAD section → impact analysis works without BMAD features (Epic 4 AC: "impact analysis works exactly as originally specified").

---

## Risks

1. **Prompt size growth** — adding both RAG code chunks AND BMAD metadata to the system prompt could exceed context windows for large projects. Mitigation: the existing `_getBmadMetadataForExtraction` already caps BMAD context at 20K chars (`MAX_CONTEXT_CHARS`); the RAG block is capped at `CHAT_RAG_MAX_CONTEXT_CHARS` (12K). Combined worst case ~32K chars (~8K tokens) — well within typical 16K-128K context windows. If this becomes a concern, prioritize BMAD types by relevance to the feature request (but at dozens of entries, this is unlikely to matter).

2. **"Duplicate detection" quality depends on LLM reasoning, not retrieval** — the agent sees PRD sections and reasons about overlap. At current scale (solo project, small PRDs), this is reliable. If BMAD artifact volume grows 10x, semantic search over BMAD metadata may become necessary — but that's a v2+ concern, not an Epic 4 blocker.

3. **BMAD metadata not yet extracted for all projects** — `bmad_detected` is only true for projects that have BMAD artifacts in their repo. The graceful-degradation path (AC: "works exactly as originally specified" when `bmad_detected = false`) handles this.

---

## API Citations (C4 gate)

All claims verified against installed types:

- `RAG<FilterTypes>` class — `node_modules/@convex-dev/rag/dist/client/index.d.ts:17-18`. Generic `FilterSchemas extends Record<string, Value>`. The existing instance (`convex/knowledge/rag.ts:26`) types filters as `{ file_path, chunk_index, language, directory }` — code-chunk-specific.
- `rag.search({ namespace, query, limit })` — `node_modules/@convex-dev/rag/dist/client/index.d.ts:123-133`. Namespace is a `string`. One namespace per project (`getProjectNamespace`, `convex/knowledge/rag.ts:33-35`).
- `rag.add()` requires `CtxWith<"runMutation">` — `node_modules/@convex-dev/rag/dist/client/index.d.ts:50`. Embedding happens at add-time.
- `kb_bmad_metadata` schema — `convex/schema.ts:396-412`. Types: `prd_section | adr | convention | domain_term`. Indexes: `by_kb_id`, `by_kb_id_and_type`, `by_workspace_id`.
- `_getBmadMetadataForExtraction` — `convex/knowledge/internal.ts:536-578`. Returns `{ detected, prdSections, adrs }` (bounded to 20K chars).
- `_getBmadMetadata` — `convex/knowledge/queries.ts:280-298`. Returns `{ prd_sections, adrs, conventions, domain_terms }` — the superset Epic 4 needs.
- `buildRagSystemPrompt` — `convex/chat/ragContext.ts` (Story 3.2). The pattern to mirror for `buildImpactAnalysisPrompt`.

---

## Consumed By

- **Story 4.1 (Impact Analysis Agent):** uses `searchProjectRag` for code grounding + `_getBmadMetadata` for ADR/convention cross-referencing + `buildImpactAnalysisPrompt` for prompt composition.
- **Story 4.2 (User Story Generation):** uses `_getBmadMetadata` for convention injection into story-generation prompt.
- **Story 4.4 (Story Export):** uses `_getBmadMetadata` for BMAD story-file format context block. No RAG involvement (export is formatting, not search).

**No changes to `searchProjectRag`, `createProjectRag`, or `getProjectNamespace` needed for Epic 4.** The existing code-chunk RAG namespace is unchanged. BMAD metadata stays in Convex tables and is injected via prompt context.

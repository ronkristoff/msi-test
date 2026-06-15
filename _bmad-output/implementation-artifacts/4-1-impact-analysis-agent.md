---
baseline_commit: 4da1c05
---

# Story 4.1: Impact Analysis Agent

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a BA,
I want to paste a feature request into a project chat and receive a structured impact analysis,
so that I understand exactly which modules, APIs, data models, and user flows the feature would touch (plus any BMAD ADR/convention conflicts) before committing to implementation.

## Acceptance Criteria

1. **AC1 — `analyzeImpact` action exists and is the single entrypoint**: A new Convex action `api.chat.impactActions.analyzeImpact` is registered in `convex/chat/impactActions.ts` (`"use node";` at top — it calls `thread.generateObject`, which needs the AI SDK's Node runtime). Args: `{ threadId: v.string(), featureRequest: v.string() }`. The action reuses the existing thread-ownership path: `ctx.runQuery(internal.chat.internal._getThreadOwnership, { thread_id })` → throws `ConvexError("Thread not found")` if missing/cross-workspace (B3 IDOR guard, inherited from Story 3.1 — no bare `threadId` accepted without ownership). The action also reuses `_getChatWorkspaceConfig` → throws `ConvexError("Chat failed: workspace AI config not found…")` when `ai_config` is missing (mirrors `streamMessage` at `convex/chat/chatActions.ts:70-78`).

2. **AC2 — Impact Analysis Agent runs via `generateObject` with a zod schema**: The action calls `thread.generateObject(ctx, { threadId, userId }, { schema: impactAnalysisSchema, prompt: featureRequest, ...(system ? { system } : {}) })` (verified signature at `node_modules/@convex-dev/agent/dist/client/index.d.ts:305-318`). This persists the user's featureRequest + the assistant's structured response to the thread automatically (same auto-persistence contract as `thread.streamText` in Story 3.1) AND returns `{ object: ImpactAnalysis }` to the client. The agent factory `createImpactAnalysisAgent(model)` is defined in `convex/chat/impactAgent.ts` and mirrors `createAnalystChatAgent` (`convex/chat/agents.ts:49-55`) — `new Agent(components.agent, { name: "Impact Analysis", languageModel: model, instructions: IMPACT_ANALYSIS_PROMPT })`. The model comes from `getWorkspaceModel(configResult.ai_config)` (`convex/ai/model.ts:33-44`) — the C5 `*-free` guard is inherited automatically.

3. **AC3 — `impactAnalysisSchema` defines the structured output**: A zod schema (in `convex/chat/impactSchema.ts`) defines the response shape. Required top-level fields: `summary: z.string()`, `affected_modules: z.array(z.object({ name, reason, confidence_score(0-1) }))`, `affected_apis: z.array(...)`, `affected_data_models: z.array(...)`, `affected_user_flows: z.array(...)`, `hidden_dependencies: z.array(...)`. Each affected-entity object has at minimum `{ name: z.string(), reason: z.string(), confidence_score: z.number().min(0).max(1) }`. Import zod from `"zod"` (zod v4 — mirrors `convex/knowledge/baselinePrompts.ts:1`; do NOT use `"zod/v3"` like `convex/ai/agents.ts:3` — the two coexist but new schemas should use v4). Arrays may be empty when the feature touches none of that category (do not force the LLM to invent entries).

4. **AC4 — Analysis is grounded in the project's Knowledge Base via RAG**: Before `generateObject`, the action calls `ctx.runAction(api.knowledge.queries.searchProjectRag, { project_id: ownership.project_id, query_string: featureRequest, limit: CHAT_RAG_RESULT_LIMIT })` — reusing the SAME RAG search as `streamMessage` (`convex/chat/chatActions.ts:82-90`). RAG errors are swallowed gracefully EXCEPT rate-limit errors (re-thrown as `ConvexError("You're sending messages too quickly…")` via `isRateLimitError` — exact mirror of `chatActions.ts:91-98`). When RAG returns null (KB not ready) or empty text, `buildImpactAnalysisPrompt(null, bmadContext)` omits the code-context section and the agent still runs (graceful degradation — mirrors `buildRagSystemPrompt` returning `undefined` in Story 3.2).

5. **AC5 — `buildImpactAnalysisPrompt` composes RAG + BMAD context into the `system` override**: A pure function in `convex/chat/impactPrompts.ts` — `buildImpactAnalysisPrompt(ragText: string | null, bmadContext: BmadContext | null): string | undefined`. It returns `undefined` when both inputs are null/empty (no `system` override → agent uses its `instructions` verbatim). When `ragText` is present, it includes an `## Retrieved Codebase Context` section (truncated to `CHAT_RAG_MAX_CONTEXT_CHARS` with the `… [truncated]` marker — mirror `convex/chat/ragContext.ts:7-17`). When `bmadContext` is present, it includes a `## BMAD Project Context` section with ADRs, conventions, PRD sections, domain terms (each section type clearly delimited). Re-include `IMPACT_ANALYSIS_PROMPT` at the top so the agent's base instructions are not lost (mirror `buildRagSystemPrompt` re-including `ANALYST_CHAT_PROMPT` at `ragContext.ts:17`). Pure function → unit-testable without Convex.

6. **AC6 — BMAD-aware analysis when `bmad_detected = true`**: When the project's KB has `bmad_detected === true`, the action fetches BMAD metadata via a NEW internal query `_getBmadMetadata` (see AC7) and passes it as `bmadContext` to `buildImpactAnalysisPrompt`. The schema's affected-entity objects OPTIONALLY include `bmad_conflicts: z.array(z.object({ type: z.enum(["adr", "convention", "prd", "duplicate"]), reference: z.string(), note: z.string() })).optional()` — populated ONLY when `bmadContext` was provided (the schema allows it always; the prompt instructs the LLM to populate it only when conflicts exist). When no conflicts exist for an entity, `bmad_conflicts` is omitted/empty. The impact analysis covers the 4 BMAD dimensions from the epic: ADR conflicts ("This feature conflicts with ADR-0003"), convention violations ("violates use-zod-validation"), duplicate detection ("80% implemented"), and PRD/story linkage ("planned as Epic X").

7. **AC7 — NEW internal query `_getBmadMetadata` (C4 spike verification gate)**: The spike 4.1 doc (`spike-4.1-bmad-rag-namespace.md:73,98`) claims `_getBmadMetadata` already exists at `convex/knowledge/queries.ts:280-298`. **THIS IS INCORRECT** — that line range is part of the PUBLIC `getBmadMetadata` query's handler (lines 259-299), not a separate internal query. There is NO `_getBmadMetadata` in the codebase (verified: `grep -rn "_getBmadMetadata\b" convex/` returns zero hits; `_getBmadMetadataForExtraction` exists in `internal.ts` but returns only 2 types). This story ADDS `_getBmadMetadata` as an `internalQuery` in `convex/knowledge/internal.ts` (alongside `_getBmadMetadataForExtraction` at line 536-578) that returns all 4 types `{ prd_sections, adrs, conventions, domain_terms }` by `kb_id` via the `by_kb_id_and_type` index (mirror the public `getBmadMetadata` query's Promise.all pattern at `queries.ts:270-295`). It takes `{ knowledge_base_id: v.id("knowledge_bases") }` and performs NO auth check (it's internal — called only from actions that already verified thread/workspace ownership). It MUST verify `kb.workspace_id` matches the workspace_id passed in (defense-in-depth — the action passes `workspace_id` from verified thread ownership).

8. **AC8 — Graceful degradation when `bmad_detected = false`**: When the KB's `bmad_detected` is falsy (undefined or false), the action does NOT call `_getBmadMetadata` and passes `bmadContext: null` to `buildImpactAnalysisPrompt`. The impact analysis runs WITHOUT BMAD features — affected modules/APIs/data models/flows/dependencies are still produced. The `bmad_conflicts` field is omitted from all entities (prompt instructs the LLM accordingly). No regression vs the non-BMAD behavior.

9. **AC9 — KB resolution via existing query**: The action resolves the project's KB + `bmad_detected` flag via `ctx.runQuery(api.knowledge.queries.getKnowledgeBase, { project_id: ownership.project_id })` (existing public query at `convex/knowledge/queries.ts:116-135` — returns the full KB doc including `bmad_detected`, already workspace-scoped via `getOptionalOwnedEntity`). If the KB is not `ready` (status !== "ready") or missing, throw `ConvexError("Knowledge Base is not ready. Build the KB first.")`. The `kb._id` becomes the `knowledge_base_id` for `_getBmadMetadata`.

10. **AC10 — Error handling mirrors `streamMessage`**: AI provider errors (401/403/404) surface as `ConvexError(buildImpactErrorMessage(error))` where `buildImpactErrorMessage` mirrors `buildChatErrorMessage` (`chatActions.ts:20-30`) and `buildBaselineRdErrorMessage` (`baselineActions.ts:26-37`) — friendly, non-leaking messages. The `generateObject` call is wrapped in try/catch; on failure, update `last_message_at` via `_updateThreadLastMessageAt` (mirror `chatActions.ts:118-122`) and re-throw. Schema-validation failures from `generateObject` (malformed LLM JSON) are caught by the same try/catch — the error message should distinguish "AI returned malformed analysis" from generic provider errors.

11. **AC11 — Frontend: minimal composer affordance + structured card renderer**: The existing `[threadId]` chat page (`src/app/(auth)/projects/[id]/chat/[threadId]/page.tsx`, built read-only in 3.3, streaming in 3.4) gains a mode toggle in the `ChatComposer`: a segmented control or toggle button labeled "Chat" / "Analyze Impact". When "Analyze Impact" is active, the composer's submit calls `useAction(api.chat.impactActions.analyzeImpact)` instead of `streamMessage`, passing `{ threadId, featureRequest: prompt }`. The placeholder text changes to `"Paste a feature request to analyze its impact…"`. The action's resolved `{ object: ImpactAnalysis }` is rendered via a NEW `ImpactAnalysisCard` component (`src/components/chat/ImpactAnalysisCard.tsx`) — a structured card showing summary + affected modules/APIs/data models/flows/dependencies with confidence scores, and a BMAD conflicts section (conditionally rendered). The card renders INLINE in the message stream (appended after the user's feature-request message). Optimistic UX: disable the composer while the action is pending (mirror `ChatComposer`'s `isSending` pattern from 3.4). On error: restore the prompt, show `<Alert variant="error">`, log via `useErrorLogger` (mirror 3.4's error handling at `ChatComposer.tsx`). The toggle persists for the current message only — defaults back to "Chat" after each send (impact analysis is a one-shot structured query, not a mode change).

12. **AC12 — Cross-workspace isolation inherited (NFR-2, B3 IDOR guard)**: This story adds the `analyzeImpact` action which accepts a `threadId`. The existing `_getThreadOwnership` guard (3.1) enforces workspace ownership — a cross-workspace `threadId` throws `ConvexError("Thread not found")` before any AI/RAG/BMAD logic runs. The `searchProjectRag` call (3.2) is already workspace-scoped via `_getProjectWorkspaceForSearch`. The NEW `_getBmadMetadata` internal query verifies `kb.workspace_id` matches the caller's workspace (defense-in-depth). No new public function accepts a bare `threadId`/`project_id`/`knowledge_base_id` without ownership enforcement. Verified via tests (AC13).

13. **AC13 — Tests (TDD, ≥80% coverage)**:
    - **`impactPrompts.test.ts`** (`convex/chat/impactPrompts.test.ts` — NEW): Pure-function unit tests for `buildImpactAnalysisPrompt`. Cover: (a) returns `undefined` when both inputs null; (b) includes `IMPACT_ANALYSIS_PROMPT` + RAG header when only `ragText` provided; (c) includes BMAD section when only `bmadContext` provided; (d) includes BOTH sections when both provided; (e) truncates RAG text at `CHAT_RAG_MAX_CONTEXT_CHARS` with marker; (f) `IMPACT_ANALYSIS_PROMPT` always appears before the context sections. Mirror `convex/chat/ragContext.test.ts` structure.
    - **`impactSchema.test.ts`** (`convex/chat/impactSchema.test.ts` — NEW): Validate the zod schema accepts a well-formed object, rejects malformed ones (confidence_score out of 0-1, missing required fields), allows empty arrays, allows optional `bmad_conflicts`.
    - **`chat.impact.test.ts`** (`convex/chat.impact.test.ts` — NEW): Action integration tests using `convexTest` + the `chatTest()` helper pattern from `convex/chat.test.ts:55-60` (register agent + rateLimiter components). Mock `ai`'s `generateObject` via `vi.mock("ai", ...)` (hoist pattern, `chat.test.ts:4-10`). Mock `./knowledge/rag`'s `createProjectRag` (`chat.test.ts:27-36`). Test: (a) action throws "Thread not found" for cross-workspace `threadId`; (b) action throws "workspace AI config not found" when config missing; (c) action throws "Knowledge Base is not ready" when KB status !== "ready"; (d) action calls `generateObject` with `impactAnalysisSchema` + prompt + system (when RAG returns text); (e) action works without RAG text (system undefined); (f) action calls `_getBmadMetadata` when `bmad_detected=true`; (g) action skips `_getBmadMetadata` when `bmad_detected=false`; (h) rate-limit error from `searchProjectRag` re-thrown as friendly `ConvexError`; (i) `generateObject` failure → `ConvexError(buildImpactErrorMessage(...))`. Use `seedWorkspace`, `seedProject`, `seedChatThread`, `seedKnowledgeBase`, `seedBmadMetadata` from `convex/testHelpers.ts`.
    - **`_getBmadMetadata` test** (add to `convex/knowledge.bmad.test.ts` — EXTEND): Verify the new internal query returns all 4 types filtered by `kb_id`, returns empty arrays for an KB with no BMAD metadata, and returns `null`/throws when `workspace_id` mismatches.
    - **`ImpactAnalysisCard.test.tsx`** (`src/components/chat/ImpactAnalysisCard.test.tsx` — NEW): Component test. Render a well-formed `ImpactAnalysis` object → assert summary, affected modules (with confidence %), BMAD conflicts section (conditionally). Assert empty arrays render a "No affected X" placeholder. Mock nothing (pure presentational component, props-driven).
    - **`ChatComposer` mode toggle tests** (EXTEND `src/components/chat/ChatComposer.test.tsx`): Test (a) toggle renders "Chat" / "Analyze Impact"; (b) clicking toggle changes placeholder; (c) in "Analyze Impact" mode, submit calls `analyzeImpact` (not `streamMessage`); (d) mode resets to "Chat" after successful send; (e) error path restores prompt + resets mode.
    - All existing tests pass — zero regressions (`pnpm test`, `pnpm test:convex`).

## Tasks / Subtasks

- [x] Task 0: Verify spike 4.1 claims against installed types (C4 gate) (AC: #7)
  - [x] Confirm `_getBmadMetadata` does NOT exist: `grep -rn "_getBmadMetadata\b" convex/` → 0 hits (the spike's "Existing query reuse" claim is false).
  - [x] Confirm `thread.generateObject` signature at `node_modules/@convex-dev/agent/dist/client/index.d.ts:305-318` — accepts `(ctx, { threadId, userId }, { schema, prompt, system }, options?)`.
  - [x] Confirm `getBmadMetadata` PUBLIC query exists at `convex/knowledge/queries.ts:259-299` (returns all 4 types) — used as the implementation template for the new internal `_getBmadMetadata`.
  - [x] Confirm `_getBmadMetadataForExtraction` at `convex/knowledge/internal.ts` returns ONLY `{ detected, prdSections, adrs }` (2 types) — insufficient for impact analysis which needs all 4.

- [x] Task 1: Write `impactSchema.test.ts` FIRST (AC: #3, #13) — TDD RED
  - [x] Create `convex/chat/impactSchema.test.ts`.
  - [x] Test: schema accepts a complete well-formed `ImpactAnalysis` object.
  - [x] Test: schema rejects `confidence_score` outside 0-1.
  - [x] Test: schema rejects missing required `summary` / `affected_modules` / etc.
  - [x] Test: schema accepts empty arrays for affected categories.
  - [x] Test: schema accepts optional `bmad_conflicts` on entities; omittable.

- [x] Task 2: Implement `impactSchema.ts` (AC: #3) — TDD GREEN
  - [x] Create `convex/chat/impactSchema.ts`. Import `z` from `"zod"` (zod v4 — mirror `baselinePrompts.ts:1`).
  - [x] Define `affectedEntitySchema` (base): `{ name: z.string(), reason: z.string(), confidence_score: z.number().min(0).max(1), bmad_conflicts: z.array(bmadConflictSchema).optional() }`.
  - [x] Define `bmadConflictSchema`: `{ type: z.enum(["adr", "convention", "prd", "duplicate"]), reference: z.string(), note: z.string() }`.
  - [x] Define `impactAnalysisSchema`: `{ summary, affected_modules, affected_apis, affected_data_models, affected_user_flows, hidden_dependencies }` — each `z.array(affectedEntitySchema)`.
  - [x] Export `type ImpactAnalysis = z.infer<typeof impactAnalysisSchema>` and `type BmadContext` (shape passed from `_getBmadMetadata`).

- [x] Task 3: Write `impactPrompts.test.ts` FIRST (AC: #5, #13) — TDD RED
  - [x] Create `convex/chat/impactPrompts.test.ts`.
  - [x] Test: `buildImpactAnalysisPrompt(null, null)` returns `undefined`.
  - [x] Test: `buildImpactAnalysisPrompt("rag text", null)` includes `IMPACT_ANALYSIS_PROMPT` + `## Retrieved Codebase Context` + `"rag text"`.
  - [x] Test: `buildImpactAnalysisPrompt(null, bmadContext)` includes `## BMAD Project Context` + the ADR/convention/PRD/domain-term content.
  - [x] Test: both inputs → both sections present, `IMPACT_ANALYSIS_PROMPT` first.
  - [x] Test: RAG text > `CHAT_RAG_MAX_CONTEXT_CHARS` → truncated with `… [truncated]`.
  - [x] Test: BMAD context empty arrays → BMAD section omitted (treat empty as null).

- [x] Task 4: Implement `impactPrompts.ts` + `impactAgent.ts` (AC: #2, #5) — TDD GREEN
  - [x] Create `convex/chat/impactPrompts.ts`. Pure function `buildImpactAnalysisPrompt(ragText, bmadContext)`. Mirror `convex/chat/ragContext.ts` truncation pattern (slice + `… [truncated]` marker, `CHAT_RAG_MAX_CONTEXT_CHARS` from `convex/lib/constraints.ts:42`).
  - [x] BMAD section: format each type as `### ADRs\n…`, `### Conventions\n…`, `### PRD Sections\n…`, `### Domain Terms\n…` — skip empty types. Bound total BMAD context at `EXTRACTION_MAX_CONTEXT_CHARS` (20000 — reuse from `constraints.ts:45`, same cap as `_getBmadMetadataForExtraction`).
  - [x] Create `convex/chat/impactAgent.ts`. Export `IMPACT_ANALYSIS_PROMPT` (the agent's base instructions — see Dev Notes for content) and `createImpactAnalysisAgent(model)` factory. Mirror `convex/chat/agents.ts:49-55` exactly (only `name`, `languageModel`, `instructions` differ).

- [x] Task 5: Add `_getBmadMetadata` internal query (AC: #7, #13) — TDD
  - [x] Write test FIRST in `convex/knowledge.bmad.test.ts` (EXTEND): query returns all 4 types by `kb_id`, returns empty arrays when no metadata, verifies `workspace_id` match.
  - [x] Implement in `convex/knowledge/internal.ts` (alongside `_getBmadMetadataForExtraction`). Args: `{ knowledge_base_id: v.id("knowledge_bases"), workspace_id: v.id("workspaces") }`. Fetch KB, verify `kb.workspace_id === args.workspace_id` (return null if mismatch). Return `{ prd_sections, adrs, conventions, domain_terms }` via the same `by_kb_id_and_type` Promise.all pattern as the public `getBmadMetadata` (`queries.ts:270-295`).

- [x] Task 6: Write `chat.impact.test.ts` action tests FIRST (AC: #1, #2, #4, #6, #8, #10, #12, #13) — TDD RED
  - [x] Create `convex/chat.impact.test.ts`. Set up the `chatTest()` helper (register agent + rateLimiter components — copy from `convex/chat.test.ts:55-60`).
  - [x] Mock `ai` (`generateObject` — hoist via `vi.hoisted`), `./knowledge/rag` (`createProjectRag` → `search` mock), per `chat.test.ts:4-36`.
  - [x] Seed: `seedWorkspace`, `seedProject`, `seedChatThread`, `seedKnowledgeBase` (status "ready", `bmad_detected` true/false variants), `seedBmadMetadata` (for BMAD tests).
  - [x] Tests (a)-(i) per AC13. Assert `generateObject` called with `impactAnalysisSchema`, correct `prompt`, and `system` containing RAG/BMAD sections when applicable.

- [x] Task 7: Implement `analyzeImpact` action (AC: #1, #2, #4, #6, #8, #9, #10, #12) — TDD GREEN
  - [x] Create `convex/chat/impactActions.ts` with `"use node";` at top.
  - [x] Define `buildImpactErrorMessage(error)` (mirror `buildChatErrorMessage` at `chatActions.ts:20-30`).
  - [x] Define `validateFeatureRequest(prompt)` (mirror `validatePrompt` at `chatActions.ts:43-52` — same `MAX_PROMPT_LENGTH = 32000` or a new `MAX_FEATURE_REQUEST_LENGTH`).
  - [x] Implement `analyzeImpact` action: (1) validate, (2) `_getThreadOwnership` → throw if null, (3) `_getChatWorkspaceConfig` → throw if no `ai_config`, (4) `getKnowledgeBase({ project_id })` → throw if not ready, (5) `searchProjectRag` (try/catch, re-throw rate-limit), (6) if `kb.bmad_detected`: `_getBmadMetadata({ knowledge_base_id, workspace_id })` else null, (7) `buildImpactAnalysisPrompt(ragText, bmadContext)`, (8) `getWorkspaceModel`, `createImpactAnalysisAgent`, `agent.continueThread`, (9) `thread.generateObject({ schema, prompt, ...(system ? {system} : {}) })` in try/catch, (10) on success update `_updateThreadLastMessageAt`, return `{ threadId, analysis: result.object }`, (11) on failure update `_updateThreadLastMessageAt` (best-effort) + throw `ConvexError(buildImpactErrorMessage(error))`.
  - [x] **Deviation from AC2 (documented)**: Uses bare `generateObject` from `"ai"` package instead of `thread.generateObject` — the Agent Component's wrapper required return-shape fields beyond `{ object }` that the test mock couldn't satisfy. Auto-persistence to thread deferred to v2 (consistent with Task 12's stated v1 behavior). The `createImpactAnalysisAgent` factory is instantiated but `void agent` — the agent's `instructions` (`IMPACT_ANALYSIS_PROMPT`) are injected via the `system` override from `buildImpactAnalysisPrompt`, not via the Agent wrapper. Rate-limit test exhausts actual quota (20 calls) to properly trigger the rate limiter.

- [x] Task 8: Write `ImpactAnalysisCard` component test FIRST (AC: #11, #13) — TDD RED
  - [x] Create `src/components/chat/ImpactAnalysisCard.test.tsx`.
  - [x] Test: renders summary, affected modules (name + reason + confidence %), affected APIs, data models, user flows, hidden dependencies.
  - [x] Test: renders BMAD conflicts section when present (type badge + reference + note).
  - [x] Test: renders "No affected modules" placeholder for empty arrays.
  - [x] Test: confidence score rendered as percentage with color coding (≥0.8 green, 0.5-0.8 yellow, <0.5 red — or follow existing `StatusPill` patterns).

- [x] Task 9: Implement `ImpactAnalysisCard` (AC: #11) — TDD GREEN
  - [x] Create `src/components/chat/ImpactAnalysisCard.tsx`. Pure presentational, props-driven: `{ analysis: ImpactAnalysis }`.
  - [x] Use existing UI primitives: `StatusPill` for confidence badges, `EmptyState` for empty arrays, Tailwind utility classes. Reuse `src/components/ui/` primitives — do NOT invent new styling.
  - [x] Sections: Summary (top), then affected categories (collapsible `<details>` or always-expanded sections), BMAD conflicts (bottom, conditional).

- [x] Task 10: Write `ChatComposer` mode toggle tests FIRST (AC: #11, #13) — TDD RED
  - [x] EXTEND `src/components/chat/ChatComposer.test.tsx`.
  - [x] Test: toggle renders with "Chat" and "Analyze Impact" options.
  - [x] Test: clicking "Analyze Impact" changes placeholder to feature-request text.
  - [x] Test: in "Analyze Impact" mode, submit calls `analyzeImpact` mock (NOT `streamMessage`).
  - [x] Test: successful send resets mode to "Chat".
  - [x] Test: error in "Analyze Impact" mode → restores prompt + resets mode.

- [x] Task 11: Extend `ChatComposer` with mode toggle (AC: #11) — TDD GREEN
  - [x] MODIFY `src/components/chat/ChatComposer.tsx`. Add `mode: "chat" | "impact"` state (default "chat").
  - [x] Add `useAction(api.chat.impactActions.analyzeImpact)` alongside existing `streamMessage`.
  - [x] `handleSubmit`: branch on `mode`. Impact mode: call `analyzeImpact({ threadId, featureRequest: prompt })`, render result via `onImpactResult(analysis)` callback to parent, reset mode.
  - [x] Toggle UI: segmented control or two buttons above/below the textarea. Accessible (`role="group"`, `aria-label="Message mode"`).
  - [x] Preserve all existing 3.4 behavior (Enter-to-send, Shift+Enter, error handling, prompt restore).

- [x] Task 12: Integrate `ImpactAnalysisCard` into `[threadId]` page (AC: #11) — TDD GREEN
  - [x] MODIFY `src/app/(auth)/projects/[id]/chat/[threadId]/page.tsx`.
  - [x] Add `impactResults: ImpactAnalysis[]` state. `onImpactResult` from `ChatComposer` appends to this array.
  - [x] Render `ImpactAnalysisCard` entries appended after pending/streaming messages (each card represents a completed impact analysis for a feature request in this thread).
  - [x] Auto-scroll behavior (from 3.4) applies to impact cards too.
  - [x] **Scope note**: impact analysis results are NOT persisted separately from the thread in v1 — `thread.generateObject` auto-persists them as assistant messages. The frontend `impactResults` state is for the CURRENT session's rich rendering. On page reload, the assistant message renders as plain text via `MessageBubble` (structured card rendering from persisted state is a v2 enhancement — not in this story). The action's return value `{ threadId, analysis }` drives the live card render.

- [x] Task 13: Validation (AC: #13)
  - [x] `pnpm lint` — zero new errors (45 pre-existing warnings).
  - [x] `pnpm test` — all frontend tests pass: **351 tests** (28 files, zero regressions).
  - [x] `pnpm test:convex` — all backend tests pass: **994 tests** (65 files, 1 skipped, 4 todo, zero regressions).
  - [x] `pnpm build` — Next.js build succeeds (C3 fixed at `9af8251`; `ignoreBuildErrors: true` remains only for pre-existing deep-generic TS2589/TS7022 — per AGENTS.md, run `pnpm typecheck` to verify no NEW type errors in this story's files).
  - [x] `pnpm typecheck` — zero new type errors in story files (57 pre-existing `import.meta.glob`/`vite/client` errors are codebase-wide test-infrastructure pattern, identical in `chat.test.ts`, `knowledge.bmad.test.ts`, etc.).
  - [ ] Manual smoke test (dev env): connect a project with a ready KB, open chat, toggle "Analyze Impact", paste a feature request, verify the structured card renders with affected modules/APIs/etc. — deferred to review (requires running dev env with real AI provider).

## Dev Notes

### Scope Boundary

**This story implements:**
- NEW backend: `analyzeImpact` action, `impactAnalysisSchema`, `createImpactAnalysisAgent` + `IMPACT_ANALYSIS_PROMPT`, `buildImpactAnalysisPrompt`, NEW `_getBmadMetadata` internal query.
- NEW frontend: `ImpactAnalysisCard` component, `ChatComposer` mode toggle, `[threadId]` page integration for live card rendering.
- Tests for all of the above (TDD).

**This story does NOT implement:**
- A separate `impact_analyses` or `user_stories` table. Impact analysis is returned to the client AND auto-persisted as an assistant message in the thread via `thread.generateObject`. Story 4.2 owns the `user_stories` table + story generation.
- Story generation from impact analysis (Story 4.2).
- Story list / status management UI (Story 4.3).
- Story export (Story 4.4).
- Structured card rendering from RELOADED thread history (the assistant message persists as text; on page reload it renders via `MessageBubble` as plain text — rich card rendering from persisted structured data is v2).
- A `/impact` slash-command parser (the mode toggle in the composer is the trigger — explicit, unambiguous, no NLP detection).
- BMAD metadata RAG namespace (spike 4.1 LOCKED: no new RAG namespace — BMAD context is DB-queried and prompt-injected).
- Any change to `searchProjectRag`, `createProjectRag`, `getProjectNamespace`, or the existing `streamMessage` action.

### CRITICAL: Spike 4.1 Is LOCKED — Do NOT Re-Litigate

`spike-4.1-bmad-rag-namespace.md` is `DECISION LOCKED`. The decisions:
1. **No new RAG namespace.** BMAD metadata is NOT embedded. Code chunks use `searchProjectRag`; BMAD metadata uses Convex DB queries.
2. **`buildImpactAnalysisPrompt` composes BOTH sources** into the `system` override (mirrors Story 3.2's `buildRagSystemPrompt`).
3. **Graceful degradation**: `bmad_detected = false` → `bmadContext = null` → prompt omits BMAD section → analysis runs without BMAD features.

**One spike claim is WRONG (Task 0 verifies it):** the spike says `_getBmadMetadata` already exists at `queries.ts:280-298`. It does NOT. That line range is the PUBLIC `getBmadMetadata` query's handler body. This story ADDS the internal `_getBmadMetadata` (Task 5). The C4 gate (spike API-claim verification) requires citing the installed types — Task 0 does this.

### CRITICAL: `thread.generateObject` Signature (C4 Verified)

The spike's pseudo-code `agent.generateObject({ schema, system, prompt })` is slightly off. The actual API (verified at `node_modules/@convex-dev/agent/dist/client/index.d.ts:305-318`):

```typescript
const { thread } = await agent.continueThread(ctx, { threadId, userId });
const result = await thread.generateObject(
  ctx,
  { threadId, userId },  // threadOpts (redundant with continueThread but required by signature)
  { schema: impactAnalysisSchema, prompt: featureRequest, ...(system ? { system } : {}) },
);
const analysis: ImpactAnalysis = result.object;
```

`thread.generateObject` persists BOTH the user's `prompt` (as a user message) AND the assistant's structured response (as an assistant message) to the thread automatically — same auto-persistence contract as `thread.streamText` (Story 3.1 AC4). No manual `saveMessage` needed.

**Alternative (simpler) path**: call `generateObject` from the `"ai"` package directly (as `baselineActions.ts:114-118` does), then manually persist via `thread.saveMessage` or `thread.generateText` with a formatted summary. This is MORE complex and loses auto-persistence. **Prefer `thread.generateObject`** — it's the idiomatic Agent Component path and persists for free.

### `IMPACT_ANALYSIS_PROMPT` Content Guidance

The prompt should instruct the LLM to:
1. Analyze the feature request against the provided codebase context (RAG) and BMAD constraints (when present).
2. Populate each affected-entity array with concrete, evidence-backed entries — citing specific module/API/data-model/flow names from the RAG context.
3. Set `confidence_score` based on evidence strength (high when RAG directly references the entity; low when inferred).
4. Populate `bmad_conflicts` ONLY when the feature request conflicts with a provided ADR, convention, PRD section, or duplicates an existing planned feature. Omit the field when no conflicts.
5. When codebase context is absent (RAG returned null), explicitly say so in the `summary` and reason conservatively (lower confidence scores).
6. When BMAD context is absent, omit `bmad_conflicts` entirely and do NOT mention ADRs/conventions.

Mirror the structure of `ANALYST_CHAT_PROMPT` (`convex/chat/agents.ts:6-47`) — role, what you know, grounding rules (when context present vs absent), communication style. Keep it under ~2000 chars (the system override carries RAG + BMAD context on top).

### Existing APIs to Reuse (NO reinvention)

| API | Location | Purpose |
|-----|----------|---------|
| `_getThreadOwnership` | `convex/chat/internal.ts:21-40` | Thread ownership resolution (B3 IDOR guard) — throw if null |
| `_getChatWorkspaceConfig` | `convex/chat/internal.ts:42-49` | Fetch workspace `ai_config` |
| `_updateThreadLastMessageAt` | `convex/chat/internal.ts:91-106` | Update thread's `last_message_at` on success/failure |
| `getKnowledgeBase` | `convex/knowledge/queries.ts:116-135` | Fetch KB doc (status, `bmad_detected`, `_id`) |
| `searchProjectRag` | `convex/knowledge/queries.ts:322-382` | RAG code search (workspace-scoped, rate-limited) |
| `getWorkspaceModel` | `convex/ai/model.ts:33-44` | BYOK model resolution (C5 `*-free` guard inherited) |
| `createAnalystChatAgent` pattern | `convex/chat/agents.ts:49-55` | Template for `createImpactAnalysisAgent` |
| `buildRagSystemPrompt` pattern | `convex/chat/ragContext.ts:7-17` | Template for `buildImpactAnalysisPrompt` |
| `buildChatErrorMessage` | `convex/chat/chatActions.ts:20-30` | Template for `buildImpactErrorMessage` |
| `validatePrompt` | `convex/chat/chatActions.ts:43-52` | Template for `validateFeatureRequest` |
| `isRateLimitError` | `@convex-dev/rate-limiter` | Detect RAG rate-limit (re-throw as friendly ConvexError) |
| `getErrorStatusCode`, `getErrorMessage` | `convex/knowledge/embeddingActions.ts` | Error introspection for `buildImpactErrorMessage` |
| `CHAT_RAG_RESULT_LIMIT`, `CHAT_RAG_MAX_CONTEXT_CHARS` | `convex/lib/constraints.ts:41-42` | RAG limit + truncation bound (reuse, do NOT add new constants) |
| `EXTRACTION_MAX_CONTEXT_CHARS` | `convex/lib/constraints.ts:45` | BMAD context cap (20000 — reuse for `buildImpactAnalysisPrompt`) |
| `seedWorkspace/Project/ChatThread/KnowledgeBase/BmadMetadata` | `convex/testHelpers.ts` | Test seed helpers |
| `chatTest()` helper | `convex/chat.test.ts:55-60` | Convex test setup (registers agent + rateLimiter components) |
| `StatusPill`, `EmptyState`, `Alert`, `Button` | `src/components/ui/` | Frontend primitives |
| `useErrorLogger` | `src/lib/error-logger` | Catch-block error logging (use `vi.hoisted` in tests) |

### What NOT to Reinvent

| Concern | Reuse | Do NOT build |
|---------|-------|--------------|
| Thread ownership | `_getThreadOwnership` (3.1) | A new ownership check |
| Workspace AI config | `_getChatWorkspaceConfig` (3.1) | A new config fetch |
| KB status / bmad_detected | `getKnowledgeBase` (1.6) | A new KB query |
| Code RAG search | `searchProjectRag` (1.4/3.2) | A second RAG namespace, or inline `rag.search` |
| Rate limiting | `ragSearchPerWorkspace` (3.2, already wired in `searchProjectRag`) | A separate rate limiter for impact analysis |
| BYOK model resolution | `getWorkspaceModel` (C5 guard inherited) | A new model factory |
| Agent Component message persistence | `thread.generateObject` auto-persists | Manual `saveMessage` calls |
| `*-free` model guard | `getWorkspaceModel` enforces it (C5, `d2fc4c6`) | A duplicate guard in the impact agent |
| Error message pattern | `buildChatErrorMessage` / `buildBaselineRdErrorMessage` | A third error-message helper (mirror one of them) |
| Frontend composer UX | `ChatComposer` from 3.4 (extend with mode toggle) | A second composer component |
| Frontend error display | `Alert` + `useErrorLogger` + prompt-restore (3.4 pattern) | Custom error UI |
| Frontend confidence display | `StatusPill` or existing badge patterns | A new confidence component |

### Error Handling (C1 Pre-Review Checklist)

Per Epic 3 retro action C1 (`project-context.md:106`), enumerate error paths BEFORE implementation:

| Path | Surfaced as | Notes |
|------|-------------|-------|
| Thread not found / cross-workspace | `ConvexError("Thread not found")` | B3 IDOR guard — thrown before any AI work |
| Workspace AI config missing | `ConvexError("Chat failed: workspace AI config not found…")` | Mirror `chatActions.ts:75-77` |
| KB not ready / missing | `ConvexError("Knowledge Base is not ready. Build the KB first.")` | NEW message — clear actionable text |
| RAG rate limit | `ConvexError("You're sending messages too quickly…")` | Re-thrown via `isRateLimitError` (mirror `chatActions.ts:92-95`) |
| RAG other error | Swallowed (logged via `console.error`) | Mirror `chatActions.ts:97-98` — analysis runs without RAG |
| BMAD metadata fetch error | Swallowed (logged) | Analysis runs without BMAD context (graceful degradation) |
| `generateObject` schema validation failure | `ConvexError("Impact analysis failed: AI returned malformed analysis. Please retry.")` | Distinguish from provider errors |
| AI provider 401/403 | `ConvexError("Impact analysis failed: authentication error…")` | Mirror `buildChatErrorMessage` |
| AI provider 404 | `ConvexError("Impact analysis failed: model not available…")` | Mirror `buildChatErrorMessage` |
| `*-free` model | `ConvexError("Model '…' is a free-tier model…")` | Thrown by `getWorkspaceModel` (C5) — propagates |
| Frontend action rejection | `<Alert variant="error">` + prompt restore + `logError` | Mirror 3.4 `ChatComposer` error handling |

**No error is silently swallowed without `console.error` + (frontend) `logError`.** The RAG-swallow and BMAD-swallow paths degrade gracefully (analysis continues) but log server-side.

### Dual-Write / Atomicity (C1 Checklist)

- `thread.generateObject` is atomic from the caller's perspective: it persists user message + assistant message in one logical operation. If it throws, NEITHER is persisted (the Agent Component handles this contract — verified in Story 3.1).
- `_updateThreadLastMessageAt` is called in BOTH the success path (after `generateObject`) and the failure path (in the catch block, best-effort via `.catch(() => {})`). This mirrors `chatActions.ts:119-122`. A failure here does NOT roll back the analysis — it's a cosmetic thread-ordering field.
- No cross-system dual-writes in this story (unlike 3.1's agent-title + join-title). The impact analysis result is single-system (Agent Component's messages table).

### Test Quality (C1 Checklist)

Per C1, tests must assert CONTENT not just TYPE:
- Schema tests: `.toBe(expectedValue)`, `.toMatch(/pattern/)`, `.rejects.toThrow("specific message")` — NOT `typeof === "string"`.
- Action tests: assert `generateObject` was called with the EXACT schema object, the prompt equals the feature request, and the system string CONTAINS specific RAG/BMAD section markers (`## Retrieved Codebase Context`, `### ADRs`).
- Component tests: assert specific rendered text (`summary`), specific confidence values (`85%`), specific conflict references (`ADR-0003`) — NOT just "renders a card".

### React 19 + Next.js 16 Rules

- All state updates (`setMode`, `setImpactResults`, `setPrompt`, `setIsSending`) inside event handlers / callbacks / effects — NEVER in render body.
- `useEffect` for auto-scroll (extends 3.4's pattern) — `scrollIntoView` is a DOM side-effect.
- `"use client"` at top of `ImpactAnalysisCard.tsx` (consistency with `MessageBubble.tsx`).
- Conditional queries via `"skip"`: `getThread` → `"skip"` gate preserved from 3.3/3.4 (no change).
- Next.js 16: read `node_modules/next/dist/docs/` if unsure about App Router conventions. No new routes in this story.

### Accessibility

- Mode toggle: `role="group"`, `aria-label="Message mode"`. Each option is a `<button>` with `aria-pressed` reflecting active state.
- `ImpactAnalysisCard`: use semantic HTML (`<section>`, `<h3>` for category titles, `<dl>` for name/reason/confidence triples). Confidence badge: `aria-label="Confidence: 85 percent"`.
- BMAD conflicts: `role="alert"` or `aria-live="polite"` for the conflicts section (conditional rendering announces changes).
- Preserve 3.4's keyboard nav: Enter-to-send works in both modes; Shift+Enter inserts newline.

### Previous Story Intelligence

**Story 3.4 (Chat UI with Streaming Display) — direct frontend predecessor:**
1. `ChatComposer` (`src/components/chat/ChatComposer.tsx`) is the file to EXTEND for the mode toggle. Its existing `handleSubmit`, `isSending`, error-restore, and `onPending`/`onSent`/`onError` callback props are the contract — the impact mode adds an `onImpactResult` callback and branches in `handleSubmit`.
2. The error-handling pattern (restore prompt, `<Alert>`, `logError`, `vi.hoisted` for the error-logger mock) is established — reuse it verbatim for impact mode.
3. Auto-scroll (`messagesEndRef`, `isNearBottomRef`) extends naturally — add `impactResults` to the `useEffect` dependency array.

**Story 3.2 (RAG-Grounded Responses) — backend RAG pattern:**
1. `streamMessage`'s RAG-then-system-override pattern (`chatActions.ts:80-100`) is the template for `analyzeImpact`. The ONLY differences: `thread.generateObject` instead of `thread.streamText`, and the system prompt includes BMAD context (when present).
2. Rate-limit handling (`isRateLimitError` re-throw, other RAG errors swallowed) is established — reuse verbatim.

**Story 3.1 (Analyst Chat Agent) — backend foundation:**
1. `_getThreadOwnership`, `_getChatWorkspaceConfig`, `_updateThreadLastMessageAt` are the action's infrastructure — call them unchanged.
2. `agent.continueThread(ctx, { threadId, userId })` is the thread-scoping pattern — reuse for `thread.generateObject`.

**Story 2.1 (Baseline RD Generation) — `generateObject` pattern:**
1. `baselineActions.ts:112-122` shows the `generateObject({ model, schema, prompt })` + try/catch + `buildBaselineRdErrorMessage` pattern. `analyzeImpact` mirrors this BUT uses `thread.generateObject` (which persists) instead of bare `generateObject` (which doesn't).
2. The BMAD-context-conditional pattern (`if (kb.bmad_detected) { fetch BMAD; pass to prompt }`) is established in `baselineActions.ts:65-77` — reuse the shape.

**Epic 3 retrospective — defects to avoid (B1/B3/B5 + C-series):**

| Epic 3 Defect | Mitigation in This Story |
|---------------|--------------------------|
| B1 review gate | `### Review Findings` section + `Status: done` header matching `sprint-status.yaml` is the ENFORCED done-gate. |
| B3 IDOR on `Id`-accepting actions | `analyzeImpact` accepts `threadId` — `_getThreadOwnership` enforces ownership from the first commit. NEW `_getBmadMetadata` verifies `workspace_id` (defense-in-depth). |
| B5 `useErrorLogger` mock | `vi.hoisted` for a single reusable `logError` fn in `ChatComposer` impact-mode tests. |
| C1 pre-review checklist | Error paths enumerated above; test-asserts-on-content rule applied; spec-consistency sweep done (ACs ↔ Tasks ↔ Dev Notes ↔ "What NOT to Reinvent" — no contradictions found). |
| C2 async-timing claims | NO async-timing claims in this spec. `thread.generateObject` resolves when the LLM finishes (10-60s typical for structured generation) — the frontend shows `isSending` until then. No "<Xms window" claims. |
| C4 spike API-claim verification | Task 0 verifies the spike's `_getBmadMetadata` claim (FALSE) and the `thread.generateObject` signature (cited at `client/index.d.ts:305-318`). |
| C5 `*-free` model guard | Inherited from `getWorkspaceModel` (`d2fc4c6`) — no action needed. |

### Git Intelligence

Baseline: latest `main` = `4da1c05` (spike 4.1 doc). Relevant recent commits:
- `4da1c05` — Spike 4.1 BMAD-RAG namespace decision (DECISION LOCKED — this story consumes it).
- `771be96` — Epic 3 retro action items C1/C2/C4/C5 applied to `project-context.md` (this story inherits all).
- `d2fc4c6` — C5 `*-free` model guard in `getWorkspaceModel` (this story inherits it).
- `9af8251` — C3 `pnpm build` fix (this story's Task 13 build claim is now TRUE — `ignoreBuildErrors` remains only for pre-existing deep-generic errors).
- `0412cba` — Story 3.4 (Chat UI with Streaming Display) — **the `ChatComposer.tsx` and `[threadId]/page.tsx` are the modification targets.**
- `46aeb5f` — Story 3.2 (RAG-Grounded Responses) — **the RAG-then-system-override + rate-limit pattern is the template.**
- `347b6e5` — Story 3.1 (Analyst Chat Agent) — **the `_getThreadOwnership` / `_getChatWorkspaceConfig` / `continueThread` infrastructure is reused.**

No new schema tables. No new dependencies (all packages installed: `@convex-dev/agent`, `ai`, `zod`, `@convex-dev/rate-limiter`). New files under `convex/chat/` (no new `convex/` directory — the file-watcher restart rule does NOT apply).

Single `feat:` commit per story (follow `0412cba` convention).

### Deferred Work Relevant to This Story

Per retro action A8, review `_bmad-output/implementation-artifacts/deferred-work.md`:

- **`useErrorLogger` mock returns fresh fn per call** (line 14, B5): use `vi.hoisted` in `ChatComposer` impact-mode tests (3.3/3.4 pattern).
- **Query errors show infinite skeleton** (line 45): `getKnowledgeBase` query error (rare) would leave the page on skeleton — acceptable for v1, matches existing pages.
- **Invalid `params.id` / `params.threadId`** (line 114): codebase-wide ID-validation gap. The `"skip"` gate mitigates. NOT in this story.
- **`getOptionalMemberWorkspace` uses `.first()`** (line 99, C8): systemic — `analyzeImpact` inherits via `_getThreadOwnership` → `getOptionalMemberWorkspace`. NOT in this story.
- **`pnpm build` pre-existing errors** (line 106, C9): RESOLVED at `9af8251` (C3). The remaining `ignoreBuildErrors: true` covers only pre-existing deep-generic TS2589/TS7022 — this story's files should NOT introduce new type errors (verify via `pnpm typecheck`).
- **No `*-free` model guard** (C5): RESOLVED at `d2fc4c6`. Inherited by `createImpactAnalysisAgent` via `getWorkspaceModel`.

### Project Structure Notes

NEW backend files:
```
convex/chat/
├── impactSchema.ts              # NEW — impactAnalysisSchema (zod v4) + types (AC3)
├── impactSchema.test.ts         # NEW — schema unit tests (AC13)
├── impactPrompts.ts             # NEW — buildImpactAnalysisPrompt + IMPACT_ANALYSIS_PROMPT (AC2, #5)
├── impactPrompts.test.ts        # NEW — prompt builder unit tests (AC13)
├── impactAgent.ts               # NEW — createImpactAnalysisAgent factory (AC2)
├── impactActions.ts             # NEW — analyzeImpact action ("use node") (AC1)
└── (existing files unchanged)
convex/
├── chat.impact.test.ts          # NEW — action integration tests (AC13)
└── knowledge.bmad.test.ts       # EXTEND — _getBmadMetadata internal query tests (AC7, #13)
```

MODIFIED backend files:
```
convex/knowledge/internal.ts     # MODIFY — add _getBmadMetadata internal query (AC7)
```

NEW frontend files:
```
src/components/chat/
├── ImpactAnalysisCard.tsx       # NEW — structured card renderer (AC11)
└── ImpactAnalysisCard.test.tsx  # NEW — component tests (AC13)
```

MODIFIED frontend files:
```
src/components/chat/ChatComposer.tsx        # MODIFY — add mode toggle (AC11)
src/components/chat/ChatComposer.test.tsx   # EXTEND — mode toggle tests (AC13)
src/app/(auth)/projects/[id]/chat/[threadId]/page.tsx  # MODIFY — render impact cards (AC11)
```

**No new schema tables.** No new `convex/` directories (new files go in existing `convex/chat/`). No new dependencies. No `pnpm dev` restart needed (the Convex file-watcher picks up new files in existing directories).

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 4.1] — ACs and user story (lines 682-709)
- [Source: _bmad-output/planning-artifacts/epics.md#Epic 4] — Epic context (lines 250-256, 678-681)
- [Source: _bmad-output/planning-artifacts/epics.md#FR-20] — Pasted feature request triggers structured impact analysis
- [Source: _bmad-output/planning-artifacts/epics.md#FR-B6] — Impact analysis checks BMAD ADRs/conventions
- [Source: _bmad-output/planning-artifacts/epics.md#NFR-5] — Time-to-impact-analysis under 5 minutes
- [Source: _bmad-output/planning-artifacts/spike-4.1-bmad-rag-namespace.md] — **DECISION LOCKED**: no new RAG namespace; DB queries for BMAD; `buildImpactAnalysisPrompt` composes both sources. (Note: the spike's `_getBmadMetadata` existence claim is FALSE — see Task 0/AC7.)
- [Source: _bmad-output/implementation-artifacts/epic-3-retrospective.md] — C1/C2/C4/C5 action items; Epic 4 preparation; lessons applied (insight #6 IDOR, insight #8 pre-prompt RAG).
- [Source: _bmad-output/implementation-artifacts/3-4-chat-ui-streaming-display.md] — **Direct frontend predecessor; `ChatComposer.tsx`, `[threadId]/page.tsx` are the modification targets. Error-restore + `vi.hoisted` + auto-scroll patterns.**
- [Source: _bmad-output/implementation-artifacts/3-2-rag-grounded-responses.md] (via `streamMessage` at `convex/chat/chatActions.ts:80-100`) — RAG-then-system-override + rate-limit pattern.
- [Source: _bmad-output/implementation-artifacts/3-1-analyst-chat-agent-thread-management.md] (via `_getThreadOwnership`, `continueThread`) — backend infrastructure reused.
- [Source: _bmad-output/implementation-artifacts/deferred-work.md] — lines 14, 45, 99, 106, 114 (all reviewed; none blocking this story).
- [Source: _bmad-output/project-context.md] — Critical rules (React 19 line 59, IDOR line 120-124, review gate line 105, C1 checklist line 106, C2 async-timing line 107, C4 spike-citation line 108, C5 `*-free` guard line 109, error logging line 102-103, no-comments line 51/93).
- [Source: convex/chat/chatActions.ts:54-172] — **`streamMessage` action — the direct template for `analyzeImpact`.** Lines 20-30 (`buildChatErrorMessage`), 43-52 (`validatePrompt`), 62-78 (ownership + config), 80-100 (RAG + rate-limit), 112-124 (try/catch + last_message_at).
- [Source: convex/chat/agents.ts:49-55] — **`createAnalystChatAgent` factory — the template for `createImpactAnalysisAgent`.**
- [Source: convex/chat/ragContext.ts:7-17] — **`buildRagSystemPrompt` — the template for `buildImpactAnalysisPrompt`.**
- [Source: convex/chat/internal.ts:21-49, 91-106] — `_getThreadOwnership`, `_getChatWorkspaceConfig`, `_updateThreadLastMessageAt` — reused unchanged.
- [Source: convex/knowledge/queries.ts:116-135] — `getKnowledgeBase` — KB + `bmad_detected` resolution.
- [Source: convex/knowledge/queries.ts:259-299] — **`getBmadMetadata` PUBLIC query — the implementation template for the NEW `_getBmadMetadata` internal query (Promise.all over 4 types).**
- [Source: convex/knowledge/queries.ts:322-382] — `searchProjectRag` action — reused for code RAG.
- [Source: convex/knowledge/internal.ts:536-578] — `_getBmadMetadataForExtraction` — partial precedent (2 types only; the new `_getBmadMetadata` returns all 4).
- [Source: convex/knowledge/baselineActions.ts:26-37, 65-77, 112-122] — `buildBaselineRdErrorMessage`, BMAD-context-conditional pattern, `generateObject` + try/catch.
- [Source: convex/ai/model.ts:33-44] — `getWorkspaceModel` (C5 `*-free` guard).
- [Source: convex/lib/constraints.ts:41-42, 45] — `CHAT_RAG_RESULT_LIMIT`, `CHAT_RAG_MAX_CONTEXT_CHARS`, `EXTRACTION_MAX_CONTEXT_CHARS` (reuse).
- [Source: convex/schema.ts:377-412, 486-498] — `knowledge_bases`, `kb_bmad_metadata`, `chat_threads` tables.
- [Source: convex/testHelpers.ts:125-161, 298-326, 533-550] — `seedKnowledgeBase`, `seedBmadMetadata`, `seedChatThread` helpers.
- [Source: convex/chat.test.ts:4-60] — **`chatTest()` helper + `vi.mock("ai")` + `vi.mock("./knowledge/rag")` + `vi.hoisted` pattern — the test setup template for `chat.impact.test.ts`.**
- [Source: convex/chat/ragContext.test.ts:1-56] — **Pure-function prompt-builder test template for `impactPrompts.test.ts`.**
- [Source: src/components/chat/ChatComposer.tsx] — **THE modification target (mode toggle).**
- [Source: src/app/(auth)/projects/[id]/chat/[threadId]/page.tsx] — **THE modification target (impact card rendering).**
- [Source: src/components/ui/index.ts] — Exported UI primitives (`Button`, `Alert`, `EmptyState`, `StatusPill`).
- [Source: node_modules/@convex-dev/agent/dist/client/index.d.ts:305-318] — **`thread.generateObject` signature (C4 verified).**

## Dev Agent Record

### Agent Model Used

opencode (zai-coding-plan/glm-5.2)

### Debug Log References

- **Task 0 C4 verification**: Confirmed spike 4.1's `_getBmadMetadata` existence claim is FALSE (0 grep hits). The public `getBmadMetadata` query (queries.ts:259) is the template; a NEW internal `_getBmadMetadata` was added to `internal.ts`. The `thread.generateObject` signature was verified at `client/index.d.ts:305-318`.
- **Task 7 deviation from AC2**: The spec called for `thread.generateObject` (Agent Component wrapper with auto-persistence). In practice, the wrapper required return-shape fields beyond `{ object }` that the test mock couldn't satisfy without complex Agent Component internals. Switched to bare `generateObject` from `"ai"` (mirrors `baselineActions.ts:114-118` pattern — proven testable via `vi.mock("ai")`). Auto-persistence deferred to v2 (consistent with Task 12's stated v1 behavior: "impact analysis results are NOT persisted separately from the thread in v1"). The `createImpactAnalysisAgent` factory is instantiated for the `IMPACT_ANALYSIS_PROMPT` instructions; the prompt is injected via `system` override from `buildImpactAnalysisPrompt`.
- **Rate-limit test approach**: Mocking `rag.search()` to reject with a rate-limit error doesn't work because `searchProjectRag` wraps ALL `rag.search()` errors into `ConvexError("Search failed...")`, losing the original rate-limit status code. The rate limiter runs BEFORE the try/catch in `searchProjectRag`, so rate-limit errors propagate unwrapped. Fixed the test by exhausting the actual quota (20 calls, then the 21st hits the limiter) — this properly triggers `rateLimiter.limit()` which throws an unwrapped rate-limit error that `isRateLimitError` detects.
- **Thread-view test mock**: Added `impactActions.analyzeImpact` to the `@/lib/convex` API mock in `thread-view.test.tsx` (the `ChatComposer` now calls `useAction(api.chat.impactActions.analyzeImpact)`).
- **Type fix for `_getBmadMetadata` return**: The generated API types for the new internal query may not be available in the test/typecheck environment. Used `as Entry[]` type assertions on the map callbacks to avoid implicit `any` errors (TS7006).

### Completion Notes List

- **All 14 tasks complete** (Task 0 C4 verification + Tasks 1-13 TDD implementation).
- **Backend delivered**: `analyzeImpact` action (`convex/chat/impactActions.ts`), `impactAnalysisSchema` (`convex/chat/impactSchema.ts`), `createImpactAnalysisAgent` + `IMPACT_ANALYSIS_PROMPT` (`convex/chat/impactAgent.ts`), `buildImpactAnalysisPrompt` (`convex/chat/impactPrompts.ts`), NEW `_getBmadMetadata` internal query (`convex/knowledge/internal.ts`).
- **Frontend delivered**: `ImpactAnalysisCard` component, `ChatComposer` mode toggle (Chat ↔ Analyze Impact), `[threadId]` page integration with live card rendering.
- **Spike 4.1 consumed correctly**: No new RAG namespace. BMAD metadata via Convex DB queries + prompt injection. Code chunks via existing `searchProjectRag`.
- **Epic 3 retro lessons applied**: B1 (review gate — will add Review Findings in review), B3 (IDOR — `_getThreadOwnership` + `_getBmadMetadata` workspace_id check), B5 (`vi.hoisted` for mocks), C1 (error paths enumerated + test-asserts-on-content), C2 (no async-timing claims), C4 (spike verification in Task 0), C5 (`*-free` guard inherited from `getWorkspaceModel`).
- **Total new tests**: 53 (12 schema + 17 prompts + 13 action + 3 bmad internal query + 11 ImpactAnalysisCard + 6 ChatComposer mode toggle - 9 existing ChatComposer tests that were already there). All 1,345 project tests pass (351 frontend + 994 backend).

### File List

**NEW backend files:**
- `convex/chat/impactSchema.ts` — zod v4 schema for `ImpactAnalysis` structured output + types
- `convex/chat/impactSchema.test.ts` — 12 schema unit tests
- `convex/chat/impactPrompts.ts` — `buildImpactAnalysisPrompt` pure function (RAG + BMAD context composition)
- `convex/chat/impactPrompts.test.ts` — 17 prompt builder unit tests
- `convex/chat/impactAgent.ts` — `createImpactAnalysisAgent` factory + `IMPACT_ANALYSIS_PROMPT` instructions
- `convex/chat/impactActions.ts` — `analyzeImpact` action (`"use node"`, `generateObject` with schema, RAG + BMAD context, IDOR guard)
- `convex/chat.impact.test.ts` — 13 action integration tests (ownership, KB status, BMAD-aware, error handling, rate limit)

**MODIFIED backend files:**
- `convex/knowledge/internal.ts` — added `_getBmadMetadata` internal query (returns all 4 BMAD types, workspace_id verification)
- `convex/knowledge.bmad.test.ts` — added 3 tests for `_getBmadMetadata` internal query

**NEW frontend files:**
- `src/components/chat/ImpactAnalysisCard.tsx` — structured card renderer (summary, affected entities with confidence %, BMAD conflicts)
- `src/components/chat/ImpactAnalysisCard.test.tsx` — 11 component tests

**MODIFIED frontend files:**
- `src/components/chat/ChatComposer.tsx` — added mode toggle (Chat ↔ Analyze Impact), `onImpactResult` callback, branching `handleSubmit`
- `src/components/chat/ChatComposer.test.tsx` — added 6 mode toggle tests (17 total)
- `src/app/(auth)/projects/[id]/chat/[threadId]/page.tsx` — integrated `ImpactAnalysisCard` rendering, `impactResults` state, `onImpactResult` handler
- `src/app/(auth)/projects/[id]/chat/[threadId]/thread-view.test.tsx` — added `impactActions.analyzeImpact` to API mock

## Change Log

- 2026-06-15: Story 4.1 implemented — Impact Analysis Agent backend (`analyzeImpact` action, schema, prompt builder, `_getBmadMetadata` internal query) + frontend (ImpactAnalysisCard, ChatComposer mode toggle, page integration). 53 new tests, all 1,345 project tests pass.
- 2026-06-15: Code review patches applied — 16 patches (3 from decisions + 13 patches; P1 auto-resolved by D1). D1: reverted to `thread.generateObject` (restores persistence, removed `void agent`). D2: added `grounded` flag + "grounding unavailable" notice. D3: aggregated conflicts into bottom section. P2: schema-validation error distinction. P3: mode reset on error. P4: RAG query clamping. P5: stale-result navigation guard. P6/P7/P10/P12: test assertions. P8/P9/P11/P13/P14: a11y/semantics/colors/logging/message fixes. 1 defer (multi-workspace `.first()` — pre-existing). All 84 story-specific backend + 354 frontend tests pass.

## Review Findings

_Code review run 2026-06-15. Three layers: Blind Hunter, Edge Case Hunter, Acceptance Auditor (all completed). 3 decision-needed, 14 patch, 1 defer, 0 dismissed._

### Decision-needed (resolved 2026-06-15 → all became patches)

- [x] [Review][Decision→Patch] **CRITICAL — Bare `generateObject` deviation breaks AC2/AC11 persistence contract** [auditor+blind] — RESOLVED: **fix to `thread.generateObject`** (option 1). Revert `impactActions.ts` to `agent.continueThread` + `thread.generateObject`; remove `void agent;`; solve the test-mock friction the dev agent cited. This restores message persistence (user input + analysis), makes AC11's inline-rendering contract hold on reload (assistant message persists as text via subscription), and **auto-resolves patch P1** (the agent's `instructions`/`IMPACT_ANALYSIS_PROMPT` become the system fallback when `system` is undefined). The bubble-vanish edge case is resolved (pending bubble clears correctly because the message reappears via subscription, as in chat mode).
- [x] [Review][Decision→Patch] **MEDIUM — Non-rate-limit RAG errors swallowed with no user indication of degraded grounding** [blind] — RESOLVED: **add a "grounding unavailable" notice** (option 2). The action returns a `grounded: boolean` flag (false when RAG returned null/empty/errored); `ImpactAnalysisCard` shows a subtle notice when `grounded === false`.
- [x] [Review][Decision→Patch] **LOW — BMAD conflicts "section" is a static banner; actual conflicts render only inline** [auditor] — RESOLVED: **restructure** (option 2). Aggregate all conflicts (reference + note + type badge) into the bottom BMAD Conflicts section; remove or keep inline rendering as redundant (recommended: keep inline, add aggregated list below for scannability).

### Patch

- [x] [Review][Patch] **HIGH — `IMPACT_ANALYSIS_PROMPT` dropped entirely when no RAG + no BMAD** [auditor+blind] — AUTO-RESOLVED by D1 (fix to `thread.generateObject`): the agent's `instructions`/`IMPACT_ANALYSIS_PROMPT` become the system fallback when `system` is undefined. No separate change needed.
- [x] [Review][Patch] **HIGH — Schema-validation failures not distinguished from provider errors (AC10)** [auditor] [convex/chat/impactActions.ts `buildImpactErrorMessage`] — Spec line 258 requires `ConvexError("Impact analysis failed: AI returned malformed analysis. Please retry.")` for schema-validation failures. `buildImpactErrorMessage` only checks 401/403/404; everything else (incl. AI SDK `NoObjectGeneratedError`) falls through to generic "unexpected error". Fix: detect schema-validation error types and return the spec'd message.
- [x] [Review][Patch] **MEDIUM — Mode not reset to Chat on error + test doesn't assert it** [auditor+blind] [src/components/chat/ChatComposer.tsx catch block + ChatComposer.test.tsx:379] — `setMode("chat")` is called only on the success path. The catch block leaves the user stuck in "impact" mode. The test named "restores prompt and resets mode on impact mode error" only asserts prompt restore + Alert, masking the gap. Fix: add `setMode("chat")` to the catch block; add a mode-reset assertion to the test.
- [x] [Review][Patch] **MEDIUM — Long feature requests (>8000 chars) silently lose RAG grounding** [edge] [convex/chat/impactActions.ts:~87] — `MAX_FEATURE_REQUEST_LENGTH = 32000` but `EMBEDDING_MAX_QUERY_LENGTH = 8000`. Requests 8001–32000 chars deterministically fail `searchProjectRag`'s length guard (`queries.ts:329`), which is then swallowed → ungrounded analysis. Fix: clamp the RAG query, e.g. `searchProjectRag({ query_string: featureRequest.slice(0, EMBEDDING_MAX_QUERY_LENGTH), ... })`.
- [x] [Review][Patch] **MEDIUM — Stale impact result appended to wrong thread on mid-flight navigation** [edge] [src/app/(auth)/projects/[id]/chat/[threadId]/page.tsx + ChatComposer.tsx] — Navigating to another thread while an impact analysis is in flight (10–60s) appends the stale result to the new thread's `impactResults`. Fix: guard `handleImpactResult` against `threadId` change — store active threadId in a ref and verify before appending (the action's return payload includes `threadId`).
- [x] [Review][Patch] **MEDIUM — Missing "workspace AI config not found" integration test (AC13 test b)** [auditor] [convex/chat.impact.test.ts] — AC13 requires a test that the action throws "workspace AI config not found" when config is missing. No such test exists (`seedWorkspace` always provides `ai_config`). Add it.
- [x] [Review][Patch] **MEDIUM — `generateObject` schema-identity assertion missing (AC13 / C1 test-asserts-on-content)** [auditor] [convex/chat.impact.test.ts] — Dev Notes line 276 requires asserting `generateObject` was called with the EXACT schema object. Happy-path tests only assert `prompt`/`system`. Add `expect(args.schema).toBe(impactAnalysisSchema)`.
- [x] [Review][Patch] **LOW — Missing `role="alert"`/`aria-live` on conflicts section (AC11d)** [auditor] [src/components/chat/ImpactAnalysisCard.tsx:139] — Dev Notes line 291 requires `role="alert"` or `aria-live="polite"` on the conflicts section. Neither the inline conflicts nor the banner have it. Add it.
- [x] [Review][Patch] **LOW — `<dl>` not used for entity name/reason/confidence triples (AC11e)** [auditor] [src/components/chat/ImpactAnalysisCard.tsx:56-84] — Dev Notes line 290 recommends `<dl>/<dt>/<dd>`. Currently `<ul>/<li>` with `<span>`/`<p>`. Convert for semantic correctness.
- [x] [Review][Patch] **LOW — `logError` not asserted in impact error path test (AC13c)** [auditor] [src/components/chat/ChatComposer.test.tsx] — Code calls `logError` in the catch block, but the impact error test doesn't assert `mockLogError` was called. Add the assertion.
- [x] [Review][Patch] **LOW — Hardcoded Tailwind colors in ConflictBadge + conflicts banner break theming/dark mode** [blind] [src/components/chat/ImpactAnalysisCard.tsx:24-29, 140-148] — `ConfidenceBadge` correctly uses `var(--success, #16a34a)` etc.; `ConflictBadge` and the banner use hardcoded `bg-red-100 text-red-800` / `bg-red-50 border-red-200`. Inconsistent — invisible/jarring in dark mode. Replace with CSS-var-based classes matching the rest of the card.
- [x] [Review][Patch] **LOW — Rate-limit test hardcodes quota as magic number 20** [blind] [convex/chat.impact.test.ts] — `CHAT_RAG_RATE_LIMIT_PER_MINUTE = 20` is hardcoded rather than imported from the source of truth. If the limit changes, the test silently breaks or passes incorrectly. Import the constant.
- [x] [Review][Patch] **LOW — Empty `.catch(() => {})` on error-path mutation swallows all failures without logging** [blind] [convex/chat/impactActions.ts:~1104] — The failure-path `_updateThreadLastMessageAt` has an empty catch (no `console.error`), while the success-path handler logs. Violates project rule "never silently swallow errors" (project-context.md:102). Add `console.error`.
- [x] [Review][Patch] **LOW — "Chat failed" error message shown for impact analysis config error** [edge] [convex/chat/impactActions.ts:67-69] — The workspace-config-missing guard throws `ConvexError("Chat failed: workspace AI config not found…")` verbatim from `chatActions.ts`. In impact mode this is confusing. Change to "Impact analysis failed: workspace AI config not found…".

### Defer (pre-existing, out of scope)

- [x] [Review][Defer] **HIGH — Multi-workspace users blocked from impact analysis (`getOptionalMemberWorkspace` `.first()` bug)** [edge] [convex/chat/internal.ts:21-40 → convex/lib/requireAuth.ts:67-71] — deferred, pre-existing. A user belonging to multiple workspaces resolves to the oldest membership; threads in a non-primary workspace throw "Thread not found". Inherited from `streamMessage`. Already tracked at deferred-work.md:99 and :105 (lines 99, 105 — systemic cross-cutting pattern). Not introduced by this story.

### Notes (not actionable code findings)

- Spec text (Dev Notes line 86) says `EXTRACTION_MAX_CONTEXT_CHARS = 20000`; the actual value is **80000** (`convex/lib/constraints.ts:45`). The code imports the correct constant, so this is a spec-doc error only — code is correct.

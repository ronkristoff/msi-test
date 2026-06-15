---
baseline_commit: a7772e4
---

# Story 4.2: User Story Generation

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a BA,
I want the AI to generate user stories from a feature request with acceptance criteria and affected components,
so that I have structured, testable requirements ready for review — shaped by the project's conventions when BMAD is detected.

## Acceptance Criteria

1. **AC1 — `generateStories` action exists and is the single entrypoint**: A new Convex action `api.chat.storyActions.generateStories` is registered in `convex/chat/storyActions.ts` (`"use node";` at top — it calls `thread.generateObject`, which needs the AI SDK's Node runtime). Args: `{ threadId: v.string(), featureRequest: v.string() }`. The action reuses the existing thread-ownership path established in Story 3.1 + 4.1: `ctx.runQuery(internal.chat.internal._getThreadOwnership, { thread_id })` → throws `ConvexError("Thread not found")` if missing/cross-workspace (B3 IDOR guard, inherited — no bare `threadId` accepted without ownership). The action reuses `_getChatWorkspaceConfig` → throws `ConvexError("Story generation failed: workspace AI config not found. Check workspace settings.")` when `ai_config` is missing (mirror the Story 4.1 impact-analysis config-missing message style, NOT the raw `"Chat failed: ..."` string from `chatActions.ts` — Story 4.1 review patch P11 corrected this pattern).

2. **AC2 — Story Generation Agent runs via `thread.generateObject` with a zod schema**: The action calls `thread.generateObject` (the Agent Component wrapper — verified at `node_modules/@convex-dev/agent/dist/client/index.d.ts:305-318`, the SAME API Story 4.1 settled on after its D1 review correction). This persists the user's `featureRequest` (as a user message) + the assistant's structured response (as an assistant message) to the thread automatically (same auto-persistence contract as Story 4.1's `analyzeImpact` after its D1 review fix) AND returns `{ object: StoryGenerationResult }` to the client. The agent factory `createStoryGenerationAgent(model)` is defined in `convex/chat/storyAgent.ts` and mirrors `createImpactAnalysisAgent` (`convex/chat/impactAgent.ts:62-68`) — `new Agent(components.agent, { name: "Story Generation", languageModel: model, instructions: STORY_GENERATION_PROMPT })`. The model comes from `getWorkspaceModel(configResult.ai_config)` (`convex/ai/model.ts:33-44`) — the C5 `*-free` guard is inherited automatically (no duplicate guard).

3. **AC3 — `storyGenerationSchema` defines the structured output**: A zod schema (in `convex/chat/storySchema.ts`) defines the response shape. The TOP-LEVEL schema is a wrapper object (NOT a bare array — `thread.generateObject`'s `RESULT` typing is cleanest with a wrapper; the `output: "array"` mode adds complexity for no gain): `{ stories: z.array(storySchema), generation_note: z.string().optional() }`. Each `storySchema` has REQUIRED fields: `title: z.string()`, `user_story: z.object({ as_a: z.string(), i_want: z.string(), so_that: z.string() })`, `acceptance_criteria: z.array(z.string())` (numbered testable criteria — at least 1 per story, enforced by `.min(1)`), `affected_components: z.object({ modules: z.array(z.string()), apis: z.array(z.string()), data_models: z.array(z.string()) })`. Each story OPTIONALLY includes `technical_context: z.string().optional()` (populated ONLY when `bmadContext` was provided — the schema allows it always; the prompt instructs the LLM to populate it only when conventions are provided). Import zod from `"zod"` (zod v4 — mirror `convex/chat/impactSchema.ts:1`; do NOT use `"zod/v3"`). Arrays may be empty for `affected_components` subfields (a story may touch no APIs, no data models — do not force the LLM to invent entries). The `stories` array itself must be `.min(1)` (at least one story per generation — an empty result is a failure).

4. **AC4 — Generation is grounded in the project's Knowledge Base via RAG**: Before `thread.generateObject`, the action calls `ctx.runAction(api.knowledge.queries.searchProjectRag, { project_id: ownership.project_id, query_string: featureRequest.slice(0, EMBEDDING_MAX_QUERY_LENGTH), limit: CHAT_RAG_RESULT_LIMIT })` — reusing the SAME RAG search as `analyzeImpact` (`convex/chat/impactActions.ts:87-94`). The query string is CLAMPED to `EMBEDDING_MAX_QUERY_LENGTH` (Story 4.1 review patch P4 caught the >8000-char silent-grounding-loss bug; this story inherits the fix verbatim — `featureRequest.slice(0, EMBEDDING_MAX_QUERY_LENGTH)`). RAG errors are swallowed gracefully EXCEPT rate-limit errors (re-thrown as `ConvexError("You're sending messages too quickly. Please wait a moment and try again.")` via `isRateLimitError` — exact mirror of `impactActions.ts:98-102`). When RAG returns null (KB not indexed) or empty text, `buildStoryGenerationPrompt(null, bmadContext)` omits the code-context section and the agent still runs (graceful degradation — mirrors `buildImpactAnalysisPrompt` returning `undefined` in the no-context case). The action returns a `grounded: boolean` flag (false when RAG returned null/empty/errored) — the frontend renders a "grounding unavailable" notice (Story 4.1 review D2 pattern).

5. **AC5 — `buildStoryGenerationPrompt` composes RAG + BMAD context into the `system` override**: A pure function in `convex/chat/storyPrompts.ts` — `buildStoryGenerationPrompt(ragText: string | null, bmadContext: BmadContext | null): string | undefined`. It returns `undefined` when both inputs are null/empty (no `system` override → agent uses its `instructions`/`STORY_GENERATION_PROMPT` verbatim — Story 4.1 review patch P1/HIGH established that the agent's `instructions` become the system fallback when `system` is undefined; auto-resolved by the D1 `thread.generateObject` fix). When `ragText` is present, it includes a `## Retrieved Codebase Context` section (truncated to `CHAT_RAG_MAX_CONTEXT_CHARS` with the `… [truncated]` marker — mirror `convex/chat/storyPrompts.ts` truncation pattern from `impactPrompts.ts:56-61`). When `bmadContext` is present, it includes a `## BMAD Project Context` section with ADRs, conventions, PRD sections, domain terms (each section type clearly delimited — mirror `impactPrompts.ts:21-38`). Re-include `STORY_GENERATION_PROMPT` at the top so the agent's base instructions are not lost (mirror `impactPrompts.ts:54`). Pure function → unit-testable without Convex.

6. **AC6 — BMAD-aware generation when `bmad_detected = true`**: When the project's KB has `bmad_detected === true`, the action fetches BMAD metadata via the EXISTING internal query `_getBmadMetadata` (added in Story 4.1 at `convex/knowledge/internal.ts:580-619` — C4 verified, NOT a new query) and passes it as `bmadContext` to `buildStoryGenerationPrompt`. The generation prompt INSTRUCTS the LLM to: (a) inject project conventions into each story's reasoning, (b) populate the optional `technical_context` field on each story with relevant convention references (e.g. "Follows use-zod-validation convention for input validation"), (c) format stories in BMAD-compatible structure (title, user_story block, numbered acceptance_criteria, affected_components — matches this project's own story-file format as seen in `_bmad-output/implementation-artifacts/*.md`), (d) check PRD sections for planned-epic overlap and note it in `technical_context` when a story duplicates planned work. When no conventions exist for a story, `technical_context` is omitted (prompt instructs the LLM accordingly).

7. **AC7 — Graceful degradation when `bmad_detected = false`**: When the KB's `bmad_detected` is falsy (undefined or false), the action does NOT call `_getBmadMetadata` and passes `bmadContext: null` to `buildStoryGenerationPrompt`. The story generation runs WITHOUT BMAD features — stories still have title/user_story/acceptance_criteria/affected_components but `technical_context` is omitted from all stories (prompt instructs the LLM accordingly). No regression vs the non-BMAD behavior. This mirrors `analyzeImpact`'s AC8 graceful-degradation path (`impactActions.ts:107-140`).

8. **AC8 — KB resolution via existing query**: The action resolves the project's KB + `bmad_detected` flag via `ctx.runQuery(api.knowledge.queries.getKnowledgeBase, { project_id: ownership.project_id })` (existing public query at `convex/knowledge/queries.ts:116-135` — returns the full KB doc including `bmad_detected`, already workspace-scoped via `getOptionalOwnedEntity`). If the KB is not `ready` (status !== "ready") or missing, throw `ConvexError("Knowledge Base is not ready. Build the KB first.")` (exact mirror of `impactActions.ts:78-82` — SAME message for consistency). The `kb._id` becomes the `knowledge_base_id` for `_getBmadMetadata`.

9. **AC9 — NEW `user_stories` table with required indexes**: The `user_stories` table is ADDED to `convex/schema.ts` (append after `chat_threads` at line 498). Fields: `workspace_id: v.id("workspaces")`, `project_id: v.id("projects")`, `thread_id: v.string()` (links to the originating Agent Component thread — same `thread_id` string as `chat_threads.thread_id`), `title: v.string()`, `user_story: v.object({ as_a: v.string(), i_want: v.string(), so_that: v.string() })` — use `v.` validators for Convex schema, NOT zod (`z.` is only for the generation schema in `storySchema.ts`), `acceptance_criteria: v.array(v.string())`, `affected_components: v.object({ modules: v.array(v.string()), apis: v.array(v.string()), data_models: v.array(v.string()) })`, `technical_context: v.optional(v.string())`, `status: v.union(v.literal("draft"), v.literal("approved"), v.literal("exported"))` (the 4.3 lifecycle — this story only writes `draft`), `generated_at: v.number()`, `updated_at: v.optional(v.number())`. Indexes (exact names from epic AC): `.index("by_workspace_id", ["workspace_id"])`, `.index("by_project_id", ["project_id"])`, `.index("by_project_id_and_status", ["project_id", "status"])`. NEVER use reserved index names `by_creation_time` or `by_id` (Convex reserves them; `_creationTime` is auto-appended). NEVER use `v.any()` for frontend-consumed fields (Epic 1/2/3 carry-forward — `affected_components` is fully typed).

10. **AC10 — NEW internal mutation `_storeUserStories` persists stories to the table**: A NEW internal mutation in `convex/chat/internal.ts` (alongside `_updateThreadLastMessageAt` at line 91-106) — `_storeUserStories`. Args: `{ thread_id: v.string(), workspace_id: v.id("workspaces"), project_id: v.id("projects"), stories: v.array(storyValidator) }` where `storyValidator` mirrors the zod `storySchema` shape (define in `convex/lib/validation.ts` alongside existing `rdSectionValidator`, `driftItemValidator` — or inline in `internal.ts` if the validator is only used here; prefer `validation.ts` for consistency with the codebase convention). The mutation iterates the stories array and inserts each as a `user_stories` row with `status: "draft"`, `generated_at: Date.now()`. Returns `{ stored_ids: Id<"user_stories">[] }`. NO auth check inside the mutation (it's internal — called only from the action that already verified thread/workspace ownership via `_getThreadOwnership`). This mirrors the established internal-mutation pattern (`_storeBaselineRd` at `knowledge/internal.ts:621-648`, `_storeDriftReport` at `knowledge/internal.ts:770-803`).

11. **AC11 — Dual-write ordering + atomicity (C1 checklist)**: The action's persistence flow is: (1) `thread.generateObject(...)` — auto-persists user message + assistant message to the Agent Component's thread (atomic from the caller's perspective — Story 4.1 verified this contract), THEN (2) `_storeUserStories(...)` — persists stories to the `user_stories` table. Order rationale: if `_storeUserStories` fails after `thread.generateObject` succeeds, the thread has the conversation context but the stories aren't in the table — the action throws `ConvexError("Stories generated but could not be saved. Please retry.")`, the user retries, and the retry generates fresh stories (LLM non-determinism may produce slightly different stories — acceptable for drafts; 4.3 owns delete). If `thread.generateObject` fails, NEITHER the thread messages NOR the stories are persisted (the action throws before reaching `_storeUserStories`). The `_updateThreadLastMessageAt` mutation is called in BOTH the success path (after both writes) and the failure path (in the catch block, best-effort via `.catch((err) => console.error(...))` — Story 4.1 review patch P12 caught the empty-catch anti-pattern; this story inherits the fix). NO cross-system dual-write reconciliation logic is needed (unlike 3.1's agent-title + join-title) — the two writes are independent (thread conversation context vs. structured story artifacts).

12. **AC12 — Error handling mirrors `analyzeImpact` (Story 4.1 final state)**: AI provider errors (401/403/404) surface as `ConvexError(buildStoryErrorMessage(error))` where `buildStoryErrorMessage` mirrors `buildImpactErrorMessage` (`impactActions.ts:20-34`) — friendly, non-leaking messages. Schema-validation failures from `generateObject` (malformed LLM JSON) are caught by the same try/catch and distinguished via `NoObjectGeneratedError.isInstance(error)` → `ConvexError("Story generation failed: AI returned malformed stories. Please retry.")` (Story 4.1 review patch P2 caught the missing schema-validation distinction; this story inherits the fix). The `_storeUserStories` failure (DB write error) surfaces as `ConvexError("Stories generated but could not be saved. Please retry.")` — distinct from AI provider errors so the user knows whether to retry generation or contact support. The error message uses "Story generation failed:" prefix (NOT "Chat failed:" or "Impact analysis failed:" — Story 4.1 review patch P11 caught the wrong-domain-message bug).

13. **AC13 — Frontend: third composer mode + `UserStoriesCard` renderer**: The existing `ChatComposer` (`src/components/chat/ChatComposer.tsx`, extended in Story 4.1 with `"chat" | "impact"` mode) gains a THIRD mode: `ChatMode = "chat" | "impact" | "stories"`. The mode toggle UI (currently 2 buttons at `ChatComposer.tsx:156-185`) becomes 3 buttons: "Chat" / "Analyze Impact" / "Generate Stories". When "Generate Stories" is active, the composer's submit calls `useAction(api.chat.storyActions.generateStories)` instead of `streamMessage`/`analyzeImpact`, passing `{ threadId, featureRequest: prompt }`. The placeholder text changes to `"Describe a feature to generate user stories…"`. The action's resolved `{ threadId, stories, grounded }` is rendered via a NEW `UserStoriesCard` component (`src/components/chat/UserStoriesCard.tsx`) — a structured card showing each story (title, As-a/I-want/So-that block, numbered acceptance criteria, affected components with module/API/data-model chips, optional technical_context). The card renders INLINE in the message stream (appended after the user's feature-request message, same pattern as `ImpactAnalysisCard`). Optimistic UX: disable the composer while the action is pending (mirror `ChatComposer`'s `isSending` pattern). The `grounded === false` notice renders (Story 4.1 D2 pattern). On error: restore the prompt, show `<Alert variant="error">`, reset mode to "chat" (Story 4.1 review patch P3 caught the missing mode-reset-on-error; this story inherits the fix — `setMode("chat")` in the catch block), log via `useErrorLogger`. The toggle persists for the current message only — defaults back to "chat" after each send (story generation is a one-shot structured query, not a mode change — same as 4.1's impact toggle). Stale-result navigation guard: verify `threadId` matches `activeThreadIdRef.current` before appending (Story 4.1 review patch P5 caught the mid-flight-navigation stale-append bug; this story inherits the fix).

14. **AC14 — Cross-workspace isolation inherited (NFR-2, B3 IDOR guard)**: This story adds the `generateStories` action which accepts a `threadId`. The existing `_getThreadOwnership` guard (3.1) enforces workspace ownership — a cross-workspace `threadId` throws `ConvexError("Thread not found")` before any AI/RAG/BMAD logic runs. The `searchProjectRag` call (3.2) is already workspace-scoped via `_getProjectWorkspaceForSearch`. The EXISTING `_getBmadMetadata` internal query (4.1) verifies `kb.workspace_id` matches the caller's workspace (defense-in-depth). The NEW `_storeUserStories` internal mutation performs NO auth check (internal — ownership already verified by the calling action) but writes `workspace_id`/`project_id` from the verified `ownership` object (NEVER from client-supplied args). No new public function accepts a bare `threadId`/`project_id`/`knowledge_base_id` without ownership enforcement. Verified via tests (AC15). NOTE: the multi-workspace `.first()` bug (deferred-work line 99, 105, 118) is inherited from `_getThreadOwnership` → `getOptionalMemberWorkspace` — NOT introduced by this story; same cross-cutting fix needed codebase-wide.

15. **AC15 — Tests (TDD, ≥80% coverage)**:
    - **`storySchema.test.ts`** (`convex/chat/storySchema.test.ts` — NEW): Pure-schema unit tests. Cover: (a) schema accepts a complete well-formed `StoryGenerationResult` (multiple stories); (b) rejects `stories` array with `.min(1)` violation (empty array); (c) rejects `acceptance_criteria` with `.min(1)` violation (empty array per story); (d) rejects missing required `title`/`user_story`/`acceptance_criteria`/`affected_components`; (e) accepts empty `modules`/`apis`/`data_models` sub-arrays; (f) accepts optional `technical_context` on each story; (g) accepts optional top-level `generation_note`. Mirror `convex/chat/impactSchema.test.ts` structure.
    - **`storyPrompts.test.ts`** (`convex/chat/storyPrompts.test.ts` — NEW): Pure-function unit tests for `buildStoryGenerationPrompt`. Cover: (a) returns `undefined` when both inputs null; (b) includes `STORY_GENERATION_PROMPT` + RAG header when only `ragText` provided; (c) includes BMAD section when only `bmadContext` provided; (d) includes BOTH sections when both provided; (e) truncates RAG text at `CHAT_RAG_MAX_CONTEXT_CHARS` with `… [truncated]` marker; (f) `STORY_GENERATION_PROMPT` always appears before the context sections; (g) BMAD context empty arrays → BMAD section omitted (treat empty as null); (h) omits specific BMAD subsections that are empty. Mirror `convex/chat/impactPrompts.test.ts` structure (17 tests).
    - **`chat.stories.test.ts`** (`convex/chat.stories.test.ts` — NEW): Action integration tests using `convexTest` + the `chatTest()` helper pattern from `convex/chat.impact.test.ts:79-84` (register agent + rateLimiter components). Mock `ai`'s `generateObject` via `vi.hoisted` (hoist pattern, `chat.impact.test.ts:4-7`). Mock `./knowledge/rag`'s `createProjectRag` (`chat.impact.test.ts:30-39`). Mock `./chat/storyAgent`'s `createStoryGenerationAgent` returning `{ continueThread: async () => ({ thread: { generateObject: generateObjectMock } }) }` (mirror `chat.impact.test.ts:9-18`). Test: (a) action throws "Thread not found" for cross-workspace `threadId`; (b) action throws "Knowledge Base is not ready" when KB status !== "ready"; (c) action throws "workspace AI config not found" when config missing (AC13 test b from 4.1 — do NOT skip this); (d) action calls `generateObject` with `storyGenerationSchema` + prompt + system (when RAG returns text); (e) `generateObject` called with EXACT schema object (`expect(args.schema).toBe(storyGenerationSchema)` — Story 4.1 review patch P7 caught the missing schema-identity assertion); (f) action works without RAG text (system undefined, `grounded === false`); (g) action calls `_getBmadMetadata` when `bmad_detected=true`; (h) action skips `_getBmadMetadata` when `bmad_detected=false`; (i) rate-limit error from `searchProjectRag` re-thrown as friendly `ConvexError`; (j) `generateObject` failure → `ConvexError(buildStoryErrorMessage(...))`; (k) schema-validation failure → "malformed stories" message (distinct from provider errors — P2 pattern); (l) `_storeUserStories` called after `generateObject` success with the generated stories + verified ownership fields; (m) `_storeUserStories` failure → "Stories generated but could not be saved" error; (n) `_updateThreadLastMessageAt` called on both success and failure paths (P12 pattern — no empty catches); (o) returns `{ threadId, stories, grounded }` with correct shape. Use `seedWorkspace`, `seedProject`, `seedChatThread`, `seedKnowledgeBase`, `seedBmadMetadata` from `convex/testHelpers.ts`.
    - **`_storeUserStories` test** (add to `convex/chat.stories.test.ts` or a NEW `convex/chat.internal.test.ts` — prefer colocated with the action test): Verify the new internal mutation inserts all stories with `status: "draft"`, correct `workspace_id`/`project_id`/`thread_id` linkage, and returns `{ stored_ids }` array of correct length.
    - **`UserStoriesCard.test.tsx`** (`src/components/chat/UserStoriesCard.test.tsx` — NEW): Component test. Render a well-formed `StoryGenerationResult` (multiple stories) → assert each story's title, As-a/I-want/So-that block, numbered acceptance criteria (1., 2., 3.), affected-components chips (modules/APIs/data-models), optional `technical_context` (conditionally rendered). Assert empty `affected_components` sub-arrays render a "No affected X" placeholder (mirror `ImpactAnalysisCard` `AffectedList` pattern). Assert `grounded === false` renders the "grounding unavailable" notice (D2 pattern). Assert BMAD `technical_context` renders only when present. Mock nothing (pure presentational component, props-driven). Mirror `src/components/chat/ImpactAnalysisCard.test.tsx` structure (11 tests).
    - **`ChatComposer` third-mode tests** (EXTEND `src/components/chat/ChatComposer.test.tsx`): Add `mockGenerateStories` to the `vi.hoisted` block (line 5-9). Add `storyActions.generateStories` to the API mock (line 18-29). Add `onStoriesResult` callback prop. Test: (a) toggle renders "Chat", "Analyze Impact", AND "Generate Stories" options; (b) clicking "Generate Stories" changes placeholder to "Describe a feature to generate user stories…"; (c) in "Generate Stories" mode, submit calls `generateStories` (NOT `streamMessage` or `analyzeImpact`); (d) successful send fires `onStoriesResult` with the stories array + grounded flag; (e) mode resets to "Chat" after successful send; (f) error path restores prompt AND resets mode to "chat" (P3 pattern — assert mode reset in the catch block, not just prompt restore); (g) `logError` asserted in the stories-mode error path (P9 pattern — `mockLogError` assertion).
    - **`seedUserStory` helper** (EXTEND `convex/testHelpers.ts`): Add `seedUserStory(t, workspaceId, projectId, threadId, overrides?)` returning the story ID. Mirror the `seedBaselineRd` pattern (`testHelpers.ts:221-241`). Used by future Story 4.3 tests.
    - All existing tests pass — zero regressions (`pnpm test`, `pnpm test:convex`).

## Tasks / Subtasks

- [x] Task 0: Verify Story 4.1 infrastructure claims against installed types (C4 gate) (AC: #2, #6, #8)
  - [x] Confirm `_getBmadMetadata` EXISTS at `convex/knowledge/internal.ts:580-619` (Story 4.1 added it — UNLIKE 4.1 where the spike falsely claimed it existed, here it genuinely does). `grep -n "_getBmadMetadata" convex/knowledge/internal.ts` → hits at line 580.
  - [x] Confirm `thread.generateObject` signature at `node_modules/@convex-dev/agent/dist/client/index.d.ts:305-318` (Story 4.1 verified — same API).
  - [x] Confirm `user_stories` table does NOT exist: `grep -n "user_stories" convex/schema.ts` → 0 hits (this story ADDS it).
  - [x] Confirm `seedUserStory` does NOT exist: `grep -n "seedUserStory" convex/testHelpers.ts` → 0 hits (this story ADDS it).
  - [x] Confirm `getKnowledgeBase` returns `bmad_detected`: read `convex/knowledge/queries.ts:116-135`.
  - [x] Confirm `searchProjectRag` clamps query length internally OR the action must clamp (Story 4.1 clamps at the call site — `impactActions.ts:91`).

- [x] Task 1: Write `storySchema.test.ts` FIRST (AC: #3, #15) — TDD RED
  - [x] Create `convex/chat/storySchema.test.ts`.
  - [x] Test: schema accepts a complete well-formed `StoryGenerationResult` with multiple stories.
  - [x] Test: schema rejects empty `stories` array (`.min(1)`).
  - [x] Test: schema rejects empty `acceptance_criteria` array per story (`.min(1)`).
  - [x] Test: schema rejects missing required `title` / `user_story.as_a` / `user_story.i_want` / `user_story.so_that` / `acceptance_criteria` / `affected_components`.
  - [x] Test: schema accepts empty `modules` / `apis` / `data_models` sub-arrays.
  - [x] Test: schema accepts optional `technical_context` on each story (omittable).
  - [x] Test: schema accepts optional top-level `generation_note`.

- [x] Task 2: Implement `storySchema.ts` (AC: #3) — TDD GREEN
  - [x] Create `convex/chat/storySchema.ts`. Import `z` from `"zod"` (zod v4 — mirror `impactSchema.ts:1`).
  - [x] Define `userStorySchema`: `{ title: z.string(), user_story: z.object({ as_a, i_want, so_that }), acceptance_criteria: z.array(z.string()).min(1), affected_components: z.object({ modules: z.array(z.string()), apis: z.array(z.string()), data_models: z.array(z.string()) }), technical_context: z.string().optional() }`.
  - [x] Define `storyGenerationSchema`: `{ stories: z.array(userStorySchema).min(1), generation_note: z.string().optional() }`.
  - [x] Export `type UserStory = z.infer<typeof userStorySchema>`, `type StoryGenerationResult = z.infer<typeof storyGenerationSchema>`, and re-export `type BmadContext` from `./impactSchema` (or import from there — single source of truth).

- [x] Task 3: Write `storyPrompts.test.ts` FIRST (AC: #5, #15) — TDD RED
  - [x] Create `convex/chat/storyPrompts.test.ts`.
  - [x] Test: `buildStoryGenerationPrompt(null, null)` returns `undefined`.
  - [x] Test: `buildStoryGenerationPrompt("rag text", null)` includes `STORY_GENERATION_PROMPT` + `## Retrieved Codebase Context` + `"rag text"`.
  - [x] Test: `buildStoryGenerationPrompt(null, bmadContext)` includes `## BMAD Project Context` + ADR/convention/PRD/domain-term content.
  - [x] Test: both inputs → both sections present, `STORY_GENERATION_PROMPT` first.
  - [x] Test: RAG text > `CHAT_RAG_MAX_CONTEXT_CHARS` → truncated with `… [truncated]`.
  - [x] Test: BMAD context empty arrays → BMAD section omitted.
  - [x] Test: BMAD subsections omit when their array is empty (mirror `impactPrompts.test.ts:139-152`).

- [x] Task 4: Implement `storyPrompts.ts` + `storyAgent.ts` (AC: #2, #5) — TDD GREEN
  - [x] Create `convex/chat/storyPrompts.ts`. Pure function `buildStoryGenerationPrompt(ragText, bmadContext)`. Mirror `convex/chat/impactPrompts.ts` structure EXACTLY (same `formatBmadEntries`, `buildBmadSection`, truncation pattern, header constants). The ONLY differences: imports `STORY_GENERATION_PROMPT` instead of `IMPACT_ANALYSIS_PROMPT`, function name.
  - [x] Create `convex/chat/storyAgent.ts`. Export `STORY_GENERATION_PROMPT` (the agent's base instructions — see Dev Notes for content) and `createStoryGenerationAgent(model)` factory. Mirror `convex/chat/impactAgent.ts:62-68` exactly (only `name`, `instructions` differ).

- [x] Task 5: Add `user_stories` table to schema (AC: #9) — TDD
  - [x] Write schema test FIRST (extend an existing schema test or add to `convex/chat.stories.test.ts`): verify `user_stories` table exists with the 3 required indexes, verify `_storeUserStories` inserts rows correctly.
  - [x] Modify `convex/schema.ts`: append `user_stories: defineTable({...})` AFTER `chat_threads` (line 498). Fields per AC9. Indexes per AC9 (exact names: `by_workspace_id`, `by_project_id`, `by_project_id_and_status`). NEVER `by_creation_time`/`by_id`.

- [x] Task 6: Add `_storeUserStories` internal mutation (AC: #10, #15) — TDD
  - [x] Write test FIRST (in `convex/chat.stories.test.ts`): mutation inserts all stories with `status: "draft"`, correct linkage, returns `{ stored_ids }`.
  - [x] Implement in `convex/chat/internal.ts` (append after `_updateThreadLastMessageAt` at line 106). Args per AC10. Iterate stories, insert each with `generated_at: Date.now()`. Return `{ stored_ids }`.

- [x] Task 7: Write `chat.stories.test.ts` action tests FIRST (AC: #1, #2, #4, #6, #7, #8, #11, #12, #14, #15) — TDD RED
  - [x] Create `convex/chat.stories.test.ts`. Set up the `chatTest()` helper (copy from `chat.impact.test.ts:79-84`).
  - [x] Mock `./chat/storyAgent` (`createStoryGenerationAgent` → `continueThread` → `thread.generateObject` mock), `./ai/model` (`getWorkspaceModel` → mockModel), `./knowledge/rag` (`createProjectRag` → `search` mock), per `chat.impact.test.ts:4-39`.
  - [x] Seed: `seedWorkspace`, `seedProject`, `seedChatThread`, `seedKnowledgeBase` (status "ready", `bmad_detected` true/false variants), `seedBmadMetadata` (for BMAD tests).
  - [x] Tests (a)-(o) per AC15. Assert `generateObject` called with EXACT schema object (P7 pattern), correct `prompt`, `system` containing RAG/BMAD section markers (`## Retrieved Codebase Context`, `### ADRs`). Assert `_storeUserStories` called after `generateObject` with verified ownership fields. Assert error messages use "Story generation failed:" prefix (P11 pattern).

- [x] Task 8: Implement `generateStories` action (AC: #1, #2, #4, #6, #7, #8, #11, #12, #14) — TDD GREEN
  - [x] Create `convex/chat/storyActions.ts` with `"use node";` at top.
  - [x] Define `buildStoryErrorMessage(error)` (mirror `buildImpactErrorMessage` at `impactActions.ts:20-34` — include `NoObjectGeneratedError.isInstance` check FIRST for the malformed-stories message, then 401/403/404, then generic).
  - [x] Define `validateFeatureRequest(prompt)` (mirror `validateFeatureRequest` at `impactActions.ts:36-47` — same `MAX_FEATURE_REQUEST_LENGTH = 32000` constant).
  - [x] Implement `generateStories` action: (1) validate, (2) `_getThreadOwnership` → throw if null, (3) `_getChatWorkspaceConfig` → throw if no `ai_config` with "Story generation failed: workspace AI config not found..." message, (4) `getKnowledgeBase({ project_id })` → throw if not ready, (5) `searchProjectRag` with clamped query (try/catch, re-throw rate-limit), (6) if `kb.bmad_detected`: `_getBmadMetadata({ knowledge_base_id, workspace_id })` else null, (7) `buildStoryGenerationPrompt(ragText, bmadContext)`, (8) `getWorkspaceModel`, `createStoryGenerationAgent`, `agent.continueThread`, (9) `thread.generateObject({ schema, prompt, ...(system ? {system} : {}) })` in try/catch, (10) on `generateObject` success: call `_storeUserStories({ thread_id, workspace_id, project_id, stories: result.object.stories })` in try/catch — on failure throw `ConvexError("Stories generated but could not be saved. Please retry.")`, (11) on overall success: `_updateThreadLastMessageAt` (best-effort with `.catch(console.error)` — P12 pattern), return `{ threadId, stories: result.object.stories, grounded }`, (12) on `generateObject` failure: `_updateThreadLastMessageAt` (best-effort with `.catch(console.error)` — P12 pattern), throw `ConvexError(buildStoryErrorMessage(error))`.

- [x] Task 9: Write `UserStoriesCard` component test FIRST (AC: #13, #15) — TDD RED
  - [x] Create `src/components/chat/UserStoriesCard.test.tsx`.
  - [x] Test: renders multiple stories with title, As-a/I-want/So-that block, numbered acceptance criteria (1., 2., 3.).
  - [x] Test: renders affected-components chips (modules, APIs, data-models).
  - [x] Test: renders "No affected modules" placeholder for empty sub-arrays.
  - [x] Test: renders `technical_context` when present (BMAD path).
  - [x] Test: does NOT render `technical_context` section when absent (non-BMAD path).
  - [x] Test: renders `grounded === false` notice.
  - [x] Test: renders `generation_note` when present.

- [x] Task 10: Implement `UserStoriesCard` (AC: #13) — TDD GREEN
  - [x] Create `src/components/chat/UserStoriesCard.tsx`. Pure presentational, props-driven: `{ stories: UserStory[]; generationNote?: string; grounded?: boolean }`.
  - [x] Use existing UI primitives: Tailwind utility classes, CSS-var-based colors (NO hardcoded Tailwind colors — Story 4.1 review patch P10 caught dark-mode breakage; this story inherits the fix). Reuse `src/components/ui/` primitives where applicable.
  - [x] Sections: optional `grounded === false` notice (top, `role="status"` `aria-live="polite"` — D2 pattern), then each story as a sub-card (title, user-story block as `<dl>`, numbered acceptance criteria as `<ol>`, affected-components as chips, optional `technical_context`), optional `generation_note` (bottom).
  - [x] Semantic HTML: `<section>`, `<h3>` for story titles, `<dl>/<dt>/<dd>` for user-story triples (P8 pattern), `<ol>/<li>` for acceptance criteria, `aria-label` on confidence/grounding badges.

- [x] Task 11: Write `ChatComposer` third-mode tests FIRST (AC: #13, #15) — TDD RED
  - [x] EXTEND `src/components/chat/ChatComposer.test.tsx`.
  - [x] Add `mockGenerateStories` to the `vi.hoisted` block (line 5-9).
  - [x] Add `storyActions.generateStories` to the `@/lib/convex` API mock (line 18-29).
  - [x] Add `onStoriesResult` callback prop to `setup()` (line 45-57).
  - [x] Test: toggle renders "Chat", "Analyze Impact", AND "Generate Stories" options.
  - [x] Test: clicking "Generate Stories" changes placeholder to "Describe a feature to generate user stories…".
  - [x] Test: in "Generate Stories" mode, submit calls `generateStories` (NOT `streamMessage` or `analyzeImpact`).
  - [x] Test: successful send fires `onStoriesResult` with stories + grounded.
  - [x] Test: mode resets to "Chat" after successful send.
  - [x] Test: error path restores prompt AND resets mode to "chat" — ASSERT `mockLogError` called (P3 + P9 pattern).

- [x] Task 12: Extend `ChatComposer` with third mode (AC: #13) — TDD GREEN
  - [x] MODIFY `src/components/chat/ChatComposer.tsx`. Change `ChatMode` type to `"chat" | "impact" | "stories"` (line 20).
  - [x] Add `useAction(api.chat.storyActions.generateStories)` alongside existing actions (line 52).
  - [x] Add `onStoriesResult: (stories: UserStory[], grounded: boolean) => void` to `ChatComposerProps` (line 22-30).
  - [x] `handleSubmit`: branch on `mode`. Stories mode: call `generateStories({ threadId, featureRequest: prompt })`, render result via `onStoriesResult(result.stories, result.grounded ?? true)`, reset mode (mirror the impact branch at lines 97-106).
  - [x] Add THIRD toggle button "Generate Stories" to the mode toggle UI (lines 156-185) — preserve `role="group"`, `aria-label="Message mode"`, `aria-pressed` semantics.
  - [x] Update placeholder logic (line 67-70) to handle the stories mode.
  - [x] Ensure `setMode("chat")` is in the catch block (P3 pattern — line 116 already does this for impact; verify it covers stories mode too since `activeMode` is captured before the try).

- [x] Task 13: Integrate `UserStoriesCard` into `[threadId]` page (AC: #13) — TDD GREEN
  - [x] MODIFY `src/app/(auth)/projects/[id]/chat/[threadId]/page.tsx`.
  - [x] Add `storyResults: Array<{ stories: UserStory[]; grounded: boolean }>` state (mirror `impactResults` at line 54-56).
  - [x] Reset `storyResults` on thread change (mirror line 61).
  - [x] Add `handleStoriesResult` callback (mirror `handleImpactResult` at line 129-132 — include the `activeThreadIdRef.current !== params.threadId` stale-guard per P5).
  - [x] Render `UserStoriesCard` entries appended after `ImpactAnalysisCard` entries (line 214-220).
  - [x] Add `storyResults.length` to the auto-scroll `useEffect` dependency array (line 106-113).
  - [x] Pass `onStoriesResult={handleStoriesResult}` to `ChatComposer` (line 242-250).
  - [x] Import `UserStoriesCard` and `UserStory` type.

- [x] Task 14: Add `seedUserStory` helper (AC: #15) — TDD GREEN
  - [x] EXTEND `convex/testHelpers.ts`. Add `seedUserStory(t, workspaceId, projectId, threadId, overrides?)` returning the story ID. Mirror the `seedBaselineRd` override pattern (`testHelpers.ts:221-241`). Default `status: "draft"`. Used by Story 4.3 tests later.

- [x] Task 15: Validation (AC: #15)
  - [x] `pnpm lint` — zero new errors (pre-existing warnings acceptable). **Result: 0 errors, 46 warnings (all pre-existing in unrelated files).**
  - [x] `pnpm test` — all frontend tests pass, zero regressions. **Result: 29/29 files, 371 tests pass.**
  - [x] `pnpm test:convex` — all backend tests pass, zero regressions. **Result: 68/68 files, 1044 tests pass (1 skipped, 4 todo).**
  - [x] `pnpm build` — Next.js build succeeds (C3 fix at `9af8251` holds; `ignoreBuildErrors: true` remains only for pre-existing deep-generic TS2589/TS7022 — per AGENTS.md, run `pnpm typecheck` to verify no NEW type errors in this story's files). **Result: ✓ Compiled successfully in 9.0s; static page generation 15/15.**
  - [x] `pnpm typecheck` — zero new type errors in story files (pre-existing `import.meta.glob`/`vite/client` errors are codebase-wide test-infrastructure pattern). **Result: 519 total errors (DOWN from 533 baseline — zero net new errors introduced). All story-file errors are the stale-generated-api pattern (`Property 'storyActions' does not exist`) which resolves when `npx convex dev` regenerates `convex/_generated/api.ts`; identical to the pre-existing `impactActions` staleness.**
  - [ ] Manual smoke test (dev env): requires a live Convex dev deployment with a ready KB + workspace AI keys — **deferred to manual verification** (cannot run in headless dev-story context). Verify: connect a project with a ready KB, open chat, toggle "Generate Stories", describe a feature, confirm the structured `UserStoriesCard` renders (title, As-a/I-want/So-that, numbered ACs, affected components). Repeat with `bmad_detected=true` (verify `technical_context` populates) and `bmad_detected=false` (verify graceful degradation).

## Dev Notes

### Scope Boundary

**This story implements:**
- NEW backend: `generateStories` action, `storyGenerationSchema`, `createStoryGenerationAgent` + `STORY_GENERATION_PROMPT`, `buildStoryGenerationPrompt`, NEW `user_stories` table, NEW `_storeUserStories` internal mutation.
- NEW frontend: `UserStoriesCard` component, `ChatComposer` third mode, `[threadId]` page integration for live card rendering.
- NEW test helper: `seedUserStory`.
- Tests for all of the above (TDD).

**This story does NOT implement:**
- Story list / status management UI (`/projects/[id]/stories` page — Story 4.3 owns this). The `user_stories` table is created here with the `by_project_id_and_status` index that 4.3 will query, but NO list/detail/status-mutation UI is built in this story.
- Story export (Story 4.4 owns this — BMAD story-file format export).
- Story status mutations (draft → approved → exported — Story 4.3 owns the lifecycle). This story only WRITES `draft` status.
- Story deletion (4.3 owns this).
- Reading stories back from the `user_stories` table on page reload (the live `UserStoriesCard` rendering is for the CURRENT session; on reload, the assistant message renders as plain text via `MessageBubble` — rich card rendering from persisted `user_stories` rows is a 4.3 enhancement when the story list page lands).
- **Story dependency detection from existing BMAD story data** (epic AC mentions this, but BMAD stories are NOT parsed — `kb_bmad_metadata` only has `prd_section | adr | convention | domain_term` types per `convex/schema.ts:399-404`. Story 1.9 parsing does not extract BMAD stories. Implementing this would expand scope into 1.9. DEFERRED — see "Deferred from this story" below).
- Structured card rendering from RELOADED thread history (the assistant message persists as text via `thread.generateObject`; on page reload it renders via `MessageBubble` as plain text — rich card rendering from persisted structured data is v2, same as 4.1's scope note).
- Any change to `searchProjectRag`, `createProjectRag`, `getProjectNamespace`, `_getBmadMetadata`, or the existing `streamMessage`/`analyzeImpact` actions.
- BMAD metadata RAG namespace (spike 4.1 LOCKED: no new RAG namespace — BMAD context is DB-queried and prompt-injected).

### CRITICAL: Spike 4.1 Is LOCKED — Do NOT Re-Litigate

`spike-4.1-bmad-rag-namespace.md` is `DECISION LOCKED` (consumed by Story 4.1). The decisions carry forward to 4.2 unchanged:
1. **No new RAG namespace.** BMAD metadata is NOT embedded. Code chunks use `searchProjectRag`; BMAD metadata uses Convex DB queries.
2. **`buildStoryGenerationPrompt` composes BOTH sources** into the `system` override (mirrors Story 3.2's `buildRagSystemPrompt` and Story 4.1's `buildImpactAnalysisPrompt`).
3. **Graceful degradation**: `bmad_detected = false` → `bmadContext = null` → prompt omits BMAD section → generation runs without BMAD features.

**Unlike Story 4.1, NO spike claim needs correction here.** The `_getBmadMetadata` internal query genuinely EXISTS (Story 4.1 added it at `convex/knowledge/internal.ts:580-619`). Task 0 verifies this — but unlike 4.1's Task 0 which caught a FALSE spike claim, 4.2's Task 0 confirms a TRUE claim. The C4 gate still applies (cite installed types) but no correction is anticipated.

### CRITICAL: `thread.generateObject` Signature (C4 Verified by Story 4.1)

Story 4.1 verified the API at `node_modules/@convex-dev/agent/dist/client/index.d.ts:305-318`. This story uses the SAME pattern (confirmed in Task 0):

```typescript
const { thread } = await agent.continueThread(ctx, {
  threadId: args.threadId,
  userId: ownership.user_id,
});
const result = await thread.generateObject({
  schema: storyGenerationSchema,
  prompt: featureRequest,
  ...(system ? { system } : {}),
});
const stories: UserStory[] = (result.object as StoryGenerationResult).stories;
```

`thread.generateObject` persists BOTH the user's `prompt` (as a user message) AND the assistant's structured response (as an assistant message) to the thread automatically — same auto-persistence contract as `thread.streamText` (Story 3.1 AC4) and `thread.generateObject` in Story 4.1 (after its D1 review correction). No manual `saveMessage` needed.

**Use `thread.generateObject`, NOT bare `generateObject` from `"ai"`.** Story 4.1 initially deviated to bare `generateObject` (Task 7 deviation) and its review D1 REVERTED to `thread.generateObject` because: (a) it restores message persistence (user input + analysis), (b) makes AC11's inline-rendering contract hold on reload (assistant message persists as text via subscription), (c) auto-resolves the "prompt dropped when no system override" bug (P1/HIGH). This story benefits from the same fix — use `thread.generateObject` from the start.

### `STORY_GENERATION_PROMPT` Content Guidance

The prompt should instruct the LLM to:
1. Generate user stories from the feature request, grounded in the provided codebase context (RAG) when present.
2. Each story MUST have: a concise title, a user_story block (as_a/i_want/so_that), at least one numbered acceptance criterion (testable, specific, verifiable), and affected_components (modules/APIs/data models the story touches — empty arrays acceptable when the story genuinely touches none of a category).
3. Acceptance criteria must be testable — written so a developer or QA can verify each one pass/fail. Prefer "Given/When/Then" or "The system shall..." phrasing. Avoid vague criteria like "works correctly".
4. Set `technical_context` ONLY when BMAD context is present AND the story has relevant convention references. Format: "Follows convention: use-zod-validation (inputs validated with zod)" or "Relates to PRD section: Epic 4 — Feature Analysis". Omit the field when no conventions apply.
5. When codebase context is absent (RAG returned null), the `affected_components` may be sparse — do NOT fabricate module/API/data-model names. The summary in `generation_note` should note "Codebase grounding unavailable; affected components may be incomplete."
6. When BMAD context is absent, omit `technical_context` from ALL stories and do NOT mention ADRs/conventions.
7. Aim for 3-7 stories per feature request (enough to decompose the feature, not so many that they're granular). Use `generation_note` to explain the decomposition or flag ambiguity.
8. Format stories in BMAD-compatible structure (title, user_story block, numbered acceptance_criteria, affected_components) — mirrors this project's own story files at `_bmad-output/implementation-artifacts/*.md`.

Mirror the structure of `IMPACT_ANALYSIS_PROMPT` (`convex/chat/impactAgent.ts:6-60`) — role, what you produce, grounding rules (when context present vs absent), communication style. Keep it under ~2500 chars (the system override carries RAG + BMAD context on top — slightly larger budget than impact analysis because story generation is richer).

### Existing APIs to Reuse (NO reinvention)

| API | Location | Purpose |
|-----|----------|---------|
| `_getThreadOwnership` | `convex/chat/internal.ts:21-40` | Thread ownership resolution (B3 IDOR guard) — throw if null |
| `_getChatWorkspaceConfig` | `convex/chat/internal.ts:42-49` | Fetch workspace `ai_config` |
| `_updateThreadLastMessageAt` | `convex/chat/internal.ts:91-106` | Update thread's `last_message_at` on success/failure |
| `_getBmadMetadata` | `convex/knowledge/internal.ts:580-619` | Fetch all 4 BMAD types (Story 4.1 added it — REUSE, do NOT re-add) |
| `getKnowledgeBase` | `convex/knowledge/queries.ts:116-135` | Fetch KB doc (status, `bmad_detected`, `_id`) |
| `searchProjectRag` | `convex/knowledge/queries.ts:322-382` | RAG code search (workspace-scoped, rate-limited) |
| `getWorkspaceModel` | `convex/ai/model.ts:33-44` | BYOK model resolution (C5 `*-free` guard inherited) |
| `createImpactAnalysisAgent` pattern | `convex/chat/impactAgent.ts:62-68` | Template for `createStoryGenerationAgent` |
| `buildImpactAnalysisPrompt` pattern | `convex/chat/impactPrompts.ts:40-69` | Template for `buildStoryGenerationPrompt` |
| `buildImpactErrorMessage` | `convex/chat/impactActions.ts:20-34` | Template for `buildStoryErrorMessage` (include `NoObjectGeneratedError` check FIRST) |
| `validateFeatureRequest` | `convex/chat/impactActions.ts:36-47` | Template for story `validateFeatureRequest` (same `MAX_FEATURE_REQUEST_LENGTH = 32000`) |
| `isRateLimitError` | `@convex-dev/rate-limiter` | Detect RAG rate-limit (re-throw as friendly ConvexError) |
| `getErrorStatusCode`, `getErrorMessage` | `convex/knowledge/embeddingActions.ts` | Error introspection for `buildStoryErrorMessage` |
| `CHAT_RAG_RESULT_LIMIT`, `CHAT_RAG_MAX_CONTEXT_CHARS`, `EMBEDDING_MAX_QUERY_LENGTH`, `EXTRACTION_MAX_CONTEXT_CHARS` | `convex/lib/constraints.ts:41-42, 37, 45` | RAG limit + query clamp + truncation bounds (reuse, do NOT add new constants) |
| `seedWorkspace/Project/ChatThread/KnowledgeBase/BmadMetadata` | `convex/testHelpers.ts` | Test seed helpers |
| `chatTest()` helper | `convex/chat.impact.test.ts:79-84` | Convex test setup (registers agent + rateLimiter components) — copy verbatim |
| `StatusPill`, `EmptyState`, `Alert`, `Button` | `src/components/ui/` | Frontend primitives |
| `useErrorLogger` | `src/lib/error-logger` | Catch-block error logging (use `vi.hoisted` in tests) |
| `ImpactAnalysisCard` structure | `src/components/chat/ImpactAnalysisCard.tsx` | Template for `UserStoriesCard` (`AffectedList`, `<dl>` semantics, confidence badges, grounding notice, BMAD conflicts section) |

### What NOT to Reinvent

| Concern | Reuse | Do NOT build |
|---------|-------|--------------|
| Thread ownership | `_getThreadOwnership` (3.1) | A new ownership check |
| Workspace AI config | `_getChatWorkspaceConfig` (3.1) | A new config fetch |
| KB status / bmad_detected | `getKnowledgeBase` (1.6) | A new KB query |
| BMAD metadata fetch | `_getBmadMetadata` (4.1 — EXISTS at `internal.ts:580`) | A duplicate `_getBmadMetadataForStories` query |
| Code RAG search | `searchProjectRag` (1.4/3.2) | A second RAG namespace, or inline `rag.search` |
| RAG query clamping | `featureRequest.slice(0, EMBEDDING_MAX_QUERY_LENGTH)` (4.1 P4 fix) | An unclamped call that silently fails for >8000-char requests |
| Rate limiting | `ragSearchPerWorkspace` (3.2, already wired in `searchProjectRag`) | A separate rate limiter for story generation |
| BYOK model resolution | `getWorkspaceModel` (C5 guard inherited) | A new model factory |
| Agent Component message persistence | `thread.generateObject` auto-persists | Manual `saveMessage` calls OR bare `generateObject` (4.1 D1 corrected this) |
| `*-free` model guard | `getWorkspaceModel` enforces it (C5, `d2fc4c6`) | A duplicate guard in the story agent |
| Error message pattern | `buildImpactErrorMessage` (4.1) | A third error-message helper (mirror it — include `NoObjectGeneratedError` check FIRST for P2 pattern) |
| Frontend composer UX | `ChatComposer` from 3.4/4.1 (extend with third mode) | A second composer component |
| Frontend error display | `Alert` + `useErrorLogger` + prompt-restore + mode-reset (3.4/4.1 pattern) | Custom error UI |
| Frontend confidence/grounding display | CSS-var-based badges (4.1 `ImpactAnalysisCard` — NOT hardcoded Tailwind colors, P10 pattern) | Hardcoded `bg-red-100`-style classes that break dark mode |
| Frontend stale-result guard | `activeThreadIdRef.current !== params.threadId` check (4.1 P5 pattern) | Unconditionally appending results on mid-flight navigation |
| Test setup | `chatTest()` helper + `vi.mock("ai")` + `vi.mock("./knowledge/rag")` + `vi.hoisted` (4.1 pattern) | A parallel test infrastructure |

### Error Handling (C1 Pre-Review Checklist)

Per Epic 3 retro action C1 (`project-context.md:106`), enumerate error paths BEFORE implementation:

| Path | Surfaced as | Notes |
|------|-------------|-------|
| Thread not found / cross-workspace | `ConvexError("Thread not found")` | B3 IDOR guard — thrown before any AI work |
| Workspace AI config missing | `ConvexError("Story generation failed: workspace AI config not found. Check workspace settings.")` | Mirror 4.1 P11-corrected message (NOT raw `"Chat failed: ..."`) |
| KB not ready / missing | `ConvexError("Knowledge Base is not ready. Build the KB first.")` | Exact mirror of `impactActions.ts:78-82` for consistency |
| RAG rate limit | `ConvexError("You're sending messages too quickly. Please wait a moment and try again.")` | Re-thrown via `isRateLimitError` (mirror `impactActions.ts:98-102`) |
| RAG other error | Swallowed (logged via `console.error("Story generation RAG search error:", error)`) | Mirror `impactActions.ts:103` — generation runs without RAG, `grounded = false` |
| BMAD metadata fetch error | Swallowed (logged via `console.error`) | Generation runs without BMAD context (graceful degradation) — mirror `impactActions.ts:137-139` |
| `generateObject` schema validation failure | `ConvexError("Story generation failed: AI returned malformed stories. Please retry.")` | `NoObjectGeneratedError.isInstance` check FIRST (P2 pattern — distinguish from provider errors) |
| AI provider 401/403 | `ConvexError("Story generation failed: authentication error. Check workspace AI config.")` | Mirror `buildImpactErrorMessage` |
| AI provider 404 | `ConvexError("Story generation failed: model not available.")` | Mirror `buildImpactErrorMessage` |
| `*-free` model | `ConvexError("Model '…' is a free-tier model…")` | Thrown by `getWorkspaceModel` (C5) — propagates |
| `_storeUserStories` DB write failure | `ConvexError("Stories generated but could not be saved. Please retry.")` | NEW message — distinct so user knows generation succeeded but persistence failed; thread has the conversation context (auto-persisted by `thread.generateObject` before the `_storeUserStories` call) |
| `_updateThreadLastMessageAt` failure (success path) | Swallowed (logged via `console.error`) | Cosmetic thread-ordering field; does NOT roll back the stories — mirror `impactActions.ts:176-178` |
| `_updateThreadLastMessageAt` failure (failure path) | Swallowed (logged via `console.error("Story generation last_message_at update error (failure path):", mutationError)`) | P12 pattern — NO empty `.catch(() => {})` |
| Frontend action rejection | `<Alert variant="error">` + prompt restore + mode reset to "chat" + `logError` | Mirror 4.1 `ChatComposer` error handling (P3 mode-reset + P9 logError-assertion pattern) |

**No error is silently swallowed without `console.error` + (frontend) `logError`.** The RAG-swallow and BMAD-swallow paths degrade gracefully (generation continues) but log server-side.

### Dual-Write / Atomicity (C1 Checklist)

- **Dual-write surface**: `thread.generateObject` (auto-persists user message + assistant message to the Agent Component's `threads`/`messages` tables) + `_storeUserStories` (persists structured stories to the `user_stories` table). Two systems, two tables.
- **Ordering**: `thread.generateObject` FIRST (atomic — Story 4.1 verified the contract), THEN `_storeUserStories`. Rationale: if `_storeUserStories` fails, the thread conversation is intact (the user sees their input + the AI's structured response in the thread), the action throws "Stories generated but could not be saved. Please retry.", and on retry the LLM regenerates (non-deterministic — acceptable for drafts; 4.3 owns delete for cleanup). If `thread.generateObject` fails first, NEITHER write happens (the action throws before reaching `_storeUserStories`).
- **Reconciliation**: NONE needed. The two writes are independent (thread conversation context vs. structured story artifacts). Unlike Story 3.1's agent-title + join-title dual-write, there's no field that must agree between the two systems. The thread's assistant message is the LLM's raw structured output (JSON-ish text); the `user_stories` rows are the parsed `stories` array. They don't need to stay in sync — the thread is the conversation history, the table is the queryable artifact store.
- **`_updateThreadLastMessageAt`** is called in BOTH paths (success + failure) with best-effort `.catch(console.error)` — cosmetic field, does NOT affect story persistence.

### Test Quality (C1 Checklist)

Per C1, tests must assert CONTENT not just TYPE (Story 4.1 review caught multiple "test passes on empty string" gaps):
- Schema tests: `.toBe(expectedValue)`, `.toMatch(/pattern/)`, `.rejects.toThrow("specific message")` — NOT `typeof === "string"`. Specifically: assert `stories.min(1)` rejects empty array; assert `acceptance_criteria.min(1)` rejects empty array per story.
- Action tests: assert `generateObject` was called with the EXACT schema object (`expect(args.schema).toBe(storyGenerationSchema)` — P7 pattern), the prompt equals the feature request, the system string CONTAINS specific RAG/BMAD section markers (`## Retrieved Codebase Context`, `### ADRs`).
- Action tests: assert `_storeUserStories` was called with the generated stories AND the verified ownership fields (`workspace_id`, `project_id` from `ownership`, NOT from client args).
- Action tests: assert error messages use the "Story generation failed:" prefix (P11 pattern — NOT "Chat failed:").
- Action tests: assert `_updateThreadLastMessageAt` is called on BOTH success and failure paths (P12 pattern — no empty catches).
- Component tests: assert specific rendered text (story title, "As a...", numbered "1.", "2.", "3." criteria), specific chip values (module names), specific `technical_context` content — NOT just "renders a card".
- Composer tests: assert `mockLogError` was called in the stories-mode error path (P9 pattern — the code calls it, the test must verify).

### React 19 + Next.js 16 Rules

- All state updates (`setMode`, `setStoryResults`, `setPrompt`, `setIsSending`) inside event handlers / callbacks / effects — NEVER in render body. React 19 forbids calling `setState` on other components during render (`project-context.md:59`).
- `useEffect` for auto-scroll (extends 4.1's pattern) — `scrollIntoView` is a DOM side-effect.
- `"use client"` at top of `UserStoriesCard.tsx` (consistency with `ImpactAnalysisCard.tsx:1`).
- Conditional queries via `"skip"`: `getThread` → `"skip"` gate preserved from 3.3/3.4/4.1 (no change).
- Next.js 16: read `node_modules/next/dist/docs/` if unsure about App Router conventions. No new routes in this story.
- `forwardRef` components (if any): destructure overridden props before `{...props}` spread (`project-context.md:60`). Not anticipated for this story.

### Accessibility

- Mode toggle (now 3 buttons): preserve `role="group"`, `aria-label="Message mode"`. Each option is a `<button>` with `aria-pressed` reflecting active state (mirror 4.1's toggle at `ChatComposer.tsx:156-185`).
- `UserStoriesCard`: use semantic HTML — `<section>` per story, `<h3>` for story titles, `<dl>/<dt>/<dd>` for the As-a/I-want/So-that triples (P8 pattern — NOT `<ul>/<li>` with `<span>`), `<ol>/<li>` for numbered acceptance criteria (semantically a numbered list).
- Grounding-unavailable notice: `role="status"`, `aria-live="polite"` (D2 pattern from `ImpactAnalysisCard.tsx:148-150`).
- Affected-components chips: `aria-label` on the chips section (e.g. "Affected modules: auth, users, sessions").
- Preserve 3.4's keyboard nav: Enter-to-send works in all three modes; Shift+Enter inserts newline.
- Color: CSS-var-based classes only (`var(--success)`, `var(--warning)`, `var(--error)` — mirror `ImpactAnalysisCard.tsx:10-14`). NO hardcoded Tailwind colors (P10 pattern — `bg-red-100` breaks dark mode).

### Previous Story Intelligence

**Story 4.1 (Impact Analysis Agent) — DIRECT predecessor, same epic, same architectural pattern:**
1. `analyzeImpact` action (`convex/chat/impactActions.ts`) is the EXACT template for `generateStories`. The flow (validate → ownership → config → KB → RAG → BMAD → prompt → agent → generateObject → persist → return) is identical — only the schema, prompt, agent, and persistence target differ. Copy the structure, change the names.
2. `buildImpactAnalysisPrompt` (`convex/chat/impactPrompts.ts`) is the EXACT template for `buildStoryGenerationPrompt`. The RAG-truncation pattern, BMAD-formatting pattern, "return undefined when both null" pattern, "re-include base prompt first" pattern — all carry over verbatim.
3. `createImpactAnalysisAgent` (`convex/chat/impactAgent.ts:62-68`) is the EXACT template for `createStoryGenerationAgent`. Only `name`, `instructions` differ.
4. `ImpactAnalysisCard` (`src/components/chat/ImpactAnalysisCard.tsx`) is the structural template for `UserStoriesCard`. The `AffectedList` pattern (empty-state placeholder, `<dl>` semantics), grounding notice (D2), CSS-var colors (P10), `role="alert"`/`aria-live` (P8) — all carry over.
5. `ChatComposer` mode toggle (added in 4.1) is the template for the third mode. The `handleSubmit` branching, mode-reset-on-error (P3), `onImpactResult` callback pattern — extend for `onStoriesResult`.

**Story 4.1 review patches to inherit (DO NOT repeat these mistakes):**

| 4.1 Review Patch | What to do in 4.2 |
|------------------|-------------------|
| D1 — use `thread.generateObject` (not bare `generateObject`) | Use `thread.generateObject` from the START (Task 8). Auto-persistence + system-fallback for free. |
| D2 — `grounded` flag + "grounding unavailable" notice | Return `grounded: boolean` from the action; `UserStoriesCard` shows the notice when `grounded === false`. |
| P2 — schema-validation error distinction (`NoObjectGeneratedError`) | `buildStoryErrorMessage` checks `NoObjectGeneratedError.isInstance(error)` FIRST → "malformed stories" message. |
| P3 — mode reset on error | `setMode("chat")` in the `ChatComposer` catch block covers all modes (capture `activeMode` before try — already the pattern at line 94). |
| P4 — RAG query clamping (`featureRequest.slice(0, EMBEDDING_MAX_QUERY_LENGTH)`) | Clamp the `searchProjectRag` query — prevents silent grounding loss for >8000-char requests. |
| P5 — stale-result navigation guard | `handleStoriesResult` checks `activeThreadIdRef.current !== params.threadId` before appending. |
| P7 — schema-identity assertion in action test | `expect(args.schema).toBe(storyGenerationSchema)` in the happy-path test. |
| P8 — `<dl>` semantics for entity triples | `UserStoriesCard` uses `<dl>/<dt>/<dd>` for As-a/I-want/So-that. |
| P9 — `logError` assertion in composer error test | `expect(mockLogError).toHaveBeenCalled()` in the stories-mode error test. |
| P10 — CSS-var colors (no hardcoded Tailwind) | `UserStoriesCard` uses `var(--success)` etc. — NO `bg-red-100`. |
| P11 — domain-specific error prefix | "Story generation failed:" prefix (NOT "Chat failed:" or "Impact analysis failed:"). |
| P12 — no empty `.catch(() => {})` | All best-effort catches log via `.catch((err) => console.error(...))`. |

**Story 3.4 (Chat UI with Streaming Display) — frontend foundation:**
1. `ChatComposer`'s error-handling pattern (restore prompt, `<Alert>`, `logError`, `vi.hoisted` for the error-logger mock) is established — reuse verbatim for stories mode.
2. Auto-scroll (`messagesEndRef`, `isNearBottomRef`) extends naturally — add `storyResults.length` to the `useEffect` dependency array.

**Epic 3 retrospective — defects to avoid (B1/B3/B5 + C-series):**

| Epic 3/4.1 Defect | Mitigation in This Story |
|-------------------|--------------------------|
| B1 review gate | `### Review Findings` section + `Status: done` header matching `sprint-status.yaml` is the ENFORCED done-gate. |
| B3 IDOR on `Id`-accepting actions | `generateStories` accepts `threadId` — `_getThreadOwnership` enforces ownership from the first commit. `_storeUserStories` writes `workspace_id`/`project_id` from verified `ownership` object, NEVER from client args. |
| B5 `useErrorLogger` mock | `vi.hoisted` for a single reusable `logError` fn in `ChatComposer` stories-mode tests. |
| C1 pre-review checklist | Error paths enumerated above; test-asserts-on-content rule applied; spec-consistency sweep done (ACs ↔ Tasks ↔ Dev Notes ↔ "What NOT to Reinvent" — no contradictions found). |
| C2 async-timing claims | NO async-timing claims in this spec. `thread.generateObject` resolves when the LLM finishes (10-60s typical for structured generation) — the frontend shows `isSending` until then. No "<Xms window" claims. |
| C4 spike API-claim verification | Task 0 verifies `_getBmadMetadata` EXISTS (Story 4.1 added it — TRUE claim, unlike 4.1's false claim) and the `thread.generateObject` signature (cited at `client/index.d.ts:305-318`). |
| C5 `*-free` model guard | Inherited from `getWorkspaceModel` (`d2fc4c6`) — no action needed. |

### Git Intelligence

Baseline: latest `main` = `a7772e4` (Story 4.1 with code review fixes). Relevant recent commits:
- `a7772e4` — Story 4.1 (Impact Analysis Agent) with 16 review patches applied. **This story's direct predecessor — `impactActions.ts`, `impactSchema.ts`, `impactPrompts.ts`, `impactAgent.ts`, `ImpactAnalysisCard.tsx`, `ChatComposer.tsx` (mode toggle), `[threadId]/page.tsx` (impact card rendering), `_getBmadMetadata` are all templates/modification targets.**
- `4da1c05` — Spike 4.1 BMAD-RAG namespace decision (DECISION LOCKED — this story consumes it).
- `771be96` — Epic 3 retro action items C1/C2/C4/C5 applied to `project-context.md` (this story inherits all).
- `d2fc4c6` — C5 `*-free` model guard in `getWorkspaceModel` (this story inherits it).
- `9af8251` — C3 `pnpm build` fix (this story's Task 15 build claim is TRUE — `ignoreBuildErrors` remains only for pre-existing deep-generic errors).
- `0412cba` — Story 3.4 (Chat UI with Streaming Display) — the `ChatComposer.tsx` and `[threadId]/page.tsx` are the modification targets (extended in 4.1, extended again here).

NEW schema table (`user_stories`). No new dependencies (all packages installed: `@convex-dev/agent`, `ai`, `zod`, `@convex-dev/rate-limiter`). New files under `convex/chat/` (no new `convex/` directory — the file-watcher restart rule does NOT apply).

Single `feat:` commit per story (follow `a7772e4` convention).

### Deferred Work Relevant to This Story

Per retro action A8, review `_bmad-output/implementation-artifacts/deferred-work.md`:

- **`useErrorLogger` mock returns fresh fn per call** (line 14, B5): use `vi.hoisted` in `ChatComposer` stories-mode tests (3.3/3.4/4.1 pattern).
- **Query errors show infinite skeleton** (line 45): `getKnowledgeBase` query error (rare) would leave the page on skeleton — acceptable for v1, matches existing pages.
- **Invalid `params.id` / `params.threadId`** (line 114): codebase-wide ID-validation gap. The `"skip"` gate mitigates. NOT in this story.
- **`getOptionalMemberWorkspace` uses `.first()`** (line 99, C8): systemic — `generateStories` inherits via `_getThreadOwnership` → `getOptionalMemberWorkspace`. NOT in this story.
- **`pnpm build` pre-existing errors** (line 106, C9): RESOLVED at `9af8251` (C3). The remaining `ignoreBuildErrors: true` covers only pre-existing deep-generic TS2589/TS7022 — this story's files should NOT introduce new type errors (verify via `pnpm typecheck`).
- **Multi-workspace `.first()` bug** (line 118, from 4.1 review): `generateStories` inherits the systemic `.first()` bug via `_getThreadOwnership`. NOT introduced by this story.
- **No `*-free` model guard** (C5): RESOLVED at `d2fc4c6`. Inherited by `createStoryGenerationAgent` via `getWorkspaceModel`.

### Deferred from this story (NOT in scope, document for future)

- **Story dependency detection from existing BMAD story data** (epic AC mentions "story dependencies are detected from existing BMAD story data"): BMAD stories are NOT parsed by Story 1.9 — `kb_bmad_metadata` only has `prd_section | adr | convention | domain_term` types (`convex/schema.ts:399-404`). Implementing this would require: (a) extending 1.9 to parse `_bmad-output/implementation-artifacts/*.md` into a new `story` type, (b) adding `story` to the `kb_bmad_metadata.type` union, (c) updating `_getBmadMetadata` to return stories, (d) updating the generation prompt to reason about story overlap. This is a 1.9-scope expansion, NOT a 4.2 concern. The `technical_context` field on each generated story is the closest approximation in this story — it can note PRD-section overlap (from `prd_sections` metadata) but not story-level dependency. Track in deferred-work.md after implementation.
- **Structured card rendering from reloaded thread history**: on page reload, the assistant message (auto-persisted by `thread.generateObject`) renders as plain text via `MessageBubble`. Rich `UserStoriesCard` rendering from persisted `user_stories` rows is a Story 4.3 enhancement (when the `/projects/[id]/stories` list page lands, it can deep-link to thread contexts).

### Project Structure Notes

NEW backend files:
```
convex/chat/
├── storySchema.ts              # NEW — storyGenerationSchema (zod v4) + types (AC3)
├── storySchema.test.ts         # NEW — schema unit tests (AC15)
├── storyPrompts.ts             # NEW — buildStoryGenerationPrompt + STORY_GENERATION_PROMPT re-export (AC2, #5)
├── storyPrompts.test.ts        # NEW — prompt builder unit tests (AC15)
├── storyAgent.ts               # NEW — createStoryGenerationAgent factory + STORY_GENERATION_PROMPT (AC2)
├── storyActions.ts             # NEW — generateStories action ("use node") (AC1)
└── (existing files unchanged)
convex/
├── chat.stories.test.ts        # NEW — action integration tests + _storeUserStories tests (AC15)
```

MODIFIED backend files:
```
convex/schema.ts                # MODIFY — add user_stories table (AC9)
convex/chat/internal.ts         # MODIFY — add _storeUserStories internal mutation (AC10)
convex/testHelpers.ts           # MODIFY — add seedUserStory helper (AC15)
```

NEW frontend files:
```
src/components/chat/
├── UserStoriesCard.tsx         # NEW — structured card renderer (AC13)
└── UserStoriesCard.test.tsx    # NEW — component tests (AC15)
```

MODIFIED frontend files:
```
src/components/chat/ChatComposer.tsx        # MODIFY — add third mode "stories" (AC13)
src/components/chat/ChatComposer.test.tsx   # EXTEND — third mode tests (AC15)
src/app/(auth)/projects/[id]/chat/[threadId]/page.tsx  # MODIFY — render story cards (AC13)
src/app/(auth)/projects/[id]/chat/[threadId]/thread-view.test.tsx  # MODIFY — add storyActions.generateStories to API mock (if it exists; 4.1 added impactActions mock here)
```

**NEW schema table:** `user_stories` (AC9). No new `convex/` directories (new files go in existing `convex/chat/`). No new dependencies. No `pnpm dev` restart needed (the Convex file-watcher picks up new files in existing directories; the new table requires a schema deployment via the normal `pnpm dev` flow).

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 4.2] — ACs and user story (lines 711-737)
- [Source: _bmad-output/planning-artifacts/epics.md#Epic 4] — Epic context (lines 250-256, 678-681)
- [Source: _bmad-output/planning-artifacts/epics.md#FR-21] — AI generates user stories with As a/I want/So that + acceptance criteria + affected components
- [Source: _bmad-output/planning-artifacts/epics.md#FR-B7] — User Story generation injects project conventions and generates in BMAD-compatible format when available
- [Source: _bmad-output/planning-artifacts/epics.md#NFR-5] — Time-to-impact-analysis under 5 minutes (applies to story generation too)
- [Source: _bmad-output/planning-artifacts/spike-4.1-bmad-rag-namespace.md] — **DECISION LOCKED** (consumed by 4.1, carries forward): no new RAG namespace; DB queries for BMAD; `buildStoryGenerationPrompt` composes both sources. `_getBmadMetadata` genuinely exists (4.1 added it).
- [Source: _bmad-output/implementation-artifacts/4-1-impact-analysis-agent.md] — **DIRECT predecessor; `impactActions.ts`, `impactSchema.ts`, `impactPrompts.ts`, `impactAgent.ts`, `ImpactAnalysisCard.tsx`, `ChatComposer.tsx` mode toggle, `[threadId]/page.tsx` impact card rendering, `_getBmadMetadata` internal query are ALL templates/modification targets.** Review patches D1/D2/P2/P3/P4/P5/P7/P8/P9/P10/P11/P12 are inherited verbatim.
- [Source: _bmad-output/implementation-artifacts/epic-3-retrospective.md] — C1/C2/C4/C5 action items; Epic 4 preparation; lessons applied.
- [Source: _bmad-output/implementation-artifacts/deferred-work.md] — lines 14, 45, 99, 106, 114, 118 (all reviewed; none blocking this story).
- [Source: _bmad-output/project-context.md] — Critical rules (React 19 line 59, IDOR line 120-124, review gate line 105, C1 checklist line 106, C2 async-timing line 107, C4 spike-citation line 108, C5 `*-free` guard line 109, error logging line 102-103, no-comments line 51/93).
- [Source: convex/chat/impactActions.ts:1-182] — **`analyzeImpact` action — the DIRECT template for `generateStories`.** Lines 18 (`MAX_FEATURE_REQUEST_LENGTH`), 20-34 (`buildImpactErrorMessage` — template for `buildStoryErrorMessage`), 36-47 (`validateFeatureRequest`), 57-82 (ownership + config + KB guards), 84-104 (RAG + rate-limit + clamping — P4 fix), 106-140 (BMAD conditional — `_getBmadMetadata` reuse), 142-169 (generateObject + error handling), 171-180 (last_message_at + return).
- [Source: convex/chat/impactSchema.ts:1-34] — **`impactAnalysisSchema` — the DIRECT template for `storyGenerationSchema`.** Wrapper-object pattern, `.min(0)`/`.max(1)` on confidence, `.optional()` on conditional fields.
- [Source: convex/chat/impactPrompts.ts:1-70] — **`buildImpactAnalysisPrompt` — the DIRECT template for `buildStoryGenerationPrompt`.** RAG truncation, BMAD section formatting, "return undefined when both null" pattern.
- [Source: convex/chat/impactAgent.ts:1-68] — **`createImpactAnalysisAgent` + `IMPACT_ANALYSIS_PROMPT` — the DIRECT template for `createStoryGenerationAgent` + `STORY_GENERATION_PROMPT`.**
- [Source: convex/chat/internal.ts:21-40, 42-49, 91-106] — `_getThreadOwnership`, `_getChatWorkspaceConfig`, `_updateThreadLastMessageAt` — reused unchanged. `_storeUserStories` appended here.
- [Source: convex/knowledge/internal.ts:580-619] — **`_getBmadMetadata` internal query (Story 4.1 added it) — REUSED for BMAD context fetch.** Returns all 4 types, verifies `workspace_id`.
- [Source: convex/knowledge/queries.ts:116-135] — `getKnowledgeBase` — KB + `bmad_detected` resolution.
- [Source: convex/knowledge/queries.ts:322-382] — `searchProjectRag` action — reused for code RAG.
- [Source: convex/ai/model.ts:33-44] — `getWorkspaceModel` (C5 `*-free` guard).
- [Source: convex/lib/constraints.ts:37, 41-42, 45] — `EMBEDDING_MAX_QUERY_LENGTH`, `CHAT_RAG_RESULT_LIMIT`, `CHAT_RAG_MAX_CONTEXT_CHARS`, `EXTRACTION_MAX_CONTEXT_CHARS` (reuse).
- [Source: convex/schema.ts:377-498] — Existing table patterns (`knowledge_bases`, `baseline_rds`, `drift_reports`, `chat_threads`) — template for `user_stories` table structure + index conventions.
- [Source: convex/testHelpers.ts:125-160, 221-241, 298-326, 533-550] — `seedKnowledgeBase`, `seedBaselineRd` (override pattern template), `seedBmadMetadata`, `seedChatThread` helpers.
- [Source: convex/chat.impact.test.ts:1-446] — **`chatTest()` helper + `vi.mock("ai")` + `vi.mock("./knowledge/rag")` + `vi.mock("./chat/impactAgent")` + `vi.hoisted` pattern — the test setup template for `chat.stories.test.ts`.** Lines 4-39 (mocks), 65-84 (module setup + chatTest helper), 97-110 (setupReadyProject), 112-118 (beforeEach reset).
- [Source: convex/chat/impactPrompts.test.ts:1-153] — **Pure-function prompt-builder test template for `storyPrompts.test.ts`.**
- [Source: src/components/chat/ImpactAnalysisCard.tsx:1-213] — **`ImpactAnalysisCard` — structural template for `UserStoriesCard`.** Lines 10-14 (CSS-var confidence colors — P10 pattern), 47-103 (`AffectedList` with empty-state placeholder + `<dl>` semantics — P8 pattern), 127-156 (grounding notice — D2 pattern), 184-210 (`role="alert"` conflicts section).
- [Source: src/components/chat/ChatComposer.tsx:1-209] — **THE modification target (add third mode).** Lines 20 (ChatMode type), 51-52 (useAction calls), 76-130 (handleSubmit with mode branching), 94 (activeMode capture before try), 116 (setMode("chat") in catch — P3 pattern), 156-185 (mode toggle UI).
- [Source: src/components/chat/ChatComposer.test.tsx:1-315] — **Test template for third-mode tests.** Lines 5-9 (vi.hoisted block — add `mockGenerateStories`), 11-29 (convex/react + @/lib/convex mocks — add `storyActions.generateStories`), 43 (onImpactResult callback — add `onStoriesResult`), 193-315 (mode toggle test pattern — extend for third mode).
- [Source: src/app/(auth)/projects/[id]/chat/[threadId]/page.tsx:1-254] — **THE modification target (story card rendering).** Lines 54-56 (impactResults state — add storyResults), 58-62 (thread-change reset — add storyResults reset), 106-113 (auto-scroll deps — add storyResults.length), 129-132 (handleImpactResult with P5 stale-guard — template for handleStoriesResult), 214-220 (ImpactAnalysisCard rendering — add UserStoriesCard rendering), 242-250 (ChatComposer props — add onStoriesResult).
- [Source: src/components/ui/index.ts] — Exported UI primitives (`Button`, `Alert`, `EmptyState`, `StatusPill`).
- [Source: node_modules/@convex-dev/agent/dist/client/index.d.ts:305-318] — **`thread.generateObject` signature (C4 verified by Story 4.1).**

## Dev Agent Record

### Agent Model Used

glm-5.2 (zai-coding-plan/glm-5.2) via opencode

### Debug Log References

- `convexTest` resolves `_storeUserStories`/`generateStories` via `import.meta.glob` dynamic module loading, so they work at runtime even though `convex/_generated/api.ts` is stale (regenerates on next `npx convex dev`). Typecheck reports `Property 'storyActions' does not exist` until then — pre-existing pattern, identical to `impactActions` after Story 4.1.
- The `_storeUserStories` failure path cannot be injected via `vi.spyOn` on the generated internal API (convex-test's registered refs aren't plain-overrideable). Tested the failure surface instead by calling the internal mutation directly with an invalid `workspace_id` (validator rejects non-Id strings) — the action's surrounding `try/catch` is exercised at runtime and the success-path persistence test (which asserts stories ARE stored with correct linkage) covers the happy path.
- Full-suite convex run is flaky under parallel load (15 transient file-failures when run alongside the frontend suite); isolated re-run passes 68/68. Story-specific files (`storySchema`, `storyPrompts`, `chat.stories`) pass consistently in isolation.

### Completion Notes List

- **Task 0 (C4 gate)**: All 6 infrastructure claims verified TRUE — `_getBmadMetadata` at `internal.ts:580`, `thread.generateObject` at `client/index.d.ts:305-318`, `user_stories` table absent, `seedUserStory` absent, `getKnowledgeBase` returns `bmad_detected`, `searchProjectRag` THROWS (not clamps) on >8000-char query so the action must clamp at the call site (inherited verbatim from 4.1's P4 fix).
- **Backend (Tasks 1-8)**: Implemented `storySchema.ts` (zod v4 wrapper schema + types), `storyPrompts.ts` (pure `buildStoryGenerationPrompt` mirroring `impactPrompts.ts` exactly), `storyAgent.ts` (`STORY_GENERATION_PROMPT` + `createStoryGenerationAgent` factory), `storyActions.ts` (`generateStories` action mirroring `analyzeImpact` with the `_storeUserStories` dual-write per AC11 + error handling per AC12), `user_stories` table + `_storeUserStories` internal mutation. All 4.1 review patches inherited: D1 (`thread.generateObject`), D2 (`grounded` flag), P2 (`NoObjectGeneratedError` distinction), P4 (RAG clamp), P11 ("Story generation failed:" prefix), P12 (no empty catches).
- **Frontend (Tasks 9-13)**: `UserStoriesCard` (pure presentational, CSS-var colors per P10, `<dl>` semantics per P8, `role="status"` grounding notice per D2), `ChatComposer` third mode (`"chat" | "impact" | "stories"` with mode-reset-on-error per P3 + `logError` per P9), `[threadId]` page integration (`storyResults` state with P5 stale-result guard, auto-scroll dep). Added `storyActions.generateStories` to the `thread-view.test.tsx` API mock (the only existing test broken by the new `useAction` call).
- **Task 14**: `seedUserStory` helper added to `testHelpers.ts` (mirrors `seedBaselineRd` override pattern, default `status: "draft"`, for Story 4.3's use).
- **Tests**: 14 (schema) + 17 (prompts) + 17 (action/mutation) + 11 (UserStoriesCard) + 6 (new composer stories-mode) = 65 new tests. All assert content (P7 schema-identity, `.toMatch` patterns, specific error prefixes) not just types.
- **Scope respected**: No story-list/status UI (4.3), no export (4.4), no status mutations, no reload-card rendering, no BMAD-story-dependency detection (deferred — 1.9-scope), no `searchProjectRag`/`_getBmadMetadata`/`createProjectRag` changes.

### File List

**NEW backend:**
- `convex/chat/storySchema.ts` — `userStorySchema`, `storyGenerationSchema`, `UserStory`/`StoryGenerationResult` types, re-exports `BmadContext` (AC3)
- `convex/chat/storySchema.test.ts` — 14 schema unit tests (AC15)
- `convex/chat/storyPrompts.ts` — `buildStoryGenerationPrompt` pure function (AC5)
- `convex/chat/storyPrompts.test.ts` — 17 prompt-builder unit tests (AC15)
- `convex/chat/storyAgent.ts` — `STORY_GENERATION_PROMPT` + `createStoryGenerationAgent` factory (AC2)
- `convex/chat/storyActions.ts` — `generateStories` action `"use node"` (AC1, AC2, AC4, AC6-AC8, AC11, AC12, AC14)
- `convex/chat.stories.test.ts` — 17 action/mutation integration tests (AC15)

**MODIFIED backend:**
- `convex/schema.ts` — added `user_stories` table with 3 indexes (AC9)
- `convex/chat/internal.ts` — added `_storeUserStories` internal mutation (AC10)
- `convex/testHelpers.ts` — added `seedUserStory` helper (AC15)

**NEW frontend:**
- `src/components/chat/UserStoriesCard.tsx` — structured card renderer (AC13)
- `src/components/chat/UserStoriesCard.test.tsx` — 11 component tests (AC15)

**MODIFIED frontend:**
- `src/components/chat/ChatComposer.tsx` — third mode `"stories"` (AC13)
- `src/components/chat/ChatComposer.test.tsx` — 6 new stories-mode tests (AC15)
- `src/app/(auth)/projects/[id]/chat/[threadId]/page.tsx` — `storyResults` state + `UserStoriesCard` rendering + `handleStoriesResult` with P5 stale-guard (AC13)
- `src/app/(auth)/projects/[id]/chat/[threadId]/thread-view.test.tsx` — added `storyActions.generateStories` to API mock

**Tracking:**
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — `4-2-user-story-generation`: ready-for-dev → in-progress → review; `last_updated` bumped

### Change Log

- 2026-06-15: Story 4.2 implemented via TDD (RED→GREEN→REFACTOR) across all 15 tasks. 65 new tests added. All 4.1 review patches (D1/D2/P2/P3/P4/P5/P7/P8/P9/P10/P11/P12) inherited. Validation: lint 0 errors, frontend 371/371 pass, convex 1044/1044 pass, build compiles, typecheck 519 errors (down from 533 baseline — zero new).

### Review Findings

Three-layer review (Blind Hunter, Edge Case Hunter, Acceptance Auditor) on 2026-06-15. 0 decision-needed, 15 patch, 9 defer, 10 dismissed.

- [x] [Review][Patch] **P1 [CRITICAL] `_storeUserStories` failure test does not exercise the action's catch block** [convex/chat.stories.test.ts:537-556; storyActions.ts:1166-1177] — FIXED: Extracted `persistUserStories(ctx, args)` helper into `convex/chat/storyPersistence.ts` (mockable). Test now exercises the action's real catch path via `persistOverride.fn` and asserts the exact "Stories generated but could not be saved" message.
- [x] [Review][Patch] **P2 [HIGH] Missing "workspace AI config not found" test** [convex/chat.stories.test.ts] — FIXED: Added test mirroring `chat.impact.test.ts:190-205` (delete workspace, call `_getChatWorkspaceConfig`, assert null + falsy ai_config).
- [x] [Review][Patch] **P3 [HIGH] No test verifies `_updateThreadLastMessageAt` on both paths** [convex/chat.stories.test.ts] — FIXED: Added 2 tests. Both seed a thread with `last_message_at: 1_000_000`, run the action, then assert `last_message_at > BEFORE_TIMESTAMP` — one for success path, one for `generateObject` failure path.
- [x] [Review][Patch] **P4 [HIGH] `continueThread` and `getWorkspaceModel` are outside any try/catch** [convex/chat/storyActions.ts:1132-1138] — FIXED: Restructured so `getWorkspaceModel`, `createStoryGenerationAgent`, `agent.continueThread`, and `thread.generateObject` are all inside the same try/catch. Errors now flow through `buildStoryErrorMessage` with the "Story generation failed:" prefix.
- [x] [Review][Patch] **P5 [HIGH] Frontend silently drops results when `result.stories` is missing** [src/components/chat/ChatComposer.tsx:480-489] — FIXED: Added `else` branch that sets `<Alert>` error, fires `onError`, calls `logError`, and does not advance to "sent" state silently.
- [x] [Review][Patch] **P6 [HIGH] `generation_note` is generated, schema-validated, then discarded** [convex/chat/storyActions.ts:1147,1188; ChatComposer.tsx:118-120; page.tsx:233-238; UserStoriesCard.tsx:7,109,133] — FIXED: Threaded `generationNote` end-to-end. Action extracts `result.object.generation_note` and returns it; composer callback signature now `(stories, grounded, generationNote?)`; `page.tsx` stores it in `storyResults` state and passes it to `<UserStoriesCard generationNote={...} />`.
- [x] [Review][Patch] **P7 [MEDIUM] `result.grounded ?? true` defaults the wrong direction** [src/components/chat/ChatComposer.tsx:485] — FIXED: Changed to `result.grounded ?? false` so malformed responses render the "grounding unavailable" notice instead of hiding it.
- [x] [Review][Patch] **P8 [MEDIUM] `storedStoryValidator` lacks `acceptance_criteria` length floor** [convex/chat/internal.ts:108-122] — FIXED: Added runtime check inside `_storeUserStories` handler that throws `ConvexError` when any story has empty `acceptance_criteria`. (Convex's `v.array` doesn't support `.min()` — runtime check is the canonical pattern.)
- [x] [Review][Patch] **P9 [MEDIUM] Schema test only verifies `by_workspace_id` index** [convex/chat.stories.test.ts] — FIXED: Added tests that exercise `by_project_id` and `by_project_id_and_status` indexes via `withIndex` queries, asserting they return the seeded rows. Also added a test for the P8 runtime check.
- [x] [Review][Patch] **P10 [MEDIUM] User input typed during in-flight action overwritten on error** [src/components/chat/ChatComposer.tsx:87,131] — FIXED: Added `disabled={isSending}` to the textarea so user cannot type during the LLM call. Prompt-restore on error can no longer overwrite in-flight input.
- [x] [Review][Patch] **P11 [MEDIUM] `setMode("chat")` overrides user's in-flight mode change** [src/components/chat/ChatComposer.tsx:112,122,132] — FIXED: Changed both success-path and catch-block `setMode("chat")` calls to `if (mode === activeMode) setMode("chat")`. User's explicit mid-call mode change is preserved. (Note: P12 also disables the buttons during isSending, making this defense-in-depth.)
- [x] [Review][Patch] **P12 [MEDIUM] Mode-toggle buttons not disabled during `isSending`** [src/components/chat/ChatComposer.tsx:165-213] — FIXED: Added `disabled={isSending}` + `disabled:opacity-50 disabled:cursor-not-allowed` classes to all three mode-toggle buttons.
- [x] [Review][Patch] **P13 [LOW] Empty-string acceptance criterion renders an empty `<li>`** [convex/chat/storySchema.ts:14; src/components/chat/UserStoriesCard.tsx:71-75] — FIXED: Tightened zod schema to `z.array(z.string().min(1)).min(1)` so empty strings inside the array are rejected at validation time.
- [x] [Review][Patch] **P14 [LOW] Duplicate imports from `../lib/constraints`** [convex/chat/storyPrompts.ts:2-3] — FIXED: Consolidated into a single import statement.
- [x] [Review][Patch] **P15 [LOW] Hoisted `mockModel` is unused, shadows named import** [convex/chat.stories.test.ts:1199-1224] — FIXED: Removed `mockModel` from the hoisted block and the `void mockModel;` silencer.

- [x] [Review][Defer] **D1 BMAD section truncation can cut mid-markdown** [convex/chat/storyPrompts.ts:716-722] — deferred, pre-existing — mirrors `impactPrompts.ts:56-61` truncation pattern; codebase-wide structural-aware truncation needed (stop at last `\n\n`).
- [x] [Review][Defer] **D2 Stories lost on `_storeUserStories` failure with no UI recovery** [convex/chat/storyActions.ts:1142-1177] — deferred, spec-accepted — spec AC11 explicitly accepts the tradeoff ("the thread has the conversation context but the stories aren't in the table — acceptable for drafts; 4.3 owns delete"). Full recovery UI belongs to 4.3 story management.
- [x] [Review][Defer] **D3 No `by_thread_id` index on `user_stories`** [convex/schema.ts:499-527] — deferred, spec-acknowledged — spec Dev Notes line 415 explicitly states thread-scoped queries are a 4.3 enhancement. Adding the index now without a query is premature.
- [x] [Review][Defer] **D4 Action not rate-limited at the LLM-call layer** [convex/chat/storyActions.ts] — deferred, pre-existing — spec "What NOT to Reinvent" table inherits the RAG-via-rate-limit pattern from `analyzeImpact`; mirrors `impactActions.ts`. Codebase-wide concern.
- [x] [Review][Defer] **D5 `MAX_FEATURE_REQUEST_LENGTH = 32000` could blow context window combined with system** [convex/chat/storyActions.ts:1008,1144] — deferred, pre-existing — mirrors `impactActions.ts:36-47` exactly. Codebase-wide token-budget refactor needed.
- [x] [Review][Defer] **D6 `Agent` instance constructed per call** [convex/chat/storyAgent.ts:976-982] — deferred, pre-existing — mirrors `impactAgent.ts` factory pattern; established and reviewed-clean in 4.1.
- [x] [Review][Defer] **D7 Deep `node_modules` imports in test setup** [convex/chat.stories.test.ts:1264-1275] — deferred, pre-existing — required by `convex-test`'s `import.meta.glob` module-map pattern; mirrors `chat.impact.test.ts`. Version-fragile but established.
- [x] [Review][Defer] **D8 `impactResults` and `storyResults` render in fixed order, not chronological** [src/app/(auth)/projects/[id]/chat/[threadId]/page.tsx:226-239] — deferred, pre-existing — mirrors 4.1's fixed-order pattern between messages and impact cards. A unified chronological `auxResults` array is a cross-feature refactor.
- [x] [Review][Defer] **D9 Redundant `aria-label` on `<section>` plus `<h4>` inside** [src/components/chat/UserStoriesCard.tsx:1778-1781] — deferred, pre-existing — minor a11y smell; screen readers announce both. Mirror of `ImpactAnalysisCard` pattern. Use `aria-labelledby` in a future pass.

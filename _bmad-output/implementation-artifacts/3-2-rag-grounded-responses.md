---
baseline_commit: 347b6e5
---

# Story 3.2: RAG-Grounded Responses

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a BA,
I want every AI chat response to be grounded in the project's Knowledge Base with specific code citations,
so that I can trust the answers and verify them against actual code.

## Acceptance Criteria

1. **AC1 — `streamMessage` performs a project-scoped RAG search before generation**: Before calling `thread.streamText`, the `streamMessage` action (`convex/chat/chatActions.ts`) calls `searchProjectRag` via `ctx.runAction(api.knowledge.queries.searchProjectRag, { project_id, query_string: prompt, limit: CHAT_RAG_RESULT_LIMIT })`. The `project_id` comes from the `chat_threads` join row (already returned by `_getThreadOwnership` in `convex/chat/internal.ts:32-38` — no new lookup needed). The search is scoped to the project's namespace (`project_${project_id}`) by the existing `searchProjectRag` implementation — cross-project data never leaks (NFR-2). The user's prompt is used as the search query (after `validatePrompt` trimming).

2. **AC2 — RAG results are injected as the `system` override on `streamText`**: When `searchProjectRag` returns non-null results with non-empty `text`, the action passes `system: buildRagSystemPrompt(ragText)` to `thread.streamText({ prompt }, { system, saveStreamDeltas: true })`. The `system` field is part of `AgentPrompt` (`node_modules/@convex-dev/agent/dist/client/types.d.ts:22-26`: "System message to include in the prompt. **Overwrites Agent instructions.**"). `buildRagSystemPrompt` lives in a new pure module `convex/chat/ragContext.ts` and returns `${ANALYST_CHAT_PROMPT}\n\n## Retrieved Codebase Context\n\n${ragText}` (the full agent instructions plus the RAG block — nothing is lost when overriding). The RAG text is bounded by `CHAT_RAG_MAX_CONTEXT_CHARS` (truncated with a `… [truncated]` marker if longer). The RAG block is **transient** — it is NOT saved as a chat message (the `system` arg is not persisted by the Agent Component; only the user `prompt` and assistant response are).

3. **AC3 — Graceful degradation when KB is not ready, search returns nothing, or search fails**: Three no-RAG paths, all end with the agent using its default `instructions` (no `system` override):
   - **KB not ready / project not found**: `searchProjectRag` returns `null` (existing behavior at `convex/knowledge/queries.ts:335-337`). `buildRagSystemPrompt(null)` returns `undefined`. `streamText` is called without `system` → agent's default `instructions` apply.
   - **Search returns empty `text`**: same as above — `buildRagSystemPrompt("")` returns `undefined`.
   - **Search throws** (AI provider down, embedding failure, network): the action catches the error, logs it via `console.error("Chat RAG search error:", error)`, and proceeds WITHOUT RAG context (degrades gracefully — the user still gets a response). The chat message itself does NOT fail. This mirrors the spike's risk #4 mitigation and the project rule "Never silently swallow errors" (the error IS logged server-side; the user sees a possibly-less-grounded response rather than a broken chat).

4. **AC4 — `ANALYST_CHAT_PROMPT` is rewritten for RAG-grounded responses with citations**: The prompt in `convex/chat/agents.ts` is updated from the Story 3.1 "honest about no codebase access" framing to a dual-mode prompt that handles both RAG-grounded and RAG-absent turns:
   - **When `## Retrieved Codebase Context` is present in the system message** (RAG available): ground every factual claim in the provided context; cite specific files, modules, APIs, or data models inline as markdown (e.g., `per \`convex/chat/agents.ts\``, `in the Auth module`); if the context does not contain an answer to the user's question, explicitly say so — e.g., "The Knowledge Base does not contain evidence for this. I can offer general guidance but cannot verify against the code." — rather than fabricating (AC from epic: "the AI explicitly states the KB does not contain the answer rather than fabricating one").
   - **When `## Retrieved Codebase Context` is absent** (KB not ready, no results, or search failed): fall back to the Story 3.1 honesty rules — be explicit that codebase grounding is unavailable for this turn; do NOT fabricate file paths, function names, or code; CAN reason about general patterns and anything the user pastes directly.
   - The prompt must NOT promise citations it cannot back — same honesty constraint as Story 3.1, now scoped to "this turn" rather than "this version".

5. **AC5 — Rate limiting on `searchProjectRag` (BLOCKING prerequisite, deferred-work line 5/16)**: Wire `@convex-dev/rate-limiter` (^0.3.2, already installed) to `searchProjectRag` in `convex/knowledge/queries.ts`. Mirror the `snapshotPerWorkspace` pattern at `convex/ai/snapshotAction.ts:42-48` exactly:
   ```typescript
   const rateLimiter = new RateLimiter(components.rateLimiter, {
     ragSearchPerWorkspace: {
       kind: "fixed window",
       rate: CHAT_RAG_RATE_LIMIT_PER_MINUTE,  // 20
       period: MINUTE,
     },
   });
   ```
   Inside `searchProjectRag`'s handler, AFTER resolving `projectInfo` (so the workspace_id is known) and BEFORE `rag.search`: `const rateResult = await rateLimiter.limit(ctx, "ragSearchPerWorkspace", { key: projectInfo.workspace_id, throws: true });`. The `throws: true` option makes the rate-limiter throw a `ConvexError` automatically on limit exceeded (no manual throw needed; matches the simplest consumer pattern). The rate limit applies to ALL callers of `searchProjectRag` (chat now, future agents later) — it lives on the cost-incurring endpoint, not on the chat path. The limit is keyed by `workspace_id` (consistent with `snapshotPerWorkspace`/`feedbackPerWorkspace` — workspaces are the cost-bearing entity in the BYOK model).

6. **AC6 — `_getProjectWorkspaceForSearch` uses ordered query (deferred-work line 17)**: Change the `knowledge_bases` lookup in `_getProjectWorkspaceForSearch` (`convex/knowledge/queries.ts:298-302`) from `.first()` to `.order("desc").first()` so the LATEST knowledge base wins when a project has multiple KBs (from re-ingestion). This mirrors `getIngestionProgress` at `convex/knowledge/queries.ts:88-90` which already uses `.order("desc").first()`. Trivial fix promoted from deferred-work alongside the rate-limit work (same search path).

7. **AC7 — Cross-project data isolation verified (NFR-2)**: The existing `searchProjectRag` already enforces workspace ownership via `_getProjectWorkspaceForSearch` → `getOptionalOwnedEntity` (`convex/lib/requireAuth.ts:105-117`) and scopes the namespace via `getProjectNamespace(args.project_id)`. The deferred-work comment about "no caller-membership check" (line 7) is STALE — `getOptionalOwnedEntity` IS a caller-membership check (resolves `getOptionalMemberWorkspace` first, returns null on mismatch). This story does NOT add a new guard; it VERIFIES the existing one with a test: a workspace-A user calling `searchProjectRag` with workspace-B's `project_id` gets `null` (KB not found / no access), and chat degrades gracefully without leaking cross-project chunks.

8. **AC8 — `streamMessage` error handling unchanged on the streaming path**: The existing try/catch around `thread.streamText` (`convex/chat/chatActions.ts:87-99`) is preserved. The new RAG search call has its OWN try/catch (AC3) — RAG failures do NOT enter the streamText catch block. Auto-title logic (lines 101-144) is unchanged. The `last_message_at` update on streamText failure is unchanged. Only the pre-streamText section gains the RAG search + system prompt construction.

9. **AC9 — Tests (TDD, ≥80% coverage)**:
   - **Pure unit tests** (`convex/chat/ragContext.test.ts`, new): `buildRagSystemPrompt(null)` → `undefined`; `buildRagSystemPrompt("")` → `undefined`; `buildRagSystemProfile("some code")` → string containing `ANALYST_CHAT_PROMPT` AND `## Retrieved Codebase Context` AND the input text; truncation triggers `… [truncated]` marker when input exceeds `CHAT_RAG_MAX_CONTEXT_CHARS`; truncation preserves the marker at exactly the boundary. Pure module — no mocking needed.
   - **Prompt unit test** (`convex/chat/agents.test.ts` — already exists, extend): assert updated `ANALYST_CHAT_PROMPT` (a) is a non-empty string, (b) contains the phrase "Retrieved Codebase Context" (so it can reference the injected section), (c) contains an explicit "do not fabricate" instruction, (d) contains a citation instruction (e.g., "cite" or "reference").
   - **Convex integration tests** (`convex/chat.test.ts` — extend): with `vi.mock("./knowledge/rag", ...)` returning a fake `createProjectRag` whose `.search()` resolves to `{ text: "FAKE RAG: convex/foo.ts implements bar()", results: [], entries: [], usage: {} }`, `streamMessage` succeeds and the persisted assistant message exists (verifies RAG search was called and didn't break the flow). With the mock returning `{ text: "" }`, `streamMessage` still succeeds (graceful degradation). With the mock throwing, `streamMessage` still succeeds (graceful degradation, error logged). All three use `mockModel` from `@convex-dev/agent` (existing pattern at `convex/chat.test.ts:12-20`).
   - **Convex integration tests** (`convex/knowledge.rag.test.ts` — extend): with `vi.mock("./knowledge/rag", ...)` returning a fake `createProjectRag` whose `.search()` resolves successfully, `searchProjectRag` returns `{ results, text }`; 21st call within the test window throws (rate limit). Use `seedWorkspace`, `seedProject`, `seedKnowledgeBase` (status: "ready") from `convex/testHelpers.ts`. `_getProjectWorkspaceForSearch` returns the LATEST KB when multiple exist (seed two KBs, assert the desc-ordered one is returned).
   - All existing tests pass — zero regressions (`pnpm test:convex`).

## Tasks / Subtasks

- [x] Task 1: Add chat RAG constants (AC: #1, #2, #5)
  - [x] In `convex/lib/constraints.ts`, add: `CHAT_RAG_RESULT_LIMIT = 6` (search result count — enough context, bounded prompt size), `CHAT_RAG_MAX_CONTEXT_CHARS = 12000` (RAG text bound — fits alongside the system prompt in a typical 16K-context model), `CHAT_RAG_RATE_LIMIT_PER_MINUTE = 20` (per-workspace fixed window; chat is conversational so 20/min is generous for an active BA while bounding abuse).

- [x] Task 2: Write `buildRagSystemPrompt` unit tests FIRST (AC: #9) — TDD RED
  - [x] Create `convex/chat/ragContext.test.ts`.
  - [x] Test: `buildRagSystemPrompt(null)` returns `undefined`.
  - [x] Test: `buildRagSystemPrompt("")` returns `undefined`.
  - [x] Test: `buildRagSystemPrompt("some code")` returns a string containing `ANALYST_CHAT_PROMPT`, `## Retrieved Codebase Context`, and `"some code"`.
  - [x] Test: input longer than `CHAT_RAG_MAX_CONTEXT_CHARS` is truncated and ends with `… [truncated]`.
  - [x] Test: input exactly at the boundary is NOT truncated.

- [x] Task 3: Pure module `convex/chat/ragContext.ts` (AC: #2) — TDD GREEN
  - [x] Create `convex/chat/ragContext.ts`. Export `buildRagSystemPrompt(ragText: string | null): string | undefined`. Logic: if `!ragText` return `undefined`; truncate to `CHAT_RAG_MAX_CONTEXT_CHARS` with `… [truncated]` marker if overshoot; return `${ANALYST_CHAT_PROMPT}\n\n## Retrieved Codebase Context\n\n${truncated}`. Import `ANALYST_CHAT_PROMPT` from `./agents` and `CHAT_RAG_MAX_CONTEXT_CHARS` from `../lib/constraints`. NO React/DOM/Convex imports — fully unit-testable.

- [x] Task 4: Update `ANALYST_CHAT_PROMPT` (AC: #4)
  - [x] In `convex/chat/agents.ts`, rewrite `ANALYST_CHAT_PROMPT` to a dual-mode prompt. Keep the role/persona/style sections. Replace the "Honesty About Your Current Capabilities (v1)" section with: "## Codebase Grounding" — explains that when `## Retrieved Codebase Context` is present in the system message, the agent MUST ground answers in it, cite specific files/modules/APIs inline, and explicitly say "The Knowledge Base does not contain evidence for this" when the context lacks an answer. When the section is absent, fall back to honesty about lacking codebase access (no fabrication). Keep the "Communication Style" and "If a question is ambiguous" sections from the v1 prompt.

- [x] Task 5: Write prompt unit tests (AC: #9)
  - [x] Extend `convex/chat/agents.test.ts`: assert `ANALYST_CHAT_PROMPT` contains `Retrieved Codebase Context`, a fabrication-prohibition phrase (`fabricate` or `do not invent`), and a citation phrase (`cite` or `reference`).

- [x] Task 6: Wire rate limiter + fix KB ordering in `convex/knowledge/queries.ts` (AC: #5, #6)
  - [x] Add imports: `import { RateLimiter, MINUTE } from "@convex-dev/rate-limiter";` and `import { components } from "../_generated/api";` (already imported). Add `CHAT_RAG_RATE_LIMIT_PER_MINUTE` to the existing constraints import.
  - [x] Declare module-level `const rateLimiter = new RateLimiter(components.rateLimiter, { ragSearchPerWorkspace: { kind: "fixed window", rate: CHAT_RAG_RATE_LIMIT_PER_MINUTE, period: MINUTE } });` (mirror `convex/ai/snapshotAction.ts:42-48`).
  - [x] In `searchProjectRag` handler, AFTER the `projectInfo` null-check (line 335) and BEFORE `createProjectRag` (line 348): `await rateLimiter.limit(ctx, "ragSearchPerWorkspace", { key: projectInfo.workspace_id, throws: true });`. The `throws: true` option auto-throws `ConvexError` on limit exceeded.
  - [x] In `_getProjectWorkspaceForSearch`, change `.first()` (line 302) to `.order("desc").first()`. — **NOTE: Already satisfied in codebase** — the query at `convex/knowledge/queries.ts:308-312` already uses `.order("desc").first()`. This was fixed before the story was authored. AC6 verified via test in Task 7.

- [x] Task 7: Write rate-limit + KB-ordering tests (AC: #9) — TDD
  - [x] Extend `convex/knowledge.rag.test.ts`: with `vi.mock("./knowledge/rag", ...)` returning a fake `createProjectRag` whose `.search()` resolves to `{ results: [], text: "fake", entries: [], usage: {} }`, `searchProjectRag` returns `{ results: [], text: "fake" }` on a ready-KB project. Then assert that calling `searchProjectRag` 21 times in the same test throws (rate limit). Reset rate limit state between tests via `convexTest` isolation (each `convexTest(schema, modules)` call gets a fresh component state — confirm this is true; if not, use unique workspace_ids per test).
  - [x] Test `_getProjectWorkspaceForSearch` with two KBs seeded (different `last_synced_at` or relying on `_creationTime`): the query returns workspace info corresponding to the LATEST KB. Seed via `seedKnowledgeBase` twice; the second insert is newer by `_creationTime`. Verify the query path returns non-null for both (status="ready" on both).

- [x] Task 8: Wire RAG into `streamMessage` (AC: #1, #2, #3, #8) — TDD
  - [x] In `convex/chat/chatActions.ts`, after `_getChatWorkspaceConfig` resolves and BEFORE `agent.continueThread`: perform the RAG search in a try/catch. `let ragText: string | null = null; try { const ragResult = await ctx.runAction(api.knowledge.queries.searchProjectRag, { project_id: ownership.project_id, query_string: prompt, limit: CHAT_RAG_RESULT_LIMIT }); ragText = ragResult?.text ?? null; } catch (error) { console.error("Chat RAG search error:", error); }`. The error is logged but swallowed — chat proceeds without RAG.
  - [x] Build the system override: `const system = buildRagSystemPrompt(ragText);` (returns `undefined` when ragText is null/empty — no override).
  - [x] Pass to streamText: `await thread.streamText({ prompt }, { ...(system ? { system } : {}), saveStreamDeltas: true });`. Conditional spread avoids passing `system: undefined` explicitly (cleaner type narrowing; behavior is identical since `system?: string` is optional).
  - [x] Add imports: `api` from `../_generated/api` (already imported as `internal` — add `api`), `buildRagSystemPrompt` from `./ragContext`, `CHAT_RAG_RESULT_LIMIT` from `../lib/constraints`.
  - [x] Preserve all existing logic: ownership check, config check, model resolution, auto-title, `last_message_at` updates, error wrapping. The RAG block sits between config resolution and `agent.continueThread`.

- [x] Task 9: Write `streamMessage` RAG integration tests (AC: #9) — TDD
  - [x] Extend `convex/chat.test.ts`: add `vi.mock("./knowledge/rag", ...)` to the existing mock block at top. The mock returns a fake `createProjectRag` whose `.search()` resolves to controlled values. Also mock `getProjectNamespace` and `buildFilterValues` (re-export from the same module).
  - [x] Test: with mock returning `{ text: "FAKE RAG: convex/foo.ts has bar()" }`, `streamMessage` succeeds and returns `{ threadId }`. Verify `searchProjectRag` was called (via mock spy assertion on `createProjectRag` or by inspecting that the streamText `system` arg would have been set — assert via mockModel behavior or by spying on `thread.streamText`).
  - [x] Test: with mock returning `{ text: "" }`, `streamMessage` still succeeds (graceful degradation — empty RAG).
  - [x] Test: with mock throwing from `.search()`, `streamMessage` still succeeds (graceful degradation — error swallowed, logged).
  - [x] Test: with a project whose KB status is "building" (no ready KB seeded), `streamMessage` succeeds (searchProjectRag returns null → no RAG → agent default instructions). No mock needed — real `searchProjectRag` path.

- [x] Task 10: Validation (AC: #9)
  - [x] `pnpm lint` — zero new errors. (0 errors, 44 pre-existing warnings in src/)
  - [x] `pnpm test:convex` — all backend tests pass (new + existing, zero regressions). (917 passed, +24 new)
  - [x] `pnpm test` — frontend tests unaffected (no frontend changes in this story). (282 passed)
  - [x] `pnpm build` — Next.js build still succeeds (pre-existing failures in `convex/knowledge/bmadActions.ts`/`baselineActions.ts` are documented in deferred-work line 97 and are NOT caused by this story). (Pre-existing `baselineActions.ts:38` type error confirmed at baseline; not touched by this story.)

## Dev Notes

### Scope Boundary — Backend Only

**This story implements (backend only):**
- RAG injection into `streamMessage` (the pre-streamText search + `system` override)
- Rate limiting on `searchProjectRag` (BLOCKING prerequisite from deferred-work)
- `_getProjectWorkspaceForSearch` ordered KB lookup (deferred-work fix)
- Updated `ANALYST_CHAT_PROMPT` for RAG-grounded responses with citations
- Pure helper `buildRagSystemPrompt` + unit tests
- Convex integration tests (TDD)

**This story does NOT implement:**
- The `/projects/[id]/chat` route or any frontend component (Story 3.3 owns the thread list UI; Story 3.4 owns the ChatGPT-style chat UI + streaming display). The end-to-end "BA asks a question and sees a grounded response" flow is realized across 3.1 (backend) + 3.2 (RAG, this story) + 3.3 (list) + 3.4 (chat UI).
- A separate `chat_messages` table for citations (citations live inline in the assistant's markdown response — no schema change).
- A "sources" panel in the UI (Story 3.4 may add citation rendering; this story produces the cited text, not the UI).
- Tool-based RAG (agent calls search on demand) — spike Decision #2 explicitly defers this to v2. Pre-prompt injection is deterministic, always-on, testable. Tool-based RAG risks the agent skipping the tool and hallucinating.
- `*-free` model guard (deferred-work line 8/71, retro B4 — High priority but cross-cutting; not in this story).
- Per-user rate limiting (we key by `workspace_id` — consistent with `snapshotPerWorkspace`/`feedbackPerWorkspace`. At current scale, workspaces have one user. A cross-cutting `userId`-keyed limit is a separate hardening story if multi-user workspaces ship.)
- BMAD-aware RAG (cross-referencing BMAD PRD/ADRs in addition to code chunks) — not in epic scope; the existing `searchProjectRag` searches code chunks only. BMAD metadata is a separate namespace not yet populated for search.

### CRITICAL: How RAG Injection Works via `AgentPrompt.system`

The Agent Component's `streamText` accepts `AgentPrompt` fields alongside the standard AI SDK args. From `node_modules/@convex-dev/agent/dist/client/types.d.ts:22-26`:

```typescript
export type AgentPrompt = {
  /** System message to include in the prompt. Overwrites Agent instructions. */
  system?: string;
  /** A prompt. It can be either a text prompt or a list of messages. */
  prompt?: string | Array<ModelMessage> | undefined;
  /** A list of messages to use as context before the prompt. */
  messages?: Array<ModelMessage> | undefined;
  // ...
};
```

**Key behavior**: `system` OVERRIDES the agent's `instructions` config (set in `createAnalystChatAgent` via `new Agent(components.agent, { instructions: ANALYST_CHAT_PROMPT })`). So when we pass `system`, we must include the FULL agent prompt — otherwise the agent loses its persona/instructions for that turn.

**Why `system` and not `messages`**: The `messages` field prepends context messages before the prompt, but they are NOT saved (per the type comment: "If used with the storageOptions 'promptAndOutput' (default), none of these messages will be saved"). This would also work, but `system` is the canonical home for "instructions + retrieved context" in RAG architectures — it keeps the user's `prompt` clean as the actual question, and the model treats `system` as authoritative instructions. The Vercel AI SDK + Agent convention is `system` for instructions/context, `prompt` for the user message.

**Why not just prefix the prompt**: Prepending RAG text to the user's `prompt` would (a) save the RAG block as part of the user message (polluting thread history with transient context), (b) confuse the model about what the user actually asked, (c) break auto-title generation (the title summarization would include the RAG text). The `system` override avoids all three.

**Why re-include `ANALYST_CHAT_PROMPT` in the override**: Because `system` REPLACES the agent's `instructions`. If we passed only the RAG block as `system`, the agent would lose its persona, citation rules, and honesty constraints for that turn. By passing `${ANALYST_CHAT_PROMPT}\n\n## Retrieved Codebase Context\n\n${ragText}`, we preserve everything and add the context.

**When `system` is `undefined`** (no RAG): `streamText` falls back to the agent's configured `instructions: ANALYST_CHAT_PROMPT`. No override — the v1 behavior is preserved exactly. This is why `buildRagSystemPrompt(null)` returns `undefined`, not an empty string.

### CRITICAL: The Rate Limiter Pattern — Mirror `snapshotPerWorkspace`

`@convex-dev/rate-limiter` (^0.3.2) is installed and used in two places: `convex/ai/snapshotAction.ts:42-48` and `convex/ai/feedbackDiscovery.ts:35-41`. Both follow the same pattern:

```typescript
import { RateLimiter, MINUTE } from "@convex-dev/rate-limiter";
import { components } from "../_generated/api";

const RATE_LIMIT_PER_MINUTE = 10;  // or 20 for chat

const rateLimiter = new RateLimiter(components.rateLimiter, {
  snapshotPerWorkspace: {  // name unique to this consumer
    kind: "fixed window",
    rate: RATE_LIMIT_PER_MINUTE,
    period: MINUTE,
  },
});

// Inside the action handler, after the workspace_id is known:
const rateResult = await rateLimiter.limit(ctx, "snapshotPerWorkspace", {
  key: args.workspace_id,
  throws: true,  // auto-throws ConvexError on limit exceeded
});
```

**For Story 3.2**: declare a `ragSearchPerWorkspace` limit in `convex/knowledge/queries.ts` (the file that owns `searchProjectRag`). Rate: `CHAT_RAG_RATE_LIMIT_PER_MINUTE` (20). The limit is APPLIED INSIDE `searchProjectRag`'s handler — so every caller (chat now, future agents later) is automatically rate-limited. Chat calls `searchProjectRag` via `ctx.runAction(api.knowledge.queries.searchProjectRag, ...)`; the rate limit fires inside that action.

**Rate limit name uniqueness**: Rate limit names are GLOBAL across the rate-limiter component. `ragSearchPerWorkspace` must be declared in EXACTLY ONE file. Do NOT redeclare it in `convex/chat/chatActions.ts` — chat calls `searchProjectRag`, which already has the limit. Redeclaring would either error (duplicate config) or share the limit bucket (confusing).

**`throws: true` vs manual throw**: The rate-limiter's `throws: true` option (per `@convex-dev/rate-limiter` docs) makes `rateLimiter.limit` throw a `ConvexError` automatically when the limit is exceeded. This is simpler than checking `rateResult.ok` and throwing manually. The thrown error message is user-friendly by default. Mirror this pattern unless the existing code does otherwise (it doesn't — both `snapshotAction` and `feedbackDiscovery` use the result-check pattern, but `throws: true` is cleaner for new code; verify against the installed version's API during implementation).

**Confirm against installed types during implementation**: read `node_modules/@convex-dev/rate-limiter/dist/index.d.ts` for the exact `limit` API and whether `throws: true` is supported in ^0.3.2. If not, fall back to the manual `if (!rateResult.ok) throw new ConvexError(...)` pattern used in `snapshotAction.ts:59-62`.

### CRITICAL: Test Strategy for Network-Dependent Code

`searchProjectRag` calls `rag.search()` (from `@convex-dev/rag`) which embeds the query via the workspace's AI provider — a real network call. Tests must NOT hit the network. Two layers of mocking:

**Layer 1 — Pure function tests** (`convex/chat/ragContext.test.ts`): `buildRagSystemPrompt` is pure — no mocking. Test all branches (null, empty, normal, truncation).

**Layer 2 — Integration tests with mocked RAG module** (`convex/chat.test.ts`, `convex/knowledge.rag.test.ts`): mock `./knowledge/rag` at the module level so `createProjectRag` returns a fake object whose `.search()` resolves to controlled values:

```typescript
vi.mock("./knowledge/rag", () => ({
  createProjectRag: () => ({
    search: vi.fn().mockResolvedValue({
      results: [],
      text: "FAKE RAG CONTEXT",
      entries: [],
      usage: {},
    }),
  }),
  getProjectNamespace: (id: string) => `project_${id}`,
  getChunkKey: (f: string, i: number) => `${f}#${i}`,
  buildFilterValues: () => [],
}));
```

This works because `searchProjectRag` imports `createProjectRag` and `getProjectNamespace` from `./rag`. The mock replaces the module, so when `searchProjectRag` calls `createProjectRag(...)`, it gets the fake. The fake's `.search()` returns controlled data without network.

**For `streamMessage` tests**: the mock applies transitively. `streamMessage` calls `ctx.runAction(api.knowledge.queries.searchProjectRag, ...)`. Inside that action, `createProjectRag` is mocked → fake search runs → controlled `text` returned. `streamMessage` receives the controlled text and builds the system prompt accordingly. Verify via mock spy assertions (e.g., `expect(ragSearchMock).toHaveBeenCalled()`) OR by inspecting the persisted assistant message via `listThreadMessages`.

**Component table writes in tests**: Story 3.1 already established the pattern — register the agent component via `t.registerComponent("agent", agentSchema, agentModules)` (see `convex/chat.test.ts:29-38`). Reuse the same `chatTest()` helper. No new component registration needed.

### Spike Decision #2 — Pre-Prompt Injection, Not a Tool

Spike `spike-3.1-streaming-chat.md` Decision #2: "RAG grounding = pre-prompt injection, not a tool (for v1). Run `searchProjectRag` BEFORE `streamText` and inject results into the prompt context. Deterministic, always-on, testable. Tool-based RAG (agent calls search on demand) is a v2 enhancement — riskier because the agent may skip the tool and hallucinate."

**This story implements pre-prompt injection** via the `system` override (cleaner than the spike's schematic `thread.streamText(ctx, { prompt, context: ragResults })` pseudocode — the installed types confirm `system` is the right field). Tool-based RAG remains deferred to v2 (the Agent Component supports tools via `createTool` from `@convex-dev/agent` — see `convex/ai/tools/definitions.ts` for the existing pattern — but wiring a `searchKnowledgeBase` tool is out of scope).

### "No Answer in KB" — Prompt-Enforced, Not Code-Enforced

The epic AC: "Given a question the KB does not contain an answer for, When the AI responds, Then the AI explicitly states the KB does not contain the answer rather than fabricating one."

This is enforced via the PROMPT (AC4), not via code logic. Code cannot reliably detect "the KB doesn't contain the answer" — that's a semantic judgment. The prompt instructs the agent: when `## Retrieved Codebase Context` is present but doesn't contain evidence for the user's question, say so explicitly. The honesty constraints from Story 3.1's prompt carry forward, now scoped to "this turn's context" rather than "this version's capabilities".

Tests assert the PROMPT contains the fabrication-prohibition instruction (Task 5). Runtime enforcement is the LLM's job — we cannot unit-test "the model admitted ignorance" without a real LLM call. This is an accepted limitation; the prompt is the contract.

### Cross-Project Isolation — Already Enforced, Just Verified

The existing `searchProjectRag` flow enforces workspace ownership at TWO layers:
1. `_getProjectWorkspaceForSearch` (internal query) calls `getOptionalOwnedEntity(ctx, args.project_id, "projects")` — this resolves `getOptionalMemberWorkspace` (caller's membership) and returns null if the project's `workspace_id` doesn't match. See `convex/lib/requireAuth.ts:105-117`.
2. `rag.search` is scoped to `getProjectNamespace(args.project_id)` = `project_${project_id}` — physically isolated vector storage per project.

The deferred-work comment about "no caller-membership check" (line 7) is STALE — it was either written before `getOptionalOwnedEntity` was used, or refers to a different concern. **This story does NOT add a new IDOR guard** — it verifies the existing one with a test (AC7). If the test fails, the guard is missing and MUST be added (file a CRITICAL finding); if it passes, the deferred-work comment should be updated to reflect reality.

### What NOT to Reinvent

| Concern | Reuse | Do NOT build |
|---------|-------|--------------|
| Vector search | `searchProjectRag` (`convex/knowledge/queries.ts:312-367`) | A new `searchChatRag` action |
| RAG instance | `createProjectRag` (`convex/knowledge/rag.ts:17-31`) | A chat-specific RAG instance |
| Namespace isolation | `getProjectNamespace` (`convex/knowledge/rag.ts:33-35`) | Per-chat or per-thread namespaces |
| Workspace AI config | `_getChatWorkspaceConfig` (`convex/chat/internal.ts:42-49`) | A new config resolver |
| Thread ownership | `verifyThreadOwnership` + `_getThreadOwnership` (`convex/chat/internal.ts`) | A separate chat-RAG ownership check |
| Rate limiting | `@convex-dev/rate-limiter` + `snapshotPerWorkspace` pattern | A custom throttle |
| Streaming | `thread.streamText` + `saveStreamDeltas: true` (Story 3.1) | Manual message persistence |
| Error handling | `buildChatErrorMessage` (`convex/chat/chatActions.ts:17-27`) | A RAG-specific error formatter (RAG errors are swallowed, not surfaced) |

### Error Handling — RAG Failures Are Swallowed, Streaming Failures Are Surfaced

Two distinct error paths with OPPOSITE policies:

**RAG search failure** (AC3): SWALLOW. The error is logged via `console.error("Chat RAG search error:", error)` and chat proceeds without RAG. Rationale: RAG is an enhancement, not a requirement. A BA asking "what does this project do?" should get a response even if the embedding API is down — the response is less grounded but still useful (general patterns, conversation context). Failing the entire message because the search failed would be brittle.

**streamText failure** (AC8, unchanged from 3.1): SURFACE. The existing try/catch throws `ConvexError(buildChatErrorMessage(error))`. Rationale: if the LLM call itself fails, there IS no response — the user must be told. The `last_message_at` is still updated (3.1 review patch).

These policies are intentional and different. Do NOT unify them.

### Project Structure Notes

- `convex/chat/ragContext.ts` — pure module, NO `"use client"`, NO React, NO Convex imports. Mirrors `convex/knowledge/rag.ts` (also pure factory functions) and `convex/knowledge/baselinePrompts.ts` (pure prompt content). Fully unit-testable without `convexTest`.
- `convex/chat/ragContext.test.ts` — pure unit tests, no `convexTest`, no mocking. Mirrors `convex/knowledge.rag.test.ts:30-81` (pure function tests for `getProjectNamespace` etc.).
- `convex/chat/chatActions.ts` — modified (adds RAG search + system prompt). Still `"use node"` at top (unchanged — file already uses Node built-ins via `generateText` from `ai`).
- `convex/chat/agents.ts` — modified (prompt rewrite). No structural changes.
- `convex/knowledge/queries.ts` — modified (rate limit + ordered KB lookup). The `searchProjectRag` action signature is UNCHANGED (same args, same return type) — existing callers are unaffected.
- `convex/lib/constraints.ts` — modified (3 new constants). Additive — no existing constants change.
- `convex/chat.test.ts` — extended (new `vi.mock("./knowledge/rag", ...)` + 4 new tests). The existing 17 tests must still pass unchanged.
- `convex/knowledge.rag.test.ts` — extended (rate-limit + KB-ordering tests). Existing tests must still pass.
- `convex/chat/agents.test.ts` — extended (prompt content assertions). Existing prompt-non-empty test must still pass.

No new directories. No new schema tables. No new dependencies. The `convex/chat/` directory from Story 3.1 gains two files (`ragContext.ts`, `ragContext.test.ts`).

### Testing the Rate Limit in `convexTest`

The rate-limiter component uses Convex's database to track windows. In `convexTest`, each test gets a fresh database (via `convexTest(schema, modules)`). However, the rate-limiter may use real wall-clock time for window expiry. Two strategies:

1. **Unique workspace per test**: each rate-limit test seeds a fresh workspace. The first 20 calls succeed; the 21st throws. This avoids cross-test contamination. Use a helper that seeds workspace + project + ready KB + mocked RAG, then calls `searchProjectRag` in a loop.
2. **Single test, single workspace**: assert exactly the boundary (20 ok, 21 throws) in one test. Reset between test files via vitest module isolation.

Prefer strategy 1 — unique workspace per test — for isolation. The rate limit is `CHAT_RAG_RATE_LIMIT_PER_MINUTE = 20` per workspace per minute; tests run faster than a minute, so the window doesn't reset within a test.

**Confirm during implementation**: verify `convexTest` isolates the rate-limiter component state. If it doesn't, the 21st-call test may flake if other tests in the same file exhaust the limit. Use unique workspace_ids per test to avoid this entirely.

### Constants Rationale

| Constant | Value | Rationale |
|----------|-------|-----------|
| `CHAT_RAG_RESULT_LIMIT` | 6 | Enough context for grounded answers without bloating the prompt. Each result is a code chunk (~2000 chars max per `CHUNK_SIZE`); 6 results ≈ 12K chars, fitting within `CHAT_RAG_MAX_CONTEXT_CHARS`. The existing `EMBEDDING_SEARCH_MAX_LIMIT` (50) is the hard ceiling; 6 is the chat-specific sweet spot. |
| `CHAT_RAG_MAX_CONTEXT_CHARS` | 12000 | Bounds the RAG block to ~3K tokens. Combined with `ANALYST_CHAT_PROMPT` (~1K chars) and the user prompt (up to `MAX_PROMPT_LENGTH` = 32000, but typically <500), the total system+user is well within typical 16K-128K context windows. Prevents a runaway RAG response from blowing the context. |
| `CHAT_RAG_RATE_LIMIT_PER_MINUTE` | 20 | An active BA sending a message every 3 seconds for a minute = 20 messages. Generous for human conversation; bounded enough to prevent abuse (a script hitting the endpoint at 1000/min is blocked after 20). Matches the `snapshotPerWorkspace` (10) order of magnitude — chat is higher-volume than snapshots, so 2x. |

### Deferred Work to Resolve This Story

Per retrospective action A8, review `_bmad-output/implementation-artifacts/deferred-work.md` for items this story can opportunistically resolve:

- **[BLOCKING — Story 3.2 prerequisite] `searchProjectRag` rate limiting** (deferred-work line 5/16): **RESOLVED by AC5.** Wire `@convex-dev/rate-limiter` to `searchProjectRag` (20/min/workspace).
- **[Story 3.2] `_getProjectWorkspaceForSearch` uses `.first()` without ordering** (deferred-work line 17): **RESOLVED by AC6.** Change to `.order("desc").first()`.
- **[Story 3.1 + 3.2] IDOR / cross-project scoping** (deferred-work line 7): **VERIFIED EXISTING by AC7.** The deferred-work comment is stale — `getOptionalOwnedEntity` already enforces membership. This story adds a test to confirm; if the test fails, file a CRITICAL.
- **[Epic 3] No `*-free` model guard** (deferred-work line 8/71, retro B4): NOT in this story (cross-cutting; no existing agent has the guard). Flag for a cross-cutting hardening story.
- **searchProjectRag implemented as action not query** (deferred-work line 21): NOT a bug — `rag.search()` requires an action context (`CtxWith<"runAction">`). Documented deviation; chat calls it via `ctx.runAction` which is the correct pattern.
- **No AbortController on embedding calls** (deferred-work line 22): NOT in this story (component-managed; relies on Convex function timeout).
- **429 ignores Retry-After header** (deferred-work line 31): NOT in this story (embedding path, not search path; deferred from Story 1.4).

### Previous Story Intelligence

**Story 3.1 (Analyst Chat Agent & Thread Management) — direct predecessor:**

1. **IDOR guard pattern (AC9)**: `verifyThreadOwnership` in `convex/chat/internal.ts` is the single enforcement point for thread access. This story reuses it unchanged — RAG doesn't introduce a new ownership surface (it reuses `searchProjectRag`'s existing `_getProjectWorkspaceForSearch` guard).

2. **`mockModel` for streaming tests**: Story 3.1 established the `vi.mock("./ai/model", ...)` pattern (`convex/chat.test.ts:12-20`) returning `mockModel` from `@convex-dev/agent`. This story adds a parallel `vi.mock("./knowledge/rag", ...)` for the RAG module. Both mocks coexist — the test file mocks both modules at the top.

3. **`chatTest()` helper with component registration** (`convex/chat.test.ts:34-38`): registers the agent component schema + modules so `createThread`/`streamMessage` can write to component tables. Reuse this helper unchanged.

4. **Prompt honesty from 3.1**: The v1 prompt's "do NOT fabricate file paths, function names, or code" constraint carries forward — now scoped to "when RAG context is absent or doesn't contain the answer" rather than "always". The dual-mode prompt (AC4) preserves the honesty guarantee while enabling grounded citations.

5. **Error wrapping pattern** (`buildChatErrorMessage` at `convex/chat/chatActions.ts:17-27`): status-code-derived friendly messages for streaming failures. RAG failures use a DIFFERENT policy (swallow + log) — do NOT route RAG errors through `buildChatErrorMessage`.

6. **Single `feat:` commit per story**: Follow the git convention (`347b6e5 feat: implement story 3.1 — ...`).

**Epic 2 retrospective — review gate (project-context.md line 105):**

When this story reaches `done`, BOTH must be true: (a) a `### Review Findings` section in this file with the 3-layer review outcome, AND (b) this file's `Status:` header matches `sprint-status.yaml`. Story 2.3 shipped `done` in sprint-status but `review` in its file — a reviewed story looked unreviewed. ENFORCED gate.

### Git Intelligence

Baseline: latest `main` = `347b6e5` (Story 3.1 implementation). Relevant recent commits:
- `347b6e5` — Story 3.1 (Analyst Chat Agent & Thread Management) — **direct predecessor; `streamMessage`, `agents.ts`, `internal.ts` are the modification targets.**
- `d5ff9c0` — graphify regen after Epic 2 retro.
- `265cc6e` — Story 2.4 (Baseline RD & Drift Export) — **TDD discipline + review-gate pattern reference.**

The rate-limiter usage in `snapshotAction.ts` and `feedbackDiscovery.ts` predates Epic 3 — it was added during Epic 1 (browser/exploration features). This story is the third consumer of the rate-limiter component.

Single `feat:` commit per story (follow `347b6e5` convention).

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 3.2] — ACs and user story (lines 623-643)
- [Source: _bmad-output/planning-artifacts/epics.md#Epic 3] — Epic context (lines 597-599)
- [Source: _bmad-output/planning-artifacts/epics.md#FR-19] — RAG-grounded responses with code citations
- [Source: _bmad-output/planning-artifacts/epics.md#FR-23] — Free-form project Q&A
- [Source: _bmad-output/planning-artifacts/epics.md#NFR-2] — RAG scoped to project namespace; cross-project data never leaks
- [Source: _bmad-output/planning-artifacts/spike-3.1-streaming-chat.md#Decisions locked] — Decision #2 (pre-prompt injection, not a tool); Decision #4 (BYOK model via getWorkspaceModel)
- [Source: _bmad-output/implementation-artifacts/3-1-analyst-chat-agent-thread-management.md] — **Direct predecessor; `streamMessage`, `agents.ts`, `internal.ts`, `chat.test.ts` are the modification targets**
- [Source: _bmad-output/implementation-artifacts/deferred-work.md#Epic 3 Triage] — lines 5-8 (BLOCKING rate-limit prerequisite; stale IDOR comment; same search path)
- [Source: _bmad-output/implementation-artifacts/deferred-work.md#code review of 1-4] — lines 27-31 (rate limiting + `.first()` ordering, both addressed by this story)
- [Source: _bmad-output/project-context.md] — Critical implementation rules (versions, IDOR pattern line 120, error logging, review gate line 105)
- [Source: _bmad-output/implementation-artifacts/2-4-baseline-rd-drift-export.md] — Previous story patterns (TDD discipline, review gate, single commit)
- [Source: convex/knowledge/queries.ts:312-367] — `searchProjectRag` action — **THE reuse target; rate limit lands here**
- [Source: convex/knowledge/queries.ts:291-310] — `_getProjectWorkspaceForSearch` internal query — **`.first()` → `.order("desc").first()` fix (AC6)**
- [Source: convex/knowledge/rag.ts:17-35] — `createProjectRag` + `getProjectNamespace` — **reuse, do NOT duplicate**
- [Source: convex/chat/chatActions.ts:51-148] — `streamMessage` action — **THE modification target; add RAG search + system override between config resolution and continueThread**
- [Source: convex/chat/chatActions.ts:17-27] — `buildChatErrorMessage` — **streaming error pattern (do NOT use for RAG errors)**
- [Source: convex/chat/agents.ts:6-32] — `ANALYST_CHAT_PROMPT` — **THE rewrite target (AC4)**
- [Source: convex/chat/internal.ts:21-40] — `_getThreadOwnership` returns `project_id` — **reuse for RAG search input (AC1)**
- [Source: convex/chat/internal.ts:42-49] — `_getChatWorkspaceConfig` — **reuse for AI config resolution (already called by streamMessage)**
- [Source: convex/ai/snapshotAction.ts:42-48] — `snapshotPerWorkspace` rate-limiter pattern — **THE mirror target (AC5)**
- [Source: convex/ai/feedbackDiscovery.ts:35-41] — Second rate-limiter usage — **alternative mirror**
- [Source: convex/lib/requireAuth.ts:105-117] — `getOptionalOwnedEntity` — **the existing IDOR guard on `_getProjectWorkspaceForSearch` (AC7 verifies)**
- [Source: convex/lib/constraints.ts:31-39] — Existing embedding/RAG constants — **add new constants nearby (Task 1)**
- [Source: convex/testHelpers.ts:125-160] — `seedKnowledgeBase` — **use in rate-limit + KB-ordering tests**
- [Source: convex/testHelpers.ts:533-550] — `seedChatThread` — **use in streamMessage RAG tests**
- [Source: convex/chat.test.ts:1-38] — Existing chat test setup (mocks + `chatTest()` helper + component registration) — **THE pattern to extend**
- [Source: convex/knowledge.rag.test.ts:1-12] — `convexTest` setup for knowledge RAG tests — **THE pattern to extend**
- [Source: node_modules/@convex-dev/agent/dist/client/types.d.ts:22-26] — `AgentPrompt.system` field — **THE RAG injection point (overwrites agent instructions)**
- [Source: node_modules/@convex-dev/agent/dist/client/index.d.ts:272-297] — `streamText` signature confirming `AgentPrompt` args are accepted
- [Source: node_modules/@convex-dev/rag/dist/client/index.d.ts:127-143] — `rag.search` return shape: `{ results, text, entries, usage }`
- [Source: convex/convex.config.ts:6,15] — `rateLimiter` and `rag` components registered
- [Source: package.json] — `@convex-dev/rag` ^0.7.5, `@convex-dev/rate-limiter` ^0.3.2, `@convex-dev/agent` ^0.6.1 all installed

## Dev Agent Record

### Agent Model Used

zai-coding-plan/glm-5.2 (glm-5.2)

### Debug Log References

- TDD RED for `buildRagSystemPrompt`: initial test run failed with "Cannot find module './ragContext'" — confirmed RED before implementation.
- Rate-limiter component registration required in both `chat.test.ts` and `knowledge.rag.test.ts` for `searchProjectRag` to work in `convexTest` (writes to `rateLimits` table in the component schema).
- `vi.hoisted` + `importOriginal` mock pattern used in both test files to preserve real pure-function exports (`getProjectNamespace`, `getChunkKey`, `buildFilterValues`) while overriding only `createProjectRag` with a controlled `.search()` mock.
- The "Chat RAG search error" stderr in the "succeeds when RAG search throws" test is EXPECTED — it proves AC3 (error caught, logged, chat proceeds).
- The "Chat auto-title error" stderr in the existing streaming test is PRE-EXISTING (`generateText` not configured for that specific test — error caught by existing try/catch).

### Completion Notes List

- **AC1 (RAG search before generation)**: `streamMessage` now calls `ctx.runAction(api.knowledge.queries.searchProjectRag, { project_id, query_string: prompt, limit: CHAT_RAG_RESULT_LIMIT })` between config resolution and `agent.continueThread`. The `project_id` comes from `_getThreadOwnership` (no new lookup). The search is scoped to `project_${project_id}` by the existing `searchProjectRag` implementation.

- **AC2 (system override on streamText)**: When RAG returns non-empty `text`, `buildRagSystemPrompt(ragText)` returns `${ANALYST_CHAT_PROMPT}\n\n## Retrieved Codebase Context\n\n${truncated}` and is passed as `{ system }` to `thread.streamText`. The conditional spread `...(system ? { system } : {})` avoids passing `system: undefined`. The RAG block is transient — not persisted as a chat message (only `prompt` and assistant response are saved by the Agent Component).

- **AC3 (graceful degradation)**: Three no-RAG paths verified by integration tests: (1) KB not ready → `searchProjectRag` returns null → `buildRagSystemPrompt(null)` returns `undefined`; (2) search returns empty text → same; (3) search throws → caught by try/catch, logged via `console.error("Chat RAG search error:", error)`, `ragText` stays null. All three paths end with `streamText` called without `system` → agent's default `instructions` apply.

- **AC4 (dual-mode prompt)**: `ANALYST_CHAT_PROMPT` rewritten from v1 "honest about no codebase access" to dual-mode: when `## Retrieved Codebase Context` is present, ground every claim in it, cite files/modules/APIs inline, and explicitly say "The Knowledge Base does not contain evidence for this" when lacking an answer. When absent, fall back to honesty about no codebase access (no fabrication). Prompt content verified by `convex/chat/agents.test.ts` (7 assertions).

- **AC5 (rate limiting)**: `@convex-dev/rate-limiter` wired to `searchProjectRag` in `convex/knowledge/queries.ts`. `ragSearchPerWorkspace` fixed-window limit at 20/min, keyed by `workspace_id`, `throws: true`. Rate limit test verifies 20 calls succeed, 21st throws. Per-workspace isolation test confirms limits don't bleed across workspaces.

- **AC6 (ordered KB lookup)**: `_getProjectWorkspaceForSearch` ALREADY uses `.order("desc").first()` in the codebase (lines 308-312) — this was fixed before the story was authored. AC6 verified via test in `knowledge.rag.test.ts` that seeds two KBs and confirms the latest one is returned.

- **AC7 (cross-project isolation)**: Existing `getOptionalOwnedEntity` guard verified via test: workspace-A user calling `searchProjectRag` with workspace-B's `project_id` gets `null` (no KB found / no access), and `ragSearchMock` is never called (no chunks leak). The deferred-work comment about "no caller-membership check" is confirmed STALE.

- **AC8 (streamText error handling unchanged)**: The existing try/catch around `thread.streamText` is preserved (lines 106-118). The RAG search has its OWN try/catch (lines 79-92). RAG failures do NOT enter the streamText catch block. Auto-title and `last_message_at` logic unchanged.

- **AC9 (tests)**: 24 new tests added across 3 files:
  - `convex/chat/ragContext.test.ts` (7 tests) — pure unit tests for `buildRagSystemPrompt` (null, empty, normal, truncation, boundary).
  - `convex/chat/agents.test.ts` (7 tests) — prompt content assertions + factory test.
  - `convex/chat.test.ts` (+4 tests) — streamMessage RAG integration (text, empty, throw, KB-not-ready).
  - `convex/knowledge.rag.test.ts` (+6 tests) — rate limit boundary, per-workspace isolation, KB-not-ready, KB ordering, cross-project isolation.
  - Total: 917 convex tests pass (up from 893 baseline), 0 regressions.

### File List

**New files:**
- `convex/chat/ragContext.ts` — pure module: `buildRagSystemPrompt(ragText: string | null): string | undefined`
- `convex/chat/ragContext.test.ts` — 7 unit tests for `buildRagSystemPrompt`
- `convex/chat/agents.test.ts` — 7 prompt content + factory tests

**Modified files:**
- `convex/lib/constraints.ts` — added `CHAT_RAG_RESULT_LIMIT`, `CHAT_RAG_MAX_CONTEXT_CHARS`, `CHAT_RAG_RATE_LIMIT_PER_MINUTE`
- `convex/chat/agents.ts` — rewrote `ANALYST_CHAT_PROMPT` to dual-mode (Codebase Grounding section)
- `convex/chat/chatActions.ts` — wired RAG search + `system` override into `streamMessage`; added imports (`api`, `buildRagSystemPrompt`, `CHAT_RAG_RESULT_LIMIT`)
- `convex/knowledge/queries.ts` — wired `ragSearchPerWorkspace` rate limiter into `searchProjectRag`; added imports (`RateLimiter`, `MINUTE`, `components`, `CHAT_RAG_RATE_LIMIT_PER_MINUTE`)
- `convex/chat.test.ts` — added RAG mock, rate-limiter component registration in `chatTest()`, 4 streamMessage RAG integration tests, updated v1 prompt test to dual-mode
- `convex/knowledge.rag.test.ts` — added RAG mock, rate-limiter component registration via `ragTest()`, 6 rate-limit/KB-ordering/cross-project tests

## Change Log

- 2026-06-14: Implemented Story 3.2 — RAG-grounded responses. Injected project-scoped RAG search into `streamMessage` via `system` prompt override. Added per-workspace rate limiting on `searchProjectRag`. Rewrote `ANALYST_CHAT_PROMPT` for dual-mode (grounded + fallback). Created pure `buildRagSystemPrompt` helper. 24 new tests, 0 regressions.
- 2026-06-14: 3-layer adversarial code review (Blind Hunter + Edge Case Hunter + Acceptance Auditor). All 9 ACs PASS (Acceptance Auditor). 1 decision-needed, 2 patch, 6 defer, 2 dismissed.
- 2026-06-14: Applied 3 review patches (decision-resolved + 2 patches): rate-limit errors now propagate to user via `isRateLimitError` (chat no longer swallows them); test renamed to match assertions; rate-limit loops use `CHAT_RAG_RATE_LIMIT_PER_MINUTE` constant. +1 test. `pnpm test:convex` 918 passed, `pnpm lint` 0 errors.

### Review Findings

**Decision-needed:**

- [x] [Review][Decision→Patch] Rate-limit errors silently swallowed by chat's RAG catch-all [convex/chat/chatActions.ts:80-92, convex/knowledge/queries.ts:358-361] — RESOLVED (2026-06-14): user chose to distinguish rate-limit errors from transient search failures. Rate-limit errors propagate to the user; other search errors stay swallowed for graceful degradation.

**Patch:**

- [x] [Review][Patch] Distinguish rate-limit errors in chat's RAG catch [convex/chat/chatActions.ts:80-92] — inspect the thrown error; if it's a rate-limit error (`@convex-dev/rate-limiter` throws `ConvexError` with `{kind:"RateLimited", retryAfter}`), re-throw so the user gets a "slow down" signal instead of silent degradation. All other errors stay swallowed (graceful degradation per AC3). **APPLIED (2026-06-14):** added `isRateLimitError` import; catch re-throws a user-facing `ConvexError` on rate-limit, logs+swallows all else. +1 test in `chat.test.ts` (exhaust limit → streamMessage rejects).
- [x] [Review][Patch] Test name contradicts its assertions [convex/knowledge.rag.test.ts:382] — "returns null when KB status is not ready" asserts `not.toBeNull()` + `kb_status: "building"`. `_getProjectWorkspaceForSearch` returns workspace info regardless of KB status; the null-check lives in `searchProjectRag`. Rename the test to accurately describe the verified behavior (e.g. "returns workspace info even when KB status is building"). **APPLIED (2026-06-14):** renamed to "returns workspace info even when KB status is building".
- [x] [Review][Patch] Hardcoded rate-limit loop count `20` instead of constant [convex/knowledge.rag.test.ts:419,455] — both loops use a magic `20`; should use `CHAT_RAG_RATE_LIMIT_PER_MINUTE` so the boundary tracks the production constant. **APPLIED (2026-06-14):** imported `CHAT_RAG_RATE_LIMIT_PER_MINUTE`, replaced both loops.

**Deferred:**

- [x] [Review][Defer] AC6 KB-ordering test can't verify latest-KB selection from return shape [convex/knowledge.rag.test.ts:321] — `_getProjectWorkspaceForSearch` returns `{workspace_id, kb_status}` with no KB identity; test verifies DB ordering separately. AC6 pre-satisfied via code inspection. deferred, test-depth.
- [x] [Review][Defer] `String.slice` can split UTF-16 surrogate pairs at truncation boundary [convex/chat/ragContext.ts:14] — rare (emoji in code comments/docs surfaced by RAG); produces a lone surrogate that a provider may reject (caught by streamText catch). deferred, low impact.
- [x] [Review][Defer] KB-ordering test relies on setTimeout(5ms) for `_creationTime` ordering [convex/knowledge.rag.test.ts:330] — flaky on slow CI; `_creationTime` is auto-set and can't be overridden. deferred, test-only (recurring pattern, see deferred-work line 71).
- [x] [Review][Defer] "no rate token consumed" test asserts only on ragSearchMock [convex/knowledge.rag.test.ts:452-469] — doesn't inspect rate-limiter state; a regression that consumes a token on KB-not-ready before the early return would pass. deferred, test-depth.
- [x] [Review][Defer] Pre-existing: `getOptionalMemberWorkspace` uses `.first()` on `by_user_id` [convex/lib/requireAuth.ts:67-71] — breaks ownership for multi-membership users; inherited by this feature's `searchProjectRag` path. deferred, pre-existing (already tracked at deferred-work lines 48, 96).
- [x] [Review][Defer] `buildRagSystemPrompt` doesn't guard against `ragText` containing the literal header [convex/chat/ragContext.ts:17] — a retrieved chunk containing `## Retrieved Codebase Context` yields duplicate headers and prompt-mode ambiguity. deferred, low impact, fix not clean (sanitizing markdown headings from RAG text is fuzzy).

**Dismissed (2):** truncation output exceeds `CHAT_RAG_MAX_CONTEXT_CHARS` by the marker length (13 chars — soft budget, nothing downstream treats it as a hard cap); integration tests don't assert `system` reached `streamText` (spec AC9 explicitly permitted the mock-spy alternative).

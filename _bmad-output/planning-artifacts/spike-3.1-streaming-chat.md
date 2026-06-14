# Spike 3.1: Streaming Chat Agent (`@convex-dev/agent`)

**Status:** Research complete — de-risks Story 3.1 (Analyst Chat Agent & Thread Management) and Story 3.2 (RAG-Grounded Responses).
**Date:** 2026-06-14
**Trigger:** Epic 2 retrospective critical-path item 3 ("`@convex-dev/agent` streaming spike before Story 3.1 — no codebase precedent for streaming").

---

## Why this spike exists

Epic 3 introduces ChatGPT-style streaming chat. All 6 existing agents in `convex/ai/agents.ts` are **one-shot** (`generateObject`/`generateText`) — none stream. This spike verifies the streaming API, confirms thread/message persistence is automatic, and locks the integration shape before Story 3.1 implementation.

## What already exists (no new deps needed)

| Concern | Status | Evidence |
|---------|--------|----------|
| `@convex-dev/agent` package | ✅ Installed ^0.6.1 | `package.json` |
| Agent component registered | ✅ `convex/convex.config.ts` imports `@convex-dev/agent/convex.config` |
| Agent factory pattern | ✅ `convex/ai/agents.ts` — 6 factories via `new Agent(components.agent, {...})` |
| Tool definitions | ✅ `convex/ai/tools/definitions.ts` uses `createTool` |
| `getWorkspaceModel` | ✅ `convex/ai/model.ts` — resolves BYOK provider/model per workspace |
| Thread/message tables | ✅ **Automatic** — the Agent component owns `threads`, `messages`, `users`, `streams` tables (`component/{threads,messages,users,streams}.d.ts`). No custom schema for chat messages. |
| React streaming hooks | ✅ `@convex-dev/agent/react` — `useStreamingUIMessages`, `useThreadMessages`, `optimisticallySendMessage` |

**Net: zero new dependencies for Epic 3.** The infra is in place; Epic 3 wires streaming + RAG into it.

## API surface (verified against installed v0.6.1 types)

### Server-side (`Agent` class — `@convex-dev/agent`)

```typescript
// Thread lifecycle — returns a thread handle bound to threadId
const thread = await agent.createThread(ctx, { userId?, title? });
const thread = agent.continueThread(ctx, { threadId });

// Streaming — behaves like the "ai" package's streamText, but thread-aware
// (auto-loads recent message history from the thread)
const result = await thread.streamText(ctx, {
  prompt: "user message here",
  // OR messages: [...]
});
// result.text (awaitable full text), result.fullStream (async iterable of deltas)
// result automatically persists the assistant message to the thread

// Non-streaming (what existing test-gen agents use)
await thread.generateText(ctx, { prompt });

// Manual persistence / history (also automatic via streamText)
await agent.saveMessage(ctx, { threadId, message });
const messages = await agent.listMessages(ctx, { threadId });
await agent.getThreadMetadata(ctx, { threadId });
await agent.updateThreadMetadata(ctx, { threadId, metadata });
agent.createThreadMutation(); // generates an internal mutation (for workflows)

// Context control: how many recent messages streamText auto-injects
new Agent(components.agent, {
  // ..., 
  contextOptions: { recentMessages: 20 }, // default loads recent thread history
});
```

### Client-side (`@convex-dev/agent/react`)

```typescript
import { useStreamingUIMessages, optimisticallySendMessage, toUIMessages } from "@convex-dev/agent/react";

// Streams the assistant response token-by-token as it generates server-side
const { messages, status, error } = useStreamingUIMessages(api.chat.stream, { threadId });

// Optimistic send — shows the user's message instantly, triggers the stream
optimisticallySendMessage(...);
```

`useStreamingUIMessages` subscribes to the thread and renders deltas in real-time — this is the ChatGPT-style UI for Story 3.4.

## Integration shape (recommended for Story 3.1)

```
┌─ src/app/(auth)/projects/[id]/chat ──────────────────────────────┐
│  useStreamingUIMessages(api.chat.streamMessage, { threadId })     │  ← Story 3.4 UI
│  optimisticallySendMessage(...)                                    │
└──────────────────────────────────┬────────────────────────────────┘
                                   │ Convex action (streaming)
┌──────────────────────────────────▼────────────────────────────────┐
│  convex/chat/chatActions.ts                                        │
│   streamMessage(ctx, { projectId, threadId, prompt })              │
│     1. requireAuth + workspace/project ownership (B3 IDOR guard)   │
│     2. agent.continueThread(ctx, { threadId })                     │
│     3. ★ RAG: searchProjectRag(ctx, { project_id, query: prompt }) │  ← Story 3.2
│     4. thread.streamText(ctx, { prompt, context: ragResults })     │
│     5. return stream (component persists message automatically)    │
└────────────────────────────────────────────────────────────────────┘
```

A new `convex/chat/` domain directory (mirrors `convex/knowledge/`):
- `convex/chat/agents.ts` — `createAnalystChatAgent(model)` factory
- `convex/chat/chatActions.ts` — public `streamMessage` action (the streaming entrypoint)
- `convex/chat/queries.ts` — `listThreads(projectId)`, `getThread(threadId)` (ownership-scoped)
- `convex/chat/mutations.ts` — `createThread(projectId)` (ownership-scoped, links thread to project)

## Decisions locked by this spike

1. **Thread → project linkage via metadata.** The Agent component's `threads` table is separate from our schema. Store `projectId` + `workspaceId` in thread metadata (`updateThreadMetadata`). Querying a thread verifies `thread.metadata.workspaceId === membership.workspace_id`. Avoids a custom join table. (B3 IDOR guard applies to every thread read.)

2. **RAG grounding = pre-prompt injection, not a tool (for v1).** Run `searchProjectRag` BEFORE `streamText` and inject results into the prompt context. Deterministic, always-on, testable. Tool-based RAG (agent calls search on demand) is a v2 enhancement — riskier because the agent may skip the tool and hallucinate. (Story 3.2.)

3. **Streaming persistence is automatic.** `thread.streamText` persists the assistant message to the component's `messages` table. No manual `saveMessage` needed for the normal flow. Manual `saveMessage` only if we need to inject system messages or edit history.

4. **Model = workspace BYOK via `getWorkspaceModel`.** Same as existing agents. Chat does NOT use a hardcoded model. (B4: no `*-free` guard yet — flagged as High priority.)

## Risks for Story 3.1 (carry into the story spec)

| # | Risk | Mitigation |
|---|------|------------|
| 1 | **Thread IDOR** — the component's thread table is unscoped; a user could enumerate `threadId`s. | Every thread read/write resolves `thread.metadata.workspaceId` and asserts ownership. `createThread` mutation seeds metadata with the caller's workspace + project. (B3) |
| 2 | **Streaming subscription load** — `useStreamingUIMessages` subscribes per active thread. | Single subscription per open chat; unsubscribe on unmount. Acceptable at current scale. |
| 3 | **No `*-free` model guard (B4)** — chat is the highest-volume AI surface. | Promote the workspace model allowlist (deferred-work line 71) before chat ships. |
| 4 | **RAG cost amplification** — every message embeds the query. | Wire `@convex-dev/rate-limiter` to `searchProjectRag` (deferred-work line 16, promoted to Story 3.2 prerequisite). |
| 5 | **Stream abort / cleanup** — user navigates away mid-stream. | Verify the component handles client-disconnect gracefully (the `streams` table + cleanup is component-managed). Test in Story 3.4. |
| 6 | **Auto-title from first message** (AC: "auto-generated title from the first message") — needs a title-generation step. | Either a second lightweight `generateText` call after the first message, or a tool. Spike recommends: call `generateText({ prompt: "summarize this in ≤6 words", ... })` after the first exchange, write via `updateThreadMetadata`. |

## Open questions for the Story 3.1 spec

- Should chat threads live at `/projects/[id]/chat` (per-project) or global? → **Per-project** (matches the epic: "within a project"). Threads are scoped to a project via metadata.
- Auth for the streaming endpoint: does `useStreamingUIMessages` use Convex auth directly or need a token? → Verify in implementation; the deprecated `useStreamingText` took a token, but the newer hook likely uses Convex auth. Confirm against the component's HTTP route auth config.

## Verdict

**Story 3.1 is unblocked.** The streaming API (`thread.streamText` + `useStreamingUIMessages`) is the right shape; thread/message persistence is automatic; the main Story 3.1 work is (a) the `convex/chat/` domain wiring, (b) the thread↔project metadata linkage + IDOR guard, and (c) the auto-title step. Story 3.2 adds the RAG pre-prompt injection. No prototypes needed — the API is well-typed and the existing agent factory pattern extends cleanly.

---
baseline_commit: de7d094
---

# Story 3.4: Chat UI with Streaming Display

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a BA,
I want a ChatGPT-style interface with real-time streaming of AI responses,
so that I can read the answer as it's being generated.

## Acceptance Criteria

1. **AC1 — `[threadId]` page upgrades to streaming message subscription**: The existing thread view page at `src/app/(auth)/projects/[id]/chat/[threadId]/page.tsx` (built read-only in Story 3.3) is upgraded from non-streaming `useUIMessages(api.chat.queries.listThreadMessages, { threadId }, { initialNumItems: 50 })` to streaming: `useUIMessages(api.chat.queries.listThreadMessages, thread ? { threadId: params.threadId } : "skip", { initialNumItems: 50, stream: true })`. The `stream: true` option enables real-time streaming-delta delivery — the hook merges full messages (paginated) with streaming messages (live deltas from `syncStreams`) via `dedupeMessages`. The `listThreadMessages` query already satisfies the `StreamQuery` contract (it accepts `streamArgs: v.optional(vStreamArgs)` and returns `{ ...paginated, streams }` via `syncStreams` at `convex/chat/queries.ts:37-46` — verified in Story 3.1 AC5). **No backend change is required** — the query is already streaming-ready. The `"skip"` gate on `thread` (from `getThread`) is preserved from 3.3 (avoids `ConvexError("Thread not found")` on cross-workspace/invalid threadId before subscription).

2. **AC2 — Message composer with textarea input and submit button**: A message composer is rendered at the bottom of the `[threadId]` page (below the message list), consisting of: (a) a controlled `<textarea>` bound to `prompt` state, with `placeholder="Ask about this project's codebase…"`, styled per the existing input pattern (`inputBase` classes from `src/components/ui/FormField.tsx:22`: `w-full px-3 py-[9px] border rounded-[var(--radius-sm)] text-sm bg-[var(--surface)] text-[var(--fg)] outline-none focus:border-[var(--accent)] focus:shadow-[var(--focus-ring)] resize-none`). (b) a "Send" `<Button>` that submits. The composer is a cohesive unit — extract it as `src/components/chat/ChatComposer.tsx` for testability and reuse. The composer calls `useAction(api.chat.chatActions.streamMessage)` to trigger server-side generation, passing `{ threadId: params.threadId, prompt }`. On submit: trim the prompt (disable submit if empty), clear the textarea, set `isSending = true`, call the action, and clear `isSending` on resolve/reject. The submit button is `disabled` while `isSending === true` (prevents concurrent/duplicate sends). **React 19 rule**: all state updates (`setPrompt`, `setIsSending`) happen inside the submit event handler or the action's `.then()`/`.catch()` — never in the render body.

3. **AC3 — Optimistic user message display (instant feedback)**: When the BA submits a message, the user's message appears **instantly** in the chat (before the server persists it and the subscription propagates it). This is implemented via a local `pendingMessage` state: on submit, push `{ role: "user", parts: [{ type: "text", text: prompt }], status: "success", order: Number.MAX_SAFE_INTEGER, stepOrder: 0 }` into a local `pendingMessages` array. Render pending messages appended after the subscription messages. Once the subscription delivers the persisted user message (deduped by the hook's `dedupeMessages`), clear `pendingMessages` (the real message now shows via the subscription). This avoids duplicate display. Clear `pendingMessages` on the next render cycle after the action resolves OR when a subscription message with matching text arrives — simplest correct approach: clear `pendingMessages` when the action resolves (by then the server has persisted the user message and it's propagating). This mirrors ChatGPT's instant-send UX and is Option 1 from the Story 3.1 dev-notes "Optimistic Send Coordination" (local pending state, no `optimisticallySendMessage` — which requires a mutation wrapper since `.withOptimisticUpdate` is mutation-only and `streamMessage` is an action).

4. **AC4 — Streaming token-by-token display via subscription**: While the assistant response generates server-side, the streaming deltas arrive in real-time via the `useUIMessages(..., { stream: true })` subscription. The streaming assistant message appears in `results` with `status: "streaming"` (the `UIStatus = "streaming" | MessageStatus` type from `node_modules/@convex-dev/agent/dist/UIMessages.d.ts:3`). The `MessageBubble` component renders the streaming text as it grows (the parts array updates as deltas arrive — the hook materializes streaming deltas into a `UIMessage` with growing text parts). No manual polling or interval — the Convex subscription pushes deltas. The complete response is persisted automatically by the Agent Component (`thread.streamText` with `saveStreamDeltas: true` from Story 3.1) once generation finishes; the streaming message transitions from `status: "streaming"` to `status: "success"` and becomes a permanent full message.

5. **AC5 — Typing indicator during generation**: While the assistant is generating (detected via `results.some(m => m.role === "assistant" && m.status === "streaming")` OR while `isSending === true`), a typing indicator is displayed. The indicator is an animated three-dot ellipsis rendered below the message list (or inline at the bottom of the streaming assistant bubble). Use a pure CSS animation: three `<span>` dots with `animate-bounce` (Tailwind utility) staggered via `style={{ animationDelay: "0ms/150ms/300ms" }}`. The indicator disappears when no streaming message exists AND `isSending === false`. Extract as `src/components/chat/TypingIndicator.tsx` (small, pure-presentational, reusable, unit-testable). If a streaming assistant message already has text content (deltas arrived), the `MessageBubble` shows the partial text — the typing indicator only shows alongside (or instead of, if no text yet) to signal "still generating".

6. **AC6 — Follow-up messages maintain full conversation context**: After the first exchange, the BA can type a follow-up message and send it. The existing `streamMessage` action (`convex/chat/chatActions.ts:54-172`) calls `agent.continueThread(ctx, { threadId, userId })` which auto-loads recent message history (`contextOptions.recentMessages` default). The assistant response references prior turns — no manual history reconstruction (Agent Component handles context injection, per Story 3.1 AC6). The composer remains enabled after each exchange (only disabled during an active send). The subscription's `useUIMessages` with `stream: true` continues delivering both historical and new streaming messages for the same thread.

7. **AC7 — Auto-scroll to latest message on new content**: As new messages arrive (user send, assistant stream deltas, completion), the message list auto-scrolls to the bottom so the latest content is visible. Implement via a `messagesEndRef` (`useRef<HTMLDivElement>`) at the bottom of the message list and a `useEffect` that calls `messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })` when `results.length` changes OR when any streaming message's text grows. **Respect user scroll-up**: if the user has scrolled up (detected via `scrollContainer.scrollTop + scrollContainer.clientHeight < scrollContainer.scrollHeight - threshold`), do NOT auto-scroll (the user is reading history). Track this via a `isNearBottom` ref updated on the scroll container's `onScroll`. This is standard chat UX — prevents the viewport from yanking away while reading.

8. **AC8 — Enter to send, Shift+Enter for newline**: The composer textarea supports `Enter` to send (call the submit handler) and `Shift+Enter` to insert a newline. Implement via an `onKeyDown` handler on the textarea: if `e.key === "Enter" && !e.shiftKey`, call `e.preventDefault()` and submit. If `e.key === "Enter" && e.shiftKey`, let the default newline insertion occur. This matches ChatGPT convention. The "Send" button click also submits. Both paths go through the same `handleSubmit` function.

9. **AC9 — Error handling on send (friendly messages, no silent swallow)**: If `streamMessage` throws (e.g., `ConvexError("Thread not found")`, rate-limit `ConvexError("You're sending messages too quickly…")`, AI provider error from `buildChatErrorMessage`), the composer: (a) re-enables (sets `isSending = false`), (b) restores the prompt text into the textarea (so the user doesn't lose their input — store the prompt before clearing), (c) displays an `<Alert variant="error">` above the composer with the friendly message (strip the `Uncaught ConvexError:` prefix via the established regex `err.message.replace(/^Uncaught ConvexError:\s*/, "")`), (d) logs via `useErrorLogger().logError(msg, { severity: "error", context: { source: "ChatComposer.handleSubmit" } })`. The `streamMessage` action's RAG-search errors are already swallowed server-side (Story 3.2 AC3) — they never reach the client. Only `streamText` failures and ownership/rate-limit failures surface here. Never silently swallow a send error (project-context.md rule).

10. **AC10 — `[threadId]` page preserves all 3.3 states + adds composer**: The page retains ALL existing states from Story 3.3 (`src/app/(auth)/projects/[id]/chat/[threadId]/page.tsx`): loading (`thread === undefined` → `<PageSkeleton />`), not-found (`thread === null` → `<EmptyState>` "Thread not found" + "Back to Chat" link), message-loading (`status === "LoadingFirstPage"` → `<PageSkeleton />`), empty messages (`messages.length === 0` → `<EmptyState>` "This conversation has no messages yet" — but NOW with the composer visible so the BA can send the first message), populated messages. The header (thread title + "Back to Chat" link) is unchanged. The composer renders in ALL states EXCEPT `thread === null` (not-found) and `thread === undefined` (loading) — i.e., the composer shows whenever the thread is owned and viewable. **The empty-messages state now includes the composer** (3.3 had no composer at all; 3.4 adds it everywhere the thread is accessible). The `MessageBubble` and `MessageList` components from 3.3 (`src/components/chat/MessageBubble.tsx`) are REUSED — enhance only if needed for streaming-status display (AC5).

11. **AC11 — Cross-workspace isolation inherited and verified (NFR-2, B3 IDOR guard)**: This story adds NO new backend surface. The existing guards are inherited: `getThread` (3.3) returns `null` for cross-workspace → the page shows "Thread not found" (no composer). `listThreadMessages` (3.1) throws `ConvexError("Thread not found")` for cross-workspace — but the `"skip"` gate prevents the query from firing before `getThread` resolves ownership. `streamMessage` (3.1) throws `ConvexError("Thread not found")` via `_getThreadOwnership` if a cross-workspace `threadId` is passed to the action. **No public function accepts a bare `threadId` without ownership enforcement** — the B3 IDOR guard from Stories 3.1/3.3 is fully inherited. This story verifies via tests (AC12); it adds zero new guard code.

12. **AC12 — Tests (TDD, ≥80% coverage)**:
    - **`ChatComposer` component tests** (`src/components/chat/ChatComposer.test.tsx` — new): Mock `convex/react` (`useAction` returns a mock fn that resolves/rejects). Test: (a) renders textarea + Send button, (b) Send button disabled when textarea empty, (c) typing + clicking Send calls `streamMessage` action with `{ threadId, prompt }`, (d) textarea clears on successful send, (e) Send button disabled while sending (`isSending`), (f) `onSubmit` exposes the pending message via callback prop (for parent to render optimistically), (g) Enter key submits, Shift+Enter inserts newline (does NOT submit), (h) on action rejection: error Alert shows, prompt restored to textarea, button re-enabled. Mock `@/lib/error-logger` (`useErrorLogger`) — use `vi.hoisted` for a single reusable `logError` fn if asserting calls (deferred-work line 14 / retro B5). Follow the `chat.test.tsx:1-48` mock pattern (3.3 established it).
    - **`TypingIndicator` component test** (`src/components/chat/TypingIndicator.test.tsx` — new): Renders three dots with `animate-bounce`. Pure presentational — assert `aria-label="Assistant is typing"` (accessibility) and 3 dot elements.
    - **`[threadId]` page tests** (`src/app/(auth)/projects/[id]/chat/[threadId]/thread-view.test.tsx` — EXTEND): Update the existing `useUIMessages` mock to return the `{ stream: true }`-merged results shape. Add tests: (a) composer renders when thread is owned, (b) composer does NOT render when `thread === null`, (c) typing indicator renders when a streaming assistant message exists in results (`status: "streaming"`), (d) typing indicator absent when no streaming message, (e) pending user message renders after submit (before subscription delivers), (f) all 3.3 states still pass (regression — title, back link, empty, loading, not-found, skip-gate). Mock `useAction` (for `streamMessage`) per the `knowledge.test.tsx:21` pattern.
    - All existing tests pass — zero regressions (`pnpm test` for frontend; `pnpm test:convex` unaffected — no backend changes).

## Tasks / Subtasks

- [x] Task 1: Write `TypingIndicator` component test FIRST (AC: #5, #12) — TDD RED
  - [x] Create `src/components/chat/TypingIndicator.test.tsx`.
  - [x] Test: renders three `<span>` elements (dots) with `animate-bounce` class.
  - [x] Test: has `aria-label="Assistant is typing"` for screen readers.

- [x] Task 2: Implement `TypingIndicator` component (AC: #5) — TDD GREEN
  - [x] Create `src/components/chat/TypingIndicator.tsx`. Pure presentational: three staggered bouncing dots. `"use client"` not needed if no hooks/state, but add for consistency with sibling `MessageBubble.tsx`.
  - [x] Styling: `flex gap-1` container, three `<span className="w-2 h-2 rounded-full bg-[var(--muted)] animate-bounce">` with `style={{ animationDelay: "0ms/150ms/300ms" }}`.

- [x] Task 3: Write `ChatComposer` component tests FIRST (AC: #2, #3, #8, #9, #12) — TDD RED
  - [x] Create `src/components/chat/ChatComposer.test.tsx`.
  - [x] Mock `convex/react` (`useAction`), `@/lib/convex` (`api`), `@/lib/error-logger` (`useErrorLogger`). Use `vi.hoisted` for a shared `mockStreamMessage` + `mockLogError` so call assertions work.
  - [x] Test: renders textarea (placeholder) + Send button.
  - [x] Test: Send disabled when prompt is empty/whitespace.
  - [x] Test: type + click Send → `streamMessage` called with `{ threadId, prompt }`, textarea clears, `onPending` callback fires with the user message.
  - [x] Test: Send disabled while `isSending` (mock action pending).
  - [x] Test: Enter key submits (no Shift) → action called.
  - [x] Test: Shift+Enter does NOT submit (newline inserted) — assert action NOT called.
  - [x] Test: action rejects → error Alert visible, prompt restored, button re-enabled, `logError` called.

- [x] Task 4: Implement `ChatComposer` component (AC: #2, #3, #8, #9) — TDD GREEN
  - [x] Create `src/components/chat/ChatComposer.tsx`. Props: `{ threadId: string; onPending: (msg: PendingMessage) => void; onSent: () => void; onError: (msg: string) => void }`. The parent owns the pending-message list and error display (keeps the composer focused on input + action call).
  - [x] State: `prompt: string`, `isSending: boolean`, `lastPrompt: string` (for restore-on-error).
  - [x] `const streamMessage = useAction(api.chat.chatActions.streamMessage)`.
  - [x] `handleSubmit`: guard empty/whitespace → `setLastPrompt(prompt); setPrompt(""); setIsSending(true); onPending({...user msg...}); try { await streamMessage({ threadId, prompt: trimmed }); onSent(); } catch (err) { const msg = stripConvexError(err); setError(msg); setPrompt(lastPrompt); onError(msg); } finally { setIsSending(false); }`. NOTE: `setPrompt("")` clears instantly (optimistic); on error, restore from `lastPrompt`.
  - [x] `handleKeyDown`: if `Enter && !shiftKey` → `e.preventDefault(); handleSubmit()`.
  - [x] Textarea: controlled `value={prompt}`, `onChange`, `onKeyDown`, classes from `inputBase`. `rows={2}` or auto-resize via `min-h-[80px]`.
  - [x] Send button: `<Button disabled={isSending || !prompt.trim()}>{isSending ? "Sending…" : "Send"}</Button>`.
  - [x] NOTE: `onPending` is called with the optimistic user message BEFORE the await — the parent appends it to the rendered list instantly.

- [x] Task 5: Write `[threadId]` page streaming + composer tests FIRST (AC: #1, #4, #5, #7, #10, #11, #12) — TDD
  - [x] EXTEND `src/app/(auth)/projects/[id]/chat/[threadId]/thread-view.test.tsx`.
  - [x] Update `useUIMessages` mock to accept the `{ stream: true }` option (the mock ignores options — just verify the call includes `stream: true`).
  - [x] Add `useAction` to the `convex/react` mock (returns `mockStreamMessage`).
  - [x] Test: composer (`ChatComposer`) renders when `thread` is non-null (owned).
  - [x] Test: composer does NOT render when `thread === null`.
  - [x] Test: typing indicator renders when `results` contains `{ role: "assistant", status: "streaming" }`.
  - [x] Test: typing indicator absent when no streaming message.
  - [x] Test: `onPending` from `ChatComposer` appends a user message to the rendered list (optimistic display).
  - [x] Test: all existing 3.3 tests still pass (regression — title, back link, empty, loading, not-found, skip-gate, messages render).
  - [x] Test: `useUIMessages` called with `{ initialNumItems: 50, stream: true }`.

- [x] Task 6: Upgrade `[threadId]` page to streaming + integrate composer + typing indicator + auto-scroll (AC: #1, #4, #5, #7, #10) — TDD GREEN
  - [x] In `src/app/(auth)/projects/[id]/chat/[threadId]/page.tsx`: change `useUIMessages(api.chat.queries.listThreadMessages, thread ? { threadId: params.threadId } : "skip", { initialNumItems: 50 })` → add `stream: true` to the options object.
  - [x] Add `pendingMessages` state (`useState<PendingMessage[]>([])`). Pass `onPending`, `onSent`, `onError` handlers to `ChatComposer`. `onPending`: append to `pendingMessages`. `onSent`: clear `pendingMessages` (server has persisted + subscription delivering). `onError`: set an error state rendered as `<Alert>`.
  - [x] Render `pendingMessages` appended after the `results` messages (both fed to `MessageBubble`).
  - [x] Compute `isStreaming = results.some(m => m.role === "assistant" && m.status === "streaming")`. Render `<TypingIndicator />` when `isStreaming`.
  - [x] Render `<ChatComposer>` below the message list + typing indicator — ONLY when `thread` is non-null (owned). NOT when loading/not-found.
  - [x] Auto-scroll: add `messagesEndRef` + scroll container ref. `useEffect` on `[results, pendingMessages, isStreaming]` → if `isNearBottom.current`, `messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })`. Track `isNearBottom` via `onScroll` on the scroll container.
  - [x] Sort: keep the existing oldest-first sort (`results` may include streaming messages with high order — sort by `order` then `stepOrder`; pending messages sort last).

- [x] Task 7: Enhance `MessageBubble` for streaming display (AC: #4, #5) — if needed
  - [x] Review whether `MessageBubble` (`src/components/chat/MessageBubble.tsx`) renders streaming text correctly. The existing implementation filters `type === "text"` parts and renders `.text` — streaming deltas grow the text part, so this should work as-is for incremental text.
  - [x] If the streaming message has empty text parts (deltas not yet arrived), render the `<TypingIndicator />` INSIDE the assistant bubble instead of `[non-text content]`. Add an optional `isStreaming?: boolean` prop; when true and no text parts, render the typing dots inline.
  - [x] Update `MessageBubble.test.tsx` if the prop is added (test the streaming-empty-text branch).

- [x] Task 8: Validation (AC: #12)
  - [x] `pnpm lint` — zero new errors.
  - [x] `pnpm test` — all frontend tests pass (new + existing, zero regressions).
  - [x] `pnpm test:convex` — all backend tests pass (zero regressions — no backend changes, but verify nothing broke).
  - [x] `pnpm build` — Next.js build succeeds (pre-existing `bmadActions.ts`/`baselineActions.ts` type errors are documented in deferred-work line 106 and NOT caused by this story).

## Dev Notes

### Scope Boundary — Frontend Only

**This story implements (frontend only):**
- Streaming upgrade on the `[threadId]` page (`useUIMessages(..., { stream: true })`)
- Message composer (`ChatComposer` component) with optimistic send via `useAction`
- Typing indicator (`TypingIndicator` component) during assistant generation
- Auto-scroll to latest message (respecting user scroll-up)
- Enter-to-send / Shift+Enter-for-newline keyboard handling
- Error handling on send (restore prompt, friendly Alert, logError)
- Frontend component + page tests (TDD)

**This story does NOT implement:**
- Any backend change. `streamMessage`, `listThreadMessages`, `getThread`, `listThreads` are ALL complete from Stories 3.1/3.2/3.3. The `listThreadMessages` query already satisfies the `StreamQuery` contract (accepts `streamArgs`, returns `streams` via `syncStreams`). **Do NOT modify `convex/chat/` files.**
- Markdown rendering of assistant responses. No markdown renderer dependency exists in the project (`react-markdown`/`marked` are NOT installed). The assistant response renders as plain preformatted text via `MessageBubble`'s `whitespace-pre-wrap` — inline code citations appear as backtick-text, not rendered code blocks. Markdown rendering is a future enhancement (add `react-markdown` + `remark-gfm` as a separate story if richer formatting is needed). The AC requires streaming display, not markdown rendering.
- Citation rendering / "sources" panel. The RAG-grounded citations (Story 3.2) are inline in the assistant's text response — no separate UI panel.
- `optimisticallySendMessage` from `@convex-dev/agent/react`. That helper pairs with a MUTATION's `.withOptimisticUpdate`, but `streamMessage` is an ACTION (`useAction`, which has no `.withOptimisticUpdate`). Local `pendingMessages` state achieves the same instant-feedback UX without the mutation constraint. (Story 3.1 dev-notes "Optimistic Send Coordination" Option 1.)
- Thread deletion, renaming, or pinning (no AC).
- `*-free` model guard (deferred-work line 71/retro B4 — cross-cutting, not story-specific).
- BMAD-aware features (Epic 4 scope).

### CRITICAL: The Streaming Upgrade Is a One-Line Options Change

Story 3.3 built the `[threadId]` page with the NON-streaming variant intentionally (3.3 dev-notes "The Split Between 3.3 and 3.4" table). The upgrade is surgical:

```typescript
// Story 3.3 (current):
const { results, status } = useUIMessages(
  api.chat.queries.listThreadMessages,
  thread ? { threadId: params.threadId } : "skip",
  { initialNumItems: 50 },
);

// Story 3.4 (upgrade — add stream: true):
const { results, status } = useUIMessages(
  api.chat.queries.listThreadMessages,
  thread ? { threadId: params.threadId } : "skip",
  { initialNumItems: 50, stream: true },  // ← THE change
);
```

**Why this works without a backend change** (verified against installed types at `node_modules/@convex-dev/agent/dist/react/useUIMessages.d.ts:86-90`):

1. The `useUIMessages` hook is "a wrapper around `usePaginatedQuery` and `useStreamingUIMessages`" (line 35). With `stream: true`, it ALSO subscribes to streaming deltas and merges them via `dedupeMessages` (line 91-95).
2. The `listThreadMessages` query (`convex/chat/queries.ts:20-48`) already: (a) accepts `streamArgs: v.optional(vStreamArgs)`, (b) calls `syncStreams(ctx, components.agent, args)`, (c) returns `{ ...paginated, streams }`. This satisfies the `StreamQuery` contract (the `stream?: Query extends StreamQuery ? boolean` type-level gate at line 88).
3. The streaming deltas were already being PERSISTED by `streamMessage` (Story 3.1 AC4: `saveStreamDeltas: true`). They just weren't being CONSUMED by the client until `stream: true` is set.

**Do NOT swap to `useStreamingUIMessages`** — that hook "ONLY returns streaming UIMessages" (line 7 of `useStreamingUIMessages.d.ts`) and would lose the paginated full-message history. `useUIMessages` with `stream: true` returns BOTH (merged). The 3.3 dev-notes anticipated exactly this upgrade path.

### CRITICAL: How `streamMessage` + the Subscription Coordinate

The chat flow has two independent halves (Story 3.1 "Streaming Architecture — Two Parts"):

```
┌─ Client (this story) ──────────────────────────────────────────┐
│  useUIMessages(..., { stream: true })  ← subscribes to deltas   │
│  ChatComposer → useAction(streamMessage) ← triggers generation  │
└─────────────────────────────────────────────────────────────────┘
         │ subscription (real-time deltas)      │ action (one-shot)
         ▼                                       ▼
┌─ Server (Stories 3.1/3.2 — UNCHANGED) ──────────────────────────┐
│  listThreadMessages query: syncStreams → pushes deltas          │
│  streamMessage action: thread.streamText({ prompt }, {          │
│    saveStreamDeltas: true                                       │
│  }) → persists user msg + assistant response + stream deltas    │
│    → auto-title on first message                                │
│    → RAG search + system override (Story 3.2)                   │
└─────────────────────────────────────────────────────────────────┘
```

**Key behavior**: when the client calls `streamMessage({ threadId, prompt })`, the action runs server-side and `thread.streamText` persists BOTH the user message (from `prompt`) and the assistant response + stream deltas. The client's `useUIMessages` subscription receives: (1) the persisted user message (once saved), (2) the streaming assistant deltas (in real-time as they're written to the `streams` table). This is why local `pendingMessages` state is needed — there's a brief delay between the client calling the action and the subscription receiving the persisted user message. The `pendingMessages` array fills that gap, then is cleared once the real message arrives.

**Do NOT manually call `saveMessage`** — `streamText({ prompt })` persists the user message automatically (Story 3.1 "Message Persistence Is Automatic"). Manual `saveMessage` would duplicate it.

### CRITICAL: Optimistic Send — Local Pending State (NOT `optimisticallySendMessage`)

The `optimisticallySendMessage` helper from `@convex-dev/agent/react` (`node_modules/@convex-dev/agent/dist/react/optimisticallySendMessage.d.ts:31`) patches the local query cache to show the user's message instantly. BUT it's designed to be called inside a MUTATION's `.withOptimisticUpdate`:

```typescript
const sendMessage = useMutation(api.chat.stream).withOptimisticUpdate(
  (store, args) => optimisticallySendMessage(api.chat.queries.listThreadMessages)(store, { threadId, prompt })
);
```

`streamMessage` is an ACTION (`"use node"` at `convex/chat/chatActions.ts:1` — it needs Node runtime for the AI SDK's `fetch`). `useAction` does NOT support `.withOptimisticUpdate` in Convex. Therefore, `optimisticallySendMessage` cannot be used directly here without refactoring `streamMessage` into a mutation (which would break the `"use node"` AI call).

**Solution**: local `pendingMessages` state in the page. On submit, the `ChatComposer` calls `onPending(userMessage)` before awaiting the action. The parent appends it to the rendered list. On `onSent` (action resolved), clear `pendingMessages` — the server has persisted the user message and the subscription is delivering it. This achieves identical UX (instant message appearance) without touching the action/mutation boundary.

**Dedup**: once the subscription delivers the real user message (same text, `role: "user"`), clearing `pendingMessages` prevents a brief double-display. The simplest correct timing: clear `pendingMessages` in the `onSent` callback (by the time the action resolves, `streamText` has persisted the user message and it's propagating to the subscription within the next render cycle). A momentary double-display (pending + real) is harmless and resolves in <500ms.

### Typing Indicator — Detecting Streaming State

The `UIStatus` type (`node_modules/@convex-dev/agent/dist/UIMessages.d.ts:3`) is `"streaming" | MessageStatus`. When `useUIMessages` merges streaming deltas, the in-progress assistant message has `status: "streaming"`. Detection:

```typescript
const isStreaming = results.some(
  (m) => m.role === "assistant" && m.status === "streaming",
);
```

Render `<TypingIndicator />` when `isStreaming === true`. The indicator can render:
- **Below the message list** (always-visible "Assistant is typing…" bar), OR
- **Inside the streaming assistant bubble** (if no text deltas yet — the `MessageBubble` shows dots instead of empty content).

Both are valid. The simplest v1: render `<TypingIndicator />` below the message list when `isStreaming` — it coexists with a streaming `MessageBubble` that may already have partial text. If the streaming message has NO text yet (deltas not arrived), the `MessageBubble` renders `[non-text content]` which is misleading — prefer rendering the dots inside the bubble in that case (Task 7 enhancement: `isStreaming` prop on `MessageBubble`).

Also consider `isSending` (local state from the action call) as an additional trigger — there's a brief window between calling the action and the first delta arriving where `isStreaming` is false but the user is waiting. Show the indicator when `isStreaming || isSending` for a smooth experience.

### Auto-Scroll — Respect User Scroll-Up

Standard chat UX: auto-scroll to bottom on new content UNLESS the user has scrolled up to read history.

```typescript
const scrollRef = useRef<HTMLDivElement>(null);
const messagesEndRef = useRef<HTMLDivElement>(null);
const isNearBottomRef = useRef(true);

const handleScroll = () => {
  const el = scrollRef.current;
  if (!el) return;
  isNearBottomRef.current =
    el.scrollHeight - el.scrollTop - el.clientHeight < 100; // 100px threshold
};

useEffect(() => {
  if (isNearBottomRef.current) {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }
}, [results, pendingMessages, isStreaming]);
```

The scroll container is the message-list wrapper (`<div ref={scrollRef} onScroll={handleScroll} className="overflow-y-auto">`). The `messagesEndRef` is an empty `<div ref={messagesEndRef} />` at the bottom of the list (scroll target). Use `"smooth"` behavior for natural feel; the threshold (100px) prevents scroll-fighting when the user is near but not exactly at the bottom.

**React 19 note**: `useEffect` with the dependency array is correct — `scrollIntoView` is a DOM side-effect, safe in effects (not render body). Do NOT call `scrollIntoView` during render.

### Error Handling — Restore Prompt on Failure

If `streamMessage` throws, the user should NOT lose their typed message. Pattern:

```typescript
const handleSubmit = async () => {
  const trimmed = prompt.trim();
  if (!trimmed || isSending) return;
  const savedPrompt = trimmed;       // save before clearing
  setPrompt("");                     // clear for optimistic UX
  setIsSending(true);
  onPending({ role: "user", parts: [{ type: "text", text: trimmed }], ... });
  try {
    await streamMessage({ threadId, prompt: trimmed });
    onSent();
  } catch (err) {
    const msg = err instanceof Error
      ? err.message.replace(/^Uncaught ConvexError:\s*/, "")
      : "Failed to send message.";
    setPrompt(savedPrompt);          // restore so user can retry/edit
    onError(msg);
  } finally {
    setIsSending(false);
  }
};
```

This mirrors the `chat/page.tsx` "New Chat" error pattern (3.3) but with prompt-restore. The `onError` callback lets the parent render the `<Alert>` (keeps the composer focused). The `ConvexError` prefix-stripping regex (`/^Uncaught ConvexError:\s*/`) is the established codebase pattern (`chat/page.tsx:45`, deferred-work line 55).

### What NOT to Reinvent

| Concern | Reuse | Do NOT build |
|---------|-------|--------------|
| Streaming subscription | `useUIMessages(..., { stream: true })` (`@convex-dev/agent/react`) | A custom WebSocket/SSE poller, or swap to `useStreamingUIMessages` (loses paginated history) |
| Generation trigger | `streamMessage` action (`convex/chat/chatActions.ts:54`) via `useAction` | A new mutation, or `optimisticallySendMessage` (requires mutation) |
| Message rendering | `MessageBubble` + `MessageList` (`src/components/chat/MessageBubble.tsx`) | A new message component |
| Thread ownership gate | `getThread` query (3.3) + `"skip"` pattern | A new ownership check |
| Thread metadata/title | `getThread` query (`convex/chat/queries.ts:104`) | A separate fetch |
| Empty/loading/not-found states | `EmptyState`, `PageSkeleton` (`@/components/ui/`) | Custom state components |
| Error display | `Alert` (`@/components/ui/Alert`) + `useErrorLogger` | Custom error UI |
| Button styling | `Button` (`@/components/ui/Button`) | Custom button |
| Input styling | `inputBase` classes from `FormField.tsx:22` | A new input component (use the existing class string) |
| ConvexError prefix strip | `err.message.replace(/^Uncaught ConvexError:\s*/, "")` | A different error-parsing approach |
| Test mock pattern | `chat.test.tsx:1-48` (3.3 list-page mocks) + `thread-view.test.tsx` | A different mock structure |

### Existing APIs to Reuse (no reinvention)

| API | Location | Purpose in this story |
|-----|----------|----------------------|
| `useUIMessages` | `@convex-dev/agent/react` | Streaming message subscription (add `stream: true`) |
| `streamMessage` | `convex/chat/chatActions.ts:54` (via `api.chat.chatActions.streamMessage`) | Trigger generation (called via `useAction`) |
| `listThreadMessages` | `convex/chat/queries.ts:20` | The streaming-ready query (consumed by `useUIMessages`) |
| `getThread` | `convex/chat/queries.ts:104` | Thread title + ownership gate (consumed by `useQuery`) |
| `MessageBubble`, `MessageList` | `src/components/chat/MessageBubble.tsx` | Reusable message renderer (3.3 — enhance if needed) |
| `useAction` | `convex/react` | Call the `streamMessage` action |
| `useQuery` | `convex/react` | `getThread` subscription |
| `Button` | `@/components/ui/Button` | Send button |
| `Alert` | `@/components/ui/Alert` | Error display |
| `EmptyState` | `@/components/ui/EmptyState` | Empty/loading/not-found states |
| `PageSkeleton` | `@/components/ui/Skeleton` | Loading state |
| `useErrorLogger` | `src/lib/error-logger` | Catch-block error logging |
| `asId` | `@/lib/convex` | (not needed — threadId is a string, not an Id) |

### Previous Story Intelligence

**Story 3.3 (Chat Thread List & Navigation) — direct predecessor, built the file being modified:**

1. **The `[threadId]` page is read-only** (`src/app/(auth)/projects/[id]/chat/[threadId]/page.tsx`): `useUIMessages` WITHOUT `stream: true`, NO composer, NO typing indicator. This story upgrades ALL THREE. The page structure (header, states, `MessageBubble` usage) is reused.

2. **`MessageBubble` is reusable** (`src/components/chat/MessageBubble.tsx`): filters `type === "text"` parts, renders role + text. It works for streaming text (deltas grow the text part). The only gap: a streaming message with NO text yet renders `[non-text content]` — Task 7 adds an `isStreaming` prop to render dots instead.

3. **The `"skip"` gate pattern** (`thread ? { threadId } : "skip"`): PRESERVED. The `getThread` query (3.3) returns `null` for cross-workspace → the page shows "Thread not found" WITHOUT calling `listThreadMessages` (avoids the `ConvexError("Thread not found")` throw on every subscription tick). This is the 3.3 review-patch finding — keep it.

4. **Test mock pattern** (`thread-view.test.tsx:1-42`): mock `@convex-dev/agent/react` (`useUIMessages`), `convex/react` (`useQuery`), `next/navigation` (`useParams`), `@/lib/convex` (`api`), `@/lib/error-logger`. EXTEND with `useAction` mock for `streamMessage`. Follow the exact mock structure.

5. **Review gate (project-context.md line 105)**: Every story's `done` transition requires (a) a `### Review Findings` section with the 3-layer review outcome, AND (b) this file's `Status:` header matching `sprint-status.yaml`. Story 2.3 shipped `done` in sprint-status but `review` in its file — ENFORCED gate.

6. **`useErrorLogger` mock limitation** (deferred-work line 14, retro B5): use `vi.hoisted` for a single reusable `logError` fn if tests assert error logging (3.3's `chat.test.tsx:5-7` established the `vi.hoisted` pattern for this).

**Story 3.2 (RAG-Grounded Responses) — backend complete, no frontend:**

1. **`streamMessage` now injects RAG** before `streamText` — the client is unaware (the `system` override is server-side, transient, not persisted as a message). The client just calls `streamMessage({ threadId, prompt })` and the response is grounded. No client-side RAG logic.

2. **Rate limiting on `searchProjectRag`** (3.2 AC5): if the workspace exceeds 20 RAG searches/min, `streamMessage` throws `ConvexError("You're sending messages too quickly. Please wait a moment and try again.")`. This surfaces in the composer's error handling (AC9) — the user sees the friendly message and can retry. The `isRateLimitError` check (3.2, `convex/chat/chatActions.ts:92`) re-throws as a user-facing `ConvexError` (NOT swallowed like other RAG errors).

**Story 3.1 (Analyst Chat Agent & Thread Management) — backend foundation:**

1. **`streamMessage` persists automatically**: `thread.streamText({ prompt }, { saveStreamDeltas: true })` saves user + assistant + deltas. The client relies on the subscription for display — no manual message writes.

2. **Auto-title on first message**: server-side (3.1 AC7). The client sees the title update via the `getThread` subscription (the list page's `listThreads` also reflects it). No client-side title logic.

3. **"Optimistic Send Coordination" (3.1 dev-notes)**: flagged Option 1 (local pending state, direct action call) vs Option 2 (`optimisticallySendMessage` + `promptMessageId`). This story implements Option 1 (local pending state) — see "Optimistic Send" dev-notes above for the rationale (action vs mutation constraint).

**Epic 2 retrospective — defects to avoid:**

| Epic 2 Defect | Mitigation in This Story |
|---------------|--------------------------|
| IDOR on `Id`-accepting actions (B3) | No new backend surface — all guards inherited from 3.1/3.3. `streamMessage` already enforces `_getThreadOwnership`. |
| Review documentation skipped (B1) | `### Review Findings` section + status header match is the ENFORCED done-gate. |
| Status-header hygiene | `Status: ready-for-dev` now; matches `sprint-status.yaml` at every transition. |
| `useErrorLogger` mock returns fresh fn per call (B5) | Use `vi.hoisted` for single-fn reuse if asserting `logError` calls. |

### Git Intelligence

Baseline: latest `main` = `de7d094` (graphify regen after Story 3.3). Relevant recent commits:
- `5882520` — Story 3.3 (Chat Thread List & Navigation) with code review fixes — **direct predecessor; the `[threadId]/page.tsx`, `MessageBubble.tsx`, `getThread` query, and `thread-view.test.tsx` are the modification/reuse targets.**
- `46aeb5f` — Story 3.2 (RAG-Grounded Responses) — **`streamMessage` now includes RAG injection + rate limiting.**
- `347b6e5` — Story 3.1 (Analyst Chat Agent & Thread Management) — **backend foundation; `streamMessage`, `listThreadMessages`, `saveStreamDeltas` are the contract this story consumes.**

No new schema tables. No new dependencies. No backend files modified. The frontend `src/app/(auth)/projects/[id]/chat/[threadId]/page.tsx` is the primary modification target. New components (`ChatComposer`, `TypingIndicator`) go in `src/components/chat/`. No `pnpm dev` restart needed (frontend-only changes — the Convex file-watcher restart rule at project-context.md line 68 applies only to new `convex/` directories).

Single `feat:` commit per story (follow `5882520` convention).

### React 19 + Next.js 16 Rules (project-context.md)

- **`router.push()` in event handlers only**: not directly relevant (no navigation in this story — the composer calls an action, not a route change). But the "Back to Chat" link is a `<Link>` (already correct from 3.3).
- **All state updates in event handlers / effects / callbacks**: `setPrompt`, `setIsSending`, `setPendingMessages`, `setError` all happen inside `handleSubmit` (event handler) or its `.then()`/`.catch()`/`.finally()` — NEVER in the render body. The `useEffect` for auto-scroll only calls `scrollIntoView` (DOM API, not React state).
- **`"use client"` at top of every page/component**: all files in this story are client components (they use Convex hooks + React state). `page.tsx` already has it (3.3). `ChatComposer.tsx` and `TypingIndicator.tsx` need it if they use hooks/state.
- **Conditional queries via `"skip"`**: the `getThread` → `"skip"` gate on `useUIMessages` is PRESERVED from 3.3.
- **Next.js 16 breaking changes**: read `node_modules/next/dist/docs/` if unsure about App Router conventions. No new conventions in this story — the `[threadId]` route already exists.

### Accessibility

- **Composer textarea**: `<label>` with `htmlFor` linking to the textarea `id` (e.g., `<label htmlFor="chat-input">Message</label>`). Visually-hidden label or `sr-only` if the placeholder suffices visually — but the label must exist for screen readers. Use `aria-label="Type your message"` on the textarea as a fallback.
- **Send button**: accessible by default via `<Button>` (renders `<button>`). `aria-label` not needed if text "Send" is present. Disabled state is communicated by `disabled` attribute.
- **Typing indicator**: `aria-label="Assistant is typing"` + `role="status"` (so screen readers announce the status change). `aria-live="polite"` on the indicator container so the announcement doesn't interrupt.
- **Message bubbles**: 3.3 already has `aria-label={role === "user" ? "Your message" : "AI response"}` — preserve.
- **Keyboard navigation**: Enter-to-send, Shift+Enter for newline (AC8). The Send button is keyboard-focusable and activatable via Space/Enter (native `<button>`).
- **Auto-scroll**: do NOT trap focus. `scrollIntoView` moves the viewport but not focus. The composer textarea retains focus after send (so the user can type the next message immediately) — do NOT blur it.

### Deferred Work Relevant to This Story

Per retrospective action A8, review `_bmad-output/implementation-artifacts/deferred-work.md`:

- **`useErrorLogger` mock returns fresh fn per call** (deferred-work line 14, retro B5): if this story's tests assert `logError` calls, use `vi.hoisted` for a single reusable fn (3.3's `chat.test.tsx:5-7` pattern). Test-quality only.
- **Query errors show infinite loading skeleton** (deferred-work line 45): "useQuery error state never inspected — undefined (loading) and null (not found) handled, but query errors leave user stuck on skeleton." For this story, the `getThread` query error (rare) would leave the page on `<PageSkeleton />` — acceptable for v1, matches existing pages (3.3 explicitly accepted this).
- **Invalid `params.id` / `params.threadId` → perpetual skeleton** (deferred-work line 114, 3.3 review-defer): codebase-wide client-side ID-validation gap. The `"skip"` gate mitigates the `threadId` case (getThread returns null for invalid → "Thread not found"). The `params.id` case isn't used by the `[threadId]` page (it only reads `params.threadId` + `params.id` for the back-link href). NOT in this story.
- **`pnpm build` fails** (deferred-work line 106): pre-existing TypeScript errors in `convex/knowledge/bmadActions.ts`/`baselineActions.ts`. NOT caused by this story. Task 8 notes this.
- **No `*-free` model guard** (deferred-work line 71/8, retro B4): NOT in this story (cross-cutting; no frontend involvement).
- **`getThread` throws on session expiry** (deferred-work line 111, 3.3 review-defer): session-expiry query-error UX is codebase-wide. NOT in this story.

### Project Structure Notes

New frontend files:
```
src/components/chat/
├── MessageBubble.tsx              # (EXISTS from 3.3 — enhance if needed)
├── ChatComposer.tsx               # NEW — textarea + Send button (AC2, #3, #8, #9)
├── ChatComposer.test.tsx          # NEW — component tests (AC12)
├── TypingIndicator.tsx            # NEW — animated dots (AC5)
└── TypingIndicator.test.tsx       # NEW — component test (AC12)
```

Modified frontend files:
```
src/app/(auth)/projects/[id]/chat/[threadId]/
├── page.tsx                       # MODIFY — add stream:true, composer, typing indicator, auto-scroll (AC1, #4, #5, #7, #10)
└── thread-view.test.tsx           # EXTEND — streaming + composer + indicator tests (AC12)
```

**No backend files modified.** No new directories under `convex/`. No schema changes. No new dependencies. No `pnpm dev` restart needed.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 3.4] — ACs and user story (lines 661-676)
- [Source: _bmad-output/planning-artifacts/epics.md#Epic 3] — Epic context (lines 597-599)
- [Source: _bmad-output/planning-artifacts/epics.md#FR-18] — Send messages, AI responds with streaming
- [Source: _bmad-output/planning-artifacts/epics.md#FR-22] — Conversation refinement
- [Source: _bmad-output/planning-artifacts/spike-3.1-streaming-chat.md#Client-side] — `useStreamingUIMessages` / `optimisticallySendMessage` API surface (verified)
- [Source: _bmad-output/planning-artifacts/spike-3.1-streaming-chat.md#Risks] — Risk #5 (stream abort on unmount — component-managed cleanup) and Risk #2 (subscription load — single per open chat)
- [Source: _bmad-output/implementation-artifacts/3-3-chat-thread-list-navigation.md] — **Direct predecessor; `[threadId]/page.tsx`, `MessageBubble.tsx`, `getThread` query, `thread-view.test.tsx` are the modification/reuse targets. "The Split Between 3.3 and 3.4" table defines this story's scope.**
- [Source: _bmad-output/implementation-artifacts/3-2-rag-grounded-responses.md] — `streamMessage` now includes RAG + rate limiting; rate-limit `ConvexError` surfaces in composer error handling
- [Source: _bmad-output/implementation-artifacts/3-1-analyst-chat-agent-thread-management.md] — **Backend foundation; `streamMessage` (auto-persist + auto-title), `listThreadMessages` (StreamQuery contract), `saveStreamDeltas: true`. "Optimistic Send Coordination" Option 1 = local pending state.**
- [Source: _bmad-output/implementation-artifacts/deferred-work.md#Deferred from: code review of 3-3] — lines 108-114 (N+1 fan-out, getThread session-expiry, project-id binding, truncation, invalid-id skeleton — all accepted/deferred)
- [Source: _bmad-output/project-context.md] — Critical rules (React 19 line 59, IDOR line 120, review gate line 105, Next.js 16 line 37, error logging line 102, no-comments line 51/93)
- [Source: src/app/(auth)/projects/[id]/chat/[threadId]/page.tsx:1-109] — **THE modification target (3.3 read-only view → 3.4 full chat)**
- [Source: src/components/chat/MessageBubble.tsx:1-55] — **Reusable message renderer (enhance for streaming-empty-text in Task 7)**
- [Source: src/app/(auth)/projects/[id]/chat/[threadId]/thread-view.test.tsx:1-180] — **THE test file to extend**
- [Source: src/app/(auth)/projects/[id]/chat/page.tsx:37-54] — "New Chat" handler pattern (async event handler, error strip, logError) — mirror for composer submit
- [Source: src/app/(auth)/projects/[id]/chat/chat.test.tsx:1-48] — **THE frontend test mock pattern reference (`vi.hoisted` for logError, useQuery/useMutation mocks)**
- [Source: src/components/ui/FormField.tsx:22] — `inputBase` class string for textarea styling
- [Source: src/app/(auth)/projects/[id]/generate-nl/page.tsx:112-131] — Composer-like textarea + submit button pattern reference
- [Source: convex/chat/chatActions.ts:54-172] — `streamMessage` action — **consumed via `useAction`; ownership check, RAG, streamText, auto-title all server-side**
- [Source: convex/chat/queries.ts:20-48] — `listThreadMessages` query — **already StreamQuery-ready (accepts `streamArgs`, returns `streams`)**
- [Source: convex/chat/queries.ts:104-119] — `getThread` query — **ownership gate + title source**
- [Source: convex/chat/internal.ts:7-19] — `verifyThreadOwnership` — **the B3 IDOR guard (inherited, not modified)**
- [Source: node_modules/@convex-dev/agent/dist/react/useUIMessages.d.ts:35-90] — `useUIMessages` hook — **`stream: true` option enables streaming-delta merge (line 88)**
- [Source: node_modules/@convex-dev/agent/dist/react/useStreamingUIMessages.d.ts:5-8] — "ONLY returns streaming UIMessages" — **why we use `useUIMessages` instead**
- [Source: node_modules/@convex-dev/agent/dist/UIMessages.d.ts:3] — `UIStatus = "streaming" | MessageStatus` — **typing-indicator detection**
- [Source: node_modules/@convex-dev/agent/dist/react/optimisticallySendMessage.d.ts:14-29] — **pairs with mutation `.withOptimisticUpdate` — NOT usable with actions (why we use local pending state)**
- [Source: src/lib/error-logger.ts] — `useErrorLogger` hook
- [Source: src/components/ui/index.ts] — Exported UI primitives (`Button`, `Alert`, `EmptyState`, `PageSkeleton`)

## Dev Agent Record

### Agent Model Used

opencode (zai-coding-plan/glm-5.2)

### Debug Log References

- Initial ChatComposer test "disables Send while the action is pending" asserted the button was *enabled* after resolve — but the implementation correctly keeps it disabled when the prompt is empty (cleared on submit). Reframed the test to assert the "Sending…" label transitions back to "Send" (sending state ended) — this is the actual `isSending` contract, decoupled from the textarea-empty disable rule.
- JSDOM does not implement `Element.prototype.scrollIntoView`. Added a defensive polyfill to `src/test/setup.ts` (guarded by `typeof` check so it's idempotent). This is a standard JSDOM workaround and benefits any future test that exercises scroll behavior.
- Story 3.4 spec Task 4 subtask text and Dev Notes contain a tension about *who renders the error Alert*: Task 4 subtask list says "parent owns error display", but Task 3 test requires "error Alert visible" when rendering `ChatComposer` alone, and AC9 says the composer displays the Alert. Resolved in favor of self-containment: `ChatComposer` renders its own internal `<Alert variant="error">` on rejection (via its `error` state) AND fires `onError(msg)` for the parent's optional awareness. The parent's `handleError` is currently a no-op (the composer's Alert suffices). This satisfies the AC9 wording ("displays an Alert above the composer") and keeps the unit test natural.

### Completion Notes List

- **AC1** ✓: `[threadId]/page.tsx` upgraded — `useUIMessages(..., { initialNumItems: 50, stream: true })`. Verified via `thread-view.test.tsx` "enables streaming via { stream: true } option in useUIMessages".
- **AC2** ✓: `ChatComposer.tsx` extracted — textarea (`inputBase` classes, placeholder, `aria-label`) + Send `<Button>`. Calls `useAction(api.chat.chatActions.streamMessage)`. Submit disabled when empty/sending. All state updates inside `handleSubmit` event handler.
- **AC3** ✓: Optimistic user message via local `pendingMessages` state. Composer fires `onPending(userMessage)` before the await; parent appends to rendered list. `onSent` clears the pending list (server has persisted + subscription is delivering).
- **AC4** ✓: Streaming delta display inherited from `useUIMessages(..., { stream: true })`. The hook merges paginated full messages with streaming deltas via `dedupeMessages`. `MessageBubble` renders the growing text part naturally (delta growth = text part growth). When a streaming message has no text deltas yet, `MessageBubble` now renders `<TypingIndicator />` inline instead of `[non-text content]` (Task 7 enhancement).
- **AC5** ✓: `TypingIndicator.tsx` — three staggered `animate-bounce` dots with `aria-label="Assistant is typing"` and `role="status"`. Rendered below the message list when `isStreaming === true` AND inside any streaming `MessageBubble` that has no text deltas yet.
- **AC6** ✓: Follow-up messages inherit conversation context — `streamMessage` action's `agent.continueThread` auto-loads recent history (3.1 AC6). Composer remains enabled after each exchange. No client-side history management.
- **AC7** ✓: Auto-scroll via `messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })` in a `useEffect` keyed on `[results.length, pendingMessages.length, isStreaming]`. Respects user scroll-up via `isNearBottomRef` (100px threshold) updated on the scroll container's `onScroll`.
- **AC8** ✓: `handleKeyDown` on textarea — `Enter && !shiftKey` → preventDefault + submit; `Shift+Enter` falls through to default newline insertion. Both Send button click and Enter key go through the same `handleSubmit`. Verified by dedicated keyboard tests in `ChatComposer.test.tsx`.
- **AC9** ✓: On `streamMessage` rejection — `ChatComposer` re-enables (`isSending=false` in `finally`), restores the prompt into the textarea (`setPrompt(saved)` in catch), displays `<Alert variant="error">` with `ConvexError` prefix stripped, and calls `logError` via `useErrorLogger`. Verified by dedicated rejection test.
- **AC10** ✓: All 3.3 states preserved (loading skeleton, not-found EmptyState, message-loading skeleton, empty-messages EmptyState — now WITH composer, populated messages, header with title + Back link). Composer renders ONLY when `thread` is non-null (owned). The empty-messages state now includes the composer (3.3 had none).
- **AC11** ✓: No new backend surface. Existing guards inherited: `getThread` returns `null` for cross-workspace → "Thread not found" page (no composer). `listThreadMessages` and `streamMessage` enforce ownership server-side. The `"skip"` gate prevents the query from firing before `getThread` resolves. Verified by the 3.3 regression tests (skipped when null, fetched when owned).
- **AC12** ✓: TDD followed throughout — every component has its test file written first. Coverage: `TypingIndicator.test.tsx` (4 tests), `ChatComposer.test.tsx` (10 tests), `MessageBubble.test.tsx` (7 tests + 1 MessageList test), extended `thread-view.test.tsx` (19 tests, including all 11 original 3.3 tests as regression + 8 new streaming/composer tests). All 332 frontend + 943 convex tests pass. Zero regressions.

### File List

New files:
- `src/components/chat/TypingIndicator.tsx` — pure presentational three-dot animated indicator (AC5)
- `src/components/chat/TypingIndicator.test.tsx` — component tests (AC12)
- `src/components/chat/ChatComposer.tsx` — textarea + Send button, optimistic send, Enter-to-send, error handling (AC2, AC3, AC8, AC9)
- `src/components/chat/ChatComposer.test.tsx` — component tests (AC12)
- `src/components/chat/MessageBubble.test.tsx` — component tests including streaming-empty-text branch (AC12; Task 7)

Modified files:
- `src/app/(auth)/projects/[id]/chat/[threadId]/page.tsx` — streaming upgrade (`stream: true`), composer integration, typing indicator, optimistic pending messages, auto-scroll with scroll-up respect (AC1, AC4, AC5, AC7, AC10)
- `src/app/(auth)/projects/[id]/chat/[threadId]/thread-view.test.tsx` — extended with 8 new streaming/composer tests; 11 original 3.3 tests preserved as regression (AC12)
- `src/components/chat/MessageBubble.tsx` — added `isStreaming?: boolean` prop; filters empty text parts; renders inline `TypingIndicator` when streaming with no text deltas yet (Task 7)
- `src/test/setup.ts` — JSDOM `scrollIntoView` polyfill (test infrastructure; documented in Debug Log)

Unchanged (per scope boundary — no backend files modified):
- `convex/chat/chatActions.ts`, `convex/chat/queries.ts`, `convex/chat/internal.ts` — all backend contracts inherited from Stories 3.1/3.2/3.3

### Build Verification Note

`pnpm build` fails on a **pre-existing** type error in `convex/chat/queries.ts:85` (`ctx.logger` does not exist on the query context type — a Convex API drift). Verified pre-existing at baseline `de7d094` via `git show de7d094:convex/chat/queries.ts`. This error is unrelated to Story 3.4 — no `convex/` file was modified. All Story 3.4 files typecheck cleanly (`npx tsc --noEmit` reports zero errors in any of the new/modified frontend files). The Task 8 spec explicitly anticipates pre-existing build failures from deferred-work line 106 (different file, same pattern).

### Review Findings

Three-layer adversarial review (Blind Hunter, Edge Case Hunter, Acceptance Auditor) run 2026-06-15 against the working-tree diff (baseline `de7d094`). 2 decision-needed, 14 patch, 2 defer, 4 dismissed.

#### Decision-needed (require human choice — spec-deviation or design ambiguity)

- [x] [Review][Decision] **Optimistic message duplicates during the entire streaming window** — `onSent` fires only when the `streamMessage` action resolves, but the action `await`s `thread.streamText(...)` (`convex/chat/chatActions.ts:113`), so it does NOT resolve until streaming completes. The subscription delivers the persisted user message almost immediately, so `allMessages = [...subscriptionMessages, ...pendingMessages]` (`page.tsx:121`) renders the user's message TWICE for the whole streaming duration (often 10–30s), with the duplicate parked below the assistant reply. Spec dev-notes (line 200) claimed the window is "<500ms" — empirically false; the spec's premise was wrong. Also subsumes "handleSent wipes entire pending array (multi-submit race)" — `page.tsx:79-81` clears all pending at once with no per-message correlation. Fix approach needs human choice (see options in review presentation).
- [x] [Review][Decision] **Failed send leaves a ghost optimistic message; resubmit stacks duplicates** — The catch block in `ChatComposer.handleSubmit` (`ChatComposer.tsx:67-78`) restores the prompt and fires `onError`, but has no removal path. The parent's `handlePending` (`page.tsx:75-77`) only appends. On rejection BEFORE persistence (e.g. `ConvexError("Thread not found")` from the ownership check), the subscription never delivers a counterpart, so the phantom message stays in the list indefinitely; retry appends a second. Couples to the pending-lifecycle redesign above.

#### Patch (clear fix, no ambiguity)

- [x] [Review][Patch] **Auto-scroll effect doesn't track streaming text growth** [`page.tsx:69-73`] — deps `[results.length, pendingMessages.length, isStreaming]` don't refire per token (the streaming message object grows in place; `results.length` is stable). Viewport won't follow the growing reply. AC7 PARTIAL per Acceptance Auditor. Add a dep that tracks the streaming message's current text (e.g. derive `streamingTextLen` from `results`).
- [x] [Review][Patch] **`pendingMessages` leaks across thread navigation** [`page.tsx:53`] — App Router reuses the page component instance; `useParams()` changes but `useState` does not reset. A pending message from thread A renders inside thread B if the user navigates mid-send. Add `useEffect(() => setPendingMessages([]), [params.threadId])` (and reset `isSending`-equivalent state in the composer via key or effect).
- [x] [Review][Patch] **Enter fires during IME composition (CJK input)** [`ChatComposer.tsx:81-86`] — `handleKeyDown` checks only `e.key === "Enter" && !e.shiftKey`. No `e.nativeEvent.isComposing` / `keyCode === 229` guard. Every Chinese/Japanese/Korean user's first Enter (to confirm a candidate) sends the message prematurely. Add the guard.
- [x] [Review][Patch] **Typing indicator missing during `isSending` window** [`page.tsx:59`] — Only `results.some(isStreamable)` triggers the indicator; `isSending` is local to `ChatComposer` and never lifted. Spec dev-notes line 218 explicitly requires "Show the indicator when `isStreaming || isSending`." AC5 PARTIAL per Acceptance Auditor. Lift `isSending` via `onSendingChange` callback or parent-owned state.
- [x] [Review][Patch] **Two typing indicators render simultaneously** [`page.tsx:142-146` + `MessageBubble.tsx:52-53`] — For a streaming assistant message with no text deltas yet, BOTH the inline bubble indicator AND the below-list indicator render (and `aria-live="polite"` announces twice). Make them mutually exclusive (e.g. suppress the below-list indicator when an inline one is showing).
- [x] [Review][Patch] **`"pending"`-status assistant messages render `[non-text content]`** [`page.tsx:29-31`] — `isStreamable` matches only `status === "streaming"`. Verified `MessageStatus = "pending" | "success" | "failed"` (`node_modules/@convex-dev/agent/dist/validators.d.ts:9`) and the library emits `"pending"` (`UIMessages.js:26`). A pending assistant bubble shows "[non-text content]" instead of dots. Extend `isStreamable` to include `"pending"` (or match any non-terminal status).
- [x] [Review][Patch] **Double-submit via rapid Enter (state, not ref)** [`ChatComposer.tsx:49,51,81-86`] — `canSubmit` reads `isSending` from a closure; two Enter presses in the same tick both see `isSending === false` and both call `streamMessage` (the textarea is never disabled; only the button is). Add a `useRef` guard that flips synchronously inside `handleSubmit`.
- [x] [Review][Patch] **List key embeds array index for pending messages** [`page.tsx:155`] — All pending messages share `order: Number.MAX_SAFE_INTEGER, stepOrder: 0`, so key uniqueness depends entirely on the trailing `-${i}` index. When pending clears and subscription messages arrive, React can reuse DOM nodes by index suffix, causing transient mis-rendering. Add a stable client-side `id` to `PendingMessage` and use it as the key.
- [x] [Review][Patch] **`void handleSubmit()` discards unhandled rejection from `onPending`** [`ChatComposer.tsx:84,109`] — `onPending(...)` runs outside the try/catch; if the parent's state update throws, the rejected promise is silently dropped by `void` with no `logError`. Add `.catch(logError)` (or move `onPending` inside the try).
- [x] [Review][Patch] **Stale error Alert persists while the user types** [`ChatComposer.tsx:46,101`] — `error` is only cleared inside `handleSubmit`. After a failed send the red Alert stays visible during editing until the next submit. Clear `error` in the textarea `onChange`.
- [x] [Review][Patch] **Comment at `page.tsx:84` violates the no-comments rule** [`page.tsx:84`] — project-context.md line 51/93 is unconditional ("No comments in code unless explicitly requested"). Delete the `// Composer renders its own Alert...` comment.
- [x] [Review][Patch] **`aria-hidden={false}` is a redundant literal** [`page.tsx:164`] — Explicit `aria-hidden={false}` is the default and reads as an unfinished edit. Remove the attribute.
- [x] [Review][Patch] **Test gap: optimistic-render test never verifies pending→cleared transition** [`thread-view.test.tsx:281-297`] — The test holds the mock unresolved, asserts the pending message appears, then resolves with no further assertions. The CRITICAL duplicate-window bug ships green. Add a test that simulates the subscription delivering the real user message while the action is still pending, and asserts no duplicate.
- [x] [Review][Patch] **Test gap: error-path test doesn't assert `onSent` skipped / no stack-on-retry** [`ChatComposer.test.tsx:152-170`] — Asserts the Alert + restored prompt + re-enable + `logError`, but not `expect(onSent).not.toHaveBeenCalled()`, and `onPending` has no parent state so the ghost-message bug is invisible. Add assertions + a retry scenario.

#### Defer (real, out of scope)

- [x] [Review][Defer] **No timeout/abort if `streamMessage` never resolves** [`ChatComposer.tsx:51-79`] — deferred, pre-existing (no AC for cancel/timeout; Convex `useAction` abort is non-trivial; out of story scope).
- [x] [Review][Defer] **`inputBase` class string duplicated, not imported** [`ChatComposer.tsx:25-26`] — deferred, future refactor to `export const inputBase` from `FormField.tsx` (currently a non-exported local; copying is pragmatic and uses identical classes).

#### Dismissed (4)

- `stripConvexError` surfaces arbitrary `Error.message` — matches the established codebase pattern (`chat/page.tsx:45`); not a regression.
- `handleError` parent no-op — intentional future-hook; the composer renders its own Alert (AC9 satisfied). Kept as-is.
- Tests assert `span.animate-bounce` class names — acceptable way to count the three dots; other tests cover aria/role behavior.
- `MessageBubble` hides non-text parts while streaming — spec only requires text-part rendering; non-text rendering is out of scope.

## Change Log

- 2026-06-15: Story 3.4 implementation complete — Chat UI with Streaming Display. Frontend-only story adding `ChatComposer`, `TypingIndicator`, `MessageBubble` enhancement, and the `[threadId]` page streaming upgrade. 332 frontend tests + 943 convex tests pass. Zero regressions. Story status: ready-for-dev → in-progress → review.
- 2026-06-15: Three-layer code review complete — 2 decision-needed, 14 patch, 2 defer, 4 dismissed. Findings written to `### Review Findings` above. Story remains `review` pending decision resolution.
- 2026-06-15: Both decision-needed items resolved (option 1 each — effect-free render-time dedup, `onRollback`+`pendingId` lifecycle). All 16 patches applied: CRITICAL duplicate-window fix (render-time dedup filters pending against delivered subscription messages), HIGH ghost-on-failure rollback, auto-scroll tracks streaming-text growth, pending reset on thread change, IME-composition guard, `isSending` typing indicator, mutually-exclusive indicators, `"pending"`-status rendering, double-submit `useRef` guard, `.catch` on submit, clear-error-on-type, comment/aria nit cleanup, plus dedup + error-path regression tests. Refactored dedup + thread-reset from effects to render-time filtering / during-render setState (React Compiler `set-state-in-effect` rule). All 333 frontend tests pass, lint 0 errors, TSC clean for story files. Story status: review → done.

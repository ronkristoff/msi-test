---
baseline_commit: 46aeb5f
---

# Story 3.3: Chat Thread List & Navigation

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a BA,
I want to see all my chat threads for a project and navigate between them,
so that I can resume previous conversations.

## Acceptance Criteria

1. **AC1 — Thread list page renders at `/projects/[id]/chat` with thread cards**: A new Next.js page `src/app/(auth)/projects/[id]/chat/page.tsx` renders a list of chat threads for the project. Each thread card displays: (a) the auto-generated title, (b) a last-message preview (truncated text snippet, max ~120 chars), (c) a relative timestamp via `formatRelativeTime(last_message_at ?? _creationTime)` from `src/lib/format.ts`. The page header shows "Chat" as the title with a "Back to Project" link (`<Link href={`/projects/${id}`}>`), mirroring the `knowledge/page.tsx` header pattern at `src/app/(auth)/projects/[id]/knowledge/page.tsx:126-144`. The page is wrapped by `AppLayout` automatically via `src/app/(auth)/layout.tsx` (the `PAGE_META["/projects"]` prefix match provides the title/subtitle).

2. **AC2 — `listThreads` query is extended to return `last_message_preview`**: The existing `listThreads` query in `convex/chat/queries.ts:44-69` is extended to return `last_message_preview: string | null` per thread. After fetching the up-to-50 threads from `chat_threads`, the query fetches the latest message per thread in parallel via `ctx.runQuery(components.agent.messages.listMessagesByThreadId, { threadId, order: "desc", paginationOpts: { numItems: 1, cursor: null, id: undefined } })` (component query exported at `node_modules/@convex-dev/agent/dist/component/messages.js`). The preview text is extracted from the returned `MessageDoc` (use the `text` field if populated; otherwise extract from `message.content` — see Dev Notes). Truncate to 120 chars with `…` ellipsis. If no messages exist for a thread (brand-new thread with no exchange yet), `last_message_preview` is `null`. The existing return fields (`thread_id`, `title`, `last_message_at`, `_creationTime`) are unchanged. The ownership guard (`getOptionalOwnedEntity` → returns `null` for cross-workspace) is unchanged.

3. **AC3 — Clicking a thread navigates to `/projects/[id]/chat/[threadId]`**: Each thread card is a `<Link href={`/projects/${id}/chat/${thread.thread_id}`}>`. Navigation works — the `[threadId]` route renders (AC4). The `thread_id` is the Agent Component's thread `_id` string (stored as `v.string()` in `chat_threads.thread_id`).

4. **AC4 — `[threadId]` page loads full message history (read-only, non-streaming)**: A new page `src/app/(auth)/projects/[id]/chat/[threadId]/page.tsx` loads the thread's message history using the `useUIMessages` hook from `@convex-dev/agent/react` (NOT `useStreamingUIMessages` — streaming display is Story 3.4). The hook consumes the existing `listThreadMessages` query (`convex/chat/queries.ts:14-42`): `const { results, status, loadMore } = useUIMessages(api.chat.queries.listThreadMessages, { threadId }, { initialNumItems: 50 })`. Messages render as a vertical list with role indicators (user vs assistant) and text content extracted from `message.parts` (filter `type === "text"`, render `.text`). The page header shows the thread title with a "Back to Chat" link (`<Link href={`/projects/${id}/chat`}>`). **This page is intentionally minimal (read-only history, no composer/input, no streaming).** Story 3.4 enhances it into a full ChatGPT-style chat interface with streaming display, typing indicator, and message composer. The message rendering component built here MUST be reusable — 3.4 wraps the same `useUIMessages` with `stream: true`.

5. **AC5 — "New Chat" button creates a thread and navigates to it**: The thread list page has a "New Chat" button (top-right of the header, mirroring the "Back to Project" button placement). Clicking it calls `useMutation(api.chat.mutations.createThread)` with `{ project_id }`, then `router.push(`/projects/${id}/chat/${result.threadId}`)` inside the mutation's `.then()` / `await` handler (NOT in render body — React 19 rule). The button shows a loading state while the mutation is pending. On error (e.g., workspace AI config missing → `ConvexError`), display an `Alert` with the friendly message and log via `logError`.

6. **AC6 — Empty state, loading skeleton, and error handling on the list page**: Three UI states on the thread list page:
   - **Loading** (`threads === undefined`): render `<PageSkeleton />` (from `@/components/ui/Skeleton`).
   - **Empty** (`threads` is an empty array, i.e., project has no threads yet): render `<EmptyState>` with a chat icon, title "No conversations yet", description "Start a new chat to ask questions about this project's codebase.", and the "New Chat" button as the action.
   - **Error** (query error / `threads === null` from cross-workspace): render `<EmptyState>` with title "Project not found" and a link to `/projects`. This mirrors `knowledge/page.tsx:95-113` (kb === null → "Not Analyzed" state).

7. **AC7 — `[threadId]` page handles loading, empty, and ownership states**: The thread view page handles:
   - **Loading** (`status === "LoadingFirstPage"`): `<PageSkeleton />` or a simple "Loading messages…" state.
   - **No messages** (`results.length === 0` after load): An `EmptyState` — "This conversation has no messages yet." (brand-new thread navigated to from "New Chat" button before 3.4's composer exists).
   - **Ownership error**: `listThreadMessages` throws `ConvexError("Thread not found")` for cross-workspace access. Catch this in an error boundary or error state — show "Thread not found" with a link back to the chat list. Use the `"skip"` pattern: `useUIMessages(api.chat.queries.listThreadMessages, threadId ? { threadId } : "skip", ...)` to avoid calling before threadId is resolved from params (the hook's `"skip"` arg is documented at `node_modules/@convex-dev/agent/dist/react/useUIMessages.d.ts:86`).

8. **AC8 — Cross-workspace isolation is inherited and verified (NFR-2, B3 IDOR guard)**: The existing `listThreads` query already enforces workspace ownership via `getOptionalOwnedEntity(ctx, project_id, "projects")` (`convex/lib/requireAuth.ts:92-104`) — returns `null` for cross-workspace. The existing `listThreadMessages` query throws `ConvexError("Thread not found")` via `verifyThreadOwnership` (`convex/chat/internal.ts:7-19`). **This story adds NO new guard** — it verifies the existing ones via tests (AC9). No public function accepts a bare `threadId` or `project_id` without ownership enforcement. The frontend never receives another workspace's thread data.

9. **AC9 — Tests (TDD, ≥80% coverage)**:
   - **Backend test** (`convex/chat.test.ts` — extend): `listThreads` returns threads WITH `last_message_preview` field (seed a thread + a component message, verify preview is non-null and truncated). `listThreads` returns `null` for cross-workspace project (existing test — verify the preview extension doesn't break it). `listThreads` returns `last_message_preview: null` for a thread with no messages. The preview is truncated to 120 chars for long messages. Requires agent component registration in `chatTest()` (already established in 3.1) AND component message seeding (use `agent.saveMessage` or `thread.streamText` with `mockModel` to create messages — see Dev Notes for test strategy).
   - **Frontend test — thread list** (`src/app/(auth)/projects/[id]/chat/chat.test.tsx` — new): Mock `convex/react` (`useQuery`, `useMutation`), `next/navigation` (`useParams`, `useRouter`), `@/lib/convex` (string API refs), `@/lib/error-logger`. Test states: (a) loading → skeleton, (b) empty threads → empty state with "New Chat" button, (c) populated list → thread cards with title/preview/timestamp, (d) click "New Chat" → `createThread` called + `router.push` called with new threadId, (e) click thread card → links to `/projects/{id}/chat/{threadId}`, (f) cross-workspace null → "Project not found" state. Follow the mock pattern at `knowledge/knowledge.test.tsx:1-52`.
   - **Frontend test — thread view** (`src/app/(auth)/projects/[id]/chat/[threadId]/thread-view.test.tsx` — new): Mock `@convex-dev/agent/react` (`useUIMessages` returns `{ results: [...], status: "Loaded", loadMore: vi.fn() }`). Test states: (a) messages render with role indicators and text, (b) empty messages → empty state, (c) "Back to Chat" link present.
   - All existing tests pass — zero regressions (`pnpm test:convex`, `pnpm test`).

## Tasks / Subtasks

- [x] Task 1: Extend `listThreads` query with `last_message_preview` (AC: #2, #8)
  - [x] In `convex/chat/queries.ts`, after the existing `threads` fetch (line 54-60), add a parallel `Promise.all` that calls `ctx.runQuery(components.agent.messages.listMessagesByThreadId, { threadId: t.thread_id as Id<"threads">, order: "desc", paginationOpts: { numItems: 1, cursor: null, id: undefined } })` per thread.
  - [x] Extract preview text: prefer the `text` field on the returned `MessageDoc`; if empty/absent, extract from `message.content` (string or first text part). Truncate to 120 chars with `…`.
  - [x] Map the extended return shape: add `last_message_preview: string | null` alongside the existing fields.
  - [x] Import `Id` from `../../_generated/dataModel` for the `threadId` cast (component thread IDs are `Id<"threads">` at the type level; our join stores them as `v.string()` — runtime-safe cast).
  - [x] Verify `components.agent.messages.listMessagesByThreadId` is the correct reference (check `convex/_generated/api.d.ts` for the `components.agent` table/function path).

- [x] Task 2: Write `listThreads` preview test FIRST (AC: #9) — TDD RED
  - [x] Extend `convex/chat.test.ts`. The `chatTest()` helper (from 3.1) already registers the agent component. Seed a thread via `seedChatThread`, then seed a component message via `agent.saveMessage(ctx, { threadId, message: { role: "user", content: "What does the auth module do?" } })` (or use `streamMessage` with `mockModel` to produce a real exchange, then verify the preview).
  - [x] Test: `listThreads` returns `{ thread_id, title, last_message_at, _creationTime, last_message_preview }` — verify `last_message_preview` is a non-null string containing the message text.
  - [x] Test: thread with no messages → `last_message_preview` is `null`.
  - [x] Test: long message → preview truncated to ≤121 chars (120 + `…`).
  - [x] Test: existing cross-workspace null test still passes (verify the preview extension doesn't break ownership).

- [x] Task 3: Implement preview extraction — TDD GREEN (AC: #2)
  - [x] Task 1 implementation passes Task 2 tests.

- [x] Task 4: Create thread list page `src/app/(auth)/projects/[id]/chat/page.tsx` (AC: #1, #5, #6)
  - [x] `"use client"` page component. `useParams<{ id: string }>()`, `projectId = asId(params.id, "projects")`.
  - [x] `const threads = useQuery(api.chat.queries.listThreads, { project_id: projectId })`.
  - [x] `const createThread = useMutation(api.chat.mutations.createThread)`.
  - [x] Loading: `threads === undefined` → `<PageSkeleton />`.
  - [x] Cross-workspace/not-found: `threads === null` → `<EmptyState>` "Project not found" with link to `/projects`.
  - [x] Empty: `threads?.length === 0` → `<EmptyState>` "No conversations yet" with "New Chat" action.
  - [x] Populated: thread cards as `<Link>` elements. Each card: title (bold), preview (muted, single-line truncate), timestamp (`formatRelativeTime`). Mirror the card styling from `KnowledgeModuleList.tsx` or `knowledge/page.tsx` patterns.
  - [x] "New Chat" button handler: `async () => { try { setIsCreating(true); const { threadId } = await createThread({ project_id: projectId }); router.push(`/projects/${params.id}/chat/${threadId}`); } catch (err) { ...logError + Alert... } finally { setIsCreating(false); } }`. Must be in an event handler (React 19 rule — no setState in render body).
  - [x] Header: "Chat" title + "Back to Project" link, mirroring `knowledge/page.tsx:126-144`.

- [x] Task 5: Write thread list page tests FIRST (AC: #9) — TDD
  - [x] Create `src/app/(auth)/projects/[id]/chat/chat.test.tsx`.
  - [x] Mock setup following `knowledge/knowledge.test.tsx:1-52` pattern (mock `convex/react`, `next/navigation`, `@/lib/convex`, `@/lib/error-logger`).
  - [x] Test loading state (useQuery returns `undefined`).
  - [x] Test empty state (useQuery returns `[]`).
  - [x] Test populated state (useQuery returns array of thread objects with title/preview/timestamp) — verify thread cards render and link to the correct href.
  - [x] Test "New Chat" button click → `createThread` mock called with `{ project_id }`, `router.push` called with `/projects/{id}/chat/{newThreadId}`.
  - [x] Test cross-workspace null state → "Project not found" renders.

- [x] Task 6: Create thread view page `src/app/(auth)/projects/[id]/chat/[threadId]/page.tsx` (AC: #4, #7)
  - [x] `"use client"` page. `useParams<{ id: string; threadId: string }>()`.
  - [x] `const { results, status, loadMore } = useUIMessages(api.chat.queries.listThreadMessages, { threadId: params.threadId }, { initialNumItems: 50 })`. NO `stream: true` (that's 3.4).
  - [x] Extract a `MessageBubble` component (same dir or `src/components/chat/`) that takes a `UIMessageLike` and renders role + text parts. Keep it reusable for 3.4.
  - [x] Loading: `status === "LoadingFirstPage"` → skeleton or "Loading messages…".
  - [x] Empty: `results.length === 0` → `<EmptyState>` "This conversation has no messages yet." (brand-new thread from "New Chat" before 3.4 composer).
  - [x] Error: wrap in error state for `ConvexError("Thread not found")` — show "Thread not found" + link to `/projects/${id}/chat`.
  - [x] Header: thread title (from a `getThread` query or inferred from messages — see Dev Notes) + "Back to Chat" link.
  - [x] Messages render oldest-first (reverse the `results` array if the hook returns newest-first).

- [x] Task 7: Write thread view page tests (AC: #9) — TDD
  - [x] Create `src/app/(auth)/projects/[id]/chat/[threadId]/thread-view.test.tsx`.
  - [x] Mock `@convex-dev/agent/react` → `useUIMessages` returns `{ results: [{ role: "user", parts: [{ type: "text", text: "Hello" }], order: 0, stepOrder: 0, status: "success" }], status: "Loaded", loadMore: vi.fn() }`.
  - [x] Test messages render with correct text and role indicators.
  - [x] Test empty state (results = []).
  - [x] Test "Back to Chat" link present.

- [x] Task 8: Validation (AC: #9)
  - [x] `pnpm lint` — zero new errors.
  - [x] `pnpm test:convex` — all backend tests pass (new + existing, zero regressions).
  - [x] `pnpm test` — all frontend tests pass (new + existing, zero regressions).
  - [x] `pnpm build` — Next.js build succeeds (pre-existing `bmadActions.ts`/`baselineActions.ts` type errors are documented in deferred-work line 106 and NOT caused by this story).

## Dev Notes

### Scope Boundary — Frontend-First Story with One Backend Extension

**This story implements:**
- Thread LIST page at `/projects/[id]/chat` (the primary deliverable)
- Minimal read-only thread VIEW page at `/projects/[id]/chat/[threadId]`
- "New Chat" creation flow (calls existing `createThread` mutation, navigates)
- `listThreads` backend extension: `last_message_preview` field (the ONE backend change)
- Frontend component tests (TDD)
- One backend test extension for the preview field

**This story does NOT implement:**
- Streaming token-by-token display, typing indicator, message composer, optimistic send (ALL Story 3.4). The `[threadId]` page is read-only message history only.
- `useStreamingUIMessages` — 3.3 uses `useUIMessages` (non-streaming). 3.4 swaps to `useStreamingUIMessages` + adds `stream: true`.
- Thread deletion, renaming, or archival (no AC for these).
- A message composer / input box on the `[threadId]` page (3.4 scope).
- The `getThread` query for individual thread metadata (the list page's `listThreads` is sufficient; the `[threadId]` page infers title from messages or a lightweight query — see "Thread Title on [threadId] Page" below).
- BMAD-aware features (Epic 4 scope).
- A separate `chat_messages` table (messages live in the Agent Component's `messages` table, accessed via `listThreadMessages`).

### CRITICAL: The Split Between 3.3 and 3.4

| Concern | Story 3.3 (this story) | Story 3.4 (next) |
|---------|----------------------|-------------------|
| Thread list page | ✅ Full implementation | — |
| `[threadId]` route exists | ✅ Minimal (read-only history) | Enhances with full chat UI |
| Message rendering | ✅ `MessageBubble` component (reusable) | Reuses 3.3's component |
| Message loading hook | `useUIMessages` (non-streaming) | Swaps to `useStreamingUIMessages` + `stream: true` |
| Message composer / input | ❌ Not built | ✅ Full implementation |
| Streaming token display | ❌ Not built | ✅ Token-by-token via subscription |
| Typing indicator | ❌ Not built | ✅ |
| Optimistic send | ❌ Not built | ✅ `optimisticallySendMessage` |
| "New Chat" button | ✅ | — |
| Thread navigation | ✅ | — |

**The `MessageBubble` component from 3.3 MUST be designed for reuse.** 3.4 will render the same message types (streaming + non-streaming messages merged by `useStreamingUIMessages`). Keep the component pure: takes a message-like object, renders role + text parts. Do NOT couple it to `useUIMessages` internals.

### CRITICAL: Extending `listThreads` — The One Backend Change

The existing `listThreads` (`convex/chat/queries.ts:44-69`) returns `{ thread_id, title, last_message_at, _creationTime }[]`. The AC requires a `last_message_preview`. This is a backend change in service of the frontend story — without it, the thread list cannot show previews without client-side N+1 queries (worse).

**Implementation approach** (verify against installed types during implementation):

```typescript
export const listThreads = query({
  args: { project_id: v.id("projects") },
  handler: async (ctx, args) => {
    const result = await getOptionalOwnedEntity(ctx, args.project_id, "projects");
    if (!result) return null;

    const threads = await ctx.db
      .query("chat_threads")
      .withIndex("by_project_id_and_last_message_at", (q) =>
        q.eq("project_id", args.project_id),
      )
      .order("desc")
      .take(50);

    // Fetch latest message preview per thread (parallelized, bounded to 50)
    const previews = await Promise.all(
      threads.map(async (t) => {
        try {
          const result = await ctx.runQuery(
            components.agent.messages.listMessagesByThreadId,
            {
              threadId: t.thread_id as Id<"threads">,
              order: "desc",
              paginationOpts: { numItems: 1, cursor: null, id: undefined },
            },
          );
          const lastMsg = result.page[0];
          if (!lastMsg) return null;
          return truncatePreview(extractMessageText(lastMsg));
        } catch {
          return null; // graceful: component query failure → no preview
        }
      }),
    );

    return threads.map((t, i) => ({
      thread_id: t.thread_id,
      title: t.title,
      last_message_at: t.last_message_at ?? null,
      _creationTime: t._creationTime,
      last_message_preview: previews[i],
    }));
  },
});
```

**Key details:**
- `components.agent.messages.listMessagesByThreadId` — verify the exact reference path in `convex/_generated/api.d.ts`. The component exports this query at `node_modules/@convex-dev/agent/dist/component/messages.js`.
- `t.thread_id as Id<"threads">` — our `chat_threads.thread_id` is `v.string()` (component IDs are strings), but the component query types it as `v.id("threads")`. Runtime-safe cast (the string IS a valid component thread ID).
- `extractMessageText(msg)` — the `MessageDoc` has a `text` field (the search-indexed text) AND a `message` field (AI SDK format: `{ role, content: string | ContentPart[] }`). Prefer `msg.text` if non-empty; otherwise extract from `msg.message.content` (if string, use directly; if array, find first `{ type: "text", text }` part). Create this as a pure helper function for unit testing.
- `truncatePreview(text)` — truncate to 120 chars. If longer, slice to 117 + `…`. Use `Array.from(text).slice(0, 117).join("") + "…"` for code-point safety (mirrors `sanitizeTitle` pattern from 3.1 review fix — `String.slice` can split surrogate pairs).
- The try/catch per thread ensures one component query failure doesn't break the entire list. If a thread's messages can't be fetched, its preview is `null` (graceful degradation).

**Performance note**: 50 parallel component queries per list load. Convex handles this within query limits. If performance is unacceptable, the fallback is title-only preview (the title IS derived from the first message). Document any deviation in the Completion Notes.

### CRITICAL: `useUIMessages` Hook — Non-Streaming Message History

The `[threadId]` page uses `useUIMessages` from `@convex-dev/agent/react` (NOT `useStreamingUIMessages`). This is the non-streaming variant that fetches full messages via `listThreadMessages`. Verified API at `node_modules/@convex-dev/agent/dist/react/useUIMessages.d.ts:86-90`:

```typescript
import { useUIMessages } from "@convex-dev/agent/react";

const { results, status, loadMore } = useUIMessages(
  api.chat.queries.listThreadMessages,
  { threadId: params.threadId },
  { initialNumItems: 50 },
  // NO stream: true — that's Story 3.4
);
```

- `results` is `UIMessageLike[]` — each has `{ role, parts, order, stepOrder, status }`.
- `parts` is an array of content parts (from AI SDK `UIMessage`). Filter `type === "text"`, render `.text`.
- `status` is `"LoadingFirstPage" | "CanLoadMore" | "LoadingMore" | "Loaded"`.
- The hook internally calls `usePaginatedQuery` + (if streaming) `useStreamingUIMessages`. Without `stream: true`, it's just paginated messages.

**Story 3.4 upgrade path**: add `stream: true` to the options + swap the import to `useStreamingUIMessages` if needed (or the hook handles it — verify during 3.4). The `results` shape stays the same; streaming messages are merged in.

### Thread Title on `[threadId]` Page

The `[threadId]` page needs a title for the header. Two options:
1. **Add a lightweight `getThread` query** to `convex/chat/queries.ts` that returns `{ title }` for a single thread (ownership-scoped via `verifyThreadOwnership`). Clean but adds a query.
2. **Infer from the list** — the user navigates from the list page which already has the title. Pass via `router.push` state or URL query param. Fragile (direct navigation / refresh loses the title).
3. **Add `getThread` query** (PREFERRED): `export const getThread = query({ args: { thread_id: v.string() }, handler: ... })` — `getMemberWorkspace` → `verifyThreadOwnership` → return `{ title, last_message_at }` or `null`. This is a small, clean addition that 3.4 also benefits from.

**Decision**: Add `getThread` query (option 3). It's a 10-line query that both 3.3 and 3.4 consume. Verify ownership via `verifyThreadOwnership` (B3 IDOR guard — same as `listThreadMessages`).

### Message Rendering — Extract Text from `UIMessageLike.parts`

The `useUIMessages` hook returns `UIMessageLike[]` with a `parts` array (AI SDK format). Render text:

```typescript
function MessageText({ parts }: { parts: UIMessageLike["parts"] }) {
  const textParts = parts.filter((p): p is { type: "text"; text: string } =>
    p.type === "text"
  );
  return (
    <div className="whitespace-pre-wrap">
      {textParts.map((p, i) => <span key={i}>{p.text}</span>)}
    </div>
  );
}
```

Handle the case where `parts` is empty or has no text parts (tool calls, images) — render a placeholder like `[non-text content]`. For 3.3, only text matters; 3.4 may add tool-call rendering.

### Frontend Testing — Mock Patterns

Follow the established pattern at `src/app/(auth)/projects/[id]/knowledge/knowledge.test.tsx:1-52`:

```typescript
vi.mock("convex/react", () => ({
  useQuery: vi.fn((_queryRef, args) => {
    const key = String(_queryRef);
    if (key.includes("listThreads")) return mockThreads;
    return undefined;
  }),
  useMutation: vi.fn((_mutationRef) => {
    const key = String(_mutationRef);
    if (key.includes("createThread")) return mockCreateThread;
    return vi.fn();
  }),
}));

vi.mock("next/navigation", () => ({
  useParams: vi.fn(() => ({ id: "proj1" })),
  useRouter: vi.fn(() => ({ push: mockRouterPush })),
  usePathname: vi.fn(() => "/projects/proj1/chat"),
}));

vi.mock("@/lib/convex", () => ({
  api: {
    chat: {
      queries: {
        listThreads: "chat.queries.listThreads",
        listThreadMessages: "chat.queries.listThreadMessages",
      },
      mutations: {
        createThread: "chat.mutations.createThread",
      },
    },
  },
  asId: (v: string) => v,
}));

vi.mock("@/lib/error-logger", () => ({
  useErrorLogger: () => ({ logError: vi.fn() }),
}));
```

**For the `[threadId]` page tests**, additionally mock `@convex-dev/agent/react`:

```typescript
vi.mock("@convex-dev/agent/react", () => ({
  useUIMessages: vi.fn(() => ({
    results: mockMessages,
    status: "Loaded",
    loadMore: vi.fn(),
  })),
}));
```

**`useErrorLogger` mock limitation** (deferred-work line 14): the current mock returns a fresh `vi.fn()` per call, so `logError` assertions don't work. Use `vi.hoisted` for a single reusable fn instance if you need to assert error logging. Test-quality only — no production bug.

### Backend Test Strategy — Seeding Component Messages

The `listThreads` preview test needs component messages to exist. Two approaches:

1. **Use `streamMessage` with `mockModel`** (established in 3.1/3.2): seed a thread via `seedChatThread`, call `streamMessage({ threadId, prompt: "test message" })` with the mocked model. This persists a real user + assistant message in the component's `messages` table. Then call `listThreads` and verify the preview.

2. **Direct component message insert**: if `streamMessage` is too heavy, use the component's `saveMessage` or `addMessages` mutation directly via `ctx.runMutation(components.agent.messages.addMessages, ...)`. Lighter weight but requires understanding the component's message format.

Prefer approach 1 (it's the established pattern from 3.1/3.2). The `chatTest()` helper already registers the agent component (`t.registerComponent("agent", agentSchema, agentModules)`).

### File Organization

New frontend files:
```
src/app/(auth)/projects/[id]/chat/
├── page.tsx                          # Thread list page (AC1, #5, #6)
├── chat.test.tsx                     # List page tests (AC9)
├── [threadId]/
│   ├── page.tsx                      # Thread view page (AC4, #7)
│   └── thread-view.test.tsx          # View page tests (AC9)
```

Optional shared component:
```
src/components/chat/
└── MessageBubble.tsx                 # Reusable message renderer (AC4, reused by 3.4)
```

Modified backend files:
- `convex/chat/queries.ts` — extend `listThreads` with preview (AC2); optionally add `getThread` query (AC4 title)

Modified test files:
- `convex/chat.test.ts` — add `listThreads` preview tests (AC9)

**No new directories under `convex/`** — the `convex/chat/` domain dir exists from 3.1. No schema changes (the `chat_threads` table from 3.1 is sufficient). No new dependencies.

### What NOT to Reinvent

| Concern | Reuse | Do NOT build |
|---------|-------|--------------|
| Thread list data | `listThreads` query (`convex/chat/queries.ts:44-69`) | A new `getThreads` query (extend the existing one) |
| Thread creation | `createThread` mutation (`convex/chat/mutations.ts:8-46`) | A new `startThread` mutation |
| Message history | `listThreadMessages` query + `useUIMessages` hook | A custom message fetcher or `usePaginatedQuery` directly |
| Thread ownership | `verifyThreadOwnership` (`convex/chat/internal.ts:7-19`) | A new ownership check |
| Timestamp formatting | `formatRelativeTime` (`src/lib/format.ts:35-42`) | A custom time-ago formatter |
| Empty/loading states | `EmptyState`, `PageSkeleton` (`@/components/ui/`) | Custom empty/loading components |
| Error handling | `Alert` (`@/components/ui/Alert`) + `useErrorLogger` | Custom error display |
| Page header pattern | `knowledge/page.tsx:126-144` header layout | A new header component |
| API refs in tests | `knowledge/knowledge.test.tsx:33-48` mock pattern | A different mock structure |

### Existing APIs to Reuse (no reinvention)

| API | Location | Purpose in this story |
|-----|----------|----------------------|
| `listThreads` | `convex/chat/queries.ts:44` | Thread list data (EXTEND with preview) |
| `createThread` | `convex/chat/mutations.ts:8` | New thread creation |
| `listThreadMessages` | `convex/chat/queries.ts:14` | Message history (consumed by `useUIMessages`) |
| `verifyThreadOwnership` | `convex/chat/internal.ts:7` | Ownership for `getThread` query |
| `getOptionalOwnedEntity` | `convex/lib/requireAuth.ts:92` | Project ownership in `listThreads` (existing) |
| `useUIMessages` | `@convex-dev/agent/react` | Non-streaming message history on `[threadId]` page |
| `formatRelativeTime` | `src/lib/format.ts:35` | "5m ago" timestamps on thread cards |
| `EmptyState` | `@/components/ui/EmptyState` | No-threads / not-found states |
| `PageSkeleton` | `@/components/ui/Skeleton` | Loading state |
| `Alert` | `@/components/ui/Alert` | Error display |
| `Button` | `@/components/ui/Button` | "New Chat" / "Back to Project" buttons |
| `useErrorLogger` | `src/lib/error-logger` | Catch-block error logging |
| `asId` | `@/lib/convex` | Convert route param to typed `Id<"projects">` |
| `components.agent.messages.listMessagesByThreadId` | `@convex-dev/agent` component | Fetch latest message per thread (preview) |

### Previous Story Intelligence

**Story 3.2 (RAG-Grounded Responses) — direct predecessor:**

1. **`chatTest()` helper with component registration** (`convex/chat.test.ts`): registers the agent component schema + modules so component queries (`listMessagesByThreadId`) work in tests. Reuse this helper unchanged — the preview test calls `listThreads` which internally calls `ctx.runQuery(components.agent.messages.listMessagesByThreadId)`.

2. **`vi.mock("./knowledge/rag", ...)` pattern** (3.2): the top-level module mock pattern for component-adjacent modules. For 3.3's frontend tests, follow the `knowledge/knowledge.test.tsx` pattern instead (mocking `convex/react` at the app level, not module internals).

3. **Code-point-safe truncation** (3.1 review fix): `sanitizeTitle` uses `Array.from(trimmed).slice(0, N).join("")` to avoid splitting surrogate pairs. Apply the same pattern to `truncatePreview`. Do NOT use `String.slice` directly.

4. **Review gate (project-context.md line 105)**: Every story's `done` transition requires (a) a `### Review Findings` section in this file with the 3-layer review outcome, AND (b) this file's `Status:` header matching `sprint-status.yaml`. Story 2.3 shipped `done` in sprint-status but `review` in its file — ENFORCED gate. When this story reaches `done`, both must agree.

**Story 3.1 (Analyst Chat Agent & Thread Management) — backend foundation:**

1. **`listThreads` ownership**: `getOptionalOwnedEntity(ctx, project_id, "projects")` returns `null` for cross-workspace (fail-quiet). This story preserves that — the preview extension runs AFTER the ownership check.

2. **`listThreadMessages` fail-closed**: throws `ConvexError("Thread not found")` on ownership mismatch (because `useUIMessages` pagination hook expects `PaginationResult`, not `null`). The `[threadId]` page must handle this error.

3. **`createThread` returns `{ threadId }`**: the "New Chat" flow calls this mutation and navigates to the returned threadId. The mutation already validates workspace AI config existence (3.1 review fix — throws `ConvexError` if `!workspace.ai_config`).

4. **Single `feat:` commit per story**: Follow the git convention (`46aeb5f feat: implement story 3.2 — ...`).

**Epic 2 retrospective — defects to avoid:**

| Epic 2 Defect | Mitigation in This Story |
|---------------|--------------------------|
| IDOR on `Id`-accepting actions (B3) | `listThreads` already guarded via `getOptionalOwnedEntity`. `getThread` (new) uses `verifyThreadOwnership`. No bare-ID lookup without ownership check. |
| Review documentation skipped (B1) | `### Review Findings` section + status header match is the ENFORCED done-gate. |
| Status-header hygiene | `Status: ready-for-dev` now; matches `sprint-status.yaml` at every transition. |
| `useErrorLogger` mock returns fresh fn per call (B5) | Use `vi.hoisted` for single-fn reuse if asserting `logError` calls. |

### Git Intelligence

Baseline: latest `main` = `46aeb5f` (Story 3.2 implementation). Relevant recent commits:
- `46aeb5f` — Story 3.2 (RAG-Grounded Responses) — **direct predecessor; `chatActions.ts`, `queries.ts` are the modification targets.**
- `347b6e5` — Story 3.1 (Analyst Chat Agent & Thread Management) — **backend foundation; `listThreads`, `createThread`, `listThreadMessages`, `verifyThreadOwnership` are the reuse targets.**
- `265cc6e` — Story 2.4 (Baseline RD & Drift Export) — **frontend export UI pattern reference (TDD discipline, review gate).**

No new schema tables. No new dependencies. The frontend route `src/app/(auth)/projects/[id]/chat/` is a new directory — Next.js App Router auto-discovers it. No `pnpm dev` restart needed for frontend route additions (only for new `convex/` directories, per project-context.md line 68).

### React 19 + Next.js 16 Rules (project-context.md)

- **`router.push()` in event handlers only**: the "New Chat" button handler calls `router.push` inside the `await createThread(...)` `.then()` block — NEVER in the render body. React 19 forbids calling setState on other components during render.
- **`"use client"` at top of every page**: all pages in this story are client components (they use Convex hooks). Already the pattern across all `projects/[id]/` pages.
- **Conditional queries via `"skip"`**: the `[threadId]` page uses `useUIMessages(api.chat.queries.listThreadMessages, threadId ? { threadId } : "skip", ...)` — matches the established pattern.
- **Next.js 16 breaking changes**: read `node_modules/next/dist/docs/` if unsure about App Router conventions. The `projects/[id]/chat/` nested route follows the existing `projects/[id]/knowledge/` pattern (no new conventions).

### Accessibility

- Thread cards as `<Link>` elements are keyboard-navigable and screen-reader-friendly.
- "New Chat" button uses `<Button>` (accessible by default).
- Message bubbles: use `role` attributes or aria-labels for user vs assistant messages (e.g., `aria-label={role === "user" ? "Your message" : "AI response"}`).
- Loading states: `<PageSkeleton />` is already accessible (ARIA live region optional).

### Deferred Work Relevant to This Story

Per retrospective action A8, review `_bmad-output/implementation-artifacts/deferred-work.md`:

- **`getOptionalMemberWorkspace` uses `.first()` for multi-workspace users** (deferred-work lines 48, 96, 99, 105): systemic pre-existing pattern. `listThreads` inherits this via `getOptionalOwnedEntity` → `getOptionalMemberWorkspace`. NOT in this story (cross-cutting fix needed). The frontend handles `null` (cross-workspace) gracefully — no crash.
- **`pnpm build` fails** (deferred-work line 106): pre-existing TypeScript errors in `convex/knowledge/bmadActions.ts`/`baselineActions.ts`. NOT caused by this story. Task 8 notes this.
- **`useErrorLogger` mock pattern** (deferred-work line 14, retro B5): test-quality gap. If this story's tests need to assert `logError` calls, use `vi.hoisted` for a single reusable fn. Otherwise, the existing mock pattern suffices.
- **Query errors show infinite loading skeleton** (deferred-work line 45): "useQuery error state never inspected — undefined (loading) and null (not found) handled, but query errors leave user stuck on skeleton." This is a codebase-wide pattern. For this story, the `[threadId]` page should handle the `ConvexError("Thread not found")` explicitly (don't rely on the skeleton for errors). The list page handles `null` (cross-workspace) but query errors (rare) would show skeleton indefinitely — acceptable for v1, matches existing pages.

### Project Structure Notes

- New frontend directory: `src/app/(auth)/projects/[id]/chat/` — follows the existing `knowledge/`, `baseline/`, `explore/` sibling pattern. No conflicts.
- New optional component directory: `src/components/chat/` — for shared `MessageBubble` component. Follows the existing `src/components/ui/` pattern for shared primitives. If the component is small, it can live in the `[threadId]/` dir instead.
- Backend: `convex/chat/queries.ts` modified (extend `listThreads`, optionally add `getThread`). No new backend files needed.
- Tests: `convex/chat.test.ts` extended (preview tests). New frontend tests alongside pages.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 3.3] — ACs and user story (lines 645-659)
- [Source: _bmad-output/planning-artifacts/epics.md#Epic 3] — Epic context (lines 597-599)
- [Source: _bmad-output/planning-artifacts/epics.md#FR-17] — Start chat thread, auto-generated title
- [Source: _bmad-output/planning-artifacts/epics.md#FR-18] — Send messages, AI responds with streaming (3.4 frontend)
- [Source: _bmad-output/planning-artifacts/epics.md#Story 3.4] — Chat UI with Streaming Display (successor story — defines the split)
- [Source: _bmad-output/implementation-artifacts/3-1-analyst-chat-agent-thread-management.md] — **Backend foundation; `listThreads`, `createThread`, `listThreadMessages`, `verifyThreadOwnership` are the reuse targets**
- [Source: _bmad-output/implementation-artifacts/3-2-rag-grounded-responses.md] — **Direct predecessor; `chatTest()` helper, code-point-safe truncation, review gate pattern**
- [Source: _bmad-output/implementation-artifacts/epic-2-retrospective.md] — B1 (review gate), B3 (IDOR guard), B5 (useErrorLogger mock) — lessons applied
- [Source: _bmad-output/implementation-artifacts/deferred-work.md#Deferred from: code review of 3-1] — line 105 (multi-workspace `.first()` pattern), line 106 (pre-existing build failure)
- [Source: _bmad-output/project-context.md] — Critical rules (React 19 line 59, forwardRef line 60, IDOR line 120, review gate line 105, Next.js 16 line 37)
- [Source: _bmad-output/implementation-artifacts/2-4-baseline-rd-drift-export.md] — Frontend TDD + review-gate pattern reference
- [Source: convex/chat/queries.ts:14-42] — `listThreadMessages` query — **consumed by `useUIMessages` on `[threadId]` page**
- [Source: convex/chat/queries.ts:44-69] — `listThreads` query — **THE extension target (add `last_message_preview`)**
- [Source: convex/chat/mutations.ts:8-46] — `createThread` mutation — **called by "New Chat" button**
- [Source: convex/chat/internal.ts:7-19] — `verifyThreadOwnership` — **reuse for `getThread` query**
- [Source: convex/lib/requireAuth.ts:92-104] — `getOptionalOwnedEntity` — **existing ownership guard on `listThreads`**
- [Source: src/app/(auth)/projects/[id]/knowledge/page.tsx:1-187] — **THE page pattern reference (header, loading/empty/error states, actions, styling)**
- [Source: src/app/(auth)/projects/[id]/knowledge/knowledge.test.tsx:1-52] — **THE frontend test mock pattern reference**
- [Source: src/app/(auth)/layout.tsx:13-20] — `PAGE_META` map (title/subtitle by pathname prefix)
- [Source: src/app/(auth)/layout.tsx:83-92] — `SIDEBARLESS_ROUTES` + `AppLayout` wrapping logic
- [Source: src/components/AppLayout.tsx:28-121] — `NAV_SECTIONS` (no per-project sub-nav; pages own their headers)
- [Source: src/components/ui/index.ts] — Exported UI primitives (`Button`, `EmptyState`, `PageSkeleton`, `Alert`, etc.)
- [Source: src/lib/format.ts:35-42] — `formatRelativeTime` — **thread card timestamps**
- [Source: src/lib/convex.ts] — `api`, `asId`, `Id` exports
- [Source: src/lib/error-logger.ts] — `useErrorLogger` hook
- [Source: node_modules/@convex-dev/agent/dist/react/useUIMessages.d.ts:86-90] — `useUIMessages` hook signature (non-streaming)
- [Source: node_modules/@convex-dev/agent/dist/react/useUIMessages.d.ts:15-25] — `UIMessagesQuery` contract (the query shape `listThreadMessages` already satisfies)
- [Source: node_modules/@convex-dev/agent/dist/react/useUIMessages.d.ts:8-14] — `UIMessageLike` shape (`{ order, stepOrder, status, parts, role }`)
- [Source: node_modules/@convex-dev/agent/dist/component/messages.js] — `listMessagesByThreadId` component query — **preview fetch**
- [Source: node_modules/@convex-dev/agent/dist/component/schema.d.ts:3919-3920] — messages table index `threadId_status_tool_order_stepOrder`
- [Source: convex/_generated/api.d.ts:151-155] — `chat/` module API path references

## Dev Agent Record

### Agent Model Used

glm-5.2 (zai-coding-plan/glm-5.2)

### Debug Log References

- **Build type error — `Id<"threads">` constraint violation**: Initial `asComponentThreadId` helper in `preview.ts` and the inline cast in `queries.ts` used `Id<"threads">` from the app's `_generated/dataModel`. The app's `Id<T>` type parameter constrains `T` to app `TableNames`, but `"threads"` is a component table — not in the app schema. Fix: removed the unused helper from `preview.ts`; in `queries.ts`, introduced `type ListMessagesArgs = FunctionArgs<typeof components.agent.messages.listMessagesByThreadId>` and cast `t.thread_id as ListMessagesArgs["threadId"]` to use the component's own branded type without referencing the app's `Id` type.
- **Empty state duplicate "New Chat" button**: First implementation rendered both the header "New Chat" button and the `EmptyState` action "New Chat" button simultaneously when `threads.length === 0`, causing a `getByRole` "multiple elements found" test failure. Fix: the header "New Chat" button is now conditionally rendered only when `threads.length > 0` — the empty state's action button is the sole CTA in that state.

### Completion Notes List

- **AC1 — Thread list page** (`src/app/(auth)/projects/[id]/chat/page.tsx`): renders thread cards with title, preview, and relative timestamp. Header has "Chat" title, "Back to Project" link, and "New Chat" button (populated state only). AppLayout wraps automatically via `PAGE_META["/projects"]` prefix match.
- **AC2 — `listThreads` preview extension** (`convex/chat/queries.ts`): `listThreads` now returns `last_message_preview: string | null` per thread, fetched in parallel (bounded to 50) via `components.agent.messages.listMessagesByThreadId`. Per-thread try/catch ensures graceful null on component query failure. Preview extracted via `extractMessageText` (prefers string content, falls back to first `{ type: "text" }` part) and truncated to 120 chars + `…` via code-point-safe `truncatePreview`.
- **AC3 — Thread navigation**: each thread card is a `<Link>` to `/projects/${id}/chat/${thread.thread_id}`.
- **AC4 — `[threadId]` page** (`src/app/(auth)/projects/[id]/chat/[threadId]/page.tsx`): loads message history via `useUIMessages` (non-streaming, `initialNumItems: 50`). Messages sorted oldest-first. Reusable `MessageBubble` component extracted to `src/components/chat/MessageBubble.tsx` for 3.4 reuse. Title from new `getThread` query.
- **AC5 — "New Chat" button**: calls `createThread` mutation then `router.push` inside the async event handler (React 19 compliant — no render-body setState). Loading state while pending; error shown via `Alert` + `logError`.
- **AC6 — List page states**: loading → `<PageSkeleton />`; empty → `<EmptyState>` "No conversations yet" with "New Chat" action; null (cross-workspace) → `<EmptyState>` "Project not found" with link to `/projects`.
- **AC7 — View page states**: loading → `<PageSkeleton />`; empty → `<EmptyState>` "This conversation has no messages yet."; null (ownership fail via `getThread` returning null) → `<EmptyState>` "Thread not found" with "Back to Chat" link.
- **AC8 — Cross-workspace isolation**: verified via existing `getOptionalOwnedEntity` on `listThreads` and `verifyThreadOwnership` on `getThread`/`listThreadMessages`. No new guard added — existing ones verified by new tests.
- **AC9 — Tests**: 12 helper unit tests (`convex/chat/preview.test.ts`), 4 new `listThreads` preview integration tests + 3 `getThread` tests (`convex/chat.test.ts`), 11 thread list page tests (`chat.test.tsx`), 8 thread view page tests (`thread-view.test.tsx`). All existing tests pass — zero regressions (937 backend + 301 frontend).
- **`getThread` query added** (`convex/chat/queries.ts`): per Dev Notes "option 3 (PREFERRED)" — ownership-scoped via `verifyThreadOwnership` (B3 IDOR guard). Returns `{ title, last_message_at }` or `null`.

### File List

**New files:**
- `convex/chat/preview.ts` — pure helpers: `extractMessageText`, `truncatePreview`
- `convex/chat/preview.test.ts` — 12 unit tests for preview helpers
- `src/app/(auth)/projects/[id]/chat/page.tsx` — thread list page
- `src/app/(auth)/projects/[id]/chat/chat.test.tsx` — 11 thread list page tests
- `src/app/(auth)/projects/[id]/chat/[threadId]/page.tsx` — thread view page
- `src/app/(auth)/projects/[id]/chat/[threadId]/thread-view.test.tsx` — 8 thread view page tests
- `src/components/chat/MessageBubble.tsx` — reusable message renderer + `MessageList` wrapper

**Modified files:**
- `convex/chat/queries.ts` — extended `listThreads` with `last_message_preview`; added `getThread` query
- `convex/chat.test.ts` — added 4 `listThreads` preview tests + 3 `getThread` tests; updated shape test to include `last_message_preview`
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — status updated (ready-for-dev → in-progress → review)
- `_bmad-output/implementation-artifacts/3-3-chat-thread-list-navigation.md` — status + Dev Agent Record + Change Log

## Change Log

- 2026-06-14: Story 3.3 implemented — thread list page, thread view page (read-only), `listThreads` preview extension, `getThread` query, reusable `MessageBubble`, "New Chat" flow. 38 new tests (12 helper + 7 backend + 11 list page + 8 view page), zero regressions. Pre-existing `baselineActions.ts` build error confirmed at baseline (deferred-work line 106).
- 2026-06-14: 3-layer code review (Blind Hunter + Edge Case Hunter + Acceptance Auditor) — 9 patches applied: `useUIMessages` `"skip"` gate; `extractMessageText` prefers `text` field + normalizes empty/whitespace to null; preview-fetch catch logs via `ctx.logger?.warn`; `excludeToolMessages: true` on preview fetch; long-message truncation integration test + content-asserting preview test; `MessageBubble` text-part separator + stable key; double-click "New Chat" guard (reset `isCreating` only on error); `thread-view` skip/error-path tests. 5 items deferred (N+1 fan-out, getThread auth-consistency, project-id binding, grapheme truncation, invalid-id skeleton — all pre-existing/accepted). Backend 943 passed (+7), frontend 303 passed (+2), lint 0 errors.

## Review Findings

_Code review run 2026-06-14 — 3-layer adversarial review (Blind Hunter + Edge Case Hunter + Acceptance Auditor). 0 decision-needed, 9 patch, 5 defer, 1 dismissed._

**Patches (actionable, unambiguous fixes):**

- [x] [Review][Patch] `useUIMessages` fires unconditionally — no `"skip"` pattern; `listThreadMessages` throws `ConvexError("Thread not found")` on every subscription tick for cross-workspace/invalid `threadId` (AC7 violation, project-context.md line 58) [`src/app/(auth)/projects/[id]/chat/[threadId]/page.tsx:28`] — fix: gate on `thread ? { threadId: params.threadId } : "skip"`. (Flagged by all 3 layers.)
- [x] [Review][Patch] `extractMessageText` ignores the top-level `text` field — spec AC2 / Dev Notes say "prefer `msg.text` if non-empty; otherwise extract from `message.content`". Implementation only reads `message.content`. Also: empty-string `content` returns `""` → renders a blank preview line instead of the "No messages yet" fallback (frontend `??` doesn't catch `""`) [`convex/chat/preview.ts:10`, `src/app/(auth)/projects/[id]/chat/page.tsx:147`] — fix: add `text` field fallback first; normalize empty/whitespace-only result to `null`.
- [x] [Review][Patch] Broad `catch { return null; }` swallows every preview-fetch error with no logging — masks regressions (e.g. args-shape change silently nulls all previews) [`convex/chat/queries.ts:83`] — fix: add `ctx.logger.warn(...)` in the catch; keeps graceful degradation, surfaces failures.
- [x] [Review][Patch] Backend integration test missing long-message truncation assertion (AC9 / Task 2: "Test: long message → preview truncated to ≤121 chars") [`convex/chat.test.ts`] — fix: add an integration test seeding a >120-char message, assert `last_message_preview.length <= 121` and `endsWith("…")`.
- [x] [Review][Patch] Backend "non-null preview" test asserts only `typeof === "string"`, not content — passes on `""`; spec Task 2 says "containing the message text" [`convex/chat.test.ts:276`] — fix: `expect(result[0].last_message_preview).toBe("Mocked assistant response")` (or `.toMatch(/.../)`).
- [x] [Review][Patch] `MessageBubble` renders multiple text parts as adjacent `<span>`s with no separator ("Helloworld") and uses `key={i}` anti-pattern [`src/components/chat/MessageBubble.tsx:38`] — fix: add a separator/whitespace between parts; use a stable key. Matters now since the component must be reusable for 3.4.
- [x] [Review][Patch] Rapid double-click on "New Chat" can create duplicate threads — `finally { setIsCreating(false) }` re-enables the button after `router.push` but before the page unmounts [`src/app/(auth)/projects/[id]/chat/page.tsx:54`] — fix: only reset `isCreating` in the `catch`, not `finally` (successful navigation unmounts the component).
- [x] [Review][Patch] `thread-view` test never covers the `listThreadMessages` error / `"skip"` path — the mock always returns success [`src/app/(auth)/projects/[id]/chat/[threadId]/thread-view.test.tsx`] — fix: add a test where `getThread` returns `null` and assert the page renders "Thread not found" without calling `listThreadMessages` (pairs with the first patch).
- [x] [Review][Patch] Latest tool-call/image-only message yields `extractMessageText → null` → list shows misleading "No messages yet" for a thread that has messages [`convex/chat/queries.ts:71`] — fix: pass `excludeToolMessages: true` to `listMessagesByThreadId`, or change the frontend fallback to a neutral label (null preview ≠ no messages).

**Deferred (real, not actionable for this story):**

- [x] [Review][Defer] N+1 component query fan-out in `listThreads` — up to 50 parallel `ctx.runQuery` calls per subscription evaluation [`convex/chat/queries.ts:68`] — deferred; spec Dev Notes explicitly acknowledge & accept this for v1. Future optimization: cache `last_message_preview` on the `chat_threads` row (written by `streamMessage`).
- [x] [Review][Defer] `getThread` throws `ConvexError("Not authenticated")` on session expiry while sibling `listThreads` returns `null` — inconsistent graceful-degradation UX [`convex/chat/queries.ts:102`] — deferred; matches sibling `listThreadMessages` (also throws). Session-expiry query-error UX is a codebase-wide deferred concern (deferred-work line 45).
- [x] [Review][Defer] `getThread` verifies workspace ownership but not that the thread belongs to the URL's `params.id` — `/projects/<wrong-project>/chat/<your-thread>` renders with a misleading "Back to Chat" link [`convex/chat/queries.ts:99`] — deferred; AC8 (workspace ownership / B3 IDOR guard) is satisfied. Project-id binding is defense-in-depth, out of spec scope.
- [x] [Review][Defer] `truncatePreview` splits base + combining-mark sequences — `Array.from` is code-point-safe, not grapheme-safe (e.g. `"e\u0301"` split at the boundary) [`convex/chat/preview.ts:19`] — deferred; mirrors the established `sanitizeTitle` pattern from 3.1. Grapheme segmentation (`Intl.Segmenter`) is a repo-wide truncation-utility enhancement, not story-specific.
- [x] [Review][Defer] Invalid `params.id` (not a valid Convex `Id<"projects">`) → `listThreads` validator rejects before handler → `useQuery` stays `undefined` → perpetual skeleton [`src/app/(auth)/projects/[id]/chat/page.tsx:27`] — deferred; pre-existing codebase-wide pattern across all `projects/[id]` pages (spec explicitly mirrors `knowledge/page.tsx`). Needs a repo-wide client-side ID-validation fix.

**Dismissed (1):** the `t.thread_id as ListMessagesArgs["threadId"]` cast — documented intentional decision in this story's Debug Log (necessary because `chat_threads.thread_id` is `v.string()` per the 3.1 schema).

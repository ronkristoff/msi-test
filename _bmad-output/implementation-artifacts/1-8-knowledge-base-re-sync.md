---
baseline_commit: 81ebcfa1a4ebb2115ecec5fee6714625f51b695b
---

# Story 1.8: Knowledge Base Re-Sync

Status: done

## Story

As a BA,
I want to trigger a re-sync of the Knowledge Base after code changes,
so that the system detects what changed and updates the structured knowledge.

## Acceptance Criteria

1. **AC1 — Re-sync action exists and is guarded**: A `resyncKnowledgeBase` action is added to `convex/knowledge/triggerIngestion.ts`. It takes `project_id: v.id("projects")`. It requires authentication via `requireAuth(ctx)` + workspace membership check (same pattern as `triggerIngestion`). It throws `ConvexError` if `kb_status !== "ready"` — re-sync is only allowed on a completed KB.

2. **AC2 — Old data is cleared before re-run**: Before starting the workflow, the action deletes all existing data for the current KB record:
   - Old `kb_modules` rows via `_deleteModulesByKb` (wiring this previously-deferred mutation)
   - Old `code_chunks` rows via `_deleteChunksByKb`
   - Old RAG vector embeddings via `clearRagNamespace` internal action (listing and deleting all entries in the project's namespace)

3. **AC3 — KB record is reset and reused**: A new `_resetKbForResync` internal mutation patches the existing KB record, clearing `architecture_summary`, `tech_stack`, `folder_structure`, `architecture_type`, `total_files`, `total_size_bytes`, `error_message`, and `progress_message`. The KB `_id` is preserved (same record, not a new one). Status is set to `building` with progress message "Starting re-sync...".

4. **AC4 — Workflow re-runs**: The ingestion workflow (`ingestionWorkflow`) is started against the same KB ID. The pipeline re-runs: read from GitHub, chunk, embed, extract. KB status transitions `ready` → `building` → `ready` (or `error`). On completion, `last_synced_at` is updated.

5. **AC5 — Extraction is idempotent on retry**: `extractArchitectureAndModules` in `convex/knowledge/extractionActions.ts` calls `_deleteModulesByKb` before `_storeModules`, preventing duplicate modules on workflow retry or re-sync.

6. **AC6 — Re-sync button in UI**: The KB viewer page (`KnowledgeReady.tsx` or the page header) shows a "Re-sync" button when `kb.status === "ready"`. Clicking it shows a confirmation dialog (re-sync replaces all KB data). After confirmation, `resyncKnowledgeBase` is called. Errors are logged via `logError` and shown to the user. After successful trigger, the Convex real-time subscription auto-transitions the page to the building state.

7. **AC7 — Button hidden during building/error states**: The "Re-sync" button is not rendered when `kb.status` is `building` or `error`. Error state already has a "Retry" button (existing behavior — retry calls `triggerIngestion`).

8. **AC8 — Query ordering fix (deferred from 1.4)**: `_getKnowledgeBaseForProject` in `internal.ts` and `_getProjectWorkspaceForSearch` in `queries.ts` are fixed to use `.order("desc").first()` instead of bare `.first()`, ensuring the latest KB record is returned when multiple exist.

9. **AC9 — Baseline RD archiving (forward-compatible no-op)**: The epic AC says "previous Baseline RD is archived (version incremented)". The `baseline_rds` table does not exist yet (Epic 2 backlog). The `resyncKnowledgeBase` action includes a code comment marking where RD archiving will hook in when Epic 2 adds the table. No functional code for this AC until the table exists.

10. **AC10 — Tests**: Backend tests for `_resetKbForResync`, `_deleteModulesByKb` (clears modules, returns count), `clearRagNamespace` registration, and the `resyncKnowledgeBase` guard logic (rejects non-ready status). Frontend tests for the re-sync button (visible when ready, hidden when building, confirmation flow, error handling). All tests use existing mock patterns and seed helpers.

## Tasks / Subtasks

- [x] Task 1: Add `_resetKbForResync` internal mutation (AC: #3)
  - [x] Takes `knowledge_base_id: v.id("knowledge_bases")`
  - [x] Patches KB record: clears architecture_summary, tech_stack, folder_structure, architecture_type, total_files, total_size_bytes, error_message, progress_message
  - [x] Does NOT clear workspace_id, project_id, _id, _creationTime, status, last_synced_at

- [x] Task 2: Add `clearRagNamespace` internal action to `convex/knowledge/embeddingActions.ts` (AC: #2)
  - [x] `"use node"` at top (file already has it)
  - [x] Takes `project_id: v.id("projects")`, `workspace_id: v.id("workspaces")`
  - [x] Fetches workspace AI config via `_getWorkspaceAiConfig`
  - [x] Creates RAG instance via `createProjectRag`
  - [x] Gets namespace via `rag.getNamespace(ctx, { namespace: getProjectNamespace(projectId) })`
  - [x] If namespace exists: lists entries paginated (100 at a time), deletes each via `rag.deleteAsync`
  - [x] Returns `{ deletedCount: number }`

- [x] Task 3: Wire `_deleteModulesByKb` into `extractArchitectureAndModules` (AC: #5)
  - [x] In `convex/knowledge/extractionActions.ts`, before `_storeModules` call, call `_deleteModulesByKb` with the current `knowledge_base_id`
  - [x] This makes extraction safe for workflow retries and re-sync

- [x] Task 4: Add `resyncKnowledgeBase` action to `convex/knowledge/triggerIngestion.ts` (AC: #1, #2, #3, #4, #9)
  - [x] Auth check: `requireAuth(ctx)` + `_getMembershipForUser` (same as `triggerIngestion`)
  - [x] Get project via `_getProjectForIngestion`
  - [x] Guard: throw if `project.kb_status !== "ready"`
  - [x] Get existing KB via `_getKnowledgeBaseForProject` (latest, now with desc ordering)
  - [x] Guard: throw if no KB found
  - [x] Delete modules: `ctx.runMutation(internal.knowledge.internal._deleteModulesByKb, { knowledge_base_id })`
  - [x] Delete chunks: `ctx.runMutation(internal.knowledge.internal._deleteChunksByKb, { knowledge_base_id })`
  - [x] Clear RAG namespace: `ctx.runAction(internal.knowledge.embeddingActions.clearRagNamespace, { project_id, workspace_id })`
  - [x] Reset KB: `ctx.runMutation(internal.knowledge.internal._resetKbForResync, { knowledge_base_id })`
  - [x] Set status to building: `ctx.runMutation(internal.knowledge.internal._updateKbStatus, { knowledge_base_id, project_id, status: "building", progress_message: "Starting re-sync..." })`
  - [x] // TODO(Epic 2): Archive previous Baseline RD (version increment) when baseline_rds table exists
  - [x] Start workflow: `start(ctx, internal.knowledge.ingestionWorkflow.ingestionWorkflow, { project_id, knowledge_base_id }, { onComplete, context })`
  - [x] Return `{ knowledgeBaseId, workflowId }`
  - [x] Wrap workflow start in try/catch — on failure set KB status to error

- [x] Task 5: Fix query ordering (AC: #8)
  - [x] In `convex/knowledge/internal.ts`: `_getKnowledgeBaseForProject` — add `.order("desc")` before `.first()`
  - [x] In `convex/knowledge/queries.ts`: `_getProjectWorkspaceForSearch` — already had `.order("desc")` (verified, no change needed)

- [x] Task 6: Add "Re-sync" button to KB viewer UI (AC: #6, #7)
  - [x] In `page.tsx`: add `useAction(api.knowledge.triggerIngestion.resyncKnowledgeBase)`
  - [x] Create `handleResync` handler with confirmation + error logging
  - [x] Pass `onResync` callback + `isResyncing` state to `KnowledgeReady`
  - [x] In `KnowledgeReady.tsx`: add "Re-sync" button in the header row (next to "Back to Project")
  - [x] Confirmation: use `window.confirm("Re-syncing will replace all current Knowledge Base data. Continue?")` or a simple modal
  - [x] Disable button while action is in flight
  - [x] Error: show Alert with message (strip ConvexError prefix), log via `logError`

- [x] Task 7: Write backend tests in `convex/knowledge.resync.test.ts` (AC: #10)
  - [x] Test `_resetKbForResync`: seeds a ready KB with architecture data, calls mutation, verifies fields cleared
  - [x] Test `_deleteModulesByKb`: seeds KB with modules, calls mutation, verifies all deleted, returns count (extend existing tests or reference pattern from `_deleteChunksByKb` tests)
  - [x] Test `resyncKnowledgeBase` registration: verify the action is exported
  - [x] Test `clearRagNamespace` registration: verify the internal action is exported
  - [x] Test `extractArchitectureAndModules` calls `_deleteModulesByKb` before `_storeModules`: verify function registration (full action can't run without external APIs)
  - [x] Test `_getKnowledgeBaseForProject` ordering: seed two KBs, verify latest is returned

- [x] Task 8: Write frontend tests for re-sync button (AC: #10)
  - [x] Extend existing `knowledge.test.tsx` or create `knowledge-resync.test.tsx`
  - [x] Test: "Re-sync" button visible when kb.status === "ready"
  - [x] Test: "Re-sync" button not rendered when kb.status === "building"
  - [x] Test: clicking button calls `window.confirm` and then the action mock
  - [x] Test: error from action shows error message
  - [x] Follow existing mock pattern from `knowledge.test.tsx`

- [x] Task 9: Run `pnpm lint`, `pnpm test`, `pnpm test:convex` — zero failures (AC: #10)

## Dev Notes

### Scope Boundary — What This Story Does and Does NOT Do

**This story implements:**
- `resyncKnowledgeBase` action (backend) — triggers re-analysis on a ready KB
- Data cleanup before re-sync: old modules, old chunks, old RAG embeddings
- `_resetKbForResync` internal mutation — clears KB architecture fields
- `clearRagNamespace` internal action — deletes all RAG entries in project namespace
- Wires `_deleteModulesByKb` into extraction (deferred from Story 1.5)
- Fixes `_getKnowledgeBaseForProject` and `_getProjectWorkspaceForSearch` query ordering (deferred from Story 1.4)
- "Re-sync" button in KB viewer UI with confirmation dialog
- Frontend + backend tests

**This story does NOT implement:**
- Baseline RD archiving (`baseline_rds` table doesn't exist yet — Epic 2 scope). Forward-compatible comment placeholder only.
- BMAD artifact detection/parsing (Story 1.9)
- Module-level change detection / diff comparison (Story 5.5 — drift-aware test regeneration)
- Scheduled auto-resync (out of scope — manual trigger only)
- Re-sync history/audit log
- Cancellation of an in-progress re-sync (existing `cancelIngestion` mutation works for this since it cancels any building workflow)

### Critical Architecture: Re-using the Same KB Record (Not Creating New One)

`triggerIngestion` creates a NEW `knowledge_bases` record each time. `resyncKnowledgeBase` does NOT — it re-uses the existing KB record. This is critical because:

1. **Module detail URLs stay valid**: `/projects/[id]/knowledge/modules/[moduleId]` references module `_id` which is tied to the KB `_id`. Creating a new KB would orphan all old module links.
2. **No orphaned KB records**: Multiple KB records per project would complicate queries and waste storage.
3. **Simpler data model**: One KB per project (current model). The `getKnowledgeBase` and `getIngestionProgress` queries already get `.order("desc").first()` so they'd work either way, but single-KB-per-project is cleaner.

The re-sync flow on the SAME KB record:
```
┌─────────────────────────────────────────────────────────────┐
│ resyncKnowledgeBase action                                  │
├─────────────────────────────────────────────────────────────┤
│ 1. Auth check + kb_status === "ready" guard                 │
│ 2. _deleteModulesByKb(kb_id)  ← delete old modules           │
│ 3. _deleteChunksByKb(kb_id)   ← delete old chunks            │
│ 4. clearRagNamespace(project) ← delete old embeddings        │
│ 5. _resetKbForResync(kb_id)   ← clear architecture fields    │
│ 6. _updateKbStatus(building)  ← project.kb_status = building │
│ 7. start(ingestionWorkflow)   ← re-run full pipeline         │
│    ↓                                                        │
│    Workflow: fetchTree → chunk → embed → extract            │
│    → status "ready" → last_synced_at updated                │
└─────────────────────────────────────────────────────────────┘
```

**Why the workflow doesn't need changes:** The existing `ingestionWorkflow` already:
- Calls `fetchAndChunkFiles` which calls `_deleteChunksByKb` at the start (double-delete is harmless)
- Calls `embedChunks` which adds entries to RAG (namespace is now empty after cleanup)
- Calls `extractArchitectureAndModules` which (after Task 3) calls `_deleteModulesByKb` before storing (double-delete is harmless)
- Sets status to "ready" and `last_synced_at` at the end

### Architecture: `resyncKnowledgeBase` Action

Add to `convex/knowledge/triggerIngestion.ts` (file already has `"use node"` and action imports):

```typescript
export const resyncKnowledgeBase = action({
  args: {
    project_id: v.id("projects"),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const userId = getOwnerId(user);

    const membership = await ctx.runQuery(
      internal.knowledge.internal._getMembershipForUser,
      { user_id: userId },
    );
    if (!membership) {
      throw new ConvexError("Not authenticated");
    }

    const project = await ctx.runQuery(
      internal.knowledge.internal._getProjectForIngestion,
      { project_id: args.project_id },
    );

    if (!project) {
      throw new ConvexError("Project not found");
    }

    if (project.kb_status !== "ready") {
      throw new ConvexError(
        "Knowledge Base must be in 'ready' state to re-sync.",
      );
    }

    const existingKb = await ctx.runQuery(
      internal.knowledge.internal._getKnowledgeBaseForProject,
      { project_id: args.project_id },
    );

    if (!existingKb) {
      throw new ConvexError("No Knowledge Base found to re-sync.");
    }

    // Clear old data
    await ctx.runMutation(internal.knowledge.internal._deleteModulesByKb, {
      knowledge_base_id: existingKb._id,
    });
    await ctx.runMutation(internal.knowledge.internal._deleteChunksByKb, {
      knowledge_base_id: existingKb._id,
    });
    await ctx.runAction(internal.knowledge.embeddingActions.clearRagNamespace, {
      project_id: args.project_id,
      workspace_id: project.workspace_id,
    });

    // Reset KB fields for fresh extraction
    await ctx.runMutation(internal.knowledge.internal._resetKbForResync, {
      knowledge_base_id: existingKb._id,
    });

    // TODO(Epic 2): Archive previous Baseline RD (version increment)
    // when baseline_rds table exists.

    // Set building status
    await ctx.runMutation(internal.knowledge.internal._updateKbStatus, {
      knowledge_base_id: existingKb._id,
      project_id: args.project_id,
      status: "building",
      progress_message: "Starting re-sync...",
    });

    // Start workflow against same KB ID
    let workflowId: string;
    try {
      workflowId = await start(
        ctx,
        internal.knowledge.ingestionWorkflow.ingestionWorkflow,
        {
          project_id: args.project_id,
          knowledge_base_id: existingKb._id,
        },
        {
          onComplete: internal.knowledge.internal._handleIngestionComplete,
          context: {
            knowledge_base_id: existingKb._id,
            project_id: args.project_id,
          },
        },
      );
    } catch (err) {
      await ctx.runMutation(internal.knowledge.internal._updateKbStatus, {
        knowledge_base_id: existingKb._id,
        project_id: args.project_id,
        status: "error",
        error_message: "Failed to start re-sync workflow",
      });
      throw err;
    }

    return { knowledgeBaseId: existingKb._id, workflowId };
  },
});
```

### Architecture: `_resetKbForResync` Internal Mutation

Add to `convex/knowledge/internal.ts`:

```typescript
export const _resetKbForResync = internalMutation({
  args: {
    knowledge_base_id: v.id("knowledge_bases"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.knowledge_base_id, {
      architecture_summary: undefined,
      tech_stack: undefined,
      folder_structure: undefined,
      architecture_type: undefined,
      total_files: undefined,
      total_size_bytes: undefined,
      error_message: undefined,
      progress_message: undefined,
    });
  },
});
```

**Note:** Convex `patch` with `undefined` removes the optional field. This is the correct way to clear optional fields in Convex.

### Architecture: `clearRagNamespace` Internal Action

Add to `convex/knowledge/embeddingActions.ts` (file already has `"use node"`):

```typescript
export const clearRagNamespace = internalAction({
  args: {
    project_id: v.id("projects"),
    workspace_id: v.id("workspaces"),
  },
  handler: async (ctx, args) => {
    const workspace = await ctx.runQuery(
      internal.knowledge.internal._getWorkspaceAiConfig,
      { workspace_id: args.workspace_id },
    );

    if (!workspace?.ai_config) {
      // No AI config — no embeddings could have been created. Safe no-op.
      return { deletedCount: 0 };
    }

    const rag = createProjectRag({
      endpoint_url: workspace.ai_config.endpoint_url,
      api_key: workspace.ai_config.api_key,
    });
    const namespace = getProjectNamespace(args.project_id);

    const ns = await rag.getNamespace(ctx, { namespace });
    if (!ns) {
      return { deletedCount: 0 };
    }

    let deletedCount = 0;
    let cursor: string | null = null;

    do {
      const result = await rag.list(ctx, {
        namespaceId: ns.namespaceId,
        paginationOpts: { cursor: cursor ?? undefined, numItems: 100 },
      });

      for (const entry of result.page) {
        await rag.deleteAsync(ctx, { entryId: entry._id });
        deletedCount++;
      }

      cursor = result.isDone ? null : result.continueCursor;
    } while (cursor);

    return { deletedCount };
  },
});
```

**Key RAG API details** (from `@convex-dev/rag` type definitions):
- `rag.getNamespace(ctx, { namespace })` → returns `{ namespaceId, status } | null`. Takes `CtxWith<"runQuery">`.
- `rag.list(ctx, { namespaceId, paginationOpts })` → returns `PaginationResult<Entry>`. Takes `CtxWith<"runQuery">`. Supports `{ cursor, numItems }` pagination.
- `rag.deleteAsync(ctx, { entryId })` → deletes entry + chunks asynchronously. Takes `CtxWith<"runMutation">`. Safe in action context.

**Why not `deleteByKey`?** Each chunk entry has key `getChunkKey(filePath, chunkIndex)`. We'd need to enumerate old chunk keys from code_chunks before deleting them. The list+delete approach is cleaner and catches orphaned entries that might exist from partial failures.

### Architecture: Wire `_deleteModulesByKb` into Extraction

In `convex/knowledge/extractionActions.ts`, before the `_storeModules` call (around line 147):

```typescript
// Delete old modules before storing new ones (idempotent on retry / re-sync)
await ctx.runMutation(
  internal.knowledge.internal._deleteModulesByKb,
  { knowledge_base_id: args.knowledge_base_id },
);

if (modules.length > 0) {
  await ctx.runMutation(
    internal.knowledge.internal._storeModules,
    { ... },
  );
}
```

This addresses the deferred issue: "Non-idempotent extraction on workflow retry — Spec explicitly defers _deleteModulesByKb wiring to Story 1.8."

### Architecture: Query Ordering Fix

In `convex/knowledge/internal.ts`, `_getKnowledgeBaseForProject`:
```typescript
// BEFORE (bug — returns oldest):
.first();

// AFTER (fix — returns latest):
.order("desc")
.first();
```

Same fix in `convex/knowledge/queries.ts`, `_getProjectWorkspaceForSearch`.

This addresses the deferred issue from Story 1.4: "If a project has multiple knowledge bases (from re-ingestion), .first() returns oldest by default."

### Architecture: Frontend — Re-sync Button

The re-sync button belongs in the KB page header area. Two implementation options:

**Option A (recommended): Button in page header, handler in page.tsx**

In `page.tsx`, add the action hook and handler (same pattern as `triggerIngestion`):
```typescript
const resync = useAction(api.knowledge.triggerIngestion.resyncKnowledgeBase);
const [isResyncing, setIsResyncing] = useState(false);

const handleResync = async () => {
  const confirmed = window.confirm(
    "Re-syncing will replace all current Knowledge Base data. Continue?"
  );
  if (!confirmed) return;

  setIsResyncing(true);
  try {
    await resync({ project_id: projectId });
  } catch (err) {
    const msg = err instanceof Error
      ? err.message.replace(/^Uncaught ConvexError:\s*/, "")
      : "Failed to start re-sync";
    logError(msg, {
      severity: "error",
      context: { source: "KnowledgePage.handleResync" },
    });
  } finally {
    setIsResyncing(false);
  }
};
```

Pass `onResync` and `isResyncing` as props to `KnowledgeReady`.

In `KnowledgeReady.tsx`, add a button in the stats row or after the module list:
```tsx
<button
  onClick={onResync}
  disabled={isResyncing}
  className="..."
>
  {isResyncing ? "Syncing..." : "Re-sync"}
</button>
```

**After successful trigger:** No manual navigation needed. The Convex subscription on `getKnowledgeBase` automatically fires when `kb_status` changes from "ready" to "building", and the page re-renders to show `KnowledgeBuilding` component.

**Confirmation dialog:** Use `window.confirm()` for simplicity. The project doesn't have a modal/dialog component in `src/components/ui/`. If one exists, use it instead. Do NOT add a new modal library.

### Existing Code to Modify

| File | Change | Breaking? |
|------|--------|-----------|
| `convex/knowledge/triggerIngestion.ts` | ADD `resyncKnowledgeBase` action | No — new export |
| `convex/knowledge/internal.ts` | ADD `_resetKbForResync`; FIX `_getKnowledgeBaseForProject` ordering | No — additive + bug fix |
| `convex/knowledge/extractionActions.ts` | ADD `_deleteModulesByKb` call before `_storeModules` | No — idempotent improvement |
| `convex/knowledge/embeddingActions.ts` | ADD `clearRagNamespace` internal action | No — new export |
| `convex/knowledge/queries.ts` | FIX `_getProjectWorkspaceForSearch` ordering | No — bug fix |
| `src/app/(auth)/projects/[id]/knowledge/page.tsx` | ADD resync action hook, handler, pass to KnowledgeReady | No — additive |
| `src/app/(auth)/projects/[id]/knowledge/KnowledgeReady.tsx` | ADD re-sync button + props | No — additive |

### New Files to Create

| File | Purpose |
|------|---------|
| `convex/knowledge.resync.test.ts` | Backend tests for `_resetKbForResync`, `_deleteModulesByKb`, resync guards, registration |
| `src/app/(auth)/projects/[id]/knowledge/knowledge-resync.test.tsx` | Frontend tests for re-sync button (if extending existing `knowledge.test.tsx`, no new file needed) |

### Key Dependencies

- No new npm packages needed
- `@convex-dev/rag` — already installed; RAG `list`, `getNamespace`, `deleteAsync` methods already available
- `@convex-dev/workflow` — already installed; `start` already imported in `triggerIngestion.ts`
- All Convex hooks, UI components, testing libraries already installed

### Existing Code Patterns to Follow

**Action pattern** (from `triggerIngestion.ts`):
```typescript
"use node";
import { action } from "../_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { internal } from "../_generated/api";
import { start } from "@convex-dev/workflow";
import { requireAuth, getOwnerId } from "../lib/requireAuth";
```

**Internal mutation pattern** (from `internal.ts`):
```typescript
export const _resetKbForResync = internalMutation({
  args: { knowledge_base_id: v.id("knowledge_bases") },
  handler: async (ctx, args) => { ... },
});
```

**Batch delete pattern** (from `_deleteChunksByKb` and `_deleteModulesByKb`):
```typescript
let deletedCount = 0;
const BATCH_SIZE = 100;
let hasMore = true;
while (hasMore) {
  const items = await ctx.db.query("table")
    .withIndex("by_kb_id", (q) => q.eq("knowledge_base_id", args.knowledge_base_id))
    .take(BATCH_SIZE);
  if (items.length === 0) { hasMore = false; break; }
  for (const item of items) { await ctx.db.delete(item._id); deletedCount++; }
  if (items.length < BATCH_SIZE) { hasMore = false; }
}
return deletedCount;
```

**Frontend action call pattern** (from `page.tsx`):
```typescript
const triggerIngestion = useAction(api.knowledge.triggerIngestion.triggerIngestion);
const handleRetry = async () => {
  try {
    await triggerIngestion({ project_id: projectId });
  } catch (err) {
    const msg = err instanceof Error
      ? err.message.replace(/^Uncaught ConvexError:\s*/, "")
      : "Failed to retry analysis";
    logError(msg, { severity: "error", context: { source: "KnowledgePage.handleRetry" } });
    throw err;
  }
};
```

**Test mock pattern** (from `knowledge.test.tsx`):
```typescript
vi.mock("convex/react", () => ({
  useQuery: vi.fn((_queryRef: unknown) => {
    const key = String(_queryRef);
    if (key.includes("getKnowledgeBase")) return mockKb;
    if (key.includes("getModules")) return mockModules;
    return undefined;
  }),
  useAction: vi.fn(() => vi.fn()),
}));
```

### Previous Story Intelligence (Story 1.7)

**Key learnings from Story 1.7:**
1. **Auth pattern:** `getOptionalMemberWorkspace` used for queries receiving entity IDs directly. Actions use `requireAuth` + `_getMembershipForUser` (from `triggerIngestion.ts`).
2. **Array guard before iteration:** Always use `Array.isArray(field)` guards.
3. **Accessibility:** Apply `aria-hidden` on decorative SVGs.
4. **Duplicate React keys:** Use `key={`${item.name}-${idx}`}` for dynamic lists.
5. **Test file location:** Frontend tests co-located with source. Backend tests at `convex/` root.
6. **ConvexError message scraping:** Both page and error components strip `^Uncaught ConvexError:\s*` prefix. Follow this pattern for resync errors.

**What Story 1.7 established that this story builds on:**
- Module detail page links work via `module._id` — re-sync must preserve the KB `_id` (hence re-use, not create new)
- `getKnowledgeBase` query already returns the full KB document including `last_synced_at`
- `KnowledgeReady.tsx` already displays "Last Synced" stat card from `kb.last_synced_at`
- `KnowledgeError.tsx` has a "Retry" button pattern that calls `triggerIngestion` — the re-sync button parallels this

### Git Intelligence

Recent commits:
- `81ebcfa` — Story 1.7 — module detail view with code review fixes
- `ad67e42` — Stories 1.5 & 1.6 — AI architecture extraction + KB viewer UI
- `a26975a` — Story 1.4 — vector embeddings & RAG storage
- `b56819b` — Stories 1.2 & 1.3 — KB ingestion pipeline
- Pattern: each story (or pair) is a single `feat:` commit

### Deferred Work Addressed by This Story

This story resolves deferred issues from prior story code reviews (see `_bmad-output/implementation-artifacts/deferred-work.md`):

1. **Stale embeddings after re-ingestion** [from 1.4 review] — RAG namespace cleanup via `clearRagNamespace`. Story 1.8 "owns namespace lifecycle."
2. **Non-idempotent extraction on workflow retry** [from 1.5 review] — Wire `_deleteModulesByKb` before `_storeModules`.
3. **`_deleteModulesByKb` unbounded loop** [from 1.5 review] — Mutation now wired and exercised. `EXTRACTION_MAX_MODULES=50` caps practical count.
4. **`_getKnowledgeBaseForProject` uses `.first()` without ordering** [from 1.4 review] — Fixed to `.order("desc").first()`.
5. **`_getProjectWorkspaceForSearch` uses `.first()` without ordering** [from 1.4 review] — Same fix.

### Project Structure Notes

- All backend changes are in existing files under `convex/knowledge/` — no new directories
- New backend test file at `convex/knowledge.resync.test.ts` (at `convex/` root per convention)
- Frontend changes in existing `knowledge/` route directory — no new files needed (extend existing test file)
- No schema changes needed — all tables and fields already exist from Stories C1.1 + 1.5

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.8] — ACs and user story
- [Source: convex/knowledge/triggerIngestion.ts] — existing `triggerIngestion` action pattern to follow for `resyncKnowledgeBase`
- [Source: convex/knowledge/ingestionWorkflow.ts] — workflow definition (no changes needed, re-used as-is)
- [Source: convex/knowledge/internal.ts#_deleteModulesByKb] — existing batch delete mutation (wired in this story)
- [Source: convex/knowledge/internal.ts#_deleteChunksByKb] — existing batch delete mutation
- [Source: convex/knowledge/internal.ts#_getKnowledgeBaseForProject] — query to fix ordering
- [Source: convex/knowledge/internal.ts#_updateKbStatus] — status update mutation
- [Source: convex/knowledge/internal.ts#_handleIngestionComplete] — workflow onComplete handler
- [Source: convex/knowledge/extractionActions.ts#L146-155] — where to wire `_deleteModulesByKb`
- [Source: convex/knowledge/embeddingActions.ts] — where to add `clearRagNamespace`
- [Source: convex/knowledge/rag.ts#createProjectRag] — RAG instance factory
- [Source: convex/knowledge/rag.ts#getProjectNamespace] — namespace string helper
- [Source: convex/knowledge/queries.ts#_getProjectWorkspaceForSearch] — query to fix ordering
- [Source: convex/schema.ts#knowledge_bases] — KB table schema (all fields already exist)
- [Source: src/app/(auth)/projects/[id]/knowledge/page.tsx] — KB page with triggerIngestion pattern
- [Source: src/app/(auth)/projects/[id]/knowledge/KnowledgeReady.tsx] — where to add re-sync button
- [Source: src/app/(auth)/projects/[id]/knowledge/KnowledgeError.tsx] — retry button pattern reference
- [Source: node_modules/@convex-dev/rag/dist/client/index.d.ts] — RAG API: list, getNamespace, deleteAsync methods
- [Source: _bmad-output/implementation-artifacts/deferred-work.md] — deferred issues resolved by this story
- [Source: _bmad-output/implementation-artifacts/1-7-module-detail-view.md] — previous story learnings
- [Source: _bmad-output/project-context.md] — critical implementation rules

## Dev Agent Record

### Agent Model Used

zai-coding-plan/glm-5.1 (glm-5.1)

### Debug Log References

No debug issues encountered. All implementations followed TDD red-green-refactor cycle cleanly.

### Completion Notes List

- **Task 1 (`_resetKbForResync`)**: Added internal mutation to `convex/knowledge/internal.ts`. Clears all 8 architecture fields via `patch` with `undefined` while preserving `_id`, `workspace_id`, `project_id`, `status`, `last_synced_at`. 2 tests covering field clearing + error/progress clearing.

- **Task 5 (Query ordering fix)**: Fixed `_getKnowledgeBaseForProject` in `internal.ts` — added `.order("desc")` before `.first()` to return latest KB record. Verified `_getProjectWorkspaceForSearch` in `queries.ts` already had `.order("desc")` (no change needed). 1 test seeding two KBs, verifying latest returned.

- **Task 3 (`_deleteModulesByKb` wiring)**: Added `_deleteModulesByKb` call before `_storeModules` in `convex/knowledge/extractionActions.ts`. Makes extraction idempotent on workflow retry/re-sync. Registration test verifies function export.

- **Task 2 (`clearRagNamespace`)**: Added internal action to `convex/knowledge/embeddingActions.ts`. Fetches workspace AI config, creates RAG instance, lists entries paginated (100/page), deletes each via `deleteAsync`. Returns `{ deletedCount }`. No-ops safely when no AI config or no namespace. Registration test verifies export. Note: used `entry.entryId` (not `entry._id`) per `@convex-dev/rag` type definitions.

- **Task 4 (`resyncKnowledgeBase`)**: Added action to `convex/knowledge/triggerIngestion.ts`. Full re-sync flow: auth check → kb_status guard → delete modules/chunks/embeddings → reset KB fields → set building → start workflow. Same KB record reused (not new). Try/catch on workflow start sets error status on failure. TODO comment for Epic 2 RD archiving. Registration test verifies export.

- **Tasks 7-8 (Tests)**: Backend: 8 new tests in `convex/knowledge.resync.test.ts` (645 convex tests total pass). Frontend: 6 new tests in existing `knowledge.test.tsx` covering button visibility, confirm flow, cancel, error alert (180 frontend tests total pass).

- **Task 9 (Validation)**: `pnpm lint` — 0 errors (43 pre-existing warnings, none from this story). `pnpm test` — 180/180 pass. `pnpm test:convex` — 645/645 pass. 2 pre-existing runner test failures are unrelated (Playwright integration + autonomous explorer instruction).

### File List

**Modified:**
- `convex/knowledge/internal.ts` — Added `_resetKbForResync` internal mutation; fixed `_getKnowledgeBaseForProject` query ordering (`.order("desc")`)
- `convex/knowledge/extractionActions.ts` — Wired `_deleteModulesByKb` before `_storeModules` for idempotent extraction
- `convex/knowledge/embeddingActions.ts` — Added `clearRagNamespace` internal action
- `convex/knowledge/triggerIngestion.ts` — Added `resyncKnowledgeBase` action
- `src/app/(auth)/projects/[id]/knowledge/page.tsx` — Added resync action hook, `handleResync` handler with confirm + error logging, `isResyncing`/`resyncError` state, Alert for errors, props passed to KnowledgeReady
- `src/app/(auth)/projects/[id]/knowledge/KnowledgeReady.tsx` — Added `onResync`/`isResyncing` props, "Re-sync" button with spinner state
- `src/app/(auth)/projects/[id]/knowledge/knowledge.test.tsx` — Updated `useAction` mock for dual-action routing, added 6 re-sync tests

**New:**
- `convex/knowledge.resync.test.ts` — Backend tests for `_resetKbForResync`, `_deleteModulesByKb`, `_deleteChunksByKb`, query ordering, function registrations (8 tests)

## Change Log

- 2026-06-14: Implemented Story 1.8 — Knowledge Base re-sync. Added `resyncKnowledgeBase` action with full data cleanup (modules, chunks, RAG embeddings), `_resetKbForResync` mutation, `clearRagNamespace` action. Wired `_deleteModulesByKb` into extraction for idempotency. Fixed `_getKnowledgeBaseForProject` query ordering bug. Added Re-sync button to KB viewer with confirmation dialog and error handling. 14 new tests (8 backend + 6 frontend).

### Review Findings

- [x] [Review][Patch] Non-atomic destructive cleanup: KB status set to "building" AFTER data deletion — if any cleanup step fails (lines 129-142), KB remains "ready" with empty data and no recovery path. Move `_updateKbStatus("building")` before the destructive cleanup steps. [convex/knowledge/triggerIngestion.ts:129-152]
- [x] [Review][Patch] Missing repo connectivity pre-check before destructive cleanup — `triggerIngestion` checks `!project.repo_url || !project.encrypted_pat` at line 35; `resyncKnowledgeBase` omits this check, so data is destroyed before the workflow discovers the repo is inaccessible (expired PAT, deleted repo). Add the same guard before line 129. [convex/knowledge/triggerIngestion.ts:113-128]
- [x] [Review][Patch] `clearRagNamespace` has no try/catch around `rag.deleteAsync` — if an entry is deleted by a background process between `list` and `deleteAsync`, the call throws and aborts the entire re-sync with data already destroyed. Wrap in try/catch and continue. [convex/knowledge/embeddingActions.ts:196-199]
- [x] [Review][Patch] Extraction deletes all modules before checking if AI returned new ones — `_deleteModulesByKb` runs unconditionally at line 146, but `_storeModules` is guarded by `if (modules.length > 0)`. If AI returns empty modules (degraded response), old modules are permanently lost. Move `_deleteModulesByKb` inside the `if` block. [convex/knowledge/extractionActions.ts:146-160]
- [x] [Review][Patch] Missing `resyncKnowledgeBase` guard logic test — AC10 requires a test verifying the action rejects non-ready status. Only a registration test exists. [convex/knowledge.resync.test.ts:208-212]
- [x] [Review][Defer] TOCTOU race allows concurrent resyncs — `kb_status !== "ready"` check and `_updateKbStatus("building")` are separated by 6 operations, allowing duplicate workflows. Same pattern as `triggerIngestion`; architectural limitation of Convex actions. [convex/knowledge/triggerIngestion.ts:114-147] — deferred, pre-existing pattern
- [x] [Review][Defer] `deleteAsync` is fire-and-forget — old RAG entries persist briefly during resync until background workpool catches up. Search may return stale results in the window. RAG component design limitation. [convex/knowledge/embeddingActions.ts] — deferred, component limitation
- [x] [Review][Defer] `clearRagNamespace` only clears "ready" status entries — RAG `list` defaults to `status: "ready"`, missing "pending" and "replaced" entries from interrupted ingests. Requires RAG API investigation to iterate all statuses. [convex/knowledge/embeddingActions.ts:192] — deferred, requires API investigation
- [x] [Review][Defer] KB status stuck at "building" on workflow engine failure — if workflow `onComplete` never fires (deployment push, crash), KB is permanently locked. Pre-existing workflow pattern issue affecting all ingestion. [convex/knowledge/triggerIngestion.ts] — deferred, pre-existing
- [x] [Review][Defer] Auth pattern: `_getProjectForIngestion` not scoped to user's workspace — `_getMembershipForUser` checks any membership, `_getProjectForIngestion` fetches by ID without workspace linkage. Pre-existing pattern shared with `triggerIngestion`. [convex/knowledge/internal.ts:186-201] — deferred, pre-existing pattern
- [x] [Review][Defer] Sequential deletion in `clearRagNamespace` is O(n) round-trips — each `rag.deleteAsync` is awaited one at a time. Large namespaces could approach action time limits. Optimization opportunity only. [convex/knowledge/embeddingActions.ts:195-200] — deferred, optimization
- [x] [Review][Defer] `_updateKbStatus` silently clears optional fields when args omitted — Convex `patch` with `undefined` removes fields. Pre-existing API behavior, not a current bug but a landmine for future callers. [convex/knowledge/internal.ts] — deferred, pre-existing
- [x] [Review][Defer] `clearRagNamespace` pagination loop has no max iteration guard — extremely large namespaces could exceed Convex action wall-clock limit. Defensive coding concern only. [convex/knowledge/embeddingActions.ts:191-203] — deferred, defensive
- [x] [Review][Defer] Test uses `setTimeout` for creation-time ordering — relies on 10ms wall-clock gap for distinct `_creationTime` values. Could be flaky on slow CI. [convex/knowledge.resync.test.ts:72] — deferred, minor test fragility
- [x] [Review][Defer] AI config existence check insufficient — checks only `ai_config` truthiness, not `endpoint_url`/`api_key` validity. Pre-existing pattern shared with `embedChunks`. [convex/knowledge/embeddingActions.ts:173-175] — deferred, pre-existing pattern

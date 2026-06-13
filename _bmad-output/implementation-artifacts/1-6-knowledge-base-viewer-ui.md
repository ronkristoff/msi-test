---
baseline_commit: a26975ab7c4448f9349013d355dbec6f22916896
---

# Story 1.6: Knowledge Base Viewer UI

Status: done

## Story

As a BA,
I want to view the Knowledge Base status, architecture summary, and browse detected modules,
so that I can understand what the system learned about the codebase.

## Acceptance Criteria

1. **AC1 — Building status display**: When a project's KB is in `building` status, navigating to `/projects/[id]/knowledge` shows a building progress view with the current progress message (e.g., "Reading N files...", "Chunking complete... Generating embeddings...", "Analyzing code structure...") and a spinner/indicator. The page updates in real-time via Convex subscription.

2. **AC2 — Ready status display**: When a project's KB is in `ready` status, navigating to `/projects/[id]/knowledge` displays:
   - Architecture summary text
   - Tech stack as badges/pills
   - Folder structure (as preformatted text block)
   - Architecture type label
   - Total files count and total size (human-readable)
   - Last synced timestamp
   - A list of detected modules, each showing: name, description, file count, and dependency names. Each module links to `/projects/[id]/knowledge/modules/[moduleId]`.

3. **AC3 — Error status display**: When a project's KB is in `error` status, the page displays the error message and a "Retry" button. Clicking Retry calls `triggerIngestion` to restart the pipeline.

4. **AC4 — No KB state**: When a project has no knowledge base (`kb_status` is `none` or `null`), the page shows an empty state with guidance to connect a repo and trigger analysis, linking to the project settings page.

5. **AC5 — BMAD detected badge (forward-compatible)**: When `bmad_detected` is truthy on the KB document, a "BMAD Detected" badge is shown and a collapsible "Declared Intent" section is displayed. When `bmad_detected` is falsy/undefined (current state — field added by Story 1.9), the badge and section are hidden. No errors, no UI disruption.

6. **AC6 — New backend queries**: Two new public queries added to `convex/knowledge/queries.ts`:
   - `getKnowledgeBase(project_id)` — returns the latest KB document for the project (all architecture fields, stats, status, error message, last_synced_at, and the raw document for `bmad_detected` access)
   - `getModules(knowledge_base_id)` — returns all `kb_modules` rows for the given KB, with name, description, file_count, dependencies

7. **AC7 — Project detail page link**: The project detail page (`/projects/[id]`) gains a "Knowledge" button/link in the header alongside existing Explore/Environments/Settings buttons.

8. **AC8 — Tests**: Frontend component tests for the knowledge page (building, ready, error, none states). Backend tests for the new queries (`getKnowledgeBase`, `getModules`) verifying ownership checks and data shapes. All tests use existing mock patterns and seed helpers.

## Tasks / Subtasks

- [x] Task 1: Add `getKnowledgeBase` query to `convex/knowledge/queries.ts` (AC: #6)
  - [x] Takes `project_id: v.id("projects")`
  - [x] Uses `getOptionalOwnedEntity(ctx, args.project_id, "projects")` for auth + ownership
  - [x] Queries `knowledge_bases` by `by_project_id` index, `.order("desc").first()` (same pattern as `getIngestionProgress`)
  - [x] Returns `null` if project not owned or no KB exists
  - [x] Verifies `kb.workspace_id === project.workspace_id`
  - [x] Returns the full KB document (for `bmad_detected` forward-compatible access)

- [x] Task 2: Add `getModules` query to `convex/knowledge/queries.ts` (AC: #6)
  - [x] Takes `knowledge_base_id: v.id("knowledge_bases")`
  - [x] Uses `getOptionalOwnedEntity` is NOT directly applicable (no project_id arg). Instead: query `kb_modules` by `by_knowledge_base_id`, then verify workspace ownership via the KB's `workspace_id`
  - [x] Returns array of modules with `_id`, `name`, `description`, `file_count`, `dependencies`

- [x] Task 3: Create frontend route `src/app/(auth)/projects/[id]/knowledge/page.tsx` (AC: #1, #2, #3, #4, #5)
  - [x] `"use client"` component
  - [x] Uses `useParams` for project ID, `asId` for type conversion
  - [x] Uses `useQuery(api.knowledge.queries.getKnowledgeBase, { project_id })` for KB data
  - [x] Conditionally queries modules: `useQuery(api.knowledge.queries.getModules, kb ? { knowledge_base_id: kb._id } : "skip")`
  - [x] Loading state: `<PageSkeleton />`
  - [x] Not found/null state: `<EmptyState>` with link to project settings
  - [x] Building state: spinner + progress message card
  - [x] Ready state: architecture card + stats row + module list
  - [x] Error state: error message + Retry button
  - [x] BMAD detected: conditional badge + collapsible section

- [x] Task 4: Create knowledge page sub-components (AC: #2)
  - [x] Break the page into sub-components for clarity (each <150 lines):
    - `KnowledgeBuilding.tsx` — building progress view
    - `KnowledgeReady.tsx` — ready state with architecture + modules
    - `KnowledgeError.tsx` — error state with retry
    - `KnowledgeModuleList.tsx` — module list section (reusable within Ready view)

- [x] Task 5: Add "Knowledge" link to project detail page header (AC: #7)
  - [x] In `src/app/(auth)/projects/[id]/page.tsx`, add a "Knowledge" button in the header button group
  - [x] Links to `/projects/${project._id}/knowledge`
  - [x] Shows KB status as a small indicator if KB exists

- [x] Task 6: Add `formatBytes` helper to `src/lib/format.ts` (AC: #2)
  - [x] Converts bytes to human-readable (e.g., 1.2 MB, 450 KB)
  - [x] Used for displaying `total_size_bytes`

- [x] Task 7: Write frontend tests (AC: #8)
  - [x] `src/app/(auth)/projects/[id]/knowledge/knowledge.test.tsx`
  - [x] Mock `convex/react` with `useQuery`/`useMutation`/`useAction` patterns (same as `settings.test.tsx`)
  - [x] Mock `@/lib/convex` with API path strings
  - [x] Test cases: building state renders progress, ready state renders architecture + modules, error state renders error + retry button, null state renders empty state
  - [x] Test retry button calls triggerIngestion

- [x] Task 8: Write backend tests (AC: #8)
  - [x] Extend existing `convex/knowledge.queries.test.ts` or create `convex/knowledge.kbViewerQueries.test.ts`
  - [x] Test `getKnowledgeBase`: returns full KB doc for owned project, returns null for unowned, returns null when no KB exists
  - [x] Test `getModules`: returns modules for valid KB, returns empty array for KB with no modules, returns null/empty for unowned workspace
  - [x] Use `seedWorkspace`, `seedProject`, `seedKnowledgeBase` from `convex/testHelpers.ts`
  - [x] Create seed helper for modules if `seedModule` doesn't exist in testHelpers

- [x] Task 9: Run `pnpm lint`, `pnpm test`, `pnpm test:convex` — zero failures (AC: #8)

## Dev Notes

### Scope Boundary — What This Story Does and Does NOT Do

**This story implements:**
- Two new public Convex queries (`getKnowledgeBase`, `getModules`)
- The `/projects/[id]/knowledge` frontend route with 4 KB states (building, ready, error, none)
- A "Knowledge" link button on the project detail page header
- A `formatBytes` utility helper
- Frontend component tests + backend query tests

**This story does NOT implement:**
- Module detail view (`/projects/[id]/knowledge/modules/[moduleId]` — Story 1.7)
- KB re-sync button (Story 1.8 — the Retry button on error state re-triggers ingestion, but there's no "Re-sync" for ready KBs in this story)
- BMAD artifact parsing/storage (Story 1.9 — the BMAD UI is forward-compatible, hidden until 1.9 adds the field)
- Sidebar nav item for Knowledge (KB is accessed via project detail page, not global sidebar)

### Critical: BMAD Forward-Compatibility

The `knowledge_bases` table does NOT have `bmad_detected` or `bmad_parsed_at` fields yet. These are added by Story 1.9. The `getKnowledgeBase` query returns the raw KB document. In the frontend:

```typescript
// bmad_detected is undefined on all KB docs until Story 1.9 adds the schema field
// Accessing it via optional property check avoids TypeScript errors
const bmadDetected = (kb as Record<string, unknown>).bmad_detected as boolean | undefined;
```

When `bmad_detected` is falsy (always, until Story 1.9): hide the "BMAD Detected" badge and "Declared Intent" section. When truthy (after Story 1.9): show them. No special backend handling needed — the raw document is returned as-is.

**Do NOT add `bmad_detected` to the schema in this story.** Story 1.9 owns that.

### Architecture: Query Patterns

**`getKnowledgeBase` — follow the existing `getIngestionProgress` pattern exactly:**

```typescript
export const getKnowledgeBase = query({
  args: { project_id: v.id("projects") },
  handler: async (ctx, args) => {
    const result = await getOptionalOwnedEntity(ctx, args.project_id, "projects");
    if (!result) return null;

    const kb = await ctx.db
      .query("knowledge_bases")
      .withIndex("by_project_id", (q) => q.eq("project_id", args.project_id))
      .order("desc")
      .first();

    if (!kb) return null;
    if (kb.workspace_id !== result.entity.workspace_id) return null;

    return kb;
  },
});
```

This returns `Doc<"knowledge_bases"> | null`. The document type already includes `architecture_summary`, `tech_stack`, `folder_structure`, `architecture_type`, `total_files`, `total_size_bytes`, `last_synced_at`, `status`, `progress_message`, `error_message` — all the fields the UI needs.

**`getModules` — workspace ownership via `getOptionalMemberWorkspace`:**

The `getOptionalMemberWorkspace` helper exists in `convex/lib/requireAuth.ts` (line 62). It returns `{ user, workspace, membership } | null`. Use it to verify the authenticated user owns the workspace before returning modules:

```typescript
import { getOptionalMemberWorkspace } from "../lib/requireAuth";

export const getModules = query({
  args: { knowledge_base_id: v.id("knowledge_bases") },
  handler: async (ctx, args) => {
    const result = await getOptionalMemberWorkspace(ctx);
    if (!result) return null;

    const kb = await ctx.db.get(args.knowledge_base_id);
    if (!kb) return null;
    if (kb.workspace_id !== result.workspace._id) return null;

    const modules = await ctx.db
      .query("kb_modules")
      .withIndex("by_knowledge_base_id", (q) =>
        q.eq("knowledge_base_id", args.knowledge_base_id),
      )
      .collect();

    return modules.map((m) => ({
      _id: m._id,
      name: m.name,
      description: m.description ?? null,
      file_count: m.file_count ?? 0,
      dependencies: m.dependencies ?? [],
    }));
  },
});
```

**Why `getOptionalMemberWorkspace` instead of `getOptionalOwnedEntity`:** The `getModules` query receives a `knowledge_base_id`, not a `project_id`. `getOptionalOwnedEntity` requires an entity ID from a table with `workspace_id`. Since `knowledge_bases` has `workspace_id`, we could use `getOptionalOwnedEntity(ctx, args.knowledge_base_id, "knowledge_bases")` — but using `getOptionalMemberWorkspace` + explicit KB lookup is clearer and avoids ambiguity when the KB might not exist.

### Architecture: Frontend Route Structure

The route goes under the existing `(auth)` group, nested under `projects/[id]/`:

```
src/app/(auth)/projects/[id]/knowledge/
├── page.tsx                    ← main KB viewer page
├── knowledge.test.tsx          ← component tests
├── KnowledgeBuilding.tsx       ← building state sub-component
├── KnowledgeReady.tsx          ← ready state sub-component
├── KnowledgeError.tsx          ← error state sub-component
└── KnowledgeModuleList.tsx     ← module list (used within Ready)
```

**All files in one directory** — this matches the existing pattern of `explore/` which has its own page + sub-components (`FeatureMapGraph.tsx`, `FlowCard.tsx`, `ScenarioList.tsx`, `PageChecklist.tsx`) and tests in the same directory.

### Architecture: Conditional Query Pattern

The modules query depends on the KB existing. Use the `"skip"` pattern:

```typescript
const projectId = asId(params.id, "projects");
const kb = useQuery(api.knowledge.queries.getKnowledgeBase, { project_id: projectId });
const modules = useQuery(
  api.knowledge.queries.getModules,
  kb && kb.status === "ready" ? { knowledge_base_id: kb._id } : "skip",
);
```

### Architecture: Retry Action

The Retry button on the error state calls the existing `triggerIngestion` action. This is already a public action at `api.knowledge.triggerIngestion.triggerIngestion`:

```typescript
const triggerIngestion = useAction(api.knowledge.triggerIngestion.triggerIngestion);

const handleRetry = async () => {
  try {
    setRetrying(true);
    await triggerIngestion({ project_id: projectId });
    // Convex subscription auto-updates the UI as KB status changes
  } catch (err) {
    const msg = err instanceof Error ? err.message.replace(/^Uncaught ConvexError:\s*/, "") : "Failed to retry";
    setRetryError(msg);
    logError(msg, { severity: "error", context: { source: "KnowledgeError.handleRetry" } });
  } finally {
    setRetrying(false);
  }
};
```

**Important — `triggerIngestion` validates `kb_status`:** It throws `ConvexError` if `kb_status` is not `"none"` or `"error"`. From the error state, this is always valid. No pre-cleanup needed.

**Note on `useAction` vs `useMutation`:** `triggerIngestion` is an `action` (not a `mutation`) because it uses `"use node"` and orchestrates the workflow. Use `useAction` from `convex/react`, not `useMutation`.

### Architecture: UI Layout Pattern

Follow the project detail page pattern — card-based layout within `max-w-[1080px]`:

```
┌──────────────────────────────────────────────────────┐
│ Header: "Knowledge Base" + StatusPill + BMAD badge   │
├──────────────────────────────────────────────────────┤
│ Building:                                            │
│   ┌── Spinner ──┐  Progress message text             │
│   └──────────────┘                                   │
│                                                      │
│ Ready:                                               │
│   ┌─ Stats Row ────────────────────────────────────┐ │
│   │ Total Files: 247    Total Size: 1.2 MB         │ │
│   │ Last Synced: 2h ago  Type: Monolith            │ │
│   └─────────────────────────────────────────────────┘ │
│   ┌─ Architecture Summary ─────────────────────────┐ │
│   │ [tech stack badges]                             │ │
│   │ Architecture summary text...                    │ │
│   │ Folder structure (preformatted)                 │ │
│   └─────────────────────────────────────────────────┘ │
│   ┌─ Modules (N) ──────────────────────────────────┐ │
│   │ Module Name         Description      Files →   │ │
│   │ Module Name         Description      Files →   │ │
│   └─────────────────────────────────────────────────┘ │
│                                                      │
│ Error:                                               │
│   ┌── Alert (error) ──────────────────────────────┐  │
│   │ Error message text                             │  │
│   └────────────────────────────────────────────────┘  │
│   [ Retry button ]                                   │
└──────────────────────────────────────────────────────┘
```

### Architecture: StatusPill Variants for KB Status

| KB Status | StatusPill Variant | Label |
|-----------|-------------------|-------|
| `building` | `running` | "Building" |
| `ready` | `success` | "Ready" |
| `error` | `danger` | "Error" |
| none/null | `neutral` | "Not Analyzed" |

### Architecture: formatBytes Helper

Add to `src/lib/format.ts`:

```typescript
export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes || bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}
```

### Architecture: BMAD "Declared Intent" Section (Forward-Compatible)

The collapsible section renders ONLY when `bmad_detected` is truthy. Since the field doesn't exist in the schema yet, it's always `undefined` now. The section structure for when Story 1.9 activates it:

```tsx
{bmadDetected && (
  <div className="...">
    <button onClick={() => setDeclaredIntentOpen(!declaredIntentOpen)}>
      Declared Intent (BMAD Method detected)
    </button>
    {declaredIntentOpen && (
      <div>
        {/* These fields come from kb_bmad_metadata table (Story 1.9) */}
        {/* For now, this entire block is dead code that activates post-1.9 */}
        {/* The data would come from a separate query, not getKnowledgeBase */}
        <p>PRD sections, ADRs, conventions, domain terms</p>
      </div>
    )}
  </div>
)}
```

**Do NOT query `kb_bmad_metadata` in this story** — that table doesn't exist yet. The BMAD badge is purely a visual indicator from the `bmad_detected` field. The full "Declared Intent" content (PRD outline, ADR list, etc.) requires Story 1.9's data. For now, render the badge only — the collapsible section with detailed content is a Story 1.9 follow-up.

**Simplified approach for this story:** Show the "BMAD Detected" badge when `bmad_detected` is truthy. Skip the collapsible "Declared Intent" section entirely for now — it needs data that doesn't exist. Add a TODO comment referencing Story 1.9.

### Existing Code to Modify

- `convex/knowledge/queries.ts` — ADD `getKnowledgeBase` and `getModules` queries (non-breaking additions)
- `src/app/(auth)/projects/[id]/page.tsx` — ADD "Knowledge" link button in header (small non-breaking addition)
- `src/lib/format.ts` — ADD `formatBytes` function (non-breaking addition)

### New Files to Create

- `src/app/(auth)/projects/[id]/knowledge/page.tsx` — main KB viewer page
- `src/app/(auth)/projects/[id]/knowledge/KnowledgeBuilding.tsx` — building state
- `src/app/(auth)/projects/[id]/knowledge/KnowledgeReady.tsx` — ready state
- `src/app/(auth)/projects/[id]/knowledge/KnowledgeError.tsx` — error state
- `src/app/(auth)/projects/[id]/knowledge/KnowledgeModuleList.tsx` — module list
- `src/app/(auth)/projects/[id]/knowledge/knowledge.test.tsx` — frontend tests
- `convex/knowledge.kbViewerQueries.test.ts` — backend query tests (at convex/ root per convention)

### Key Dependencies

- No new npm packages needed — all UI components, Convex hooks, and testing libraries are already installed
- `convex/react` provides `useQuery`, `useAction` — already used throughout
- `@testing-library/react`, `@testing-library/user-event` — already in devDependencies
- `convex-test` — already in devDependencies for backend tests

### Existing Code Patterns to Follow

**Client page pattern** (from `src/app/(auth)/projects/[id]/page.tsx`):
```typescript
"use client";
import { useParams } from "next/navigation";
import { useQuery } from "convex/react";
import { api, asId } from "@/lib/convex";
```

**Conditional query pattern** (from project-context.md):
```typescript
const modules = useQuery(
  api.knowledge.queries.getModules,
  kb && kb.status === "ready" ? { knowledge_base_id: kb._id } : "skip",
);
```

**Error handling pattern** (from project detail page):
```typescript
import { useErrorLogger } from "@/lib/error-logger";
const { logError } = useErrorLogger();

// In catch block:
logError(msg, { severity: "error", context: { source: "KnowledgePage.handleRetry" } });
```

**ConvexError message extraction** (from project detail page):
```typescript
const msg = err instanceof Error
  ? err.message.replace(/^Uncaught ConvexError:\s*/, "")
  : "Failed to retry analysis";
```

**Card layout pattern** (from settings page):
```tsx
<div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] p-5 shadow-[var(--elev-raised)]">
```

**Loading skeleton** (from project detail page):
```tsx
if (kb === undefined) return <PageSkeleton />;
```

**Test mock pattern** (from `settings.test.tsx`):
```typescript
vi.mock("convex/react", () => ({
  useQuery: vi.fn((_queryRef: unknown) => {
    const key = String(_queryRef);
    if (key.includes("getKnowledgeBase")) return mockKb;
    if (key.includes("getModules")) return mockModules;
    return undefined;
  }),
  useAction: vi.fn((_actionRef: unknown) => mockTriggerIngestion),
}));

vi.mock("@/lib/convex", () => ({
  api: {
    knowledge: {
      queries: {
        getKnowledgeBase: "knowledge.queries.getKnowledgeBase",
        getModules: "knowledge.queries.getModules",
      },
      triggerIngestion: {
        triggerIngestion: "knowledge.triggerIngestion.triggerIngestion",
      },
    },
  },
  asId: (v: string) => v,
}));
```

### Testing Strategy

**Frontend tests** (`knowledge.test.tsx`):
- Building state: renders progress message, spinner indicator
- Ready state: renders architecture summary, tech stack badges, folder structure, module list with links
- Error state: renders error message in Alert, renders Retry button, Retry calls `triggerIngestion`
- None state (null KB): renders EmptyState with link to settings
- Loading state: renders PageSkeleton

**Backend tests** (`convex/knowledge.kbViewerQueries.test.ts`):
- `getKnowledgeBase`: returns full KB doc for owned project, returns null for unowned project, returns null when no KB exists
- `getModules`: returns modules for valid owned KB, returns empty array for KB with no modules, returns null for unowned KB
- Use `seedWorkspace`, `seedProject`, `seedKnowledgeBase` from `convex/testHelpers.ts`
- May need `seedModule` helper — check if it exists in `testHelpers.ts`, if not, insert directly via `ctx.db.insert("kb_modules", {...})` in test setup

**Untestable paths:**
- Full ingestion retry flow (requires workflow + GitHub API)
- BMAD declared intent content (requires Story 1.9 data)

### Previous Story Intelligence (Story 1.5)

**Key learnings from Story 1.5:**
1. **Forward-compatible BMAD check pattern**: Story 1.5 checked `kb?.bmad_detected` which is always falsy until Story 1.9. This story follows the same pattern — check the field, hide UI when falsy.
2. **Query ordering**: `getIngestionProgress` uses `.order("desc").first()` to get the latest KB. `getKnowledgeBase` must use the same pattern to avoid getting a stale KB document.
3. **Internal query pattern**: Story 1.5 created `_getKbForExtraction` as a simple `ctx.db.get()`. Public queries must additionally verify ownership.
4. **Test file naming**: Convex test files live at `convex/` root, named `convex/{domain}.{feature}.test.ts`.

**What Story 1.5 established that this story builds on:**
- Architecture fields (`architecture_summary`, `tech_stack`, `folder_structure`, `architecture_type`) are populated and stored on `knowledge_bases`
- Module data (`name`, `description`, `file_count`, `dependencies`, `apis`, `data_models`, `user_flows`) is stored in `kb_modules` table
- KB status transitions work: `building` → `ready` / `error`
- `progress_message` is set at each pipeline stage
- `total_files` and `total_size_bytes` are stored on the KB document
- `last_synced_at` timestamp is set when KB reaches `ready`

### Git Intelligence

Recent commits:
- `a26975a` — Story 1.4 (vector embeddings & RAG storage) — KB status transitions, ingestion progress query
- `b56819b` — Stories 1.2 and 1.3 — KB ingestion pipeline
- Pattern: each story is a single `feat:` commit

**Existing frontend patterns:**
- All project pages are client components (`"use client"`)
- Pages use `useParams<{ id: string }>()` + `asId(params.id, "projects")` for typed project ID
- QueryResult component handles loading/null states for single-entity queries
- Card-based layout within `max-w-[1080px]` container
- StatusPill for status indicators with variants (success, danger, running, neutral)
- EmptyState for empty/not-found conditions with icon, title, description, action

### Project Structure Notes

- New frontend route under `(auth)/projects/[id]/knowledge/` — follows the `explore/` sub-route pattern (page + colocated sub-components + tests)
- Backend queries added to existing `convex/knowledge/queries.ts` — no new backend files needed
- `formatBytes` added to `src/lib/format.ts` — follows existing utility function pattern
- "Knowledge" link on project detail page — small addition to existing header button group
- No schema changes needed — all KB and module fields already exist from Story C1.1

### Schema Fields Available (No Changes Needed)

The `knowledge_bases` table already has (from Story C1.1 + 1.5):
```typescript
status: v.union(v.literal("building"), v.literal("ready"), v.literal("error")),
progress_message: v.optional(v.string()),
architecture_summary: v.optional(v.string()),
tech_stack: v.optional(v.array(v.string())),
folder_structure: v.optional(v.string()),
architecture_type: v.optional(v.string()),
total_files: v.optional(v.number()),
total_size_bytes: v.optional(v.number()),
error_message: v.optional(v.string()),
last_synced_at: v.optional(v.number()),
```

The `kb_modules` table already has:
```typescript
name: v.string(),
description: v.optional(v.string()),
file_count: v.optional(v.number()),
files: v.optional(v.array(v.string())),
dependencies: v.optional(v.array(v.string())),
apis: v.optional(v.any()),
data_models: v.optional(v.any()),
user_flows: v.optional(v.any()),
```

**No schema migration needed.** Just read these fields.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.6] — ACs and FRs
- [Source: docs/adr/0008-combined-analyst-test-platform.md#Frontend] — route definitions: `/projects/[id]/knowledge` and `/projects/[id]/knowledge/modules/[moduleId]`
- [Source: convex/schema.ts#knowledge_bases] — full KB schema with all architecture fields
- [Source: convex/schema.ts#kb_modules] — module schema with v.any() nested structures
- [Source: convex/knowledge/queries.ts#getIngestionProgress] — query pattern to follow (getOptionalOwnedEntity + KB lookup)
- [Source: convex/knowledge/queries.ts#searchProjectRag] — action pattern (triggerIngestion is also an action)
- [Source: convex/knowledge/triggerIngestion.ts] — public action for retry button
- [Source: convex/lib/requireAuth.ts] — auth helpers (getOptionalOwnedEntity, getOwnedEntity)
- [Source: src/app/(auth)/projects/[id]/page.tsx] — project detail page (add Knowledge link here)
- [Source: src/app/(auth)/projects/[id]/settings/page.tsx] — settings page pattern (card layout, form handling)
- [Source: src/app/(auth)/settings/settings.test.tsx] — frontend test mock pattern
- [Source: src/components/ui/StatusPill.tsx] — variants: success, danger, warn, neutral, running
- [Source: src/components/ui/StatCard.tsx] — stat card for metrics display
- [Source: src/components/ui/EmptyState.tsx] — empty state component
- [Source: src/components/ui/QueryResult.tsx] — query result wrapper for loading/null states
- [Source: src/components/ui/Skeleton.tsx] — PageSkeleton for loading state
- [Source: src/components/ui/Alert.tsx] — alert component for error display
- [Source: src/lib/format.ts] — format utilities (add formatBytes here)
- [Source: src/lib/error-logger.ts] — useErrorLogger hook for catch blocks
- [Source: src/lib/convex.ts] — API exports and asId helper
- [Source: _bmad-output/implementation-artifacts/1-5-ai-architecture-module-extraction.md] — previous story (extraction populates the data this story displays)
- [Source: _bmad-output/implementation-artifacts/deferred-work.md] — deferred items from prior stories

## Dev Agent Record

### Agent Model Used

glm-5.1 (zai-coding-plan/glm-5.1)

### Debug Log References

No issues encountered during implementation.

### Completion Notes List

- Implemented two new public Convex queries (`getKnowledgeBase`, `getModules`) in `convex/knowledge/queries.ts` following the existing `getIngestionProgress` ownership pattern.
- `getKnowledgeBase` returns the raw KB document (includes all architecture fields + forward-compatible `bmad_detected` access). Uses `getOptionalOwnedEntity` + `by_project_id` index with `.order("desc").first()` to get the latest KB.
- `getModules` returns mapped module data (`_id`, `name`, `description`, `file_count`, `dependencies`). Uses `getOptionalMemberWorkspace` for auth, then explicit KB lookup + workspace_id check, then `by_knowledge_base_id` index query.
- Created the `/projects/[id]/knowledge` route with 4 KB states: loading (PageSkeleton), null/none (EmptyState + settings link), building (spinner + progress message), ready (stats + architecture + modules), error (Alert + Retry button).
- Sub-components follow explore/ co-location pattern: `KnowledgeBuilding.tsx`, `KnowledgeReady.tsx`, `KnowledgeError.tsx`, `KnowledgeModuleList.tsx`.
- BMAD Detected badge is forward-compatible — checks `(kb as Record<string, unknown>).bmad_detected`, hidden until Story 1.9 adds the schema field. No collapsible section rendered (needs Story 1.9 data).
- Retry button calls existing `triggerIngestion` action via `useAction`. Error handling follows existing `ConvexError` message extraction pattern.
- `formatBytes` helper added to `src/lib/format.ts`.
- Added `seedModule` helper to `convex/testHelpers.ts` and extended `seedKnowledgeBase` to accept architecture fields.
- Added "Knowledge" button to project detail page header between Explore and Environments.
- All 8 ACs satisfied. Lint: 0 errors. Frontend tests: 158 passed. Backend tests: 632 passed.

### File List

**New files:**
- `src/app/(auth)/projects/[id]/knowledge/page.tsx` — main KB viewer page
- `src/app/(auth)/projects/[id]/knowledge/KnowledgeBuilding.tsx` — building state sub-component
- `src/app/(auth)/projects/[id]/knowledge/KnowledgeReady.tsx` — ready state sub-component
- `src/app/(auth)/projects/[id]/knowledge/KnowledgeError.tsx` — error state sub-component
- `src/app/(auth)/projects/[id]/knowledge/KnowledgeModuleList.tsx` — module list sub-component
- `src/app/(auth)/projects/[id]/knowledge/knowledge.test.tsx` — frontend component tests (10 tests)
- `convex/knowledge.kbViewer.test.ts` — backend query tests (10 tests)
- `src/lib/format.test.ts` — formatBytes unit tests (5 tests)

**Modified files:**
- `convex/knowledge/queries.ts` — added `getKnowledgeBase` and `getModules` queries, added `getOptionalMemberWorkspace` import
- `convex/testHelpers.ts` — extended `seedKnowledgeBase` with architecture fields, added `seedModule` helper
- `src/lib/format.ts` — added `formatBytes` function
- `src/app/(auth)/projects/[id]/page.tsx` — added "Knowledge" button in header

## Change Log

- 2026-06-13: Story 1.6 implemented — Knowledge Base Viewer UI with 4 KB states, two new queries, formatBytes helper, and full test coverage. All tasks complete, ready for review.
- 2026-06-13: Code review completed (3-layer: Blind Hunter + Edge Case Hunter + Acceptance Auditor). 7 patch, 0 decision-needed, 7 defer, 15 dismissed.

### Review Findings

**Patches (action items):**

- [x] [Review][Patch] formatBytes overflow/negative/NaN — `units` array caps at GB (index 3); bytes ≥ 1 TiB yields `units[4]` = undefined → "1.0 undefined". Negative/Infinity bytes produce NaN via `Math.log`. Fix: guard `!Number.isFinite(bytes) || bytes <= 0` and clamp `i` to `units.length - 1`. Add edge-case tests (negative, TB+) [src/lib/format.ts:52-57]
- [x] [Review][Patch] getModules null silently renders "No modules detected" — `(modules as ModuleItem[]) ?? []` coerces null (auth failure / lost session) to empty array, hiding security-relevant state. Now uses `Array.isArray(modules)` guard so null/undefined render skeleton, not false "No modules detected" [src/app/(auth)/projects/[id]/knowledge/page.tsx:287-290]
- [x] [Review][Patch] Accessibility gaps — added `aria-hidden="true"` to all decorative SVGs; `role="status"` + `aria-live="polite"` on building spinner container [KnowledgeBuilding.tsx, KnowledgeError.tsx, page.tsx, KnowledgeModuleList.tsx]
- [x] [Review][Patch] Redundant type intersection widens branded Id — removed `& { _id: string }` from `KnowledgeReadyProps`; removed dead `KnowledgeBaseDoc` export and unused `Doc` import [KnowledgeReady.tsx:9, KnowledgeModuleList.tsx]
- [x] [Review][Patch] Duplicate React keys on tech_stack — changed `key={tech}` to `key={`${tech}-${idx}`}` [KnowledgeReady.tsx]
- [x] [Review][Patch] Missing Story 1.9 TODO comment — added `{/* TODO(Story 1.9): Add collapsible "Declared Intent" section when bmad_detected is truthy */}` next to BMAD badge [page.tsx]
- [x] [Review][Patch] Unsound type cast on modules — replaced `(modules as ModuleItem[]) ?? []` with `Array.isArray(modules)` guard + clean cast [page.tsx]

**Deferred (pre-existing / spec-mandated / not actionable now):**

- [x] [Review][Defer] getKnowledgeBase returns full document while getModules whitelists fields [convex/knowledge/queries.ts:125-148] — deferred, spec-mandated (returns raw doc for bmad_detected forward-compat)
- [x] [Review][Defer] Authorization model inconsistency: getKnowledgeBase uses getOptionalOwnedEntity, getModules uses getOptionalMemberWorkspace [convex/knowledge/queries.ts:106-163] — deferred, spec-mandated; functionally equivalent in single-user workspace model
- [x] [Review][Defer] Duplicated ConvexError message-scraping regex in page.tsx + KnowledgeError.tsx [page.tsx:210, KnowledgeError.tsx:443] — deferred, follows existing project pattern
- [x] [Review][Defer] seedModule test helper uses unsafe `as Id<>` casts [convex/testHelpers.ts:120-127] — deferred, test-only code following existing seed helper pattern
- [x] [Review][Defer] KnowledgeError stays in error state after successful retry until Convex propagates status [KnowledgeError.tsx] — deferred, needs optimistic update logic (out of scope)
- [x] [Review][Defer] getModules unbounded .collect() on large module sets [convex/knowledge/queries.ts:158-163] — deferred, bounded by architecture detection (~50 modules max)
- [x] [Review][Defer] kb.status outside {building,ready,error} renders header but blank body [page.tsx:281-303] — deferred, schema-enforced union; "Unknown" StatusPill already signals deviation

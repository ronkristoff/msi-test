---
baseline_commit: ad67e42dd38a1cd8797928adc49f5227be5098f1
---

# Story 1.7: Module Detail View

Status: done

## Story

As a BA,
I want to drill into a specific module to see its APIs, data models, and user flows,
so that I can understand the detailed structure of each part of the codebase.

## Acceptance Criteria

1. **AC1 — Route exists and loads module data**: When a BA navigates to `/projects/[id]/knowledge/modules/[moduleId]`, the page loads and displays the module's name, description, file count, and file list.

2. **AC2 — APIs section**: The page displays an expandable "APIs" section showing extracted API endpoints. Each API item shows: path, HTTP method, description, request shape, and response shape. When `apis` is undefined, null, or an empty array, the section shows "No APIs detected" and is collapsed by default.

3. **AC3 — Data Models section**: The page displays an expandable "Data Models" section showing extracted database schemas/entities. Each item shows: name, type, fields, and relationships. When `data_models` is undefined, null, or empty, the section shows "No data models detected" and is collapsed by default.

4. **AC4 — User Flows section**: The page displays an expandable "User Flows" section showing reconstructed user-facing flows. Each item shows: name, route, description, and components. When `user_flows` is undefined, null, or empty, the section shows "No user flows detected" and is collapsed by default.

5. **AC5 — Dependencies display**: The page displays the module's dependencies as a list of module name badges. When a dependency name matches a known module in the same KB, the badge links to that module's detail page. When no dependencies exist, shows "No dependencies".

6. **AC6 — Files list**: The page displays the module's file paths as a scrollable list (monospace, truncate with tooltip if long). When `files` is undefined, null, or empty, shows "No file paths recorded".

7. **AC7 — Back navigation**: The page header includes a "Back to Knowledge" button linking to `/projects/[id]/knowledge`.

8. **AC8 — Not found / loading states**: When the module ID doesn't exist or the user lacks access, the page shows an EmptyState with a "Back to Knowledge" link. While loading, shows `PageSkeleton`.

9. **AC9 — New backend query**: A new public query `getModule` is added to `convex/knowledge/queries.ts`:
   - Takes `module_id: v.id("kb_modules")`
   - Returns the full module document (all fields including `apis`, `data_models`, `user_flows`, `files`, `dependencies`, `description`, `file_count`, `name`)
   - Returns `null` for unauthenticated users, non-existent modules, or modules outside the user's workspace
   - Uses `getOptionalMemberWorkspace(ctx)` for auth (same pattern as `getModules`)

10. **AC10 — Tests**: Frontend component tests for the module detail page (loading, ready with all sections populated, ready with all sections empty, not-found). Backend tests for `getModule` verifying ownership checks and data shapes. All tests use existing mock patterns and seed helpers.

## Tasks / Subtasks

- [x] Task 1: Add `getModule` query to `convex/knowledge/queries.ts` (AC: #9)
  - [x] Takes `module_id: v.id("kb_modules")`
  - [x] Uses `getOptionalMemberWorkspace(ctx)` for auth
  - [x] Fetches the module via `ctx.db.get(args.module_id)`
  - [x] Returns `null` if module not found or workspace mismatch
  - [x] Returns the full module document (raw `Doc<"kb_modules">`)

- [x] Task 2: Extend `seedModule` in `convex/testHelpers.ts` to accept `apis`, `data_models`, `user_flows` (AC: #10)
  - [x] Add `apis`, `data_models`, `user_flows` to the overrides Partial type
  - [x] Pass them through to `ctx.db.insert("kb_modules", {...})`

- [x] Task 3: Create frontend route `src/app/(auth)/projects/[id]/knowledge/modules/[moduleId]/page.tsx` (AC: #1, #7, #8)
  - [x] `"use client"` component
  - [x] Uses `useParams<{ id: string; moduleId: string }>()` for both route params
  - [x] Uses `asId(params.moduleId, "kb_modules")` for typed module ID
  - [x] Uses `useQuery(api.knowledge.queries.getModule, { module_id })` for module data
  - [x] Loading state: `<PageSkeleton />`
  - [x] Not-found/null state: `<EmptyState>` with "Back to Knowledge" link
  - [x] Header: module name + "Back to Knowledge" button (`ml-auto`)
  - [x] Body delegates to `ModuleDetail` sub-component

- [x] Task 4: Create `ModuleDetail.tsx` sub-component (AC: #1, #2, #3, #4, #5, #6)
  - [x] Takes `module: Doc<"kb_modules">` and `projectId: string` props
  - [x] Renders module description + file count stat row
  - [x] Renders dependencies section with badge links
  - [x] Renders files list (monospace, scrollable)
  - [x] Renders three expandable sections: APIs, Data Models, User Flows

- [x] Task 5: Create `ModuleSection.tsx` sub-component — reusable expandable section (AC: #2, #3, #4)
  - [x] Takes `title`, `items`, `renderItem`, and `emptyMessage` props
  - [x] Collapsible via `useState` toggle (collapsed by default when empty)
  - [x] Shows item count in header when non-empty
  - [x] Accessible: `aria-expanded`, `aria-controls`, keyboard-friendly button

- [x] Task 6: Create frontend tests `src/app/(auth)/projects/[id]/knowledge/modules/[moduleId]/module-detail.test.tsx` (AC: #10)
  - [x] Mock `convex/react` with `useQuery` dispatching by query-ref string (same pattern as `knowledge.test.tsx`)
  - [x] Mock `@/lib/convex` with string-keyed `api` tree including `getModule`
  - [x] Mock `next/navigation` with `useParams` returning `{ id: "proj1", moduleId: "mod1" }`
  - [x] Mock `@/lib/error-logger`
  - [x] Test cases: loading state renders skeleton, full-data state renders all sections, empty-data state renders empty messages, null state renders not-found empty state
  - [x] Test expandable section toggle (click expands, click again collapses)

- [x] Task 7: Write backend tests — extend existing `convex/knowledge.kbViewer.test.ts` or create `convex/knowledge.moduleDetail.test.ts` (AC: #10)
  - [x] Test `getModule`: returns full module doc for owned workspace, returns null for unowned, returns null for non-existent ID
  - [x] Test that `apis`, `data_models`, `user_flows` fields are returned when present
  - [x] Use `seedWorkspace`, `seedProject`, `seedKnowledgeBase`, `seedModule` from `convex/testHelpers.ts`
  - [x] Seed a module WITH `apis`/`data_models`/`user_flows` to verify they pass through

- [x] Task 8: Run `pnpm lint`, `pnpm test`, `pnpm test:convex` — zero failures (AC: #10)

## Dev Notes

### Scope Boundary — What This Story Does and Does NOT Do

**This story implements:**
- One new public Convex query (`getModule`) returning the full module document
- The `/projects/[id]/knowledge/modules/[moduleId]` frontend route
- Expandable sections for APIs, Data Models, User Flows
- Dependencies display with cross-module links
- Files list display
- Frontend component tests + backend query tests
- Extends `seedModule` test helper to support `apis`/`data_models`/`user_flows`

**This story does NOT implement:**
- KB re-sync (Story 1.8)
- BMAD artifact parsing (Story 1.9)
- Editing module data (modules are AI-extracted, read-only)
- Dependency graph visualization (AC says "dependency graph" but for MVP this is a simple list of dependency name badges with links — no graph rendering library)
- Search/filter within module sections

### Critical: `v.any()` Field Shapes

The `apis`, `data_models`, and `user_flows` fields on `kb_modules` use `v.optional(v.any())`. They are AI-extracted and their shapes come from the extraction prompt in `convex/knowledge/extractionPrompts.ts` (lines 105-107):

```
6. apis: Array of API endpoints with { path, method, description, request_shape, response_shape }
7. data_models: Array of database schemas/entities with { name, type, fields, relationships }
8. user_flows: Array of user-facing flows with { name, route, description, components }
```

**However**, because these are `v.any()`, the actual stored data may:
- Be `undefined` (field not set — common for modules where AI didn't extract this data)
- Be `null` (shouldn't happen with `v.optional`, but handle defensively)
- Be an empty array `[]`
- Be an array of objects matching the documented shape
- Be any other shape (AI may produce unexpected output)

**The frontend MUST handle all cases gracefully.** Treat each field as `unknown` and validate/safely render:
- Check `Array.isArray(field)` before mapping
- If not an array, render the empty message
- Each item should be treated as `Record<string, unknown>` with optional property access
- Never assume a property exists — use `item.path ?? "Unknown"` patterns

### Architecture: Backend Query — `getModule`

Follow the existing `getModules` pattern exactly (lines 127-154 of `convex/knowledge/queries.ts`). The `getModules` query uses `getOptionalMemberWorkspace` because it receives a `knowledge_base_id`, not a `project_id`. The new `getModule` query receives a `module_id` directly:

```typescript
export const getModule = query({
  args: {
    module_id: v.id("kb_modules"),
  },
  handler: async (ctx, args) => {
    const memberWorkspace = await getOptionalMemberWorkspace(ctx);
    if (!memberWorkspace) return null;

    const module = await ctx.db.get(args.module_id);
    if (!module) return null;
    if (module.workspace_id !== memberWorkspace.workspace._id) return null;

    return module;
  },
});
```

**Return the raw module document** — all fields including `apis`, `data_models`, `user_flows`, `files`. Unlike `getModules` (which maps/whitelists), `getModule` returns the raw `Doc<"kb_modules">` because the detail view needs every field.

**Why `getOptionalMemberWorkspace` instead of `getOptionalOwnedEntity`:** The query receives a `kb_modules` ID. While `getOptionalOwnedEntity(ctx, args.module_id, "kb_modules")` would also work (the table has `workspace_id`), using `getOptionalMemberWorkspace` matches the `getModules` pattern exactly and is consistent with the deferred review note about auth model consistency. Both are functionally equivalent in the current single-user workspace model.

### Architecture: Frontend Route Structure

The route goes under the existing `(auth)` group, nested under `knowledge/modules/[moduleId]/`:

```
src/app/(auth)/projects/[id]/knowledge/
├── page.tsx                           ← existing KB viewer (Story 1.6)
├── knowledge.test.tsx                 ← existing tests
├── KnowledgeBuilding.tsx              ← existing
├── KnowledgeReady.tsx                 ← existing
├── KnowledgeError.tsx                 ← existing
├── KnowledgeModuleList.tsx            ← existing (module links point here)
└── modules/
    └── [moduleId]/
        ├── page.tsx                   ← NEW: module detail page
        ├── ModuleDetail.tsx           ← NEW: detail content orchestrator
        ├── ModuleSection.tsx          ← NEW: reusable expandable section
        └── module-detail.test.tsx     ← NEW: frontend tests
```

This follows the existing `explore/` co-location pattern (page + sub-components + tests in same directory) and the `knowledge/` pattern established in Story 1.6.

### Architecture: Conditional Query Pattern

The module detail page directly queries `getModule` with the module ID from the URL. No conditional `"skip"` pattern needed — the module ID always exists from the route:

```typescript
const params = useParams<{ id: string; moduleId: string }>();
const projectId = params.id;
const moduleId = asId(params.moduleId, "kb_modules");
const moduleData = useQuery(api.knowledge.queries.getModule, { module_id: moduleId });
```

**Loading:** `moduleData === undefined` → `<PageSkeleton />`
**Not found:** `moduleData === null` → `<EmptyState>` with "Back to Knowledge" link

### Architecture: Expandable Section Component

`ModuleSection` is a generic collapsible component used for APIs, Data Models, and User Flows. All three sections have the same expand/collapse behavior but different item renderers:

```tsx
type ModuleSectionProps<T> = {
  title: string;
  items: T[];
  renderItem: (item: T, index: number) => ReactNode;
  emptyMessage: string;
};
```

- When `items.length === 0`: show empty message, default collapsed
- When `items.length > 0`: show count badge in header, default expanded
- Toggle via `useState<boolean>`
- Accessible: `<button aria-expanded={open} aria-controls={sectionId}>` + `<div id={sectionId} role="region">`

### Architecture: Safe Rendering of `v.any()` Data

Each section has a typed renderer that defensively extracts properties. Define local types matching the extraction prompt shapes, but treat the raw data as `unknown`:

```tsx
type ApiItem = { path?: string; method?: string; description?: string; request_shape?: string; response_shape?: string };

function renderApiItem(item: unknown): ReactNode {
  const api = item as Partial<ApiItem>;
  return (
    <div>
      <div className="flex items-center gap-2">
        {api.method && <span className="font-mono text-xs ...">{api.method}</span>}
        <span className="font-mono text-sm">{api.path ?? "Unknown path"}</span>
      </div>
      {api.description && <p className="text-sm text-[var(--muted)]">{api.description}</p>}
      {api.request_shape && <div><span className="text-xs">Request:</span> <code>{api.request_shape}</code></div>}
      {api.response_shape && <div><span className="text-xs">Response:</span> <code>{api.response_shape}</code></div>}
    </div>
  );
}
```

**Apply the same defensive pattern for data_models** (`name`, `type`, `fields`, `relationships`) **and user_flows** (`name`, `route`, `description`, `components`).

**Extract items safely from the raw field:**
```tsx
const apis = Array.isArray(module.apis) ? module.apis : [];
```

### Architecture: Dependencies Display

Dependencies are module **names** (not IDs) per ADR 0008 amendment #2. The `dependencies` field is `v.optional(v.array(v.string()))`. To make dependency badges clickable links, the page needs the module list to map names to IDs:

**Option A (simpler — recommended):** Show dependency names as static badges (no links). The BA can manually find the module in the KB viewer. This avoids an extra query and keeps the page self-contained.

**Option B (full cross-linking):** Also query `getModules` for the parent KB to build a name→ID map. Requires knowing the `knowledge_base_id` from the module document (`module.knowledge_base_id`), then calling `getModules` conditionally. This adds complexity for marginal UX gain.

**Decision: Use Option A.** Render dependency names as badges. If a dependency name matches the current module list (which the BA can see on the KB page), they navigate there manually. This avoids over-engineering and an extra backend round-trip. The epic AC says "dependency graph" but the MVP interpretation is a simple list — no graph library needed.

### Architecture: Files List

The `files` field is `v.optional(v.array(v.string()))` — an array of file paths. Render as a scrollable monospace list:

```tsx
const files = Array.isArray(module.files) ? module.files : [];
```

- Each file path in `<code>` or `<span className="font-mono">`
- Container with `max-h-[300px] overflow-y-auto` for long lists
- Empty state: "No file paths recorded"

### Architecture: UI Layout

Follow the KB viewer page pattern — card-based layout within `max-w-[1080px]`:

```
┌──────────────────────────────────────────────────────┐
│ Header: Module Name + "Back to Knowledge" button     │
├──────────────────────────────────────────────────────┤
│ ┌─ Description ───────────────────────────────────┐  │
│ │ Module description text                         │  │
│ └─────────────────────────────────────────────────┘  │
│ ┌─ Stats Row ─────────────────────────────────────┐  │
│ │ Files: 12        Dependencies: 3                │  │
│ └─────────────────────────────────────────────────┘  │
│ ┌─ Dependencies ──────────────────────────────────┐  │
│ │ [auth] [users] [billing]                        │  │
│ └─────────────────────────────────────────────────┘  │
│ ┌─ Files ─────────────────────────────────────────┐  │
│ │ src/auth/login.ts                               │  │
│ │ src/auth/session.ts                             │  │
│ │ ...                                             │  │
│ └─────────────────────────────────────────────────┘  │
│ ┌─ APIs (3) ▼ ───────────────────────────────────┐   │
│ │ POST /api/login  — Login endpoint               │   │
│ │ GET /api/session — Get session                  │   │
│ │ POST /api/logout — Logout endpoint              │   │
│ └─────────────────────────────────────────────────┘  │
│ ┌─ Data Models (2) ▼ ────────────────────────────┐   │
│ │ Session — type: table                           │   │
│ │ User — type: table                              │   │
│ └─────────────────────────────────────────────────┘  │
│ ┌─ User Flows (1) ▼ ─────────────────────────────┐   │
│ │ Login Flow — route: /login                      │   │
│ └─────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────┘
```

### Existing Code to Modify

- `convex/knowledge/queries.ts` — ADD `getModule` query (non-breaking addition after `getModules`, ~line 154)
- `convex/testHelpers.ts` — EXTEND `seedModule` overrides to accept `apis`, `data_models`, `user_flows` (non-breaking addition)

### New Files to Create

- `src/app/(auth)/projects/[id]/knowledge/modules/[moduleId]/page.tsx` — module detail page
- `src/app/(auth)/projects/[id]/knowledge/modules/[moduleId]/ModuleDetail.tsx` — detail content orchestrator
- `src/app/(auth)/projects/[id]/knowledge/modules/[moduleId]/ModuleSection.tsx` — reusable expandable section
- `src/app/(auth)/projects/[id]/knowledge/modules/[moduleId]/module-detail.test.tsx` — frontend tests
- `convex/knowledge.moduleDetail.test.ts` — backend query tests (at convex/ root per convention)

### Key Dependencies

- No new npm packages needed — all UI components, Convex hooks, and testing libraries already installed
- `convex/react` provides `useQuery` — already used throughout
- `@testing-library/react`, `@testing-library/user-event` — already in devDependencies
- `convex-test` — already in devDependencies for backend tests

### Existing Code Patterns to Follow

**Client page pattern** (from `knowledge/page.tsx`):
```typescript
"use client";
import { useParams } from "next/navigation";
import { useQuery } from "convex/react";
import { api, asId } from "@/lib/convex";
```

**Loading + not-found pattern** (from knowledge + explore pages):
```tsx
if (moduleData === undefined) return <PageSkeleton />;
if (!moduleData) return (
  <EmptyState icon={...} title="Module not found"
    description="This module may have been removed during re-analysis."
    action={<Link href={`/projects/${projectId}/knowledge`}><Button>Back to Knowledge</Button></Link>}
  />
);
```

**Card layout** (from KnowledgeReady):
```tsx
<div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] p-5 shadow-[var(--elev-raised)]">
```

**Test mock pattern** (from `knowledge.test.tsx`):
```typescript
vi.mock("convex/react", () => ({
  useQuery: vi.fn((_queryRef: unknown) => {
    const key = String(_queryRef);
    if (key.includes("getModule")) return mockModule;
    return undefined;
  }),
}));

vi.mock("@/lib/convex", () => ({
  api: {
    knowledge: {
      queries: {
        getModule: "knowledge.queries.getModule",
      },
    },
  },
  asId: (v: string) => v,
}));

vi.mock("next/navigation", () => ({
  useParams: vi.fn(() => ({ id: "proj1", moduleId: "mod1" })),
}));

vi.mock("@/lib/error-logger", () => ({
  useErrorLogger: () => ({ logError: vi.fn() }),
}));
```

### Schema Fields Available (No Changes Needed)

The `kb_modules` table already has all fields needed (from Story C1.1 + 1.5):
```typescript
name: v.string(),
description: v.optional(v.string()),
file_count: v.optional(v.number()),
files: v.optional(v.array(v.string())),
apis: v.optional(v.any()),        // { path, method, description, request_shape, response_shape }[]
data_models: v.optional(v.any()),  // { name, type, fields, relationships }[]
user_flows: v.optional(v.any()),   // { name, route, description, components }[]
dependencies: v.optional(v.array(v.string())),
```

**No schema migration needed.** The `getModule` query returns the raw document with all these fields.

### Test Data: Extending `seedModule`

The current `seedModule` helper (`convex/testHelpers.ts:160-183`) does NOT accept `apis`, `data_models`, or `user_flows`. Extend the overrides:

```typescript
export async function seedModule(
  t: TestCtx,
  workspaceId: string,
  knowledgeBaseId: string,
  overrides?: Partial<{
    name: string;
    description: string;
    file_count: number;
    files: string[];
    dependencies: string[];
    apis: unknown;         // v.any() field
    data_models: unknown;  // v.any() field
    user_flows: unknown;   // v.any() field
  }>,
) {
  return t.run(async (ctx) => {
    return ctx.db.insert("kb_modules", {
      workspace_id: workspaceId as Id<"workspaces">,
      knowledge_base_id: knowledgeBaseId as Id<"knowledge_bases">,
      name: overrides?.name ?? "Test Module",
      description: overrides?.description,
      file_count: overrides?.file_count,
      files: overrides?.files,
      dependencies: overrides?.dependencies,
      apis: overrides?.apis,
      data_models: overrides?.data_models,
      user_flows: overrides?.user_flows,
    });
  });
}
```

**Test fixture data** for frontend tests — sample module with all fields populated:
```tsx
const fullModule = {
  _id: "mod1",
  name: "auth",
  description: "Authentication and session management module",
  file_count: 5,
  files: ["src/auth/login.ts", "src/auth/session.ts", "src/auth/middleware.ts"],
  dependencies: ["users", "database"],
  knowledge_base_id: "kb1",
  workspace_id: "ws1",
  apis: [
    { path: "/api/login", method: "POST", description: "Login endpoint", request_shape: "{email, password}", response_shape: "{token}" },
    { path: "/api/logout", method: "POST", description: "Logout endpoint", request_shape: "{}", response_shape: "{}" },
  ],
  data_models: [
    { name: "Session", type: "table", fields: ["id", "userId", "expiresAt"], relationships: ["User"] },
  ],
  user_flows: [
    { name: "Login Flow", route: "/login", description: "User logs in", components: ["LoginForm", "SessionManager"] },
  ],
};
```

### Testing Strategy

**Frontend tests** (`module-detail.test.tsx`):
- Loading state: `mockModule = undefined` → renders `<PageSkeleton />`
- Full-data state: `mockModule = fullModule` → renders module name, description, file count, dependencies badges, files list, all three expandable sections with item counts, expanding a section shows item details
- Empty-data state: `mockModule = { ...minimalModule, apis: undefined, data_models: undefined, user_flows: undefined, files: undefined, dependencies: [] }` → renders "No APIs detected", "No data models detected", "No user flows detected", "No file paths recorded", "No dependencies"
- Not-found state: `mockModule = null` → renders EmptyState with "Back to Knowledge" link
- Section toggle: click expands collapsed section, click again collapses

**Backend tests** (`convex/knowledge.moduleDetail.test.ts`):
- `getModule`: returns full module doc (with apis/data_models/user_flows) for owned workspace module
- `getModule`: returns null for module in unowned workspace
- `getModule`: returns null for non-existent module ID
- `getModule`: returns null when not authenticated
- Use `seedWorkspace`, `seedProject`, `seedKnowledgeBase`, `seedModule` from `convex/testHelpers.ts`
- Seed one module WITH `apis`/`data_models`/`user_flows` to verify they pass through

### Previous Story Intelligence (Story 1.6)

**Key learnings from Story 1.6:**
1. **Auth pattern for non-project-ID queries:** `getModules` uses `getOptionalMemberWorkspace` because it receives `knowledge_base_id`, not `project_id`. `getModule` follows the same pattern since it receives `module_id`.
2. **Array guard before iteration:** Story 1.6 review found `(modules as ModuleItem[]) ?? []` hides null auth failures. Use `Array.isArray(field)` guards everywhere — null `apis`/`data_models`/`user_flows` should render empty messages, not crash.
3. **Accessibility:** Story 1.6 review required `aria-hidden` on decorative SVGs and `aria-live` on dynamic content. Apply `aria-expanded`/`aria-controls` on expandable section toggles.
4. **Duplicate React keys:** Story 1.6 had `key={tech}` collisions. Use `key={`${item.name}-${idx}`}` for section items.
5. **BMAD forward-compat:** Not applicable here — module detail has no BMAD-specific fields.
6. **Test file location:** Frontend tests co-located with source. Backend tests at `convex/` root.

**What Story 1.6 established that this story builds on:**
- `KnowledgeModuleList.tsx` already links to `/projects/${projectId}/knowledge/modules/${mod._id}` — this story creates the destination page
- `ModuleItem` type exported from `KnowledgeModuleList.tsx` (name, description, file_count, dependencies) — the detail view shows MORE fields
- `getModules` query returns module summaries — `getModule` returns full detail
- `seedModule` test helper exists — this story extends it

### Git Intelligence

Recent commits:
- `ad67e42` — Stories 1.5 & 1.6 — AI architecture extraction + KB viewer UI
- `a26975a` — Story 1.4 — vector embeddings & RAG storage
- `b56819b` — Stories 1.2 & 1.3 — KB ingestion pipeline
- Pattern: each story (or pair) is a single `feat:` commit

**Existing frontend patterns:**
- All project pages are client components (`"use client"`)
- Pages use `useParams<{ id: string }>()` + `asId(params.id, "projects")` for typed IDs
- For nested routes, `useParams<{ id: string; moduleId: string }>()` provides both params
- Card-based layout within `max-w-[1080px]` container
- StatusPill for status indicators
- EmptyState for empty/not-found conditions with icon, title, description, action
- PageSkeleton for loading state

### Project Structure Notes

- New frontend route under `(auth)/projects/[id]/knowledge/modules/[moduleId]/` — follows the co-location pattern (page + sub-components + tests in same directory)
- Backend query added to existing `convex/knowledge/queries.ts` — no new backend files needed
- `seedModule` extended in `convex/testHelpers.ts` — non-breaking override addition
- No schema changes needed — all module fields already exist from Story C1.1

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.7] — ACs and user story
- [Source: docs/adr/0008-combined-analyst-test-platform.md#Frontend] — route definition: `/projects/[id]/knowledge/modules/[moduleId]`
- [Source: docs/adr/0008-combined-analyst-test-platform.md#Schema] — `kb_modules` table with `v.any()` nested structures
- [Source: convex/schema.ts#kb_modules] — full module schema with all fields
- [Source: convex/knowledge/queries.ts#getModules] — query pattern to follow (getOptionalMemberWorkspace + workspace_id check)
- [Source: convex/knowledge/extractionPrompts.ts#L105-107] — documented shapes for apis, data_models, user_flows
- [Source: convex/lib/requireAuth.ts#getOptionalMemberWorkspace] — auth helper for module query
- [Source: convex/testHelpers.ts#seedModule] — test helper to extend
- [Source: src/app/(auth)/projects/[id]/knowledge/page.tsx] — KB viewer page pattern (loading/not-found/ready states)
- [Source: src/app/(auth)/projects/[id]/knowledge/KnowledgeModuleList.tsx] — module link pattern (lines 31-33: `href={/projects/${projectId}/knowledge/modules/${mod._id}}`)
- [Source: src/app/(auth)/projects/[id]/knowledge/KnowledgeReady.tsx] — card layout + StatCard pattern
- [Source: src/app/(auth)/projects/[id]/knowledge/knowledge.test.tsx] — test mock pattern to follow
- [Source: src/components/ui/StatusPill.tsx] — status indicator variants
- [Source: src/components/ui/EmptyState.tsx] — empty/not-found state component
- [Source: src/components/ui/Skeleton.tsx] — PageSkeleton for loading state
- [Source: src/components/ui/Alert.tsx] — alert component (not needed unless error state)
- [Source: src/lib/convex.ts] — API exports and asId helper
- [Source: src/lib/format.ts] — formatBytes, formatTime helpers
- [Source: src/lib/error-logger.ts] — useErrorLogger hook for catch blocks
- [Source: _bmad-output/implementation-artifacts/1-6-knowledge-base-viewer-ui.md] — previous story (established KB viewer, module links, ModuleItem type)
- [Source: _bmad-output/implementation-artifacts/deferred-work.md] — deferred items from prior stories (auth model consistency note)

## Dev Agent Record

### Agent Model Used

glm-5.1 (zai-coding-plan/glm-5.1)

### Debug Log References

- Fixed `module` variable name lint error (`@next/next/no-assign-module-variable`) — renamed to `mod`
- Fixed ModuleSection rendering: empty sections now always show empty message regardless of collapse state (AC2/3/4 require message visible even when collapsed)
- Fixed test for multiple POST methods — used `getAllByText` for duplicate HTTP method badges

### Completion Notes List

- Backend: Added `getModule` query to `convex/knowledge/queries.ts` following `getModules` pattern — uses `getOptionalMemberWorkspace`, returns full raw `Doc<"kb_modules">` document, returns `null` for unauthenticated/non-existent/workspace-mismatch
- Backend: Extended `seedModule` in `convex/testHelpers.ts` to accept `apis`, `data_models`, `user_flows` override params (non-breaking)
- Frontend: Created `page.tsx` — `"use client"` component with `useParams<{ id, moduleId }>()`, `asId`, `useQuery(getModule)`, loading/not-found/ready states, back navigation
- Frontend: Created `ModuleDetail.tsx` — renders description, stats row (files + dependencies count), dependency badges, scrollable files list, and three `ModuleSection` instances (APIs, Data Models, User Flows). All `v.any()` fields defensively handled with `Array.isArray()` guards
- Frontend: Created `ModuleSection.tsx` — generic collapsible section with `aria-expanded`/`aria-controls` accessibility. Non-empty sections default expanded with count badge; empty sections show empty message always visible
- Tests: 12 frontend tests covering loading, full-data, empty-data, not-found, section toggle, and accessibility attributes
- Tests: 5 backend tests covering owned/unowned/non-existent/unauthenticated, plus `apis`/`data_models`/`user_flows` passthrough verification
- All tests pass: 172 frontend, 637 convex (1 skipped, 4 todo), 0 lint errors

### File List

- `convex/knowledge/queries.ts` — MODIFIED: added `getModule` query
- `convex/testHelpers.ts` — MODIFIED: extended `seedModule` overrides with `apis`/`data_models`/`user_flows`
- `src/app/(auth)/projects/[id]/knowledge/modules/[moduleId]/page.tsx` — NEW: module detail page
- `src/app/(auth)/projects/[id]/knowledge/modules/[moduleId]/ModuleDetail.tsx` — NEW: detail content orchestrator
- `src/app/(auth)/projects/[id]/knowledge/modules/[moduleId]/ModuleSection.tsx` — NEW: reusable expandable section
- `src/app/(auth)/projects/[id]/knowledge/modules/[moduleId]/module-detail.test.tsx` — NEW: 12 frontend tests
- `convex/knowledge.moduleDetail.test.ts` — NEW: 5 backend tests

### Change Log

- 2026-06-13: Story 1.7 implemented — module detail view with backend query, frontend route, expandable sections, and full test coverage

### Review Findings

- [x] [Review][Decision] AC5 dependency badges: link vs static — Resolved: follow AC5 (add links). Page now queries `getModules` for parent KB, builds name→ID map, matching dependency badges are `<Link>` elements. [ModuleDetail.tsx, page.tsx]
- [x] [Review][Patch] Empty section toggle no-op + ARIA mismatch — Fixed: empty sections render a static (non-collapsible) header with always-visible message. No toggle button, no false `aria-expanded`. [ModuleSection.tsx]
- [x] [Review][Patch] aria-controls dangles when populated section collapsed — Fixed: content div always rendered in DOM; children conditionally rendered based on `open`. [ModuleSection.tsx]
- [x] [Review][Patch] null/non-string v.any() values crash renderers — Fixed: added `isValidItem()` null guard and `safeStr()` string coercion on all rendered values. [ModuleDetail.tsx]
- [x] [Review][Patch] Array.join() on untyped elements produces `[object Object]` — Fixed: `safeStrArray()` filters to string elements before joining. [ModuleDetail.tsx]
- [x] [Review][Patch] Dead `projectId` prop — Resolved: `projectId` now used for AC5 dependency link URLs. Removed `void _projectId`. [ModuleDetail.tsx]
- [x] [Review][Patch] sectionId not guaranteed unique — Fixed: uses React `useId()` for guaranteed-unique IDs. [ModuleSection.tsx]
- [x] [Review][Patch] Expand/collapse test only exercises empty sections — Fixed: test now uses `fullModule` to exercise populated section toggle. [module-detail.test.tsx]
- [x] [Review][Patch] No test for populated section collapse — Fixed: added test verifying section content disappears when collapsed. [module-detail.test.tsx]
- [x] [Review][Patch] AC2/3/4 fields silently omitted when falsy — Fixed: all fields always rendered with `safeStr()` fallbacks (`—`). [ModuleDetail.tsx]
- [x] [Review][Patch] Section titles as `<span>` not heading elements — Fixed: section titles now use `<h3>` elements. [ModuleSection.tsx]
- [x] [Review][Defer] Query errors → infinite loading skeleton — `useQuery` error state never inspected. Pre-existing pattern across all pages. [page.tsx:19-25] — deferred, pre-existing
- [x] [Review][Defer] useState(hasItems) stale on refetch — `open` initialized from `hasItems` at mount only. Minimal practical impact (navigation causes remount). [ModuleSection.tsx:13] — deferred, pre-existing
- [x] [Review][Defer] Cross-project module access within same workspace — no project_id validation; user can access P2's module under P1's route. Pre-existing workspace model. [queries.ts:160-168] — deferred, pre-existing
- [x] [Review][Defer] getOptionalMemberWorkspace returns first membership — multi-workspace users limited to first workspace's modules. Pre-existing auth pattern. [requireAuth.ts] — deferred, pre-existing
- [x] [Review][Defer] Empty string name renders empty heading — schema has no min length on `name`. Pre-existing schema issue. [schema.ts] — deferred, pre-existing

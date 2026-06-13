# State Management — Frontend (Next.js)

## Overview

The frontend uses **no third-party state library** (no Redux, Zustand, MobX, or Jotai). Instead, it relies on Convex's built-in reactivity for server state and React primitives for UI state.

---

## State Layer Architecture

### 1. Server State: Convex Reactive Queries

**Primary mechanism.** All data flows: Convex → `useQuery` → render. Convex handles cache invalidation and pushes real-time updates.

```tsx
const workspace = useQuery(api.workspaces.queries.getWorkspaceForUser, {});
const projects = useQuery(api.projects.queries.getProjects, { status: "active" });
```

**Conditional queries** use the `"skip"` pattern to avoid fetching when prerequisites aren't met:

```tsx
const project = useQuery(api.projects.queries.getProject, 
  projectId ? { projectId } : "skip"
);
```

**Key principle:** Server state never lives in React state. Mutations trigger automatic refetch via Convex's reactivity.

### 2. UI State: React `useState`

Reserved strictly for ephemeral UI concerns:
- Active tabs
- Search terms
- Loading flags
- Error messages
- Modal/dialog visibility
- Form submission states

### 3. Form State: react-hook-form + zod

All forms use `useForm` with `zodResolver`. Form schemas are defined in `src/lib/schemas.ts` and share validation constraints with the Convex backend via `convex/lib/constraints.ts`.

**Multi-section pages** (settings, onboarding) use the `FormProvider` pattern:
- Parent owns `useForm` and wraps with `<FormProvider>`
- Child components (like `AIConfigForm`) use `useFormContext`

### 4. Auth Session: Better Auth `useSession()`

Provided by `src/lib/auth-client.ts` via `createAuthClient` with `convexClient()` plugin.

```tsx
const { data: session, isPending } = useSession();
```

The `ConvexBetterAuthProvider` in `src/components/ConvexClientProvider.tsx` bridges the Better Auth session to the Convex React client, enabling server-side auth checks on all queries/mutations.

### 5. Context (Minimal)

Only one context exists:
- **`ConvexBetterAuthProvider`** (`ConvexClientProvider.tsx`) — bridges Better Auth → Convex. No other React Context usage.

### 6. Global Error Handlers

`src/lib/error-logger.ts` provides:
- `useErrorLogger()` — returns a `logError` function that sends errors to `api.logs.mutations.logError`
- `initGlobalErrorHandlers()` — sets up `window.onerror` and `unhandledrejection` handlers
- `setGlobalErrorLogger(fn)` — allows components to override the logger

Called once in the auth layout mount.

---

## State Flow Diagram

```
┌───────────────────────────────────────────────────────┐
│  Better Auth (useSession)                             │
│  └─ Auth state: user, isLoggedIn                     │
│     └─ ConvexBetterAuthProvider                      │
│        └─ Convex Client (token passthrough)          │
│           └─ useQuery(api.*)                         │
│              └─ Server state (reactive)              │
│                 └─ React render                      │
│                                                      │
│  useState                                            │
│  └─ UI state: tabs, search, modals, loading, errors  │
│                                                      │
│  react-hook-form + zod                               │
│  └─ Form state: validation, submission, reset        │
│                                                      │
│  Global error handlers                               │
│  └─ window.onerror + unhandledrejection              │
│     └─ api.logs.mutations.logError                   │
└───────────────────────────────────────────────────────┘
```

---

## Conventions

- **Never** store server data in `useState` — use `useQuery` directly
- **Never** inline auth checks — use `requireAuth(ctx)` on Convex side, `useSession()` on client
- **Always** use the `"skip"` pattern for conditional Convex queries
- **Always** validate forms with zod schemas from `src/lib/schemas.ts`
- **Always** call `logError()` in try/catch blocks in UI code

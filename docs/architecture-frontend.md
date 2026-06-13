# Architecture — Frontend (Next.js)

## Executive Summary

The frontend is a **Next.js 16 App Router** application using React 19 with Tailwind CSS v4. It communicates exclusively with the Convex backend via reactive queries, mutations, and actions. Authentication is handled by Better Auth (email/password + Google OAuth), bridged to Convex via `ConvexBetterAuthProvider`.

## Technology Stack

| Category | Technology | Version |
|---|---|---|
| Framework | Next.js (App Router) | 16.2.6 |
| UI Library | React | 19.2.4 |
| Language | TypeScript | 5.x |
| Styling | Tailwind CSS v4 (PostCSS) | 4.x |
| Forms | react-hook-form + zod | 7.76 / 4.4.3 |
| Charts | recharts | 3.8.1 |
| Notifications | sonner | 2.0.7 |
| Auth | Better Auth | 1.6.11 |
| Backend Client | Convex | 1.39.1 |
| Testing | vitest + @testing-library/react + jsdom | 4.1.7 / 16 / 29 |
| Package Manager | pnpm | 10.33.2 |

## Architecture Pattern

**Component-Based + Convex Reactive.** The frontend follows Next.js App Router conventions with:
- Server Components for layout shells and redirects
- Client Components for interactive pages (all pages use `"use client"` for Convex hooks)
- Convex reactive queries as the primary data layer
- No traditional REST client — all data flows through Convex's type-safe API

## Component Overview

54 component files organized into:
- **11 UI Primitives** (`ui/`) — design system (Button, Input, Card, StatusPill, etc.)
- **3 Layout Components** — `AppLayout` (sidebar + topbar), `Breadcrumbs`, `Topbar`
- **16 Domain Components** — `AIConfigForm`, `RunsList`, `TestChat`, `TaskTray`, etc.
- **5 Dashboard** — `StatsGrid`, `PassRateChart`, `RecentFailures`, `ActiveRuns`
- **8 Run Detail** — `TestList`, `StepTimeline`, `ScreenshotViewer`, `ArtifactViewer`, etc.
- **6 Flakiness Map** — `HeatmapGrid`, `FilterBar`, `ClusterAnnotations`, `SparklineChart`, etc.
- **22 Page Components** — routes for login, dashboard, runs, projects, suites, settings, etc.

See [UI Component Inventory](./ui-component-inventory-frontend.md) for full catalog.

## Routing Architecture

Three-layer auth gate:
1. **Edge proxy** (`src/proxy.ts`): Cookie-only check → redirects unauthenticated to `/login`
2. **Auth layout** (`src/app/(auth)/layout.tsx`): Convex query-based workspace/onboarding routing
3. **Login page**: Uses `useSession()` for redirecting already-logged-in users to `/dashboard`

Route groups:
- `(public)/` — login/signup (no auth required)
- `(auth)/` — all authenticated pages (22 routes), wrapped in `<AppLayout>`
- Onboarding is sidebarless (listed in `SIDEBARLESS_ROUTES`)

## State Management

No third-party state library. Instead:
- **Convex reactive queries** → server state (real-time, auto-updating)
- **React `useState`** → UI state (tabs, search, modals, loading)
- **react-hook-form + zod** → form state (all forms)
- **Better Auth `useSession()`** → auth session
- **Single React Context** → `ConvexBetterAuthProvider` (bridges auth to Convex)

See [State Management](./state-management-frontend.md) for details.

## Data Models

All data models originate from Convex's schema (18 tables). The frontend uses `FunctionReturnType<typeof api.*>` to derive shaped types from query returns — never manual type definitions. Form input types are zod-inferred from schemas in `src/lib/schemas.ts`.

See [Data Models — Frontend](./data-models-frontend.md) for details.

## API Design

The frontend calls ~70 Convex functions across 12 modules:
- **Queries**: ~30 reactive read functions (auto-update on DB changes)
- **Mutations**: ~30 write functions (called imperatively)
- **Actions**: ~10 async functions (AI generation, file uploads)

Plus one HTTP route handler (`/api/auth/[...all]`) for Better Auth callbacks.

See [API Contracts — Frontend](./api-contracts-frontend.md) for full registry.

## Testing Strategy

- **Runner**: vitest with jsdom
- **Component testing**: `@testing-library/react` + `@testing-library/user-event`
- **Test files**: alongside source files (`src/**/*.test.{ts,tsx}`)
- **Setup**: `src/test/setup.ts` auto-loads DOM matchers
- **Coverage target**: 80%+

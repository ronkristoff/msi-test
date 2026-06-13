# Data Models — Frontend (Next.js)

## Overview

All data model types come from **`convex/_generated/dataModel.ts`** (auto-generated from `convex/schema.ts`). The frontend re-exports via `src/lib/convex.ts`:

```ts
export { api } from "../../convex/_generated/api";
export type { Doc, Id } from "../../convex/_generated/dataModel";
```

The frontend uses **`FunctionReturnType<typeof api.module.function>`** to derive shaped types from Convex query return types — never manual type definitions for server data.

---

## Key Frontend Types

### Core Convex Types

| Type | Source | Description |
|---|---|---|
| `Doc<"workspaces">` | `convex/_generated/dataModel` | Workspace document |
| `Doc<"projects">` | `convex/_generated/dataModel` | Project document |
| `Doc<"suites">` | `convex/_generated/dataModel` | Suite document |
| `Doc<"tests">` | `convex/_generated/dataModel` | Test document |
| `Doc<"runs">` | `convex/_generated/dataModel` | Run document |
| `Id<"tableName">` | `convex/_generated/dataModel` | Branded string ID |

### Domain Types (`src/lib/`)

| Type | File | Derivation |
|---|---|---|
| `WorkspaceMasked` | `src/lib/types.ts` | `Omit<Doc<"workspaces">, "ai_config">` with `api_key_masked` |
| `DashboardStats` | `src/lib/dashboard-types.ts` | `FunctionReturnType<typeof api.dashboard.queries.getDashboardStats>` |
| `ActiveRun` | `src/lib/dashboard-types.ts` | `FunctionReturnType<...getActiveRuns>[number]` |
| `RunResultItem` | `src/lib/run-detail-types.ts` | `RunDetail["results"][number]` |
| `StepItem` | `src/lib/run-detail-types.ts` | `RunResultItem["steps"][number]` |
| `RunEnvironment` | `src/lib/run-detail-types.ts` | `RunDetail["environment"]` |
| `StatusVariant` | `src/lib/run-status.ts` | `"success" \| "danger" \| "warn" \| "neutral" \| "running"` |
| `FlakinessLevel` | `src/lib/flakiness-colors.ts` | `"Stable" \| "Low" \| "Moderate" \| "High" \| "Critical"` |
| `BreadcrumbItem` | `src/lib/use-breadcrumbs.ts` | `{ label: string; href?: string }` |
| `PresetConfig` | `src/lib/ai-presets.ts` | `{ label, url, model, models[], fastModel }` |
| `SOURCE_TYPE_LABELS` | `src/lib/source-types.ts` | `Record<"manual" \| "url_exploration" \| "prd" \| "natural_language", string>` |

### Form Types (zod-inferred from `src/lib/schemas.ts`)

| Type | Schema | Purpose |
|---|---|---|
| `LoginValues` | `loginFormSchema` | Login/signup form |
| `SignupValues` | `signupSchema` | Signup form |
| `AIConfigFormValues` | `aiConfigSchema` | AI provider configuration |
| `WorkspaceSettingsValues` | `workspaceSettingsSchema` | Workspace name + invite code |
| `AccountValues` | `accountSchema` | User name + password change |
| `ProjectBaseValues` | `projectBaseSchema` | Project create/update |
| `EnvironmentValues` | `environmentSchema` | Environment create/update |
| `ExploreAuthValues` | `exploreAuthSchema` | Exploration auth config |
| `TestDataValues` | `testDataSchema` | Test data key-value pairs |
| `ScheduleValues` | `scheduleSchema` | Schedule create/update |

---

## Patterns

- **Form schemas** import validation constraints from `convex/lib/constraints.ts` (NAME_MIN, NAME_MAX, PASSWORD_MIN, etc.) — single source of truth shared between frontend zod and backend Convex validators
- **Server data** never lives in React state — Convex `useQuery` provides real-time reactive data
- **Mutations** optimistically update via Convex's built-in reactivity — no manual cache invalidation
- **API key masking** — the frontend receives `api_key_masked` (format: `key***last4`) never the raw key
- **Auth tokens** passed to Convex via `ConvexBetterAuthProvider` wrapper in `ConvexClientProvider.tsx`

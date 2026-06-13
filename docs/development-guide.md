# Development Guide

## Prerequisites

- **Node.js** 20+ (required by Next.js 16)
- **pnpm** 10.33.2 (enforced via `packageManager` in `package.json`)
- **Convex account** — for backend deployment (local dev uses `npx convex dev`)

## Quick Start

```bash
# Install dependencies
pnpm install

# Start all services (Convex + Next.js + Runner)
pnpm dev
```

This runs three processes concurrently:
- `npx convex dev` — Convex backend (local dev server on `127.0.0.1:3210`)
- `next dev --turbopack` — Next.js frontend (localhost:3000)
- `npx tsx runner/src/index.ts` — Runner process (Playwright execution engine)

## Individual Services

```bash
pnpm dev:next       # Next.js only
pnpm dev:convex     # Convex only
pnpm dev:runner     # Runner only (requires Convex running)
```

## Environment Setup

Configure `.env.local`:

```env
# Convex deployment (local dev)
CONVEX_DEPLOYMENT=local:local-ron_reyes-msi_test

# Convex URLs (for Next.js client)
NEXT_PUBLIC_CONVEX_URL=http://127.0.0.1:3212
NEXT_PUBLIC_CONVEX_SITE_URL=http://127.0.0.1:3213

# Site URL (for auth callbacks)
NEXT_PUBLIC_SITE_URL=http://localhost:3000

# Shared secret for Runner ↔ Convex communication
RUNNER_SECRET=some-secret-value

# Optional: Browserbase (lightweight server-side browser tasks)
# BROWSERBASE_API_KEY=your-key
# BROWSERBASE_PROJECT_ID=your-project
# MODEL_API_KEY=your-llm-key
```

## Build

```bash
pnpm build       # Next.js production build only
```

Convex functions are auto-deployed to the cloud on `npx convex dev` — no separate build step needed.

## Testing

```bash
pnpm test              # Frontend tests (vitest, jsdom)
pnpm test:convex       # Convex backend tests (vitest, edge-runtime)
pnpm test:all          # All tests (frontend + convex + runner)
```

### Test File Conventions

| Layer | Pattern | Environment |
|---|---|---|
| Frontend | `src/**/*.test.{ts,tsx}` | jsdom |
| Backend | `convex/**/*.test.ts` | edge-runtime |
| Runner | `runner/**/*.test.ts` | node |

### Test Setup

- Frontend: `src/test/setup.ts` auto-loads `@testing-library/jest-dom/vitest`
- Backend: Uses `convex-test` with `import.meta.glob` module map pattern (see `convex/_generated/ai/guidelines.md`)
- Shared seed helpers: `convex/testHelpers.ts` provides `seedWorkspace`, `seedProject`, `seedSuite`, `seedTestDoc`, `seedFullStack`

## Linting

```bash
pnpm lint       # ESLint (next/core-web-vitals + typescript)
```

## Project Structure Guidelines

- **Small files**: 200–400 lines typical, 800 max
- **Domain organization**: Group by feature (workspaces/, projects/, suites/) not by type
- **New Convex directories** may require `pnpm dev` restart to be detected by the file watcher
- **Never edit** `convex/_generated/` — it's auto-generated

## Common Development Tasks

### Adding a new Convex function

1. Create the function in the appropriate domain directory (e.g., `convex/suites/queries.ts`)
2. Use validators from `convex/lib/validation.ts`
3. Add auth protection: `requireAuth(ctx)` for mutations, `getOptionalOwnedEntity(ctx, id, table)` for queries
4. The function is auto-registered — no manual import needed

### Adding a new page

1. Create a directory under `src/app/(auth)/` with `page.tsx`
2. The auth layout automatically wraps with `<AppLayout>`
3. Add to `SIDEBARLESS_ROUTES` if sidebar should be hidden (e.g., onboarding)
4. Use `useQuery(api.*)` for data, `useMutation(api.*)` for writes

### Adding a new form

1. Add zod schema to `src/lib/schemas.ts`
2. Import validation constants from `convex/lib/constraints.ts` (if needed)
3. Use `useForm` with `zodResolver` from `@hookform/resolvers/zod`

### Working with AI

- AI functions live in `convex/ai/`
- API keys and model config stored per-workspace in `workspaces.ai_config`
- `model.ts` provides `getWorkspaceModel()` for creating OpenAI-compatible model instances
- Agents created via `createTestGenerationAgent()`, `createHealingAgent()`, etc. in `agents.ts`
- Rate limit: 5 retries with 1.5s delay (`ai/aiRateLimit.ts`)

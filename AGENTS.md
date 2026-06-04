<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->

## MSITest — Agent Quick Reference

Two-process system: **Next.js 16 frontend** (`src/`) + **Convex backend** (`convex/`) + **Runner** (`runner/`). Convex is the source of truth for all state; the Runner is a stateless Playwright execution engine.

### Commands

- `pnpm dev` — starts both Convex and Next.js via `concurrently` (the only command you need for local dev)
- `pnpm dev:next` / `pnpm dev:convex` — run each process individually
- `pnpm build` — Next.js production build only
- `pnpm lint` — ESLint (next/core-web-vitals + typescript)
- `pnpm test` — vitest (frontend: `src/**/*.test.{ts,tsx}`)
- `pnpm test:convex` — vitest with edge-runtime (backend: `convex/**/*.test.ts`)
- `pnpm test:all` — runs both frontend and convex tests

### Architecture

- **Frontend**: Next.js App Router, Tailwind v4, React 19. Path alias `@/*` → `./src/*`
- **Backend**: Convex (database, functions, file storage, real-time subscriptions, AI via `@convex-dev/agent`)
- **Runner**: Separate Node.js process under `runner/`. Subscribes to Convex for pending work, writes results back. Never calls AI directly — API keys stay in Convex only
- **Auth**: Better Auth (email/password + Google OAuth)

### Key Files

- `CONTEXT.md` — domain glossary and data hierarchy
- `docs/PRD.md` — full product spec with schema, API surface, and module descriptions
- `docs/adr/` — architectural decision records
- `convex/_generated/` — auto-generated Convex API types; **never edit**
- `convex/_generated/ai/guidelines.md` — Convex API rules (validators, function registration, query patterns, etc.)
- `convex/lib/requireAuth.ts` — shared auth helper; use `requireAuth(ctx)` for mutations, `getOptionalOwnedEntity(ctx, id, table)` for queries
- `convex/lib/validation.ts` — shared validators (workspace name, URL, required fields, API key masking)
- `convex/lib/constraints.ts` — single source of truth for validation constants (name limits, password length, URL helpers); both frontend zod schemas and backend validators import from here
- `convex/testHelpers.ts` — shared test seed functions (`seedWorkspace`, `seedProject`, `seedSuite`, `seedTestDoc`, `seedFullStack`); use in all Convex test files
- `convex/workspaces/queries.ts` — workspace read queries + `hasWorkspace` for routing decisions
- `convex/workspaces/mutations.ts` — workspace create/update mutations
- `convex/users/mutations.ts` — user profile mutations (name, password)
- `src/components/AIConfigForm.tsx` — shared AI config form (uses `useFormContext`, parent must wrap in `FormProvider`)
- `src/components/Logo.tsx` — shared logo SVG component
- `src/components/AppLayout.tsx` — sidebar + topbar layout; nav items in `NAV_SECTIONS`
- `src/components/ui/` — reusable UI primitives (Button, StatusPill, FormField, Alert, Topbar, StatCard, EmptyState)
- `src/lib/ai-presets.ts` — AI provider preset and model data
- `src/lib/schemas.ts` — zod validation schemas for all forms

### Conventions

- Package manager: **pnpm** (v10, enforced via `packageManager` in package.json)
- Convex functions live in `convex/` with their own `tsconfig.json` (excludes `_generated`)
- Convex actions needing Node built-ins must use `"use node";` at file top — but never in files that also export queries or mutations
- Tailwind v4 via `@tailwindcss/postcss` plugin (not the classic `tailwind.config.*` file)
- Convex local dev runs on `127.0.0.1:3210` (see `.env.local`)

#### Backend Module Organization

- Convex functions organized by domain (`workspaces/`, `users/`, `logs/`), then by read/write (`queries.ts`, `mutations.ts`)
- Shared utilities in `convex/lib/` — `requireAuth.ts` for auth, `validation.ts` for input validation and masking, `constraints.ts` for shared validation constants
- Every protected mutation uses `requireAuth(ctx)` from `convex/lib/requireAuth.ts` — never inline the auth check
- Every public query uses `getOptionalOwnedEntity(ctx, id, table)` for single-entity lookups, or `getOptionalOwnedWorkspace(ctx)` for collection queries — never inline the ownership check
- Use `Doc<"tableName">` from `src/lib/convex` for frontend types — never manual type definitions
- API key masking uses `maskApiKey()` from `convex/lib/validation.ts`, not inline in query handlers

#### Auth Routing

- **Three-layer auth gate** — each layer has ONE responsibility:
  1. `src/proxy.ts` (edge): Cookie-only check → redirects to `/login` if no session cookie. **Only layer that redirects to `/login`.**
  2. `src/app/(auth)/layout.tsx` (client): Convex query-based workspace routing → only handles workspace/onboarding redirects, **never redirects to `/login`**
  3. Login page: Uses `useSession()` for already-logged-in redirect → navigates directly to `/dashboard`
- After successful login/signup, navigate directly to `/dashboard` — never to `/` (causes redirect loop)
- After sign-out, navigate to `/login` immediately in the same handler (before Convex queries fire without auth)
- Onboarding is sidebarless (listed in `SIDEBARLESS_ROUTES` in the auth layout)
- Use the `"skip"` pattern for conditional Convex queries: `useQuery(api.foo.bar, condition ? {} : "skip")`

#### Shared Components

- AI config UI uses `AIConfigForm` with mode props (`showPresets`, `showModelDropdown`, `maskedKey`)
- `AIConfigForm` uses `useFormContext<AIConfigFormValues>` — parent must own `useForm` and wrap with `<FormProvider>`
- Logo uses `Logo` component from `src/components/Logo.tsx`
- Provider presets imported from `src/lib/ai-presets.ts`

#### Forms

- All forms use **react-hook-form** with **zod** validation via `@hookform/resolvers/zod`
- Schemas live in `src/lib/schemas.ts` — add new form schemas there
- Never use raw `useState` + manual validation for forms — use `useForm` with `zodResolver`
- For multi-section pages (e.g. settings), use separate `useForm` instances per section
- For embedded sub-forms (e.g. `AIConfigForm`), parent owns `useForm` and child uses `useFormContext`

### Convex Testing

Use `convex-test` with `vitest` and `@edge-runtime/vm`. Test files live inside `convex/`. Requires `import.meta.glob` module map pattern — see `convex/_generated/ai/guidelines.md` for the exact setup.

Shared seed functions live in `convex/testHelpers.ts`. Import `seedWorkspace`, `seedProject`, `seedSuite`, `seedTestDoc`, or `seedFullStack` instead of defining local seed functions.

## Coding Guidelines

These rules override generic preferences. Read before any implementation work. For full context, see the `karpathy-guidelines` skill.

### 1. Think Before Coding

Don't assume. Don't hide confusion. Surface tradeoffs. If something is unclear or multiple interpretations exist, stop and ask before implementing.

### 2. Simplicity First

Minimum code that solves the problem. Nothing speculative. No abstractions until there's real repetition. Push back on over-engineering.

### 3. Surgical Changes

Touch only what you must. Clean up only your own mess. Don't refactor unrelated code. Prefer targeted edits over rewriting.

### 4. Verify

Define success criteria before starting. Loop until verified. If acceptance criteria aren't met after implementation, the task isn't done.

### 5. Immutability

Always create new objects — never mutate existing ones. Return new copies with changes applied. Prefer `{...obj, field: newValue}` over `obj.field = newValue`. This prevents stale-reference bugs in React state and Convex mutations.

### 6. File Organization

Many small files over few large ones. 200–400 lines typical, 800 max. Organize by feature/domain, not by type. High cohesion, low coupling. A file should do one thing well.

### 7. Error Handling

Handle errors at every level. Provide user-friendly messages in UI code. Log detailed context server-side. Never silently swallow errors. Convex functions should throw `ConvexError` with meaningful messages.

### 8. Input Validation

Validate all user input at system boundaries. Use Convex `v.` validators on every function's `args`. Fail fast with clear messages. Never trust external data.

### Code Quality Checklist

Before submitting any code:
- Functions small (<50 lines), files focused (<800 lines)
- No deep nesting (>4 levels)
- Proper error handling, no hardcoded values
- Readable, well-named identifiers
- Immutability enforced — no direct mutation

## Security

**Before ANY commit, verify:**
- No hardcoded secrets (API keys, passwords, tokens)
- All user inputs validated (Convex validators on every function)
- XSS prevention (sanitized HTML, no `dangerouslySetInnerHTML` with untrusted input)
- CSRF protection enabled (Better Auth handles this)
- Authentication/authorization verified on protected routes
- Rate limiting on all public endpoints
- Error messages don't leak sensitive data (stack traces, internal IDs)

**Secret management:** NEVER hardcode secrets. Use environment variables or a secret manager. Validate required secrets at startup. Rotate any exposed secrets immediately.

**If a security issue is found:** STOP → use security-reviewer agent → fix CRITICAL issues → rotate exposed secrets → review codebase for similar issues.

### React 19 Strict Rules

- `router.push()` / `router.replace()` must be inside `useEffect` or event handlers — **never in the render body**. React 19 forbids calling setState on other components during render.
- `forwardRef` components must destructure overridden props before `{...props}` spread: `({ type, ...props })` then `<input type={computed} {...props} />`. Otherwise the spread silently overwrites your computed value.

### Convex Schema Rules

- Index names cannot be `by_creation_time` or `by_id` — these are reserved by Convex
- `_creationTime` is auto-appended to every index — never add it explicitly as an index field
- New directories under `convex/` may require `pnpm dev` restart to be detected by the file watcher

### Error Logging

- `src/lib/error-logger.ts` provides `useErrorLogger()` hook + `initGlobalErrorHandlers()` for global `onerror`/`unhandledrejection`
- `convex/logs/mutations.ts` — `logError` mutation (public, no auth required). Truncates strings to prevent oversized documents.
- Call `setGlobalErrorLogger(logError)` and `initGlobalErrorHandlers()` once in root layout mount
- All `try/catch` blocks in UI code should call `logError()` with context

### Form Schema Patterns

- For forms that switch modes (e.g. login vs signup), don't use `useForm<A | B>` union types with `zodResolver` — TypeScript resolver mismatch
- Instead: type the form as the superset type (signup). Define a base schema with relaxed validation for mode-specific fields (`z.string()` without `.min()`). Switch resolver between schemas.

### Known Tech Debt

- `___KEEP___` sentinel value in `updateWorkspace` mutation — should be replaced with optional `api_key` field (absent = keep existing)
- Test infrastructure installed with shared seed helpers in `convex/testHelpers.ts` — coverage still minimal but foundation is in place
- All 11 planned schema tables exist in `convex/schema.ts`
- Dashboard, Runs, Flakiness Map, Suites, Insights pages are placeholder empty states — need backend queries when schema tables are added
- Settings danger zone "Delete workspace" button is disabled — needs backend mutation
- No `max_tokens` field in workspace schema yet — needs schema migration

## Agent Orchestration

Delegate to specialized agents proactively without waiting for user prompt:

- Complex feature request → **planner** agent
- Bug fix or new feature → **tdd-guide** agent (write tests FIRST)
- Code just written or modified → **code-reviewer** agent
- Security-sensitive code → **security-reviewer** agent
- Build/type errors → **build-error-resolver** agent

Use parallel execution for independent operations.

## Testing Requirements

**Minimum coverage: 80%**

Test types (all required):
1. **Unit tests** — Individual functions, utilities, components
2. **Integration tests** — Convex mutations/queries with `convex-test`
3. **Component tests** — React components with `@testing-library/react`

**TDD workflow (HARD RULE — not optional):**
1. Write test first (RED) — test MUST fail
2. Write minimal implementation (GREEN) — test passes
3. Refactor (IMPROVE) — verify coverage stays 80%+

NEVER write implementation code before a test exists for it. The only exception is when no test infrastructure exists for that layer yet — in that case, set up the infrastructure first, then write tests before implementation.

### Frontend Testing

- Test runner: `vitest` with `jsdom` environment
- Component testing: `@testing-library/react` + `@testing-library/user-event`
- DOM matchers: `@testing-library/jest-dom/vitest` (auto-loaded via `src/test/setup.ts`)
- Test files: `src/**/*.test.{ts,tsx}` alongside the source file
- Config: `vitest.config.ts` at project root

### Backend Testing

- Test runner: `vitest` with `edge-runtime` environment
- Convex testing: `convex-test` with `import.meta.glob` module map pattern
- Test files: `convex/**/*.test.ts` inside the `convex/` directory
- Config: `convex/vitest.config.ts`
- See `convex/_generated/ai/guidelines.md` for the exact `convexTest` setup

## Development Workflow

1. **Plan** — Use planner agent for complex features. Identify dependencies and risks. Break into phases.
2. **TDD** — Use tdd-guide agent. Write tests first, implement, refactor. No exceptions.
3. **Review** — Use code-reviewer agent immediately after writing code. Address CRITICAL/HIGH issues.
4. **Commit** — Conventional commits format (see Git Conventions below).

## Git Conventions

**Commit format:** `<type>: <description>`

Types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `ci`

**PR workflow:** Analyze full commit history → draft comprehensive summary → include test plan → push with `-u` flag.

## Agent skills

### Issue tracker

Issues and PRDs live as markdown files in `docs/issues/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default triage label vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context repo. Read `CONTEXT.md` at root + `docs/adr/` for architectural decisions. See `docs/agents/domain.md`.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, invoke the `skill` tool with `skill: "graphify"` before doing anything else.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

### Available Commands

| Command | Description |
|---------|-------------|
| `/graphify` | Full pipeline on current directory |
| `/graphify <path>` | Full pipeline on specific path |
| `/graphify <path> --update` | Incremental — only changed files (uses cache) |
| `/graphify query "<question>"` | BFS traversal — broad context, nearest neighbors first |
| `/graphify query "<question>" --dfs` | DFS — trace a specific chain or dependency path |
| `/graphify path "A" "B"` | Shortest path between two concepts |
| `/graphify explain "Concept"` | Plain-language explanation of a single node |
| `/graphify --cluster-only` | Re-cluster existing graph (no re-extraction) |
| `/graphify <path> --mode deep` | Thorough extraction with richer INFERRED edges |

### Key Files

| File | Purpose |
|------|---------|
| `graphify-out/graph.json` | Raw graph data (2,080 nodes, 3,707 edges, 196 communities) |
| `graphify-out/graph.html` | Interactive HTML visualization — open in any browser |
| `graphify-out/GRAPH_REPORT.md` | Audit report with god nodes, surprising connections, suggested questions |
| `graphify-out/cost.json` | Cumulative token cost tracker across runs |
| `graphify-out/.cache/` | Extraction cache — skip unchanged files on `--update` |
| `graphify-out/.manifest.json` | File hashes for incremental update detection |

### Workflow for opencode Agents

- **Before answering codebase architecture questions** — query the graph first: `graphify query "<question>"`. This returns a scoped subgraph (~9K tokens) instead of reading raw files (~285K tokens).
- **After writing/modifying code files** — run `graphify update .` to rebuild. Code-only changes trigger AST extraction only (no LLM cost, no tokens). The graph and HTML update automatically.
- **After writing/modifying docs or images** — run `graphify --update`. Semantic re-extraction is required for non-code files (costs tokens). Only changed files are re-extracted thanks to the cache.
- **When onboarding or exploring unfamiliar code** — open `graphify-out/graph.html` in a browser for the interactive visualization, or read `GRAPH_REPORT.md` for the god nodes and surprising connections.

### Troubleshooting

- **Graph seems stale or missing connections** — run a full `/graphify` rebuild (no `--update`). This re-extracts everything from scratch.
- **`graphify update` says nothing changed** — the manifest tracks file hashes. If you want to force re-extraction, delete `graphify-out/.cache/` and `graphify-out/.manifest.json`, then run `/graphify --update`.
- **HTML viz won't load** — check that `graphify-out/graph.json` exists and is valid JSON. If empty or corrupt, rebuild with `/graphify`.
- **Chunk extraction failures** — if semantic extraction skips chunks (printed warnings), the graph will be incomplete. Re-run `/graphify` to retry.

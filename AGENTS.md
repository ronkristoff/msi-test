<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working with Convex code, **always read
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
- No `test` or `typecheck` script yet

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
- `convex/lib/requireAuth.ts` — shared auth helper; use `requireAuth(ctx)` instead of manual auth checks
- `convex/lib/validation.ts` — shared validators (workspace name, URL, required fields, API key masking)
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

- Convex functions organized by domain (`workspaces/`, `users/`), then by read/write (`queries.ts`, `mutations.ts`)
- Shared utilities in `convex/lib/` — `requireAuth.ts` for auth, `validation.ts` for input validation and masking
- Every protected mutation uses `requireAuth(ctx)` from `convex/lib/requireAuth.ts` — never inline the auth check
- Use `Doc<"tableName">` from `src/lib/convex` for frontend types — never manual type definitions
- API key masking uses `maskApiKey()` from `convex/lib/validation.ts`, not inline in query handlers

#### Auth Routing

- `src/proxy.ts` handles unauthenticated redirect to `/login` (edge middleware, cannot query Convex)
- `src/app/(auth)/layout.tsx` handles client-side routing: no session → `/login`, no workspace → `/onboarding`, workspace exists → continue
- After login, the `hasWorkspace` query determines redirect target (`/onboarding` or `/dashboard`)
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

### Known Tech Debt

- `___KEEP___` sentinel value in `updateWorkspace` mutation — should be replaced with optional `api_key` field (absent = keep existing)
- No test infrastructure yet (`convex-test`, `vitest` not installed)
- Only 1 of 11 planned schema tables exists
- Dashboard, Runs, Flakiness Map, Suites, Insights pages are placeholder empty states — need backend queries when schema tables are added
- Settings danger zone "Delete workspace" button is disabled — needs backend mutation
- No `max_tokens` field in workspace schema yet — needs schema migration

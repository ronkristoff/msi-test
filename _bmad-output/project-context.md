---
project_name: 'msi-test'
user_name: 'msi'
date: '2026-06-13'
sections_completed: ['technology_stack', 'language_rules', 'framework_rules', 'testing_rules', 'code_quality', 'workflow_rules', 'critical_rules']
existing_patterns_found: 30
status: 'complete'
rule_count: 43
optimized_for_llm: true
---

# Project Context for AI Agents

_This file contains critical rules and patterns that AI agents must follow when implementing code in this project. Focus on unobvious details that agents might otherwise miss._

---

## Technology Stack & Versions

| Layer | Technology | Version |
|-------|-----------|---------|
| Frontend | Next.js (App Router, Turbopack) | 16.2.6 |
| React | React 19 | 19.2.4 |
| Styling | Tailwind CSS v4 (`@tailwindcss/postcss`) | ^4 |
| Forms | react-hook-form + zod v4 + @hookform/resolvers | ^7.76 / ^4.4 |
| Backend | Convex | ^1.39.1 |
| AI Agent | `@convex-dev/agent` + Vercel AI SDK (`ai`, `@ai-sdk/openai`) | ^0.6.1 / ^6.0 |
| Auth | Better Auth via `@convex-dev/better-auth` | ~1.6.11 / ^0.12.2 |
| Browser | Stagehand (`@browserbasehq/stagehand`) + Playwright | ^3.4 / ^1.60 |
| File Parsing | mammoth (.docx), pdf-parse (.pdf) | ^1.12 / 1.1.4 |
| Testing (FE) | vitest (jsdom) + @testing-library/react + @testing-library/user-event | ^4.1.7 |
| Testing (Convex) | vitest (edge-runtime) + convex-test | ^4.1.7 / ^0.0.53 |
| Package Manager | pnpm (enforced via `packageManager` in package.json) | 10.33.2 |
| TypeScript | Strict mode in both frontend and Convex tsconfigs | ^5 |

**Critical Version Notes:**
- Next.js 16 has breaking changes from training data — always read `node_modules/next/dist/docs/` before writing code
- Tailwind v4 uses `@tailwindcss/postcss` plugin, NOT `tailwind.config.*`
- zod v4 has different API from v3 (import from `"zod"`, not `"zod/v4"`)
- React 19 forbids calling `setState` on other components during render

## Critical Implementation Rules

### Language-Specific Rules

- **Strict TypeScript everywhere** — both frontend and Convex tsconfigs use `strict: true`. No `any` escapes.
- **Path alias**: `@/*` → `./src/*` in frontend only. Convex code uses relative imports.
- **Convex error handling**: Always throw `ConvexError` from `"convex/values"`, never raw `Error`. Use structured payloads for AI errors: `new ConvexError({ type: "ai_error", code: "invalid_api_key", message: "..." })`.
- **"use node" isolation**: Files importing Node built-ins need `"use node";` at top. These files CANNOT export queries or mutations — only actions. Use internal mutations via `ctx.runMutation()` for DB writes from "use node" files.
- **Immutability**: Always return new objects (`{...obj, field: newValue}`). Never mutate existing objects. Prevents stale-reference bugs in React state and Convex.
- **No comments in code** unless explicitly requested.

### Framework-Specific Rules

**Next.js / React**
- **Auth gate layers**: Edge (`src/proxy.ts`) → client layout (`(auth)/layout.tsx`) → login page. Only the edge layer redirects to `/login`.
- **Post-login navigation**: Go to `/dashboard`, never `/`. After sign-out, navigate to `/login` immediately before Convex queries fire.
- **Conditional queries**: Use `"skip"` pattern: `useQuery(api.foo.bar, condition ? {} : "skip")`.
- **React 19 render rule**: `router.push()`/`router.replace()` MUST be in `useEffect` or event handlers, never in render body.
- **forwardRef components**: Destructure overridden props before spread: `({ type, ...props })` then `<input type={computed} {...props} />`.

**Convex Backend**
- **Function organization**: Domain dirs (`workspaces/`, `knowledge/`) → type files (`queries.ts`, `mutations.ts`, `internal.ts`). Shared utils in `convex/lib/`.
- **Auth on mutations**: Always `requireAuth(ctx)` from `convex/lib/requireAuth.ts`. Never inline auth checks.
- **Ownership on queries**: Always `getOptionalOwnedEntity(ctx, id, table)` for single lookups, `getOptionalMemberWorkspace(ctx)` for collections. Never inline.
- **Validation constants**: `convex/lib/constraints.ts` is single source of truth. Frontend zod schemas and backend validators both import from here.
- **Reserved index names**: Never use `by_creation_time` or `by_id`. `_creationTime` is auto-appended.
- **New Convex dirs**: May need `pnpm dev` restart for file watcher detection.

**Forms**
- All forms use `react-hook-form` + `zod` via `@hookform/resolvers/zod`. Schemas in `src/lib/schemas.ts`.
- `AIConfigForm` uses `useFormContext` — parent must own `useForm` and wrap `<FormProvider>`.
- Multi-mode forms: type as superset, don't use union types with `zodResolver`.

### Testing Rules

- **Three test layers**: Frontend (`pnpm test`, jsdom), Convex (`pnpm test:convex`, edge-runtime), Runner (`pnpm test:all` runs all).
- **Frontend tests**: `src/**/*.test.{ts,tsx}` colocated with source. Uses `@testing-library/react` + `@testing-library/user-event`.
- **Convex tests**: `convex/**/*.test.ts` at `convex/` root (not in subdirs). Uses `convex-test` with `import.meta.glob` module map. See `convex/_generated/ai/guidelines.md` for exact `convexTest` setup.
- **Shared seed helpers**: Always import from `convex/testHelpers.ts` (`seedWorkspace`, `seedProject`, `seedSuite`, etc.). Never define local seed functions.
- **Minimum 80% coverage** — hard rule. TDD mandatory: RED → GREEN → REFACTOR.
- **No implementation without test first** — exception only when test infrastructure doesn't exist yet (set up infrastructure first).
- **DOM matchers**: `@testing-library/jest-dom/vitest` auto-loaded via `src/test/setup.ts`. No need to import in individual test files.
- **Test-fidelity gate (D3)**: Any AC whose behavior depends on navigation, clipboard, download, or streaming MUST have a Playwright smoke test OR be marked `UNVERIFIED-IN-JSDOM` in the story's test section. jsdom cannot verify these flows; a passing jsdom test on such an AC is a false positive. Additionally, every test fixture asserting on an external/extracted shape must **cite the production write site** (file:line of the write) — parallel to the C4 spike-citation gate. Story 5.3 shipped a CRITICAL where `renderApis` tested a `{endpoints:[...]}` wrapper shape that never exists in production (extraction emits a flat array) — a green test against a fake shape.

### Code Quality & Style Rules

- **File size limits**: 200–400 lines typical, 800 max. Functions <50 lines. No deep nesting (>4 levels).
- **Domain-first organization**: Files organized by feature/domain, not type. Convex: domain dir → type files. Frontend: `app/` pages, `components/` shared UI, `lib/` utilities.
- **Naming**: PascalCase component files, kebab-case test files, lowercase domain dirs. Named exports (except Next.js page/layout defaults).
- **Styling**: Tailwind utility classes only. No custom CSS except `globals.css`. Tailwind v4 via `@tailwindcss/postcss` — no `tailwind.config.*`.
- **Linting**: `pnpm lint` (eslint-config-next). Run before committing.
- **No hardcoded values**: All constraints in `convex/lib/constraints.ts`. All validators in `convex/lib/validation.ts`.
- **No comments** unless explicitly requested.
- **Max nesting**: 4 levels. Extract to helper functions if deeper.

### Development Workflow Rules

- **Commit format**: `<type>: <description>`. Types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `ci`.
- **Local dev**: `pnpm dev` starts everything (Convex + Next.js + Runner). Don't run processes individually unless debugging.
- **Pre-commit verification**: Run `pnpm build`, `pnpm lint`, and `pnpm test:all` before committing. Never skip. (`pnpm build` passes with `typescript.ignoreBuildErrors: true` — pre-existing Convex TS2589/TS7022 deep-generic errors tracked via `pnpm typecheck`.)
- **Runner isolation**: `runner/` is stateless. Never put API keys in Runner. Convex is source of truth for all state.
- **Error logging**: UI code calls `logError()` from `src/lib/error-logger.ts` in all catch blocks. Never silently swallow errors.
- **Convex error logging**: `convex/logs/mutations.ts` has `logError` (public, no auth, auto-truncates). Set up via `setGlobalErrorLogger()` + `initGlobalErrorHandlers()` in root layout.
- **PR workflow**: Full commit history analysis → summary → test plan → push with `-u`.
- **Review gate (mandatory before `sprint-status → done`)**: Every story's `done` transition requires (a) a `### Review Findings` section in the story file with the 3-layer review outcome, and (b) the story file's `Status:` header matching `sprint-status.yaml`. Story 2.3 shipped `done` in sprint-status but `review` in its file with no Review Findings section — a reviewed story looked unreviewed. This is an enforced gate, not an aspiration (Epic 2 retro action B1).
- **Pre-review self-checklist (C1)**: Before moving a story to `review`, verify four recurring defect classes the adversarial review catches repeatedly: (a) **error-handling paths** — enumerate surfaced vs swallowed vs leaked for every try/catch; (b) **dual-write atomicity** — code writing to two systems (agent thread + join table, pending state + subscription) must be atomic or have defined reconciliation; (c) **test-asserts-on-content** — tests assert expected values (`.toBe(...)` / `.toMatch(/.../)`), not just types (`typeof === "string"` passes on `""`); (d) **fixture-reality** — every test fixture asserting on an external/extracted shape must cite the production write site (file:line) — a green test against a shape that doesn't match production reality is a false positive (Story 5.3 `renderApis` CRITICAL). Plus a spec-consistency sweep: re-read ACs ↔ Tasks ↔ Dev Notes ↔ "What NOT to Reinvent" and resolve contradictions. Goal: ≤5 review patches/story (Epic 3 averaged ~10).
- **Async-timing verification (C2)**: Any spec claim of the form "the window is <Xms" or "this resolves before Y" must cite an installed-type contract (`.d.ts` path + line) OR be marked `UNVERIFIED` and tested before the spec is locked. Story 3.4 shipped a CRITICAL duplicate-message bug because a dev-note asserted a "<500ms" dedup window that was empirically 10–30s.
- **Spike API-citation gate (C4)**: Every spike decision asserting an external-library API shape must cite the installed `.d.ts` path + line. Spikes asserting without citation get a verification task at the top of the first consuming story. The streaming spike's "thread metadata via `updateThreadMetadata`" was impossible in `@convex-dev/agent` v0.6.1 — `ThreadDoc` has no `metadata` field.
- **`*-free` model guard enforced (C5)**: `getWorkspaceModel` (`convex/ai/model.ts`) throws `ConvexError` on model names ending in "free" (case-insensitive). Every agent factory inherits the guard. Third-epic carry-forward (B4), resolved post-Epic 3 retro.

### Critical Don't-Miss Rules

**Security**
- Never hardcode secrets. Always env vars. PATs encrypted with AES-256-GCM (`ENCRYPTION_KEY`).
- Queries returning sensitive entities must strip secrets — e.g., `getProjectRepo` returns only `{ repo_url, kb_status }`.
- Use `maskApiKey()` / `maskPat()` for any key displayed in UI.
- All user inputs validated with Convex `v.` validators on every function args.

**Anti-Patterns (NEVER do these)**
- Never edit `convex/_generated/` — auto-generated, overwritten on `convex dev`.
- Never use `dangerouslySetInnerHTML` with untrusted input.
- Never use raw `useState` + manual validation for forms — always `useForm` + `zodResolver`.
- Never inline auth/ownership checks — use `requireAuth()` / `getOptionalOwnedEntity()`.
- Never write a public action/mutation that accepts an `Id` (e.g. `project_id`, `rd_id`, `thread_id`) without a workspace-ownership check. Bare ID lookups that fetch by raw `_id` then act are the Epic 2 IDOR surface (Story 2.1 `triggerBaselineRd` CRITICAL — any authenticated user could archive/generate against another workspace's project). Pattern: resolve the entity, then assert `project.workspace_id !== membership.workspace_id` → throw `ConvexError("Project not found")`. Use `getOwnedEntity` for single-entity mutations or `getOptionalMemberWorkspace` for collection queries (Epic 2 retro action B3). Applies to all Epic 3+ endpoints.
- Never put AI API calls in Runner — API keys stay in Convex only.

**Convex Gotchas**
- `_creationTime` auto-appended to indexes — never add explicitly.
- Functions return `null` not `undefined` — always null-check.
- File storage: query `_storage` metadata for size BEFORE reading the file.
- `v.any()` only for truly dynamic JSON (e.g., `kb_modules.apis`), not as a shortcut.

---

## Usage Guidelines

**For AI Agents:**
- Read this file before implementing any code
- Follow ALL rules exactly as documented
- When in doubt, prefer the more restrictive option
- Update this file if new patterns emerge

**For Humans:**
- Keep this file lean and focused on agent needs
- Update when technology stack changes
- Review quarterly for outdated rules
- Remove rules that become obvious over time

Last Updated: 2026-06-18

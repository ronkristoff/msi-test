---
baseline_commit: 56050e5
---

# Story 5.1: readKnowledgeBase Agent Tool

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As the Test Generation Agent,
I want a `readKnowledgeBase` tool that returns module names, API surface, data models, and user flows,
so that I can generate tests grounded in actual code structure.

## Acceptance Criteria

1. **AC1 — `readKnowledgeBase` tool definition follows the installed Agent tool pattern**: A NEW tool `readKnowledgeBase` is added to the object returned by `createToolDefinitions()` in `convex/ai/tools/definitions.ts`. It mirrors `readProjectContext` exactly: `createTool({ description, inputSchema: z.object({ project_id: z.string() }), execute: async (ctx, input) => { const err = validateConvexId(input.project_id, "project_id"); if (err) return { error: err }; return ctx.runQuery(internal.ai.tools.queries.readKnowledgeBaseQuery, { project_id: input.project_id as Id<"projects"> }); } })`. The `z` import is `from "zod/v3"` (matching the file's existing import — NOT `from "zod"`). The `validateConvexId` reuse is mandatory — it is the installed convention; the ADR 0008 §Integration Bridge code example OMITS it (aspirational pseudo­code) and must NOT be copied verbatim (C4 gate, see Task 0). Because `createTestGenerationAgent` passes `tools: createToolDefinitions()` wholesale, adding the key auto-wires the tool into the Test Generation Agent — NO change to `createTestGenerationAgent` is required.

2. **AC2 — `readKnowledgeBaseLogic` returns full KB grounding data**: A NEW pure logic function `readKnowledgeBaseLogic(ctx, projectId)` is added to `convex/ai/tools/logic.ts`. It: (a) resolves the latest `knowledge_bases` doc for the project via `.query("knowledge_bases").withIndex("by_project_id", (q) => q.eq("project_id", projectId)).order("desc").first()` (mirrors `getKnowledgeBase` at `convex/knowledge/queries.ts:124-128` and `_getProjectWorkspaceForSearch` at `convex/knowledge/queries.ts:308-312`); (b) returns `null` if no KB exists OR if `kb.status !== "ready"` (graceful empty — NO throw, per AC4); (c) fetches all modules via `.query("kb_modules").withIndex("by_knowledge_base_id", (q) => q.eq("knowledge_base_id", kb._id)).collect()` (mirrors `getModules` at `convex/knowledge/queries.ts:149-154`); (d) returns `{ architecture_summary: kb.architecture_summary ?? null, tech_stack: kb.tech_stack ?? null, architecture_type: kb.architecture_type ?? null, modules: kb_modules.map((m) => ({ name: m.name, description: m.description ?? null, file_count: m.file_count ?? 0, dependencies: m.dependencies ?? [], apis: m.apis ?? null, data_models: m.data_models ?? null, user_flows: m.user_flows ?? null })) }`. The return type is a named `ReadKnowledgeBaseResult` interface exported from `logic.ts` (so the test file + future callers can reference it). The `apis`/`data_models`/`user_flows` fields are typed `unknown` (the schema uses `v.any()` for these per ADR 0008 §Negative — deliberate trade-off; do NOT tighten).

3. **AC3 — `readKnowledgeBaseQuery` internal query**: A NEW `internalQuery` `readKnowledgeBaseQuery` is added to `convex/ai/tools/queries.ts` with `args: { project_id: v.id("projects") }` and `handler: async (ctx, args) => readKnowledgeBaseLogic(ctx, args.project_id)`. Import `readKnowledgeBaseLogic` from `./logic` alongside the existing imports. This mirrors `readProjectContextQuery` (lines 14-17) exactly. The query is INTERNAL (no auth check inside — the trust boundary is the agent invocation, matching the existing `readProjectContextQuery`/`readExistingTestsQuery`/`readTestCodeQuery` pattern which also do NO workspace-ownership check; see Dev Notes "Auth/IDOR Boundary").

4. **AC4 — Graceful empty result, no error thrown**: When `readKnowledgeBaseLogic` is invoked for (a) a project with no `knowledge_bases` row, OR (b) a project whose latest KB has `status !== "ready"` (i.e. `"building"` or `"error"`), it returns `null` — it does NOT throw. When the KB is `ready` but has zero modules, it returns `{ architecture_summary, tech_stack, architecture_type, modules: [] }` (NOT null — the KB exists, it just has no detected modules). Both branches are tested (AC8).

5. **AC5 — Tool is callable by the LLM (project_id surfaced in prompt)**: The test-generation prompt builders `buildPrdGenerationPrompt` and `buildNlGenerationPrompt` (both in `convex/ai/agents.ts`) gain a NEW optional opt `projectId?: string`. When provided AND non-empty, the prompt includes a one-line injection in the context block: `\nProject ID: ${opts.projectId}\nIf the project has a Knowledge Base, use the readKnowledgeBase tool with this exact project_id to look up its modules, APIs, data models, and user flows before generating tests.\n`. When omitted/empty, the prompt is UNCHANGED (no regression — mirrors the "additive, no changes when KB absent" rule that Story 5.3 also follows). The two retry-prompt builders (`buildPrdFormatRetryPrompt`, `buildNlFormatRetryPrompt`) are UNCHANGED (retries don't re-invoke tools — they only re-emit code fences). The EXACT call sites (grep-verified — only TWO files call these builders): (a) `convex/ai/prdWorkflowActions.ts:60` — `buildPrdGenerationPrompt({ projectName, appUrl, authContext, prdText, snapshotContext, retryContext })` → add `projectId: String(args.project_id)` to this object literal (`args.project_id` is the action's validated `v.id("projects")` arg at line 27); the retry call at line 80 (`buildPrdFormatRetryPrompt`) is UNCHANGED. (b) `convex/ai/nlWorkflowActions.ts:55-61` — a `promptOpts` object is built (line 55) then spread into BOTH `buildNlGenerationPrompt({ ...promptOpts, retryContext })` (line 61) AND `buildNlFormatRetryPrompt(promptOpts)` (line 71). To avoid polluting the retry builder, add `projectId: String(args.project_id)` to the `buildNlGenerationPrompt` call directly (line 61: `buildNlGenerationPrompt({ ...promptOpts, retryContext, projectId: String(args.project_id) })`), NOT to `promptOpts`. This makes the tool genuinely invokable end-to-end. **Scope guard**: this injection is ONLY the project_id + a one-line hint — it does NOT inject KB content (that is Story 5.3's concern). The existing `readProjectContext`/`readExistingTests` tools remain dormant (their IDs are still not in the prompt) — fixing those is out of scope (see Deferred Work).

6. **AC6 — Test Generation Agent inherits the tool automatically (verified)**: A test asserts that `createTestGenerationAgent(model).options.tools` includes a `readKnowledgeBase` key (mirror the `agent.options.instructions` assertion pattern at `agents.test.ts:129-130`, but inspect the tools object). The tool is registered just by virtue of being added to `createToolDefinitions()` — `createTestGenerationAgent` is NOT modified. The Exploration Analysis Agent is NOT wired in this story (Story 5.4 owns that — see Scope Boundary).

7. **AC7 — No schema changes, no new tables, no new dependencies, no new directories**: The `knowledge_bases`, `kb_modules` tables + their existing indexes (`by_project_id` on knowledge_bases, `by_knowledge_base_id` on kb_modules) are reused as-is. No new Convex table, no new index, no schema field. No new npm dependency. No new `convex/` directory (existing `convex/ai/tools/` from the pre-existing tool set is extended — no `pnpm dev` restart needed). No frontend changes (the tool is invoked by the LLM inside the agent; the result never reaches React). This story is purely additive backend code + a one-line-each prompt-builder enhancement.

8. **AC8 — Tests (TDD, ≥80% coverage on new code)**:
   - **Backend logic tests** — EXTEND `convex/ai/agents.test.ts` (the existing `describe("Agent tools", ...)` block at line 240, do NOT create a new test file). Add a `describe("readKnowledgeBase", ...)` sub-block calling `readKnowledgeBaseLogic` directly via `t.run(async (ctx) => { return readKnowledgeBaseLogic(ctx, projectId); })` — mirror the `readProjectContextLogic` test at lines 256-268 EXACTLY (same seed + invoke pattern). Seed via existing helpers: `seedWorkspace` → `seedProject` → `seedKnowledgeBase` (with `status: "ready"`) → `seedModule` (×2, with distinct `apis`/`data_models`/`user_flows`/`dependencies` overrides). Tests:
     - Returns full KB shape for a ready KB: assert `result.architecture_summary`, `result.tech_stack`, `result.architecture_type` match the seeded KB; assert `result.modules.length === 2`; assert `result.modules[0].name` equals the seeded module name; assert `result.modules[0].apis` equals the seeded apis object (C1 content assertion — specific value, NOT `typeof`); assert `result.modules[0].dependencies` equals the seeded array (specific array).
     - Returns `null` when no KB exists (seed project only, no `seedKnowledgeBase` → `result === null`).
     - Returns `null` when latest KB is `"building"` (seed KB with `status: "building"` → `result === null`).
     - Returns `null` when latest KB is `"error"` (seed KB with `status: "error"` → `result === null`).
     - Returns `modules: []` (NOT null) when KB is ready but has zero modules (seed ready KB, no `seedModule` → `result !== null && result.modules.length === 0`).
     - Picks the LATEST KB when multiple exist (seed two KBs for the same project — older `"ready"`, newer `"ready"` — assert `result.architecture_summary` matches the NEWER one; use `last_synced_at` or distinct `architecture_summary` to disambiguate. NOTE: `.order("desc").first()` orders by `_creationTime` desc — seed the newer one second OR use the insert-then-verify pattern; do NOT rely on `setTimeout` for ordering (flaky — see deferred-work line 71/97)).
     - Returns `null` for a non-existent project_id (`"00000000000000000000000000000000" as Id<"projects">` → `result === null`; mirror `readExistingTests` unknown-suite test at lines 284-294).
   - **Prompt-builder tests** — EXTEND `convex/ai/agents.test.ts` (or the existing prompt-content `describe("Prompt content snapshots", ...)` block at line 321). Add tests:
     - `buildPrdGenerationPrompt({ ..., projectId: "abc123" })` output contains `Project ID: abc123` AND contains `readKnowledgeBase`.
     - `buildPrdGenerationPrompt({ ..., projectId: "" })` (empty) AND `buildPrdGenerationPrompt({ ... })` (omitted) output do NOT contain `readKnowledgeBase` (additive-only — no regression when absent).
     - `buildNlGenerationPrompt({ ..., projectId: "xyz789" })` output contains `Project ID: xyz789` AND `readKnowledgeBase`.
     - `buildNlGenerationPrompt` with omitted `projectId` does NOT contain `readKnowledgeBase`.
     - `buildPrdFormatRetryPrompt` and `buildNlFormatRetryPrompt` output does NOT contain `readKnowledgeBase` (retries don't re-invoke tools — verify the retry builders are unchanged).
   - **Agent wiring test** — EXTEND `convex/ai/agents.test.ts` `describe("Agent definitions", ...)`: add a test that `createTestGenerationAgent(model)` produces an agent whose tool set includes `readKnowledgeBase` (e.g. `expect(Object.keys(agent.options.tools ?? {})).toContain("readKnowledgeBase")` — verify the exact shape of `agent.options.tools` against the installed `@convex-dev/agent` types in Task 0; if `tools` is not directly enumerable, assert via invoking the tool's `execute` is present, or assert on the `createToolDefinitions()` return directly).
   - All existing tests pass — zero regressions (`pnpm test:convex`, `pnpm test`).

9. **AC9 — Convex validators + immutability + no-comments**: `readKnowledgeBaseQuery` uses `v.id("projects")` on its arg (never bare `v.string()` at the query boundary — the tool definition's `validateConvexId` is the LLM-facing guard, the internal query's `v.id()` is the type-system guard). `readKnowledgeBaseLogic` returns NEW objects (the `.map` produces fresh objects; the `apis`/`data_models`/`user_flows` `unknown` values are passed through by reference — acceptable since the LLM only reads the JSON serialization, never mutates). No code comments (project-context.md:51/93).

10. **AC10 — Verification (build/lint/test)**:
    - `pnpm lint` — zero new errors.
    - `pnpm test:convex` — all backend tests pass, zero regressions, new tests green.
    - `pnpm test` — all frontend tests pass, zero regressions (no frontend changes expected, but the prompt-builder unit tests live in `convex/ai/agents.test.ts` which runs under `pnpm test:convex`; confirm no frontend test imports the prompt builders).
    - `pnpm typecheck` — no NEW type errors beyond the pre-existing deep-instantiation cascade (Epic 4 retro D1 — this story adds NO new tables and NO nested validators, so it does NOT worsen the `TestConvexForDataModel` cascade; verify via `git stash && pnpm typecheck 2>&1 | wc -l` baseline vs. post-change count).
    - `pnpm build` — note the current state: `next.config.ts` still has `typescript.ignoreBuildErrors: true` (Epic 4 retro D1, unresolved). The story does NOT remove the flag (out of scope — D1 is a separate `fix:` commit owned by Winston). The build MUST still succeed with the flag in place. Document that the flag's removal is tracked separately.

## Tasks / Subtasks

- [x] Task 0: Verify infrastructure claims (C4 spike-citation gate) (AC: #1, #2, #3, #5, #6, #8)
  - [x] Confirm `createToolDefinitions()` return object is passed wholesale to `createTestGenerationAgent` via `tools: createToolDefinitions()` at `convex/ai/agents.ts:222`. Adding a `readKnowledgeBase` key auto-wires it — NO agent-factory edit needed.
  - [x] Confirm the installed tool pattern uses `validateConvexId` — `convex/ai/tools/definitions.ts:7-10` (helper) + lines 30-32 (`readProjectContext` calls it). ADR 0008 §Integration Bridge line 100-109 OMITS it — that's aspirational pseudo­code; the INSTALLED code is authoritative. The story MUST use `validateConvexId`.
  - [x] Confirm `z` is imported `from "zod/v3"` in `definitions.ts` (line 2) — the agent tool schemas use the v3 compat import. Do NOT use `from "zod"` (v4) — mismatch with the existing file.
  - [x] Confirm `internalQuery` + `v.id("projects")` is the internal-query pattern — `convex/ai/tools/queries.ts:14-17` (`readProjectContextQuery`). Mirror exactly.
  - [x] Confirm the latest-KB-resolution pattern — `convex/knowledge/queries.ts:124-128` (`.query("knowledge_bases").withIndex("by_project_id", ...).order("desc").first()`) and `convex/knowledge/queries.ts:308-312` (`_getProjectWorkspaceForSearch`). The `.order("desc").first()` orders by `_creationTime` desc (newest first) — verified.
  - [x] Confirm the modules-fetch pattern — `convex/knowledge/queries.ts:149-154` (`.query("kb_modules").withIndex("by_knowledge_base_id", ...).collect()`).
  - [x] Confirm the existing tool internal queries do NO auth check — `readProjectContextLogic` (`logic.ts:15-22`) does `ctx.db.get(projectId)` directly with no `getMemberWorkspace`. `readKnowledgeBaseLogic` mirrors this (trust boundary is the agent invocation; see Dev Notes "Auth/IDOR Boundary").
  - [x] Confirm `kb_modules.apis` / `data_models` / `user_flows` are `v.any()` in the schema — `convex/schema.ts:421-423`. The logic function passes them through as `unknown` (deliberate, ADR 0008 §Negative).
  - [x] Confirm `buildPrdGenerationPrompt` and `buildNlGenerationPrompt` are in `convex/ai/agents.ts:501-560`. Grep-verify call sites: ONLY `convex/ai/prdWorkflowActions.ts:60` (`buildPrdGenerationPrompt`) and `convex/ai/nlWorkflowActions.ts:61` (`buildNlGenerationPrompt`) call them. Both have `args.project_id` in scope (the action's `v.id("projects")` arg). The nlWorkflowActions `promptOpts` (line 55) is REUSED by both the main builder (line 61 spread) AND `buildNlFormatRetryPrompt` (line 71) — add `projectId` to the main-builder call directly, NOT to `promptOpts`.
  - [x] Inspect `agent.options.tools` shape: read `node_modules/@convex-dev/agent/dist/client/index.d.ts` — `tools?: AgentTools` where `AgentTools extends ToolSet` (AI SDK `Record<string, CoreTool>`). So `agent.options.tools` is a record keyed by tool name; `Object.keys(agent.options.tools ?? {}).toContain("readKnowledgeBase")` is the AC6 assertion. The Agent is generic (`AgentTools extends ToolSet = any`) and infers the tool set from `tools: createToolDefinitions()`, so adding the key types it correctly too.
  - [x] Confirm `seedKnowledgeBase` + `seedModule` exist in `convex/testHelpers.ts:125-191` with the overrides needed (status, architecture_summary, tech_stack, architecture_type, apis, data_models, user_flows, dependencies).
  - [x] Inspect `agent.options.tools` shape (duplicate of above — resolved: `AgentTools extends ToolSet`, a record; `Object.keys(agent.options.tools ?? {})` enumerates tool names). Baseline `pnpm typecheck` = 866 lines (pre-existing cascade; this story adds no tables → no new cascade errors expected).

- [x] Task 1: Write `readKnowledgeBaseLogic` test FIRST (AC: #2, #4, #8) — TDD RED
  - [x] EXTEND `convex/ai/agents.test.ts` — add `describe("readKnowledgeBase", ...)` inside the existing `describe("Agent tools", ...)` block (do NOT create a new file; the convention is one test file per domain).
  - [x] Use `seedWorkspace` → `seedProject` → `seedKnowledgeBase({ status: "ready", architecture_summary: "...", tech_stack: ["Next.js"], architecture_type: "modular monolith" })` → `seedModule` (×2 with distinct overrides).
  - [x] Test: ready KB returns full shape with content-assertions (specific `name`, specific `apis` object, specific `dependencies` array — NOT `typeof`).
  - [x] Test: no KB → `null`.
  - [x] Test: KB `"building"` → `null`.
  - [x] Test: KB `"error"` → `null`.
  - [x] Test: ready KB, zero modules → `{ ..., modules: [] }` (NOT null).
  - [x] Test: latest KB selected when multiple ready KBs exist (insert two; assert the newer `architecture_summary` is returned — use distinct summaries, NOT `setTimeout`).
  - [x] Test: non-existent project_id → `null`.

- [x] Task 2: Implement `readKnowledgeBaseLogic` (AC: #2, #4, #9) — TDD GREEN
  - [x] Add to `convex/ai/tools/logic.ts`. Export `interface ReadKnowledgeBaseResult { architecture_summary: string | null; tech_stack: string[] | null; architecture_type: string | null; modules: Array<{ name: string; description: string | null; file_count: number; dependencies: string[]; apis: unknown; data_models: unknown; user_flows: unknown }>; }`.
  - [x] `export async function readKnowledgeBaseLogic(ctx: QueryCtx, projectId: Id<"projects">): Promise<ReadKnowledgeBaseResult | null>`.
  - [x] Resolve latest KB: `const kb = await ctx.db.query("knowledge_bases").withIndex("by_project_id", (q) => q.eq("project_id", projectId)).order("desc").first();`
  - [x] `if (!kb || kb.status !== "ready") return null;`
  - [x] Fetch modules: `const modules = await ctx.db.query("kb_modules").withIndex("by_knowledge_base_id", (q) => q.eq("knowledge_base_id", kb._id)).collect();`
  - [x] Return the shaped result (per AC2 mapping).

- [x] Task 3: Add `readKnowledgeBaseQuery` internal query (AC: #3) — TDD GREEN
  - [x] Add import `readKnowledgeBaseLogic` to `convex/ai/tools/queries.ts` (alongside the existing logic imports).
  - [x] Add `export const readKnowledgeBaseQuery = internalQuery({ args: { project_id: v.id("projects") }, handler: async (ctx, args) => readKnowledgeBaseLogic(ctx, args.project_id) });`.

- [x] Task 4: Add `readKnowledgeBase` tool definition (AC: #1) — TDD GREEN
  - [x] Add to the object returned by `createToolDefinitions()` in `convex/ai/tools/definitions.ts`. Mirror `readProjectContext` (lines 26-37) exactly: `description`, `inputSchema: z.object({ project_id: z.string() })`, `execute` with `validateConvexId` guard → `ctx.runQuery(internal.ai.tools.queries.readKnowledgeBaseQuery, { project_id: input.project_id as Id<"projects"> })`.

- [x] Task 5: Write prompt-builder tests FIRST (AC: #5, #8) — TDD RED
  - [x] EXTEND `convex/ai/agents.test.ts` `describe("Prompt content snapshots", ...)`.
  - [x] Test `buildPrdGenerationPrompt` with `projectId: "abc123"` → contains `Project ID: abc123` + `readKnowledgeBase`.
  - [x] Test `buildPrdGenerationPrompt` with `projectId: ""` AND omitted → does NOT contain `readKnowledgeBase`.
  - [x] Test `buildNlGenerationPrompt` with `projectId: "xyz789"` → contains `Project ID: xyz789` + `readKnowledgeBase`.
  - [x] Test `buildNlGenerationPrompt` omitted → does NOT contain `readKnowledgeBase`.
  - [x] Test `buildPrdFormatRetryPrompt` + `buildNlFormatRetryPrompt` → do NOT contain `readKnowledgeBase` (retries unchanged).

- [x] Task 6: Add `projectId` opt to prompt builders + inject at call sites (AC: #5) — TDD GREEN
  - [x] MODIFY `buildPrdGenerationPrompt` opts type: add `projectId?: string`. In the template, after the URL line, conditionally inject `${opts.projectId ? `\nProject ID: ${opts.projectId}\nIf the project has a Knowledge Base, use the readKnowledgeBase tool with this exact project_id to look up its modules, APIs, data models, and user flows before generating tests.\n` : ""}`.
  - [x] MODIFY `buildNlGenerationPrompt` opts type: add `projectId?: string`. Same conditional injection in the template.
  - [x] DO NOT modify `buildPrdFormatRetryPrompt` or `buildNlFormatRetryPrompt` (retries don't re-invoke tools).
  - [x] At every call site (grep-verified in Task 0): (a) `prdWorkflowActions.ts:60` — add `projectId: String(args.project_id)` to the `buildPrdGenerationPrompt({...})` object literal; (b) `nlWorkflowActions.ts:61` — change to `buildNlGenerationPrompt({ ...promptOpts, retryContext, projectId: String(args.project_id) })` (NOT to `promptOpts` — it's reused by the retry builder).

- [x] Task 7: Write agent-wiring test (AC: #6, #8) — TDD RED → GREEN
  - [x] EXTEND `convex/ai/agents.test.ts` `describe("Agent definitions", ...)`. Add test asserting `createTestGenerationAgent(model)` exposes `readKnowledgeBase` in its tool set (exact assertion shape per Task 0's installed-type inspection).

- [x] Task 8: Validation (AC: #10)
  - [x] `pnpm lint` — zero new errors.
  - [x] `pnpm test:convex` — all backend tests pass; new tests green; zero regressions.
  - [x] `pnpm test` — all frontend tests pass; zero regressions.
  - [x] `pnpm typecheck` — no NEW type errors (compare count vs. baseline; this story adds no tables/nested-validators so the deep-instantiation cascade is unchanged).
  - [x] `pnpm build` — succeeds (with the pre-existing `ignoreBuildErrors: true` still in place — D1 owns its removal).

## Dev Notes

### Scope Boundary

**This story implements:**
- ONE new logic function `readKnowledgeBaseLogic` in `convex/ai/tools/logic.ts` (resolves latest ready KB + fetches full modules).
- ONE new `internalQuery` `readKnowledgeBaseQuery` in `convex/ai/tools/queries.ts` (thin wrapper, mirrors `readProjectContextQuery`).
- ONE new tool definition `readKnowledgeBase` in `convex/ai/tools/definitions.ts` (mirrors `readProjectContext`, auto-wires into Test Generation Agent via the existing `tools: createToolDefinitions()` call).
- ONE new exported interface `ReadKnowledgeBaseResult` in `logic.ts`.
- MINIMAL additive change to `buildPrdGenerationPrompt` + `buildNlGenerationPrompt` (new optional `projectId` opt + one-line conditional injection). NO change to retry-prompt builders.
- MINIMAL call-site updates (pass `projectId` at each builder invocation that has `project_id` in scope).
- Tests extending `convex/ai/agents.test.ts` (logic + prompt-builder + agent-wiring).

**This story does NOT implement:**
- Wiring `readKnowledgeBase` into the Exploration Analysis Agent (Story 5.4 — `createExplorationAnalysisAgent` currently takes NO `tools`; 5.4 adds the tool there for page/module cross-referencing).
- `readBaselineRd` tool (Story 5.2 — separate tool, same pattern).
- Pre-prompt KB CONTENT injection into `buildPrdGenerationPrompt` / `buildNlGenerationPrompt` (Story 5.3 — that's the deterministic, always-on KB summary block; THIS story only injects the project_id so the tool is callable. The two are complementary: 5.1 = tool (agent pulls on demand); 5.3 = pre-prompt (deterministic context). See Epic 4 retro insight #5).
- Any frontend / UI change (the tool result never reaches React — it's consumed by the LLM inside the agent run).
- Any schema change, new table, new index, or new npm dependency.
- Any change to `readProjectContext` / `readExistingTests` / `readTestCode` (they remain as-is; their prompt-side dormancy is a pre-existing gap — see Deferred Work).
- Removing `typescript.ignoreBuildErrors: true` (Epic 4 retro D1 — separate `fix:` commit, owned by Winston).
- Fixing the multi-workspace `.first()` bug (D5 — the logic function does NO auth, so it doesn't inherit D5 directly; the calling actions do, but that's systemic and pre-existing).
- A Playwright smoke test (D2 — this story has NO jsdom-blind surface; the tool executes inside a Convex action, not a browser).

### CRITICAL: Tool Pattern — Mirror `readProjectContext`, NOT the ADR 0008 Pseudo-code

The installed `convex/ai/tools/definitions.ts` is the AUTHORITATIVE tool pattern. ADR 0008 §Integration Bridge (lines 100-109) shows `readKnowledgeBase` WITHOUT `validateConvexId` — that is aspirational pseudo­code written before the `validateConvexId` helper existed. The C4 spike-citation gate (project-context.md:108) requires citing installed types; Task 0 verifies this. **Copy `readProjectContext` (definitions.ts:26-37), NOT the ADR example.** The three differentiators:

1. `validateConvexId(input.project_id, "project_id")` MUST be called and its error returned as `{ error: err }` before `ctx.runQuery` (defensive guard against the LLM passing a human-readable name instead of a Convex ID).
2. `import { z } from "zod/v3"` (NOT `from "zod"` — v4 default; the file uses v3 compat).
3. `input.project_id as Id<"projects">` cast after validation (the internal query's `v.id("projects")` arg validator is the runtime guard).

### CRITICAL: Auth / IDOR Boundary — The Tool Trust Boundary is the Agent Invocation

The existing tool internal queries (`readProjectContextQuery`, `readExistingTestsQuery`, `readTestCodeQuery`) perform NO workspace-ownership check — they `ctx.db.get(id)` directly. This is intentional and correct: the queries are INTERNAL (only callable from other Convex functions via `ctx.runQuery(internal....)`), never exposed to the client. The trust boundary is the agent invocation chain:

```
client → generatePrdTests (public action) → prdWorkflow → agent.generateText → LLM → readKnowledgeBase tool → ctx.runQuery(internal.ai.tools.queries.readKnowledgeBaseQuery)
```

The `project_id` originates from the client's `generatePrdTests({ project_id, suite_id })` call. The public action `generatePrdTests` (`convex/ai/generatePrdTests.ts:9-41`) calls `internal.projects.queries.getProjectForAi` and fails if the project is missing — but does NOT verify the project belongs to the caller's workspace (a pre-existing B3 IDOR surface noted in deferred-work, inherited by all AI workflows, NOT introduced by this story). `readKnowledgeBaseLogic` mirrors `readProjectContextLogic` (no auth) — do NOT add `getMemberWorkspace` inside the logic function (it would diverge from the established tool pattern and the function runs in an internal-query ctx where auth may not be available anyway).

**The B3 IDOR rule** (project-context.md:120-124) applies to PUBLIC functions accepting an `Id`. `readKnowledgeBaseQuery` is INTERNAL — the rule does not directly apply. The public-surface IDOR hardening belongs to the AI workflow actions (`generatePrdTests`, `generateNlTests`, etc.) and is tracked separately. Document this for the reviewer — do NOT add a workspace check to the logic function.

### Why `null` for Not-Ready KB (AC4) — Match the Agent's "Tool Returned Nothing" Semantics

When the KB is absent or not `ready`, the tool returns `null`. The LLM sees "the tool returned null" and reasons "no KB available" — it does NOT retry, throw, or hallucinate. This mirrors `readProjectContextLogic` returning `null` for an unknown project (logic.ts:19-20). The alternative (returning a `{ modules: [] }` shape for a not-ready KB) would be ambiguous: does `modules: []` mean "KB exists but found no modules" or "KB doesn't exist"? `null` unambiguously means "no KB available." The one exception: a `ready` KB with zero modules returns `{ ..., modules: [] }` (the KB exists; it just has no detected modules — different semantic).

### Why Include `architecture_summary` / `tech_stack` / `architecture_type` (AC2) — Cheap, High-Value Grounding

The AC text says "module names, descriptions, API endpoints, data model schemas, user flows, and cross-module dependencies" — it does NOT explicitly mention the KB-level architecture summary. Including it is a pragmatic enrichment: the `architecture_summary`, `tech_stack`, and `architecture_type` are already on the `knowledge_bases` doc (fetched for free in the same query), and they give the LLM project-wide context ("this is a Next.js App Router app with a modular monolith architecture") that informs locator strategy and test structure. The cost is ~3 extra fields in the JSON payload (negligible vs. the module data). If the reviewer feels this exceeds the AC, the three fields can be dropped without breaking anything — but their inclusion is recommended.

### Pre-Prompt Injection vs. Agent Tool — Why Both (5.1 + 5.3)

Epic 4 retro insight #5 (epic-4-retrospective.md:103) codifies the choice: **pre-prompt injection for one-shot structured generation; agent tools for interactive/agent flows**. Test generation is agentic (the LLM decides what to look up based on the PRD/scenario), so `readKnowledgeBase` is a TOOL (this story). Story 5.3 adds PRE-PROMPT KB content injection (deterministic, always-on summary block) — a DIFFERENT mechanism. They coexist:
- 5.1's tool: LLM calls `readKnowledgeBase("proj_xyz")` on demand → gets full module/API/data-model detail when it needs to ground a specific test.
- 5.3's pre-prompt: every test-gen prompt includes a short KB summary upfront → broad grounding without a tool round-trip.

This story's prompt change (AC5) is the MINIMUM needed to make the tool callable (project_id + one-line hint). It is NOT the 5.3 pre-prompt content block. The two edits touch the same builder functions but add different opts (`projectId` vs. `kbContext`) — no collision.

### Existing APIs to Reuse (NO reinvention)

| API | Location | Purpose |
|-----|----------|---------|
| `validateConvexId` | `convex/ai/tools/definitions.ts:7-10` | LLM-facing ID format guard — reuse in the new tool's `execute` |
| `createTool` | `@convex-dev/agent` | Tool factory — same import as the file already uses |
| `internalQuery` | `convex/_generated/server` | Internal query wrapper — same as `readProjectContextQuery` |
| `readProjectContext` (full pattern) | `definitions.ts:26-37` + `queries.ts:14-17` + `logic.ts:15-22` | THE template — copy structure exactly |
| `readProjectContextLogic` test | `agents.test.ts:256-268` | THE test pattern — `t.run(async (ctx) => readXxxLogic(ctx, id))` |
| latest-KB resolution | `knowledge/queries.ts:124-128` (`.order("desc").first()`) | Reuse the query shape inside the logic function |
| modules-by-KB fetch | `knowledge/queries.ts:149-154` (`.withIndex("by_knowledge_base_id")`) | Reuse the query shape |
| `seedKnowledgeBase` | `testHelpers.ts:125-160` | Test seed (status, architecture_summary, tech_stack, architecture_type, bmad_detected) |
| `seedModule` | `testHelpers.ts:162-191` | Test seed (name, description, file_count, files, dependencies, apis, data_models, user_flows) |
| `seedWorkspace`, `seedProject` | `testHelpers.ts:6-32` | Test seed foundation |
| `buildPrdGenerationPrompt`, `buildNlGenerationPrompt` | `agents.ts:501-560` | Prompt builders to extend with `projectId` opt |

### What NOT to Reinvent

| Concern | Reuse | Do NOT build |
|---------|-------|--------------|
| Tool definition shape | Copy `readProjectContext` (definitions.ts:26-37) | A new tool-registration mechanism, OR the ADR 0008 pseudo-code (missing `validateConvexId`) |
| Internal query shape | Copy `readProjectContextQuery` (queries.ts:14-17) | A public query with auth — the tool pattern is internal-only |
| Logic function shape | Copy `readProjectContextLogic` (logic.ts:15-22) — `ctx.db.get`/query, return `null` on missing | A `getMemberWorkspace` call (diverges from the tool pattern; auth is at the agent-invocation boundary) |
| KB resolution | `.query("knowledge_bases").withIndex("by_project_id").order("desc").first()` (knowledge/queries.ts:124-128) | A new "getLatestKb" helper — inline the 4-line query |
| Module fetch | `.query("kb_modules").withIndex("by_knowledge_base_id").collect()` (knowledge/queries.ts:149-154) | A new "getModulesForKb" helper — inline the 3-line query |
| Test seed | `seedKnowledgeBase` + `seedModule` (testHelpers.ts:125-191) | Local seed functions — the project rule is "never define local seed functions" (project-context.md:80) |
| Test file location | EXTEND `convex/ai/agents.test.ts` | A new `convex/ai/tools.test.ts` or `convex/ai/readKnowledgeBase.test.ts` — one test file per domain at `convex/` root |

### Error Handling (C1 Pre-Review Checklist)

Per Epic 3 retro action C1 (project-context.md:106), enumerate error paths BEFORE implementation:

| Path | Surfaced as | Notes |
|------|-------------|-------|
| LLM passes a human-readable name instead of a Convex ID | `validateConvexId` returns `{ error: "Invalid project_id 'foo'. You must pass the Convex document ID..." }` | The tool returns the error object; the LLM sees it and corrects. NO throw. Mirrors `readProjectContext`. |
| LLM passes a valid-format but non-existent project_id | `readKnowledgeBaseLogic` → no KB found → returns `null` | The LLM sees `null` and reasons "no KB." NO throw. |
| Project exists but has no KB | Returns `null` | Per AC4. NO throw. |
| Project exists, KB exists, status `"building"` | Returns `null` | Per AC4 — the KB isn't ready; the LLM shouldn't use partial data. NO throw. |
| Project exists, KB exists, status `"error"` | Returns `null` | Per AC4. NO throw. |
| Project exists, KB ready, zero modules | Returns `{ architecture_summary, tech_stack, architecture_type, modules: [] }` | NOT null — the KB exists, just has no modules. |
| `ctx.runQuery` itself throws (Convex infrastructure failure) | Propagates up through the agent → the agent run fails | Pre-existing pattern; the agent's outer action has the catch block. NOT this story's concern. |

**No error is silently swallowed at the logic-function level.** The function either returns data, returns `null` (semantically "no KB available"), or propagates an infrastructure error. The `validateConvexId` path returns a structured `{ error }` object (NOT a throw — the LLM consumes it).

### Dual-Write / Atomicity (C1 Checklist)

- **No dual-writes.** `readKnowledgeBaseLogic` is READ-ONLY (no `ctx.db.patch`/`insert`/`delete`). The prompt-builder change is pure string construction. There is NO cross-system coordination, NO status mutation, NO dual-write.
- **TOCTOU**: N/A — no writes.
- **Subscription reconciliation**: N/A — internal queries don't subscribe.

### Test Quality (C1 Checklist)

Per C1, tests assert CONTENT not just TYPE (Epic 4 reviews caught multiple "test passes on empty string" gaps):
- Ready-KB test: `expect(result.modules[0].name).toBe("Auth Module")` (specific string) — NOT `typeof result.modules[0].name === "string"`.
- `apis` content: seed `apis: { endpoints: [{ path: "/api/login", method: "POST" }] }` → `expect(result.modules[0].apis).toEqual({ endpoints: [{ path: "/api/login", method: "POST" }] })` (specific object) — NOT `result.modules[0].apis !== null`.
- `dependencies` content: seed `dependencies: ["User Module", "Core Module"]` → `expect(result.modules[0].dependencies).toEqual(["User Module", "Core Module"])` (specific array).
- `tech_stack` content: seed `tech_stack: ["Next.js", "Convex"]` → `expect(result.tech_stack).toEqual(["Next.js", "Convex"])`.
- Latest-KB selection: seed two KBs with DISTINCT `architecture_summary` values ("Older summary" / "Newer summary") → `expect(result.architecture_summary).toBe("Newer summary")` (NOT just `result !== null`).
- Prompt-builder test: `expect(prompt).toContain("Project ID: abc123")` (specific ID) AND `expect(prompt).toContain("readKnowledgeBase")` (specific tool name) — NOT `prompt.includes("Project")`.
- Negative prompt test: `expect(prompt).not.toContain("readKnowledgeBase")` when `projectId` omitted — verifies the additive-only / no-regression rule.

### Test-Fidelity (Epic 4 retro insight #2 — jsdom-blind surfaces)

This story has NO jsdom-blind surface. The logic function + internal query + prompt builders are all pure/backend — fully testable in `convex-test` (edge-runtime). The agent-wiring test (AC6) asserts on the agent's static options, not on a streamed/generated response. NO Playwright smoke needed (D2 does not block this story). The one fidelity caveat: the tests do NOT verify the LLM actually invokes `readKnowledgeBase` in a real generation (that would require a live LLM call — out of scope for unit tests; the tool's callability is verified via the prompt containing the project_id + the tool being in the agent's tool set).

### React 19 + Next.js 16 Rules

- N/A — no frontend changes in this story. The prompt builders are in `convex/ai/agents.ts` (backend). No `"use client"`, no `router.push`, no `forwardRef` concerns.

### Convex Gotchas

- `_creationTime` is auto-appended — the `.order("desc").first()` on `knowledge_bases.by_project_id` orders by `_creationTime` desc (newest KB first). Do NOT add `_creationTime` to the index.
- The `knowledge_bases.by_project_id` index is NOT unique — a project can have multiple KB rows (re-sync creates a new one per ADR 0008 + Story 1.8). `.first()` after `.order("desc")` picks the latest. Verify with the multiple-KB test (AC8).
- `kb_modules.apis`/`data_models`/`user_flows` are `v.any()` — they pass through the logic function as `unknown`. Do NOT runtime-validate them (the schema deliberately allows any shape per ADR 0008 §Negative; the AI extraction writes them and the AI test-gen reads them — both sides tolerate arbitrary JSON).
- The internal query's `v.id("projects")` arg validator rejects malformed IDs at the Convex boundary — but the tool's `validateConvexId` runs FIRST (in the `execute`) and returns a structured error, so the internal query only sees valid-format IDs. Belt-and-suspenders.

### File Organization

NEW backend code (existing files EXTENDED — no new files, no new directories):
```
convex/ai/tools/
├── definitions.ts          # EXTEND — add readKnowledgeBase to createToolDefinitions() return object
├── logic.ts                # EXTEND — add ReadKnowledgeBaseResult interface + readKnowledgeBaseLogic function
└── queries.ts              # EXTEND — add readKnowledgeBaseQuery internalQuery
```

MODIFIED backend (prompt builders + call sites):
```
convex/ai/
├── agents.ts               # MODIFY — add projectId? opt to buildPrdGenerationPrompt + buildNlGenerationPrompt; conditional one-line injection
├── prdWorkflowActions.ts   # MODIFY — line 60: add projectId: String(args.project_id) to buildPrdGenerationPrompt({...}) object literal
└── nlWorkflowActions.ts    # MODIFY — line 61: buildNlGenerationPrompt({ ...promptOpts, retryContext, projectId: String(args.project_id) }) — NOT promptOpts (reused by retry builder)
```

MODIFIED backend test (EXTEND, do NOT create new):
```
convex/ai/
└── agents.test.ts          # EXTEND — add describe("readKnowledgeBase") + prompt-builder tests + agent-wiring test
```

**No new directories.** All edits go into existing `convex/ai/tools/` and `convex/ai/` files. No `pnpm dev` restart needed (no new `convex/` directory).

**No schema changes.** `knowledge_bases` + `kb_modules` + their indexes are reused as-is.

**No new dependencies.** `createTool`, `internalQuery`, `v`, `z` are all already imported in the files being extended.

### Previous Story Intelligence

**Story 4.4 (Story Export) — the project's lowest-defect story (8 review patches), gold-standard spec:**
1. The C1 pre-review checklist (error paths + test-asserts-on-content + dual-write check) is applied above — keep the discipline.
2. The "Existing APIs to Reuse" + "What NOT to Reinvent" table format is inherited — every reuse target is cited with a file:line.
3. 4.4's `getStoriesByIds` batch-ownership pattern does NOT apply here — `readKnowledgeBaseLogic` does NO auth (internal query, trust boundary at agent invocation). Do NOT copy the `getMemberWorkspace` pattern into the tool logic.

**Story 4.1 (Impact Analysis Agent) — Task 0 C4-gate precedent:**
1. 4.1's Task 0 caught a FALSE spike claim (`_getBmadMetadata` did not exist at the cited line range). This story's Task 0 catches a related discrepancy: ADR 0008 §Integration Bridge shows `readKnowledgeBase` WITHOUT `validateConvexId`, but the installed `definitions.ts` USES it. The installed code wins (C4 gate — installed types are authoritative).
2. 4.1's "bare `generateObject` broke persistence" CRITICAL — the lesson: follow the agent-component wrapper pattern exactly. For this story, the equivalent is: follow the `createTool` + `internalQuery` + logic-function pattern exactly (do NOT shortcut by inlining the query inside `execute` — the three-file separation is the convention).

**Epic 4 retrospective — defects to avoid (D-series + insights):**

| Epic 4 Lesson | Mitigation in This Story |
|-------------------|--------------------------|
| D1 TS `ignoreBuildErrors` rot (insight #1) | Do NOT remove the flag (out of scope); DO verify via `pnpm typecheck` that no NEW errors are introduced (this story adds no tables/nested-validators → cascade unchanged) |
| jsdom test-fidelity (insight #2) | N/A — no jsdom surface; all tests are `convex-test` (edge-runtime) |
| C4 spike-citation gate (insight #3) | Task 0 verifies every infrastructure claim against installed `.d.ts`/source — especially the `validateConvexId` discrepancy with ADR 0008 |
| C1 pre-review checklist (insight #4) | Error-handling table + test-quality section above; target ≤8 review patches |
| Pre-prompt vs tools (insight #5) | Conscious choice: `readKnowledgeBase` is a TOOL (agentic test-gen), NOT pre-prompt injection. Story 5.3 adds the pre-prompt content block separately. |
| Deep `DataModel` from nested objects (insight #8) | This story adds NO tables and NO nested validators → does NOT worsen the `TestConvexForDataModel` cascade. Verified by the typecheck count comparison in AC10. |
| D5 multi-workspace `.first()` (Critical, 4-epic carry-forward) | The logic function does NO auth → does not inherit D5 directly. The calling AI actions do inherit it (systemic). NOT blocking this story; NOT fixable here. |
| D2 Playwright smoke gate | N/A — no browser/jsdom surface in this story. |

### Git Intelligence

Baseline: latest `main` = `56050e5` (Epic 4 retrospective + sprint-status → done). Relevant recent commits:
- `56050e5` — Epic 4 retrospective (D-series actions; this story's Dev Notes inherit the insights).
- `bb1aa54` — Story 4.4 (Story Export) — gold-standard spec + C1 checklist discipline.
- `a7772e4` — Story 4.1 (Impact Analysis Agent) — Task 0 C4-gate precedent + agent-component wrapper discipline.
- `d2fc4c6` — C5 `*-free` model guard in `getWorkspaceModel`. The Test Generation Agent inherits the guard via `getWorkspaceModel` — no action needed in this story (the guard is at model resolution, not at tool definition).

NEW schema: none. NEW `convex/` directory: none (existing `convex/ai/tools/`). NEW dependencies: none. NEW tables: none (insight #8 — no deep-instantiation cascade impact).

Single `feat:` commit per story (follow `bb1aa54` convention).

### Deferred Work Relevant to This Story

Per retro action A8, review `_bmad-output/implementation-artifacts/deferred-work.md`:

- **`readProjectContext` / `readExistingTests` / `readTestCode` prompts don't surface their IDs** (NEW latent finding from this story's Task 0): the existing tools are wired into the agent but the test-generation prompts do NOT include `project_id`/`suite_id`/`test_id`, so the LLM cannot invoke them. This story fixes the gap for `readKnowledgeBase` (injects project_id). Fixing it for the other three tools is a separate hardening task (consider a follow-up that surfaces all four IDs in the prompt). Document in deferred-work.md after implementation.
- **B3 IDOR on AI workflow actions** (`generatePrdTests` etc. — deferred-work lines 67, 105, 118): the public actions accept `project_id`/`suite_id` without workspace-ownership verification. The `readKnowledgeBase` tool inherits this surface (it trusts the project_id passed by the agent). NOT introduced by this story; NOT fixable here (it's a cross-cutting change to all AI workflow actions). Track as a separate security hardening story.
- **D5 multi-workspace `.first()`** (deferred-work lines 48, 99, 105, 118; Epic 4 retro Critical): the AI actions inherit it. NOT in this story.
- **D1 TS gate** (Epic 4 retro): the `ignoreBuildErrors` flag stays. NOT in this story.
- **D2 Playwright smoke** (Epic 4 retro): N/A for this story (no browser surface).
- **`getKnowledgeBase` returns full document** (defer-work line 53 — "future sensitive fields would auto-leak"): the `readKnowledgeBaseLogic` returns a CURATED shape (only architecture_summary/tech_stack/architecture_type + modules) — it does NOT return the raw `knowledge_bases` doc. So this story does NOT inherit that leak risk. (Note: the public `getKnowledgeBase` query at `knowledge/queries.ts:116-135` DOES return the raw doc — pre-existing, unchanged.)

### Project Structure Notes

- All new code is in EXISTING files under `convex/ai/tools/` and `convex/ai/`. No new directories.
- `logic.ts` stays a pure-logic module (no `internalQuery` wrapper, no Convex imports beyond `QueryCtx` + `Id` types — mirrors the existing `readProjectContextLogic`). Fully unit-testable via direct invocation in `t.run(async (ctx) => readKnowledgeBaseLogic(ctx, id))`.
- `queries.ts` stays a thin wrapper file (one `internalQuery` per logic function — mirrors the existing 3:1 ratio).
- `definitions.ts` stays the tool-registration file (one `createTool` per tool in the returned object).
- The `ReadKnowledgeBaseResult` interface is exported from `logic.ts` (not a separate types file — cohesion over type-directory pattern).
- Backend tests EXTEND `convex/ai/agents.test.ts` (one test file per domain at `convex/` root — per project-context.md:79, do NOT create `convex/ai/tools.test.ts`).

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 5.1] — ACs and user story (lines 785-802)
- [Source: _bmad-output/planning-artifacts/epics.md#Epic 5] — Epic context (lines 258-264, 781-784)
- [Source: _bmad-output/planning-artifacts/epics.md#FR-39] — Test Gen Agent gains readKnowledgeBase tool (line 65, 182)
- [Source: _bmad-output/planning-artifacts/epics.md#ARCH-9] — Integration bridge is tool-based (line 131)
- [Source: docs/adr/0008-combined-analyst-test-platform.md#Integration Bridge] — Tool pseudo-code (lines 94-120) — AUTHORITATIVE for the CONCEPT but NOT for the code shape (omits `validateConvexId`; Task 0 C4-gate catch). The installed `definitions.ts` is the code authoritative source.
- [Source: docs/adr/0008-combined-analyst-test-platform.md#Agent Definitions] — "Test Generation Agent gains readKnowledgeBase tool" (lines 88-92)
- [Source: docs/adr/0008-combined-analyst-test-platform.md#Negative] — `kb_modules.apis`/`data_models`/`user_flows` use `v.any()` deliberately (line 195)
- [Source: _bmad-output/implementation-artifacts/4-4-story-export.md] — Gold-standard spec + C1 checklist discipline + "Existing APIs to Reuse" / "What NOT to Reinvent" table format.
- [Source: _bmad-output/implementation-artifacts/4-1-impact-analysis-agent.md] — Task 0 C4-gate precedent (spike false-claim catch) + agent-component wrapper discipline.
- [Source: _bmad-output/implementation-artifacts/epic-4-retrospective.md] — Insight #5 (pre-prompt vs tools — the conscious choice for this story); insight #8 (deep DataModel — this story adds no tables); D-series critical-path items (D1/D2/D5 — none block this story).
- [Source: _bmad-output/implementation-artifacts/deferred-work.md] — lines 48, 53, 67, 99, 105, 118 (multi-workspace `.first()`, getKnowledgeBase full-doc leak, AI-action IDOR — all pre-existing, none introduced here).
- [Source: _bmad-output/project-context.md] — Critical rules: no-comments (51/93), ConvexError (48), "use node" isolation (49 — N/A here, the tool files export queries/internal functions only), IDOR B3 (120-124 — applies to PUBLIC functions; this is internal), C4 spike-citation (108), C1 checklist (106), reserved index names (67 — N/A, no new indexes).
- [Source: convex/ai/tools/definitions.ts:7-37] — **THE tool definition template** (`validateConvexId` helper + `readProjectContext` tool — copy exactly).
- [Source: convex/ai/tools/logic.ts:15-22] — **THE logic-function template** (`readProjectContextLogic` — `ctx.db.get`, return `null` on missing).
- [Source: convex/ai/tools/queries.ts:14-17] — **THE internal-query template** (`readProjectContextQuery`).
- [Source: convex/ai/agents.ts:217-224] — **`createTestGenerationAgent`** passes `tools: createToolDefinitions()` — adding a key auto-wires the tool.
- [Source: convex/ai/agents.ts:501-560] — **`buildPrdGenerationPrompt` + `buildNlGenerationPrompt`** — the prompt builders to extend with `projectId` opt.
- [Source: convex/ai/agents.test.ts:240-319] — **THE test block to extend** (`describe("Agent tools", ...)` — logic-function-direct invocation pattern).
- [Source: convex/ai/agents.test.ts:321-367] — **THE prompt-content test block to extend** (`describe("Prompt content snapshots", ...)`).
- [Source: convex/ai/agents.test.ts:115-162] — **THE agent-definitions test block to extend** (for the AC6 wiring assertion).
- [Source: convex/knowledge/queries.ts:116-135] — **`getKnowledgeBase`** — latest-KB-resolution pattern (`.order("desc").first()` on `by_project_id`).
- [Source: convex/knowledge/queries.ts:137-164] — **`getModules`** — modules-by-KB fetch pattern (`.withIndex("by_knowledge_base_id").collect()`). Returns SUMMARY shape; this story's logic function returns FULL shape.
- [Source: convex/knowledge/queries.ts:301-320] — **`_getProjectWorkspaceForSearch`** — alternative latest-KB-resolution pattern (internal query, same `.order("desc").first()`).
- [Source: convex/schema.ts:377-427] — **`knowledge_bases` + `kb_modules` tables** — field shapes + indexes. `apis`/`data_models`/`user_flows` are `v.any()` (lines 421-423).
- [Source: convex/testHelpers.ts:125-191] — **`seedKnowledgeBase` + `seedModule`** — test seed helpers (reuse, do NOT define local seeds).
- [Source: convex/ai/generatePrdTests.ts:9-41] — **`generatePrdTests`** public action — the trust-boundary entry point (calls `getProjectForAi`; pre-existing IDOR surface, not introduced here).
- [Source: convex/ai/prdWorkflowActions.ts:60] + [convex/ai/nlWorkflowActions.ts:55-61] — **the TWO call sites** for `buildPrdGenerationPrompt` / `buildNlGenerationPrompt` (pass `projectId` here; note nlWorkflowActions `promptOpts` is reused by the retry builder — add `projectId` to the main-builder call only).
- [Source: CONTEXT.md:30] — "Agent Tool" definition ( seven tools defined; this story adds the 8th — wait, CONTEXT.md lists `readKnowledgeBase (Analyst)` as already defined; that's a doc-vs-code drift — the tool is NOT yet in code. This story makes the doc accurate. UPDATE CONTEXT.md if the reviewer requires it, but it's primarily a code story.)

## Dev Agent Record

### Agent Model Used

opencode (glm-5.2 / zai-coding-plan/glm-5.2) — full story implementation in a single session via the bmad-dev-story skill.

### Debug Log References

- TDD cycle verified per task: RED (test fails before impl) → GREEN (test passes after impl) for the logic function (7 tests), prompt builders (7 tests), and agent wiring (1 test).
- Initial test-run attempt used `pnpm vitest` (frontend runner) by mistake — the convex test suite runs under `pnpm test:convex` (edge-runtime). Corrected.
- The "latest KB" ordering test uses insert-order (older KB seeded first, newer second) + distinct `architecture_summary` values, avoiding the flaky `setTimeout` pattern flagged in deferred-work line 71/97. Passed reliably.

### Completion Notes List

- **AC1 (tool definition)**: `readKnowledgeBase` added to `createToolDefinitions()` in `convex/ai/tools/definitions.ts`, mirroring `readProjectContext` exactly — `validateConvexId` guard, `z.object({ project_id: z.string() })` inputSchema (`z` from `zod/v3`), `ctx.runQuery(internal.ai.tools.queries.readKnowledgeBaseQuery, ...)`. Auto-wired into the Test Generation Agent via the existing `tools: createToolDefinitions()` call (no agent-factory change).
- **AC2 (logic function)**: `readKnowledgeBaseLogic` + `ReadKnowledgeBaseResult` interface added to `convex/ai/tools/logic.ts`. Resolves the latest KB via `.withIndex("by_project_id").order("desc").first()`, returns `null` if no KB / status !== "ready", fetches all modules via `.withIndex("by_knowledge_base_id").collect()`, returns curated shape: `{ architecture_summary, tech_stack, architecture_type, modules: [{ name, description, file_count, dependencies, apis, data_models, user_flows }] }`. The `apis`/`data_models`/`user_flows` fields pass through as `unknown` (schema uses `v.any()` per ADR 0008 §Negative — deliberate).
- **AC3 (internal query)**: `readKnowledgeBaseQuery` `internalQuery` added to `convex/ai/tools/queries.ts` with `args: { project_id: v.id("projects") }`, mirroring `readProjectContextQuery`.
- **AC4 (graceful empty)**: `null` for no KB / building / error; `{ ..., modules: [] }` for ready KB with zero modules. Both branches tested.
- **AC5 (callable via prompt)**: `buildPrdGenerationPrompt` + `buildNlGenerationPrompt` gained optional `projectId?: string` opt + `buildKnowledgeBaseToolHint(projectId)` helper (returns "" when falsy → no regression when omitted). Call sites updated: `prdWorkflowActions.ts` (passes `projectId: String(args.project_id)`); `nlWorkflowActions.ts` (passes `projectId` to the main builder call directly, NOT to the shared `promptOpts`, so the retry builder is unaffected). Retry builders unchanged.
- **AC6 (auto-wiring verified)**: test asserts `Object.keys(agent.options.tools ?? {})` contains `readKnowledgeBase` (and `readProjectContext`). The `AgentTools extends ToolSet` record shape confirmed against `node_modules/@convex-dev/agent/dist/client/index.d.ts`.
- **AC7 (no schema/deps/dirs)**: no schema changes, no new tables/indexes, no new npm deps, no new directories. Purely additive to existing `convex/ai/tools/` + `convex/ai/` files.
- **AC8 (tests)**: 15 new tests (7 readKnowledgeBase logic + 7 prompt-builder + 1 agent-wiring), all C1-asserts-on-content (specific strings/objects/arrays, never `typeof`). Total 1093 convex tests pass (1078 baseline + 15 new).
- **AC9 (validators/immutability/no-comments)**: `v.id("projects")` on the query arg; logic function returns fresh objects via `.map`; no code comments.
- **AC10 (verification)**: `pnpm lint` zero new errors (1 pre-existing frontend react-hooks error unchanged); `pnpm test:convex` 1093 passed; `pnpm test` (frontend) 481 passed; `pnpm typecheck` 866 lines = identical to baseline (zero new type errors — cascade unchanged as predicted); `pnpm build` ✓ Compiled successfully (with pre-existing `ignoreBuildErrors: true`).

### File List

**MODIFIED backend files:**
- `convex/ai/tools/logic.ts` — added `ReadKnowledgeBaseResult` interface + `readKnowledgeBaseLogic` function.
- `convex/ai/tools/queries.ts` — added `readKnowledgeBaseQuery` internalQuery + `readKnowledgeBaseLogic` import.
- `convex/ai/tools/definitions.ts` — added `readKnowledgeBase` tool to `createToolDefinitions()` return object.
- `convex/ai/agents.ts` — added `buildKnowledgeBaseToolHint` helper; added `projectId?: string` opt to `buildPrdGenerationPrompt` + `buildNlGenerationPrompt` with conditional injection.
- `convex/ai/prdWorkflowActions.ts` — pass `projectId: String(args.project_id)` to `buildPrdGenerationPrompt`.
- `convex/ai/nlWorkflowActions.ts` — pass `projectId: String(args.project_id)` to `buildNlGenerationPrompt` (directly on the call, not on shared `promptOpts`).

**MODIFIED backend test files:**
- `convex/ai/agents.test.ts` — extended: 7 `readKnowledgeBase` logic tests (inside `describe("Agent tools")`), 7 prompt-builder tests (inside `describe("Prompt content snapshots")`), 1 agent-wiring test (inside `describe("Agent definitions")`); added `seedWorkspace`, `seedProject`, `seedKnowledgeBase`, `seedModule` imports.

**No new files. No new directories. No schema changes. No new dependencies.**

### Change Log

- 2026-06-16: Implemented Story 5.1 (`readKnowledgeBase` Agent Tool) in TDD red-green-refactor cycle. Backend-only: 1 new logic function + interface, 1 new internal query, 1 new tool definition (auto-wired into Test Generation Agent), minimal `projectId` prompt injection at 2 call sites (makes the tool LLM-callable end-to-end). 15 new tests across 1 extended test file. `pnpm test:convex` (1093 passing), `pnpm test` (481 passing), `pnpm typecheck` (866 lines = baseline, zero new errors), `pnpm build` succeeds, `pnpm lint` zero new errors. Zero regressions.

### Review Findings

**Code review (2026-06-16)** — 3-layer adversarial review (Blind Hunter + Edge Case Hunter + Acceptance Auditor). 0 decision-needed, 0 patch, 4 defer, 8 dismissed. All 10 ACs satisfied; AC10 verification independently re-confirmed (`test:convex` 1093, `typecheck` 866 = baseline, `lint` 0 new errors). No new defects introduced; all deferred items are pre-existing/systemic and documented as out-of-scope in Dev Notes.

- [x] [Review][Defer] Cross-workspace IDOR — no auth/ownership check on LLM-supplied `project_id` [convex/ai/tools/logic.ts:39-48, definitions.ts:42-48] — deferred, pre-existing/systemic. Mirrors `readProjectContext` (and all sibling tools); trust boundary is the agent invocation, not the internal query. Spec Dev Notes "Auth/IDOR Boundary" defers hardening to the AI workflow actions (`generatePrdTests` etc.); tracked as B3 in deferred-work. **Highest-priority deferred item.**
- [x] [Review][Defer] `validateConvexId` regex (`/^[a-z0-9]{10,}$/i`) lets malformed IDs reach the runtime `v.id("projects")` validator → raw Convex error instead of the friendly `{error}` envelope [convex/ai/tools/definitions.ts:7-9] — deferred, pre-existing/systemic. Identical gap across all 4 sibling tools; spec mandates exact mirroring of `readProjectContext`. Fix belongs in `validateConvexId` itself (tighten to real Convex-id shape / add try-catch around `ctx.runQuery`).
- [x] [Review][Defer] Unbounded return payload — `.collect()` of all modules + full `apis`/`data_models`/`user_flows` JSON with no count/size cap [convex/ai/tools/logic.ts:50-67] — deferred. Real risk of exceeding tool-result/context limits for large KBs, but AC2 explicitly specifies returning the FULL grounding data, so bounding would violate the AC. Track as future hardening (cap module count + truncate large JSON fields).
- [x] [Review][Defer] Tool `execute` / `validateConvexId` error branch untested — only the pure logic function is unit-tested [convex/ai/agents.test.ts] — deferred, pre-existing/systemic test pattern. AC8 mandates mirroring the `readProjectContextLogic` direct-invocation test (which also skips the execute wrapper). Systemic across all tool tests.

---
baseline_commit: 0fb1504b4302c7808e476e5822b6ab25df35e735
---

# Story 5.4: Exploration Cross-References KB Modules

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want exploration to cross-reference discovered pages against Knowledge Base modules,
so that the system flags coverage gaps and proposes more relevant testable flows.

## Acceptance Criteria

1. **AC1 — `analyzeExploration` injects KB module context into the analysis prompt (additive)**: The `analyzeExploration` internalAction (`convex/ai/exploreApp.ts:280`) is EXTENDED. After the existing `getProjectForAi` lookup (`exploreApp.ts:310-312`) and BEFORE the `agent.generateText` call (`exploreApp.ts:338`), it calls `ctx.runQuery(internal.ai.tools.queries.readKnowledgeBaseQuery, { project_id: exploration.project_id })` — REUSING the internal query built by Story 5.1 (`tools/queries.ts:26-29`, NO new query). It then formats the result via `buildKbContextBlock(kb, null)` (the helper built by Story 5.3 at `agents.ts:550`) — passing `null` for the RD arg because exploration cross-references against KB MODULES (code structure), NOT the Baseline RD (requirements); the project's PRD text is already injected separately via the existing `prdSection` (`exploreApp.ts:329-332`), so RD would be redundant. The returned `kbContext` string is injected into the prompt IMMEDIATELY AFTER the `${flowsDescription}` block and BEFORE `${prdSection}` — so the LLM sees captured pages → flows → KB modules → PRD. When `kbContext` is `""` (KB absent / not ready / zero modules — `readKnowledgeBaseLogic` returns `null` fast at `logic.ts:48`, and `buildKbContextBlock(null, null) === ""`), the prompt is byte-identical to the pre-5.4 prompt (no new section, no new whitespace) — the additive-only / no-regression guarantee. The `ctx.runQuery` is ADDITIVE — it runs for every analysis (even when KB absent) but is an O(1) index lookup returning `null` fast when no ready KB.

2. **AC2 — `EXPLORATION_ANALYSIS_PROMPT` + `ANALYSIS_PROMPT` instruct KB cross-referencing (conditional, additive)**: The system-instructions constant `EXPLORATION_ANALYSIS_PROMPT` (`agents.ts:162-179`) gains a NEW paragraph that activates ONLY when KB context is present in the user prompt: instruct the agent to cross-reference discovered pages against the provided KB modules and, for each scenario, set a `kbModule` field to the EXACT KB module name (verbatim from the context block) it most closely corresponds to — omit the field when no KB context is provided OR no module is a clear match. The per-call `ANALYSIS_PROMPT` (`exploreApp.ts:243-268`) JSON-schema description gains a NEW optional field: `- "kbModule": string (optional) — the EXACT name of the Knowledge Base module this scenario corresponds to. Only include when KB module context is provided above AND the scenario clearly maps to one module. Use the module name verbatim. Omit if no KB context or no clear match.` The conditional cross-reference instruction is injected into the user prompt (NOT the system prompt) as `kbContextSection` so it is ONLY emitted when `kbContext` is non-empty — keeping the no-KB path byte-identical. The existing analysis rules (forms/tables/modals/etc. at `exploreApp.ts:248-258`) are UNCHANGED.

3. **AC3 — `explorationScenarioSchema` gains optional `kbModule`; mapping + validator mirror it**: The zod schema `explorationScenarioSchema` (`agents.ts:10-17`) gains `kbModule: z.string().optional()` (camelCase, matching the existing `flowSummary`/`relevantPageUrls` convention). The Convex `proposed_scenarios` validator (`schema.ts:290-301`) gains `kb_module: v.optional(v.string())` (snake_case, matching the existing `flow_summary`/`relevant_page_urls` convention). The scenario mapping in `exploreApp.ts:367-374` gains `kb_module: s.kbModule` (mapped camel→snake, alongside the existing `flow_summary: s.flowSummary` mapping). The LLM is NOT required to emit `kbModule` for every scenario — when omitted, the field is `undefined` (a scenario with no clear KB module match is valid). Both fields are OPTIONAL everywhere — existing explorations (analyzed before 5.4) remain valid; existing proposed_scenarios without `kb_module` are untouched (no migration — optional fields are backward-compatible in Convex).

4. **AC4 — `computeKbCoverageGaps` pure function deterministically derives coverage gaps**: A NEW exported pure function `computeKbCoverageGaps(moduleNames: string[], scenarios: { kbModule?: string }[]): string[]` is added to `convex/ai/agents.ts` (alongside the existing `buildKbContextBlock` — the KB-helper home established by 5.3). It returns the KB module names that have NO scenario annotated with them (case-insensitive exact match after `trim()`): `moduleNames.filter(name => !coveredSet.has(name.trim().toLowerCase()))` where `coveredSet = new Set(scenarios.map(s => s.kbModule?.trim().toLowerCase()).filter(Boolean))`. It is PURE (no `ctx`, no I/O, never throws — empty inputs return `[]`). Rationale: the LLM annotates scenarios with `kbModule`; gaps are then the KB modules NOT referenced by any scenario — which closely matches "KB modules with no matching exploration page" (scenarios are page-derived, so an unannotated module ≈ a module with no matching page). This avoids changing the LLM's response format (still a JSON array — robust) and avoids relying on the LLM to consistently emit a separate gaps structure. The function is EXPORTED so it can be unit-tested directly with exact input control (mirrors 5.3's `truncateContext` export rationale).

5. **AC5 — `storeProposedScenarios` stores `kb_coverage_gaps`; new optional field on `explorations`**: The `storeProposedScenarios` internalMutation (`convex/explorations/internal.ts:97-118`) gains a NEW optional arg `kb_coverage_gaps: v.optional(v.array(v.string()))`. Its handler patches `kb_coverage_gaps` onto the exploration doc when provided (alongside the existing `proposed_scenarios` + `status: "analyzed"` patch). A NEW optional field `kb_coverage_gaps: v.optional(v.array(v.string()))` is added to the `explorations` table (`schema.ts:260-314`, as a sibling to the existing `prd_coverage` field at `schema.ts:289` — same optional-array-of-strings shape). The field is OPTIONAL — existing explorations get `undefined` (no migration; backward-compatible). When the analysis has no KB, `kb_coverage_gaps` is `undefined`/empty (NOT stored as `[]` — omit the arg entirely so the field stays `undefined` for no-KB explorations, mirroring how `prd_coverage` is omitted when absent).

6. **AC6 — `analyzeExploration` computes + passes gaps; no-KB path is a no-op**: After the scenario validation (`exploreApp.ts:366-374`), the action computes `const kbCoverageGaps = kb ? computeKbCoverageGaps(kb.modules.map(m => m.name), validated) : undefined;` and passes `kb_coverage_gaps: kbCoverageGaps` to `storeProposedScenarios` (`exploreApp.ts:385-388`). When `kb` is `null` (no ready KB), `kbCoverageGaps` is `undefined` → the `storeProposedScenarios` arg is omitted → the exploration's `kb_coverage_gaps` field stays `undefined` → byte-identical to pre-5.4 behavior (no-regression). When `kb` is non-null but EVERY module is annotated on some scenario, `kbCoverageGaps` is `[]` (an empty array — this IS stored, distinct from `undefined`, signaling "KB present, full coverage"). The error path (`exploreApp.ts:375-383`) is UNCHANGED — if the LLM call fails, the exploration is marked `failed` with no `kb_coverage_gaps` (KB injection does not change failure behavior).

7. **AC7 — Frontend surfaces `kb_module` annotation on scenarios + KB coverage gaps banner**: The `Scenario` interface (`src/app/(auth)/projects/[id]/explore/types.ts:13-19`) gains `kb_module?: string` (snake_case — the frontend consumes the raw Convex doc). `ScenarioList.tsx` renders a small neutral badge (`KB: <module>`) next to each scenario's name WHEN `kb_module` is present (omitted otherwise — no visual change for scenarios without a KB module). `page.tsx` adds a KB coverage gaps info banner — MIRRORING the existing `prdGaps` banner at `page.tsx:634-641` (amber styling, same structure) — that renders WHEN `kb_coverage_gaps` is non-empty, with copy like: `<N> Knowledge Base module(s) have no matching exploration page. Consider exploring these areas to improve coverage.` The banner reads `kb_coverage_gaps` via a NEW `useMemo` (mirroring the existing `prdGaps` memo at `page.tsx:92-95`). `FeatureMapGraph.tsx` (the map view) is UNCHANGED — the `kb_module` annotation is shown ONLY in the list view (keeps the map clean; the map already encodes `area` + `emptyAreas`). The existing `prdGaps` banner + `emptyAreas` logic are UNCHANGED (KB gaps are additive, a SEPARATE concern from PRD gaps).

8. **AC8 — No new tables beyond the `kb_coverage_gaps` field; no new internal queries; no new dependencies; no new directories**: The `explorations` table gains ONE optional field (`kb_coverage_gaps`). The `proposed_scenarios` nested validator gains ONE optional field (`kb_module`). No new Convex table, no new index. No new npm dependency. No new `convex/` directory (existing `convex/ai/`, `convex/explorations/`, `convex/schema.ts`, and `src/app/.../explore/` are extended — no `pnpm dev` restart needed). No new internal query/logic function — Story 5.1's `readKnowledgeBaseQuery` is reused verbatim; Story 5.3's `buildKbContextBlock` is reused verbatim. This story is: ONE new pure function (`computeKbCoverageGaps`) + ONE prompt-injection block + prompt-instruction additions + ONE zod field + ONE schema field + ONE nested-validator field + ONE mutation-arg + ONE action-call-site extension + minimal frontend (1 interface field + 1 badge + 1 banner) + tests.

9. **AC9 — Tests (TDD, ≥80% coverage on new code)**:
   - **`computeKbCoverageGaps` unit tests** — EXTEND `convex/ai/agents.test.ts` (the existing `describe("Prompt content snapshots", ...)` block — the KB-helper test home established by 5.3; do NOT create a new file). Tests (all assert CONTENT — specific values, per C1):
     - Returns `[]` when `moduleNames` is empty.
     - Returns `[]` when ALL modules are annotated on at least one scenario (full coverage).
     - Returns the unmatched module name(s) when some modules have no annotating scenario (specific strings).
     - Case-insensitive + trim: scenario `kbModule: " auth module "` covers module `"Auth Module"` → the module is NOT in the gaps.
     - Scenarios with `kbModule: undefined` / `""` / whitespace-only are ignored (do not cover any module).
     - Duplicate module annotations (two scenarios annotating the same module) do not cause issues.
     - Returns `[]` when `scenarios` is empty AND `moduleNames` is empty; returns ALL module names when `scenarios` is empty but `moduleNames` is non-empty.
   - **Prompt-injection + schema unit tests** — EXTEND `convex/ai/agents.test.ts`. The existing `explorationScenarioSchema` tests (`agents.test.ts:197-211`) MUST still pass. ADD:
     - `explorationScenarioSchema.safeParse({ name, description, flowSummary, area, kbModule: "Auth Module" }).success === true`.
     - `explorationScenarioSchema.safeParse({ name, description, flowSummary, area })` (no `kbModule`) `.success === true` — the field is optional.
   - **Action integration test** — EXTEND `convex/ai.kbContext.test.ts` (the root-level integration-test file created by 5.3 — the PROVEN convention for action-invoking tests that mock the agent; do NOT create a new file). Use the existing `vi.mock` + `vi.hoisted` pattern to mock `createExplorationAnalysisAgent` + `getWorkspaceModel` and capture the prompt passed to the agent. ADD:
     - Seed `seedWorkspace` → `seedProject` → `seedKnowledgeBase({ status: "ready" })` → `seedModule` (×2 with distinct names) → an exploration with `captured_pages`. Invoke `analyzeExploration` (via `t.action` or direct internal call with the mocked agent). Assert the captured prompt CONTAINS `## Project Knowledge Context` AND a seeded module name (specific string — proves the KB fetch + `buildKbContextBlock` + injection chain).
     - Seed a project with NO KB. Invoke `analyzeExploration`. Assert the captured prompt does NOT contain `## Project Knowledge Context` (no-regression no-op path).
     - NOTE: full agent invocation requires a live LLM — OUT OF SCOPE. The integration test mocks the agent's `generateText` and asserts on the PROMPT + the resulting `storeProposedScenarios` call (mock or spy on the internal mutation), NOT on generated scenarios. Mirror 5.3's mock discipline.
   - **Frontend tests** — EXTEND `src/app/(auth)/projects/[id]/explore/explore.test.tsx` + `FeatureMapGraph.test.tsx` only if needed. ADD:
     - `ScenarioList` renders `KB: Auth Module` badge when a scenario has `kb_module: "Auth Module"`; does NOT render the badge when `kb_module` is absent.
     - `page.tsx` renders the KB coverage gaps banner with the seeded module name(s) when `kb_coverage_gaps` is non-empty; does NOT render the banner when `kb_coverage_gaps` is empty/absent.
     - Existing explore tests (fixtures at `explore.test.tsx:136-151`) MUST still pass — the new `kb_module` field is optional and absent in existing fixtures (no visual change).
   - All existing tests pass — zero regressions (`pnpm test:convex`, `pnpm test`).

10. **AC10 — Convex validators + immutability + no-comments + verification**:
    - No new PUBLIC Convex function. `storeProposedScenarios` is an existing internalMutation — its arg validator is extended (additive optional arg). `analyzeExploration` is an existing internalAction — its args are UNCHANGED (it takes only `exploration_id`).
    - `computeKbCoverageGaps` returns a NEW array (pure; reads inputs, never mutates). The `ReadKnowledgeBaseResult` input is read-only.
    - `kb_coverage_gaps` + `kb_module` are `v.optional(...)` — backward-compatible, no migration.
    - No code comments (project-context.md:51/93).
    - **Verification:**
      - `pnpm lint` — zero new errors.
      - `pnpm test:convex` — all backend tests pass, zero regressions, new tests green.
      - `pnpm test` — all frontend tests pass, zero regressions.
      - `pnpm typecheck` — no NEW type errors beyond the pre-existing deep-instantiation cascade (Epic 4 retro D1; baseline ~868 lines per Story 5.3). This story adds ONE optional field to an EXISTING table + ONE optional field to a nested array validator — verify the cascade count does not meaningfully increase (compare via `git stash && pnpm typecheck 2>&1 | wc -l` baseline vs. post-change).
      - `pnpm build` — succeeds (the pre-existing `typescript.ignoreBuildErrors: true` flag at `next.config.ts` remains — D1 owns its removal, out of scope).

## Tasks / Subtasks

- [x] Task 0: Verify infrastructure claims (C4 spike-citation gate) (AC: #1, #2, #3, #5, #8)
  - [x] Confirm `readKnowledgeBaseQuery` is an `internalQuery` in `convex/ai/tools/queries.ts:26-29` taking `{ project_id: v.id("projects") }` — callable from `analyzeExploration` (a `"use node"` internalAction — `exploreApp.ts:1`) via `ctx.runQuery`. Reuse — do NOT create a new query. Confirm `readKnowledgeBaseLogic` returns `null` FAST when KB absent/not-ready (`logic.ts:48`).
  - [x] Confirm `buildKbContextBlock(kb: ReadKnowledgeBaseResult | null, rd: ReadBaselineRdResult | null): string` is EXPORTED from `convex/ai/agents.ts:550` (added by 5.3) and returns `""` when `kb` is `null` OR `kb.modules.length === 0` (zero-module KB edge — `agents.ts:556`). Confirm passing `null` for the RD arg yields a KB-only block (no `### Baseline Requirements Document` section).
  - [x] Confirm `TEST_GEN_KB_CONTEXT_CHARS = 6000` exists in `convex/lib/constraints.ts` (added by 5.3) — `buildKbContextBlock` truncates at this cap. Confirm this cap is acceptable for the exploration prompt (the analysis prompt is smaller than test-gen — it has captured pages + flows but NOT snapshot/DOM context; 6000 chars of KB is a bounded additive contribution). Document if a SEPARATE exploration-specific cap is warranted (Decision: reuse `TEST_GEN_KB_CONTEXT_CHARS` — no new constant; the cap is generous enough and avoids fragmenting truncation config — see Dev Notes "Reuse the 6000 cap").
  - [x] Confirm `analyzeExploration` is at `exploreApp.ts:280`, is an `internalAction` (NOT public — no IDOR concern from this story; the inherited B3/D5 surface is on the reused `readKnowledgeBaseQuery`, pre-existing, deferred). Confirm it already calls `ctx.runQuery(internal.projects.queries.getProjectForAi, ...)` at `exploreApp.ts:310` — so `ctx.runQuery(internal.ai.tools.queries.readKnowledgeBaseQuery, ...)` is the SAME established pattern.
  - [x] Confirm `getExplorationForAnalysis` (`internal.ts:168-183`) returns `project_id` (line 175) — so the action has `exploration.project_id` in scope to pass to `readKnowledgeBaseQuery`. NO change to this query needed.
  - [x] Confirm `explorationScenarioSchema` is at `agents.ts:10-17` (zod/v3 — note the `import { z } from "zod/v3"` at `agents.ts:3`; add the field with the SAME zod instance). Confirm the camelCase convention (`flowSummary`, `relevantPageUrls`).
  - [x] Confirm the scenario mapping (camel→snake) is at `exploreApp.ts:367-374` — add `kb_module: s.kbModule` alongside the existing `flow_summary: s.flowSummary`.
  - [x] Confirm `storeProposedScenarios` is at `internal.ts:97-118` and patches `proposed_scenarios` + `status` at `internal.ts:112-116`. Confirm adding `kb_coverage_gaps` to the args validator + the patch object is additive (existing callers that omit it are unaffected).
  - [x] Confirm the `explorations` table is at `schema.ts:260-314` and `prd_coverage` (line 289) is the sibling pattern for an optional-array-of-strings field. Confirm `kb_coverage_gaps` as a new optional field is backward-compatible (existing docs get `undefined`).
  - [x] Confirm the frontend `Scenario` interface is at `src/app/(auth)/projects/[id]/explore/types.ts:13-19` and is consumed at `page.tsx:102-105` + `ScenarioList.tsx`. Confirm the `prdGaps` banner pattern is at `page.tsx:634-641` (the structure to mirror for the KB gaps banner).
  - [x] Confirm `convex/ai.kbContext.test.ts` exists (created by 5.3) and uses the `vi.mock` + `vi.hoisted` pattern to mock agents — extend it for the `analyzeExploration` integration assertions (do NOT create a new integration test file).
  - [x] Baseline `pnpm typecheck` count (≈868 lines per Story 5.3). Re-run after changes; this story adds an optional field to an existing table + a nested validator field — verify no meaningful cascade increase.

- [x] Task 1: Write `computeKbCoverageGaps` tests FIRST (AC: #4, #9) — TDD RED
  - [x] EXTEND `convex/ai/agents.test.ts` — add `describe("computeKbCoverageGaps", ...)` inside the existing `describe("Prompt content snapshots", ...)` block (do NOT create a new file).
  - [x] Test returns `[]` for empty `moduleNames`.
  - [x] Test returns `[]` when all modules covered.
  - [x] Test returns unmatched module names (specific strings) when some uncovered.
  - [x] Test case-insensitive + trim matching (`" Auth Module "` covers `"Auth Module"`).
  - [x] Test undefined/empty/whitespace `kbModule` ignored.
  - [x] Test duplicate annotations safe.
  - [x] Test empty scenarios + empty modules → `[]`; empty scenarios + non-empty modules → all modules returned.
  - [x] Confirm RED (function doesn't exist yet).

- [x] Task 2: Implement `computeKbCoverageGaps` (AC: #4, #10) — TDD GREEN
  - [x] In `convex/ai/agents.ts`, add `export function computeKbCoverageGaps(moduleNames: string[], scenarios: { kbModule?: string }[]): string[]`.
  - [x] Build `coveredSet` from scenarios' `kbModule` (trim + lowercase, filter falsy).
  - [x] Return `moduleNames.filter(name => !coveredSet.has(name.trim().toLowerCase()))`.
  - [x] Verify all Task 1 tests GREEN.

- [x] Task 3: Add `kbModule` to zod schema + validator + mapping (AC: #3, #8) — GREEN
  - [x] MODIFY `explorationScenarioSchema` (`agents.ts:10-17`): add `kbModule: z.string().optional(),`.
  - [x] MODIFY `proposed_scenarios` validator (`schema.ts:290-301`): add `kb_module: v.optional(v.string()),` inside the nested `v.object({...})`.
  - [x] MODIFY the scenario mapping (`exploreApp.ts:367-374`): add `kb_module: s.kbModule,` to the mapped object.
  - [x] ADD zod-schema tests (`agents.test.ts`): `kbModule` present → valid; `kbModule` absent → valid (optional). Confirm existing `explorationScenarioSchema` tests still GREEN.

- [x] Task 4: Extend `storeProposedScenarios` + add `kb_coverage_gaps` field (AC: #5, #8) — GREEN
  - [x] MODIFY `schema.ts` `explorations` table: add `kb_coverage_gaps: v.optional(v.array(v.string())),` as a sibling to `prd_coverage` (line 289).
  - [x] MODIFY `storeProposedScenarios` (`internal.ts:97`): add `kb_coverage_gaps: v.optional(v.array(v.string())),` to args. In the handler, conditionally spread `...(args.kb_coverage_gaps !== undefined ? { kb_coverage_gaps: args.kb_coverage_gaps } : {})` into the patch (mirror the existing conditional-spread pattern at `internal.ts:53-54`).

- [x] Task 5: Add `EXPLORATION_ANALYSIS_PROMPT` + `ANALYSIS_PROMPT` KB instructions (AC: #2) — GREEN
  - [x] MODIFY `EXPLORATION_ANALYSIS_PROMPT` (`agents.ts:162-179`): add a paragraph — "When Knowledge Base module context is provided in the user prompt, cross-reference the discovered pages against those modules. For each scenario that clearly corresponds to a Knowledge Base module, set `kbModule` to the EXACT module name (verbatim). Omit `kbModule` when no Knowledge Base is provided or no module is a clear match."
  - [x] MODIFY `ANALYSIS_PROMPT` (`exploreApp.ts:243-268`) JSON-schema description: add the `- "kbModule": string (optional) — ...` line.
  - [x] These are additive string changes; no new tests required for the constant strings themselves (the integration test in Task 7 verifies the prompt contains the cross-reference instruction).

- [x] Task 6: Plumb KB fetch + injection + gap computation in `analyzeExploration` (AC: #1, #6) — GREEN
  - [x] In `exploreApp.ts`: add `import { buildKbContextBlock, computeKbCoverageGaps } from "./agents";` (extend the existing import line at `exploreApp.ts:7`).
  - [x] After the `getProjectForAi` lookup (`exploreApp.ts:310-312`) and BEFORE building the prompt, add:
    ```
    const kb = await ctx.runQuery(internal.ai.tools.queries.readKnowledgeBaseQuery, {
      project_id: exploration.project_id,
    });
    const kbContext = buildKbContextBlock(kb, null);
    const kbContextSection = kbContext
      ? `\nKnowledge Base modules:\n${kbContext}\n\nIMPORTANT: Cross-reference the discovered pages above against these Knowledge Base modules. For each scenario that clearly maps to a module, set "kbModule" to the EXACT module name verbatim.\n`
      : "";
    ```
  - [x] Inject `${kbContextSection}` into the prompt template (`exploreApp.ts:340-347`) AFTER `${flowsDescription ? ... : ""}` and BEFORE `${prdSection}`.
  - [x] After the scenario validation + mapping (`exploreApp.ts:366-374`), compute `const kbCoverageGaps = kb ? computeKbCoverageGaps(kb.modules.map((m) => m.name), validated) : undefined;` (note: use `validated` — the camelCase zod-parsed array — as the scenarios arg; `computeKbCoverageGaps` reads `.kbModule`).
  - [x] Pass `kb_coverage_gaps: kbCoverageGaps` to the `storeProposedScenarios` call (`exploreApp.ts:385-388`). When `kb` is null → `kbCoverageGaps` is `undefined` → arg omitted → field stays `undefined`.
  - [x] DO NOT modify the error path (`exploreApp.ts:375-383`) — KB injection does not change failure behavior.

- [x] Task 7: Write action integration test (AC: #1, #6, #9) — TDD GREEN
  - [x] EXTEND `convex/ai.kbContext.test.ts` (5.3's root-level integration-test file). Inspect the existing `vi.mock` + `vi.hoisted` pattern for `createTestGenerationAgent`; mirror it for `createExplorationAnalysisAgent` (mock the agent, capture the prompt via `generateText` spy).
  - [x] Seed a project WITH a ready KB (2 modules with distinct names) + an exploration with `captured_pages` + `status: "captured"`. Invoke the `analyzeExploration` action (via `t.run` or the internal action). Assert the captured prompt CONTAINS `## Project Knowledge Context` AND a seeded module name (specific string). Assert the resulting exploration doc has `proposed_scenarios[].kb_module` populated where the mock LLM emitted `kbModule`, AND `kb_coverage_gaps` reflecting the deterministic computation.
  - [x] Seed a project with NO KB. Invoke `analyzeExploration`. Assert the captured prompt does NOT contain `## Project Knowledge Context` AND the exploration's `kb_coverage_gaps` is `undefined` (no-regression no-op path).
  - [x] Mock discipline: the LLM `generateText` returns a canned JSON array of scenarios (with + without `kbModule`); assert on the prompt + the stored doc, NOT on real LLM output. Mirror 5.3's `ai.kbContext.test.ts` mock factory.

- [x] Task 8: Frontend — `kb_module` badge + KB gaps banner (AC: #7, #9) — GREEN
  - [x] MODIFY `src/app/(auth)/projects/[id]/explore/types.ts:13-19`: add `kb_module?: string;` to the `Scenario` interface.
  - [x] MODIFY `ScenarioList.tsx`: render a small `KB: {scenario.kb_module}` badge (neutral styling — e.g. `bg-[var(--border-soft)] text-[var(--muted)] text-[10px]`) next to the scenario name WHEN `kb_module` is present. Omit otherwise (no visual change for scenarios without it).
  - [x] MODIFY `page.tsx`: add a `kbCoverageGaps` `useMemo` mirroring `prdGaps` (`page.tsx:92-95`) — read `exploration?.kb_coverage_gaps ?? []`. Add a banner MIRRORING the `prdGaps` banner (`page.tsx:634-641`) — render WHEN `kbCoverageGaps.length > 0` with copy: `<N> Knowledge Base module(s) have no matching exploration page. Consider exploring these areas to improve coverage.`
  - [x] EXTEND `explore.test.tsx`: add a fixture scenario WITH `kb_module` + an exploration WITH `kb_coverage_gaps`; assert the badge + banner render. Confirm existing fixtures (without the new fields) still render unchanged.
  - [x] DO NOT modify `FeatureMapGraph.tsx` (the map view stays clean — `kb_module` is list-view only).

- [x] Task 9: Validation (AC: #10)
  - [x] `pnpm lint` — zero new errors.
  - [x] `pnpm test:convex` — all backend tests pass; new tests green; zero regressions.
  - [x] `pnpm test` — all frontend tests pass; zero regressions.
  - [x] `pnpm typecheck` — no NEW type errors (compare count vs. ~868-line baseline; optional field additions should not meaningfully worsen the deep-instantiation cascade).
  - [x] `pnpm build` — succeeds (pre-existing `ignoreBuildErrors: true` still in place — D1 owns its removal).

## Dev Notes

### Scope Boundary

**This story implements:**
- KB context injection into `analyzeExploration` (fetch via 5.1's `readKnowledgeBaseQuery` → format via 5.3's `buildKbContextBlock(kb, null)` → inject into the analysis prompt).
- `EXPLORATION_ANALYSIS_PROMPT` + `ANALYSIS_PROMPT` additions instructing KB cross-referencing + the `kbModule` field.
- ONE new pure function `computeKbCoverageGaps(moduleNames, scenarios)` in `convex/ai/agents.ts` (deterministically derives coverage gaps from KB module names minus scenario annotations).
- ONE zod field (`kbModule?`) on `explorationScenarioSchema`; ONE nested-validator field (`kb_module?`) on `proposed_scenarios`; ONE schema field (`kb_coverage_gaps?`) on `explorations`.
- `storeProposedScenarios` gains an optional `kb_coverage_gaps` arg + patches it.
- `analyzeExploration` computes gaps + passes them to `storeProposedScenarios`.
- Minimal frontend: `Scenario.kb_module?` interface field + `ScenarioList` badge + `page.tsx` KB gaps banner.
- Tests extending `convex/ai/agents.test.ts` (pure function + schema) + `convex/ai.kbContext.test.ts` (integration) + `explore.test.tsx` (frontend).

**This story does NOT implement:**
- A new agent tool for the Exploration Analysis Agent. The agent (`createExplorationAnalysisAgent`, `agents.ts:376`) is a plain `Agent` with instructions + a single `generateText` call — it has NO tools attached and does NOT use a tool-calling loop. Cross-referencing is done via DETERMINISTIC pre-prompt injection (KB block) + LLM annotation, NOT via the `readKnowledgeBase` tool (5.1's tool is for the Test Generation Agent). See "Pre-Prompt Injection vs Agent Tool — Why Both" (5.1/5.3 Dev Notes).
- Deterministic page→module URL matching. KB module `user_flows`/`apis` are `v.any()` (deliberately — ADR 0008 §Negative); their shapes vary, and URL↔route matching is fuzzy. The LLM (which already reasons semantically about page content) does the cross-referencing; gaps are then derived deterministically from the annotations. See "Why LLM-Driven Cross-Referencing".
- Wiring the Baseline RD into the exploration prompt. The AC says "cross-reference against Knowledge Base modules" (code structure), not RD (requirements). The project's PRD text is ALREADY injected via `prdSection` (`exploreApp.ts:329-332`). RD would be redundant. `buildKbContextBlock(kb, null)` deliberately passes `null` for RD.
- Any change to the Test Generation Agent, test-gen prompts (`buildPrdGenerationPrompt`/`buildNlGenerationPrompt`), or the test-generation workflow actions — those are 5.3's scope (complete).
- A Playwright smoke test (D2 — this story's backend is testable in `convex-test`; the frontend badge/banner is testable in jsdom. No browser surface).
- Removing `typescript.ignoreBuildErrors: true` (Epic 4 retro D1 — separate `fix:` commit, owned by Winston).
- The D6 codebase-wide truncation rollout to `impactPrompts.ts`/`storyPrompts.ts` (separate task, owned by Amelia — 5.3 addressed it for the test-gen block; this story REUSES `buildKbContextBlock` which already uses `truncateContext`).
- Fixing the multi-workspace IDOR on `readKnowledgeBaseQuery` (D5/B3 — pre-existing, systemic; the `ctx.runQuery` call inherits the same trust boundary as 5.1/5.2/5.3. NOT introduced by this story; NOT fixable here).

### CRITICAL: Reuse 5.1 + 5.3 — Do NOT Re-Query or Re-Format

The action's KB handling is THREE lines of plumbing: fetch (via `readKnowledgeBaseQuery`) → format (via `buildKbContextBlock(kb, null)`) → inject (via `kbContextSection`). **Do NOT:**
- Add a new "getExplorationKb" query/logic function that re-resolves the KB — 5.1's `readKnowledgeBaseQuery` + `readKnowledgeBaseLogic` already return the curated shape (with the `status !== "ready"` guard at `logic.ts:48` and the module map at `logic.ts:50-53`).
- Re-implement KB formatting — 5.3's `buildKbContextBlock` already produces the `## Project Knowledge Context` / `### Knowledge Base` / module-names+apis+flows block with boundary-aware truncation (`truncateContext` at `agents.ts:510`) and defensive `unknown` rendering (`renderApis`/`renderUserFlows`). Reuse it verbatim.
- Re-implement truncation — `buildKbContextBlock` already caps at `TEST_GEN_KB_CONTEXT_CHARS` (6000). See "Reuse the 6000 cap".

### Why LLM-Driven Cross-Referencing (not deterministic URL matching)

The AC says "each discovered page is cross-referenced against KB modules" + "coverage gaps are flagged (KB modules with no matching exploration pages)". Two implementation strategies:

1. **Deterministic URL↔module matching** — match discovered_page URLs against KB module `user_flows[].route` / `apis[].path`. REJECTED because: (a) `user_flows`/`apis` are `v.any()` (shapes vary wildly — ADR 0008); (b) URL↔route matching is fuzzy (`/dashboard` vs `/app/dashboard` vs relative paths); (c) a module's pages may not be captured at stable URLs (SPAs, client-side routing); (d) building a robust matcher is a large, fragile subsystem.
2. **LLM-driven cross-referencing** — inject the KB block into the analysis prompt; the LLM (which ALREADY reasons semantically about page content to propose scenarios) annotates each scenario with `kbModule`. ACCEPTED because: (a) the LLM is already doing semantic page analysis — module attribution is the same kind of reasoning; (b) the KB block's module names + apis + flows give the LLM strong matching signal; (c) gaps are then derived DETERMINISTICALLY via `computeKbCoverageGaps` (no reliance on the LLM to emit a separate gaps structure); (d) minimal code — one prompt addition + one pure function.

This mirrors 5.3's "Pre-Prompt Injection vs Agent Tool — Why Both": the deterministic block (5.3/5.4) is the always-on summary; the tool (5.1) is the on-demand pull. The Exploration Analysis Agent uses the BLOCK (it's a single-shot analysis, not a tool loop); the Test Generation Agent uses the TOOL (it generates tests iteratively).

### Why Compute Gaps Deterministically (not LLM-emitted)

The LLM returns a JSON ARRAY of scenarios. Two options for coverage gaps:
- (a) LLM emits a separate `coverageGaps` array — requires changing the response format from array to object `{ scenarios, coverageGaps }` (bigger parse change) OR a second LLM call (cost). Both are fragile (LLMs emit auxiliary structures inconsistently).
- (b) Compute gaps deterministically from the annotations: `gaps = kbModuleNames − set(scenarios.kbModule)`. ACCEPTED — keeps the response format unchanged (array), is robust, is testable as a pure function, and is accurate (if the LLM annotates well). A module the LLM didn't annotate IS a coverage gap (the LLM wasn't confident it matched a page).

The gap is "module with no annotating scenario" which closely matches "module with no matching exploration page" (scenarios are page-derived). Document this in `EXPLORATION_ANALYSIS_PROMPT` so the LLM understands that omitting `kbModule` for a scenario signals "no clear module match."

### Reuse the 6000 Cap

`buildKbContextBlock` caps at `TEST_GEN_KB_CONTEXT_CHARS = 6000` (5.3). The exploration analysis prompt is SMALLER than the test-gen prompt (no DOM snapshots, no test code) — captured pages (`formatCapturedPagesForPrompt(..., 4000)` at `exploreApp.ts:323`) + flows + PRD slice (4000 at `PRD_ANALYSIS_LIMIT`). Adding 6000 chars of KB is a bounded contribution. Decision: REUSE `TEST_GEN_KB_CONTEXT_CHARS` — do NOT add a separate `EXPLORATION_KB_CONTEXT_CHARS`. Rationale: (a) avoids fragmenting truncation config; (b) the cap is generous enough; (c) if exploration needs more/less, bump the shared constant (single source of truth). If a reviewer disagrees, a separate constant is a trivial addition — but reuse is the defensible default.

### Additive-Only / No-Regression — The Three-Way Guarantee

This story MUST NOT change exploration behavior when KB is absent. Three layers guarantee it:
1. **Query layer:** `readKnowledgeBaseLogic` returns `null` when KB absent/not-ready (`logic.ts:48`) — fast O(1) index lookup.
2. **Format layer:** `buildKbContextBlock(null, null) === ""` (5.3's guarantee; the zero-module KB also yields `""`).
3. **Inject layer:** `kbContextSection = kbContext ? "..." : ""` — empty string → prompt byte-identical. `kbCoverageGaps = kb ? computeKbCoverageGaps(...) : undefined` → `undefined` → arg omitted → field stays `undefined`.

Verified end-to-end by AC9's integration test (seed project with no KB → assert prompt has no `## Project Knowledge Context` + `kb_coverage_gaps` is `undefined`).

### Error Handling (C1 Pre-Review Checklist)

| Path | Surfaced as | Notes |
|------|-------------|-------|
| KB query returns `null` (no KB / not ready) | `buildKbContextBlock(null, null) === ""` → no injection; `kbCoverageGaps = undefined` | NO throw. Analysis proceeds exactly as before. |
| KB present, zero modules | `buildKbContextBlock(<zero-module KB>, null) === ""` (5.3's zero-module edge) → no injection; `kbCoverageGaps = []` (computed from empty module list) → stored as `[]` (signals "KB present, no modules to cover") | NO throw. |
| KB present, LLM omits `kbModule` for all scenarios | `computeKbCoverageGaps` returns ALL module names (none covered) → all flagged as gaps | NO throw. Accurate (the LLM found no page↔module matches). |
| KB module name has different case/whitespace than the LLM's `kbModule` | `computeKbCoverageGaps` normalizes (trim + lowercase) — exact-insensitive match | NO throw. A module the LLM named slightly differently shows as a gap (accurate — the LLM wasn't confident). |
| `ctx.runQuery(readKnowledgeBaseQuery)` itself throws (Convex infra failure) | Propagates up through `analyzeExploration` → the action's existing `catch` (`exploreApp.ts:375-383`) marks the exploration `failed` | Pre-existing pattern (same as `getProjectForAi` / `getWorkspaceAiConfigQuery`). NOT this story's concern. The KB fetch is INSIDE the try block. |
| `storeProposedScenarios` receives `kb_coverage_gaps: undefined` | Conditional spread omits the field → exploration doc unchanged | NO throw. Backward-compatible. |
| `kb_coverage_gaps: []` (KB present, full coverage) | Stored as `[]` → frontend banner does NOT render (`length === 0`) | NO throw. Distinct from `undefined` (no KB). |

**No error is silently swallowed at a level that hides a bug.** KB returning `null` is the documented "no context" semantic (not an error). Infrastructure errors propagate via the existing catch.

### Dual-Write / Atomicity (C1 Checklist)

- **No dual-writes.** `storeProposedScenarios` is the ONLY write — it patches `status` + `proposed_scenarios` + `kb_coverage_gaps` in a SINGLE `ctx.db.patch` (atomic at the Convex document level). No cross-system coordination.
- **TOCTOU:** N/A — the analysis reads (KB query) then writes (storeProposedScenarios); the exploration is in `analyzing` status during this window (claimed by the action; no concurrent analyzer).
- **Subscription reconciliation:** N/A — internal mutations; the frontend's existing exploration subscription auto-receives the patched doc (including the new optional fields).

### Test Quality (C1 Checklist)

Tests assert CONTENT not TYPE (Epic 4 reviews caught "passes on empty string" gaps):
- `computeKbCoverageGaps`: `expect(gaps).toEqual(["Billing Module"])` (specific module name) — NOT `Array.isArray(gaps)`.
- Case-insensitive: seed `kbModule: " AUTH "` + module `"Auth"` → `expect(gaps).not.toContain("Auth")` — proves normalization.
- Integration: captured prompt `expect(prompt).toContain("## Project Knowledge Context")` AND `expect(prompt).toContain("Auth Module")` (specific seeded module name) — proves the fetch+format+inject chain. AND `expect(prompt).not.toContain("## Project Knowledge Context")` in the no-KB path.
- Stored doc: `expect(exploration.kb_coverage_gaps).toEqual(["Billing Module"])` (specific) — NOT `expect(exploration.kb_coverage_gaps).toBeDefined()`.
- Frontend: `expect(screen.getByText("KB: Auth Module")).toBeInTheDocument()` when present; `expect(screen.queryByText(/KB:/)).not.toBeInTheDocument()` when absent. Banner: `expect(screen.getByText(/no matching exploration page/)).toBeInTheDocument()` when gaps non-empty.

### Test File Location

- `computeKbCoverageGaps` + zod schema tests → EXTEND `convex/ai/agents.test.ts` (the KB-helper test home established by 5.3; project rule: one test file per domain — `project-context.md:79`).
- Action integration test → EXTEND `convex/ai.kbContext.test.ts` (root-level dotted file created by 5.3 — the PROVEN convention for `t.action()`-invoking integration tests; every `convex/` test that calls `t.action()` lives at root with `"./**/*.ts"` module map. Do NOT create `convex/ai/explorationKb.test.ts` — it would fail `t.action()` resolution from a subdir, exactly as 5.3's review confirmed).
- Frontend tests → EXTEND `src/app/(auth)/projects/[id]/explore/explore.test.tsx` (colocated with the page — frontend convention).

### React 19 + Next.js 16 Rules

- The frontend changes are MINIMAL client components (badge + banner render from existing `useQuery` data). NO new `router.push`/`replace`, NO `forwardRef`, NO new data fetching. The `useMemo` for `kbCoverageGaps` mirrors the existing `prdGaps` memo — same pattern, no new render-body side effects.
- The banner + badge are pure render from props/existing state — no React 19 render-rule concerns.

### Convex Gotchas

- Adding OPTIONAL fields (`kb_coverage_gaps` on `explorations`, `kb_module` on the nested `proposed_scenarios` object) is backward-compatible — existing docs get `undefined`. NO migration script needed. Convex validates NEW writes strictly; existing docs are untouched.
- `_creationTime` auto-append is irrelevant (no new indexes, no ordering reliance).
- The `proposed_scenarios` nested validator is a `v.array(v.object({...}))` — adding an optional field to the inner object is safe (existing array elements without the field remain valid).
- `ctx.runQuery(internal.ai.tools.queries.readKnowledgeBaseQuery, ...)` from a `"use node"` internalAction is the established pattern (`exploreApp.ts:1` is `"use node"`; the file already calls `ctx.runQuery` at lines 283, 306, 310). NO new `"use node"` constraint.
- No reserved index names touched (no new indexes).

### File Organization

NEW backend code (existing files EXTENDED — no new files, no new directories):
```
convex/ai/
└── agents.ts               # EXTEND — add computeKbCoverageGaps pure function; add kbModule? to explorationScenarioSchema; extend EXPLORATION_ANALYSIS_PROMPT
convex/ai/
└── exploreApp.ts           # MODIFY — add KB fetch + buildKbContextBlock + kbContextSection injection + compute kbCoverageGaps + pass to storeProposedScenarios; extend ANALYSIS_PROMPT JSON-schema description
convex/explorations/
└── internal.ts             # MODIFY — storeProposedScenarios gains kb_coverage_gaps optional arg + conditional-spread patch
convex/
└── schema.ts               # EXTEND — explorations table gains kb_coverage_gaps?; proposed_scenarios nested validator gains kb_module?
```

MODIFIED frontend (existing files EXTENDED):
```
src/app/(auth)/projects/[id]/explore/
├── types.ts                # EXTEND — Scenario interface gains kb_module?
├── ScenarioList.tsx        # MODIFY — render KB:<module> badge when kb_module present
└── page.tsx                # MODIFY — add kbCoverageGaps useMemo + KB gaps banner (mirror prdGaps banner)
```

MODIFIED tests (EXTEND, do NOT create new):
```
convex/ai/
└── agents.test.ts          # EXTEND — describe("computeKbCoverageGaps") + explorationScenarioSchema kbModule tests
convex/
└── ai.kbContext.test.ts    # EXTEND — analyzeExploration integration tests (KB present → injected; absent → no-op)
src/app/(auth)/projects/[id]/explore/
└── explore.test.tsx        # EXTEND — kb_module badge + KB gaps banner assertions
```

**No new directories.** All edits go into existing files. No `pnpm dev` restart needed (no new `convex/` directory).

**No new dependencies.** `buildKbContextBlock`, `computeKbCoverageGaps`, `truncateContext`, `Set`, `String.prototype.trim`/`toLowerCase` are all runtime built-ins or existing helpers.

### Existing APIs to Reuse (NO reinvention)

| API | Location | Purpose |
|-----|----------|---------|
| `readKnowledgeBaseQuery` | `convex/ai/tools/queries.ts:26-29` | Fetch the curated KB shape (5.1) — call from `analyzeExploration` via `ctx.runQuery` |
| `readKnowledgeBaseLogic` | `convex/ai/tools/logic.ts:39-69` | The logic (returns `null` fast when KB absent/not-ready at `:48`) |
| `ReadKnowledgeBaseResult` | `convex/ai/tools/logic.ts:24-37` | Type contract (import as type if needed; the action reads `kb.modules[].name`) |
| `buildKbContextBlock` | `convex/ai/agents.ts:550` | Format KB into the `## Project Knowledge Context` block (5.3) — pass `(kb, null)` for KB-only |
| `truncateContext` | `convex/ai/agents.ts:510` | Boundary-aware truncation (used internally by `buildKbContextBlock`) |
| `TEST_GEN_KB_CONTEXT_CHARS` | `convex/lib/constraints.ts` | The 6000-char cap (5.3) — reused via `buildKbContextBlock` |
| `explorationScenarioSchema` | `convex/ai/agents.ts:10-17` | The zod scenario schema — EXTEND with `kbModule?` |
| `storeProposedScenarios` | `convex/explorations/internal.ts:97` | The mutation that persists scenarios — EXTEND with `kb_coverage_gaps` |
| `getExplorationForAnalysis` | `convex/explorations/internal.ts:168` | Returns `project_id` (line 175) — already in scope for the KB query |
| `prd_coverage` field | `convex/schema.ts:289` | The sibling pattern for an optional-array-of-strings field on `explorations` |
| `prdGaps` banner | `src/app/(auth)/projects/[id]/explore/page.tsx:634-641` | The UI pattern to MIRROR for the KB gaps banner |
| `seedKnowledgeBase` + `seedModule` | `convex/testHelpers.ts` | Test seed for the integration test |

### What NOT to Reinvent

| Concern | Reuse | Do NOT build |
|---------|-------|--------------|
| KB resolution + shape | `readKnowledgeBaseQuery` (queries.ts:26-29) + `readKnowledgeBaseLogic` (logic.ts:39-69) | A new "getExplorationKb" query — 5.1 already returns the curated shape |
| KB formatting + truncation | `buildKbContextBlock` (agents.ts:550) + `truncateContext` (agents.ts:510) | A second KB-block formatter — 5.3 already built it with boundary-aware truncation (D6 fix) |
| Coverage-gap computation | NEW `computeKbCoverageGaps` (pure, deterministic) | LLM-emitted gaps array (fragile) OR a fuzzy URL↔module matcher (large, fragile — `user_flows`/`apis` are `v.any()`) |
| Truncation cap | `TEST_GEN_KB_CONTEXT_CHARS` (constraints.ts, 5.3) | A separate `EXPLORATION_KB_CONTEXT_CHARS` (fragmented config) |
| Scenario schema | `explorationScenarioSchema` (agents.ts:10) | A second schema — extend with `kbModule?` |
| Scenario persistence | `storeProposedScenarios` (internal.ts:97) | A new mutation — extend with `kb_coverage_gaps` |
| Gaps banner UI | `prdGaps` banner (page.tsx:634-641) | A new banner component — mirror the existing amber banner |
| Test seed | `seedKnowledgeBase` + `seedModule` (testHelpers.ts) | Local seed functions — project rule: "never define local seed functions" (project-context.md:80) |
| Integration test file | `convex/ai.kbContext.test.ts` (5.3) | A new `convex/ai/explorationKb.test.ts` (would fail `t.action()` resolution from subdir — proven by 5.3 review) |

### Previous Story Intelligence

**Story 5.3 (Context-Enhanced Test Generation Prompts) — the DIRECT predecessor and closest sibling:**
1. 5.3 built `buildKbContextBlock(kb, rd)` + `truncateContext` in `agents.ts` — this story REUSES `buildKbContextBlock(kb, null)` verbatim (KB-only block; the boundary-aware truncation + defensive `unknown` rendering + zero-module edge are all inherited).
2. 5.3's additive-only / no-regression rule (three-layer guarantee: query → format → inject) is mirrored EXACTLY for this story (KB absent → `null` → `""` → no injection → byte-identical prompt).
3. 5.3's integration-test placement finding (root-level `convex/ai.kbContext.test.ts` is the PROVEN convention for `t.action()` tests; subdir placement breaks module resolution) — this story EXTENDS that file rather than creating a new one.
4. 5.3's CRITICAL review finding: `renderApis` expected `{endpoints:[...]}` but real extraction produces a flat array — `renderApis` was fixed to handle BOTH. Since this story REUSES `buildKbContextBlock`, it INHERITS that fix (no re-derivation).
5. 5.3's `TEST_GEN_KB_CONTEXT_CHARS = 6000` cap is reused (see "Reuse the 6000 cap").

**Story 5.1 (readKnowledgeBase Agent Tool) — the other DIRECT predecessor:**
1. 5.1's `readKnowledgeBaseQuery` (internal query) + `readKnowledgeBaseLogic` (with the `status !== "ready"` fast-null guard) are reused verbatim — NO new query.
2. 5.1's "Pre-Prompt Injection vs Agent Tool — Why Both" justification applies here: the Exploration Analysis Agent uses the BLOCK (deterministic always-on, single-shot analysis); the Test Generation Agent uses the TOOL (on-demand, iterative). This story is the block half for exploration; 5.1 is the tool half for test-gen.

**Epic 4 retrospective — defects to avoid:**

| Epic 4 Lesson | Mitigation in This Story |
|-------------------|--------------------------|
| D1 TS `ignoreBuildErrors` rot | Do NOT remove the flag (out of scope); DO verify via `pnpm typecheck` that no NEW errors are introduced (optional field additions should not worsen the cascade) |
| D6 structural-aware truncation | INHERITED — `buildKbContextBlock` (reused) already uses `truncateContext` (boundary-aware `\n\n` cut). No new truncation code. |
| D7 token-budget blindness | PARTIALLY ADDRESSED — `TEST_GEN_KB_CONTEXT_CHARS = 6000` (reused) caps the KB contribution to the analysis prompt. |
| jsdom test-fidelity (insight #2) | The frontend badge/banner tests run in jsdom (no browser-blind surface — they assert on rendered text from props/state, not on real DOM behavior). The backend integration test runs in `convex-test` (edge-runtime). |
| C4 spike-citation gate | Task 0 verifies every infrastructure claim against installed source — especially the 5.1 query + 5.3 `buildKbContextBlock` exports + the `storeProposedScenarios` patch pattern. |
| C1 pre-review checklist | Error-handling table + test-quality section above; target ≤5 review patches (5.1/5.2/5.3 shipped 0-3). |
| Pre-prompt vs tools (insight #5) | Conscious choice: THIS story is the pre-prompt half for exploration (deterministic KB block); 5.1 is the tool half for test-gen. Insight #5 endorses both coexisting. |
| D5 multi-workspace IDOR (Critical, 4-epic carry-forward) | The action's `ctx.runQuery` call inherits the same trust boundary as 5.1/5.2/5.3 (the query does NO auth). NOT introduced by this story; NOT fixable here. `analyzeExploration` is an `internalAction` (not public-facing). |
| D2 Playwright smoke gate | N/A — no browser surface; backend is `convex-test`, frontend badge/banner is jsdom. |

### Git Intelligence

Baseline: latest `main` = `0fb1504` (graphify regen after 5.3). Relevant recent commits:
- `b3983bf` — Story 5.3 (Context-Enhanced Test Gen Prompts) — the DIRECT predecessor; built `buildKbContextBlock` + `truncateContext` (reused here); established the root-level `convex/ai.kbContext.test.ts` integration-test convention (extended here); fixed the `renderApis` flat-array shape (inherited via reuse).
- `188aa4e` — Story 5.2 (`readBaselineRd` Agent Tool) — DIRECT predecessor; established the additive-only opt pattern.
- `498ece8` — Story 5.1 (`readKnowledgeBase` Agent Tool) — DIRECT predecessor; built `readKnowledgeBaseQuery` + `readKnowledgeBaseLogic` (reused here); "Pre-Prompt Injection vs Agent Tool" justification.
- `56050e5` — Epic 4 retrospective (D-series actions; D6 addressed via reuse, D7 partially addressed, D5 inherited).

NEW schema: ONE optional field on `explorations` (`kb_coverage_gaps`) + ONE optional field on the `proposed_scenarios` nested validator (`kb_module`). NEW `convex/` directory: none. NEW dependencies: none. NEW internal queries: none (reuse 5.1). NEW tables: none (no deep-instantiation cascade impact).

Single `feat:` commit per story (follow `b3983bf` / `188aa4e` convention).

### Deferred Work Relevant to This Story

Per retro action A8, review `_bmad-output/implementation-artifacts/deferred-work.md`:
- **IDOR on `readKnowledgeBaseQuery`** (deferred-work.md:5): the query trusts `project_id` with no workspace-membership assertion; this story's `ctx.runQuery` call inherits the surface. `analyzeExploration` is an `internalAction` (not public-facing), so not a new B3 public-endpoint violation. NOT introduced here; tracked under B3/D5.
- **D7 token-budget awareness**: the reused 6000-char cap is a bounded contribution, not a full token-budget solution. Track as the same future-hardening item.
- **D6 codebase-wide truncation rollout**: this story REUSES `buildKbContextBlock` (which already uses `truncateContext`) — no new truncation code. The rollout to `impactPrompts.ts`/`storyPrompts.ts` remains a separate task.

### Project Structure Notes

- All new backend code is in EXISTING files under `convex/ai/`, `convex/explorations/`, `convex/`. No new directories.
- `agents.ts` grows by ~1 pure function (~8 lines) + 1 zod field + 1 prompt paragraph. Currently 683 lines → ~700, under the 800-line soft cap. `computeKbCoverageGaps` is conceptually a KB-context helper (sibling to `buildKbContextBlock`) — high cohesion in `agents.ts`.
- `exploreApp.ts` grows by ~10 lines (the KB fetch + `kbContextSection` + `kbCoverageGaps` computation + the arg). Currently 845 lines → ~855. NOTE: the file is ALREADY over the 800 soft cap (pre-existing). This story adds a bounded ~10 lines; a future refactor extracting the analysis flow to `convex/ai/explorationAnalysis.ts` is warranted but OUT OF SCOPE (surgical-changes principle — do not refactor unrelated code). Flag for a future cleanup story.
- `internal.ts` grows by ~3 lines (the optional arg + conditional spread).
- `schema.ts` grows by 2 lines (the two optional fields).
- Frontend: `types.ts` +1 line; `ScenarioList.tsx` +~5 lines (badge); `page.tsx` +~12 lines (memo + banner).
- `computeKbCoverageGaps` + `buildKbContextBlock` are EXPORTED (used across files + tested directly). The prompt constants are module-level exports (already exported).

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 5.4] — ACs and user story (lines 847-865)
- [Source: _bmad-output/planning-artifacts/epics.md#Epic 5] — Epic context (lines 258-264, 781-784)
- [Source: _bmad-output/planning-artifacts/epics.md#FR-41] — Exploration cross-references KB (line 184)
- [Source: docs/adr/0008-combined-analyst-test-platform.md] — Authoritative for the combined-platform concept (KB + exploration + test gen)
- [Source: _bmad-output/implementation-artifacts/5-1-read-knowledge-base-agent-tool.md] — DIRECT predecessor; `readKnowledgeBaseQuery` reuse; "Pre-Prompt Injection vs Agent Tool" justification.
- [Source: _bmad-output/implementation-artifacts/5-3-context-enhanced-test-generation-prompts.md] — DIRECT predecessor; `buildKbContextBlock` + `truncateContext` reuse; `TEST_GEN_KB_CONTEXT_CHARS` reuse; root-level `convex/ai.kbContext.test.ts` convention; additive-only three-layer guarantee; `renderApis` flat-array fix (inherited).
- [Source: _bmad-output/implementation-artifacts/epic-4-retrospective.md] — Insight #5 (pre-prompt vs tools — endorses this story's mechanism); D6 (truncation — inherited via reuse); D7 (token-budget — partially addressed via the 6000 cap); D5 (IDOR — pre-existing, inherited).
- [Source: _bmad-output/implementation-artifacts/deferred-work.md] — IDOR on readKnowledgeBaseQuery (inherited); D7 token-budget (separate); D6 rollout (separate).
- [Source: _bmad-output/project-context.md] — Critical rules: no-comments (51/93), constraints in constraints.ts (66/92), ConvexError (48), "use node" isolation (49), IDOR B3 (120-124 — applies to PUBLIC functions; the reused query is internal), C4 spike-citation (108), C1 checklist (106), optional-field backward-compat (Convex gotchas 128-131).
- [Source: convex/ai/tools/logic.ts:24-37] — **`ReadKnowledgeBaseResult`** interface (the KB type contract — `modules[].name` is the field consumed by `computeKbCoverageGaps`).
- [Source: convex/ai/tools/logic.ts:39-69] — **`readKnowledgeBaseLogic`** — returns `null` fast at `:48` when KB absent/not-ready.
- [Source: convex/ai/tools/queries.ts:26-29] — **`readKnowledgeBaseQuery`** — the internal query to reuse from `analyzeExploration`.
- [Source: convex/ai/agents.ts:10-17] — **`explorationScenarioSchema`** — the zod schema to EXTEND with `kbModule?`.
- [Source: convex/ai/agents.ts:162-179] — **`EXPLORATION_ANALYSIS_PROMPT`** — the system instructions to EXTEND with KB cross-reference guidance.
- [Source: convex/ai/agents.ts:376-382] — **`createExplorationAnalysisAgent`** — the agent (NO tools; single `generateText` — pre-prompt injection is the mechanism).
- [Source: convex/ai/agents.ts:510-599] — **`truncateContext` + `buildKbContextBlock`** (5.3) — reused verbatim.
- [Source: convex/ai/exploreApp.ts:1] — **`"use node"`** — the file is a node action file; `ctx.runQuery(internal...)` works.
- [Source: convex/ai/exploreApp.ts:243-268] — **`ANALYSIS_PROMPT`** — the per-call prompt to EXTEND with the `kbModule` JSON-schema line.
- [Source: convex/ai/exploreApp.ts:280-389] — **`analyzeExploration`** — the action handler to EXTEND (KB fetch + inject + gap computation).
- [Source: convex/ai/exploreApp.ts:367-374] — **scenario mapping** (camel→snake) — add `kb_module: s.kbModule`.
- [Source: convex/explorations/internal.ts:97-118] — **`storeProposedScenarios`** — EXTEND with `kb_coverage_gaps` arg + conditional-spread patch.
- [Source: convex/explorations/internal.ts:168-183] — **`getExplorationForAnalysis`** — already returns `project_id` (line 175); NO change needed.
- [Source: convex/schema.ts:260-314] — **`explorations` table** — add `kb_coverage_gaps?` (sibling to `prd_coverage` at line 289).
- [Source: convex/schema.ts:290-301] — **`proposed_scenarios` nested validator** — add `kb_module?`.
- [Source: convex/lib/constraints.ts] — **`TEST_GEN_KB_CONTEXT_CHARS = 6000`** (5.3) — reused via `buildKbContextBlock`.
- [Source: convex/ai.kbContext.test.ts] — **5.3's root-level integration-test file** — EXTEND for `analyzeExploration` assertions.
- [Source: convex/testHelpers.ts] — **`seedKnowledgeBase` + `seedModule`** — test seed helpers (reuse, do NOT define local seeds).
- [Source: src/app/(auth)/projects/[id]/explore/types.ts:13-19] — **`Scenario` interface** — EXTEND with `kb_module?`.
- [Source: src/app/(auth)/projects/[id]/explore/page.tsx:92-95] — **`prdGaps` memo** — the pattern to MIRROR for `kbCoverageGaps`.
- [Source: src/app/(auth)/projects/[id]/explore/page.tsx:634-641] — **`prdGaps` banner** — the UI pattern to MIRROR for the KB gaps banner.

## Dev Agent Record

### Agent Model Used

glm-5.2 (zai-coding-plan/glm-5.2) via opencode

### Debug Log References

- Baseline typecheck: 868 lines (captured pre-implementation; matches Story 5.3 baseline).
- Post-implementation typecheck: 868 lines (identical — optional field additions introduced zero new type errors).
- Lint error in `KnowledgeError.tsx:85` is pre-existing (file NOT modified by this story).

### Completion Notes List

- **AC1 (KB injection)**: `analyzeExploration` now fetches KB via `ctx.runQuery(internal.ai.tools.queries.readKnowledgeBaseQuery, ...)` inside the try block, formats via `buildKbContextBlock(kb, null)`, and injects `kbContextSection` into the prompt after `${flowsDescription}` and before `${prdSection}`. When KB is absent, `kbContextSection` is `""` → prompt is byte-identical to pre-5.4 (additive-only / no-regression guarantee).
- **AC2 (prompt instructions)**: `EXPLORATION_ANALYSIS_PROMPT` gained a paragraph instructing KB cross-referencing + `kbModule` annotation. `ANALYSIS_PROMPT` gained the `- "kbModule": string (optional)` JSON-schema description line. Both are additive string changes.
- **AC3 (schema fields)**: `explorationScenarioSchema` gained `kbModule: z.string().optional()`. The `proposed_scenarios` nested validator in `schema.ts` gained `kb_module: v.optional(v.string())`. The scenario mapping in `exploreApp.ts` gained `kb_module: s.kbModule`.
- **AC4 (`computeKbCoverageGaps`)**: NEW exported pure function added to `agents.ts` (alongside `buildKbContextBlock`). Pure, deterministic, case-insensitive + trim-normalized. Returns a new array (never mutates inputs).
- **AC5 (`storeProposedScenarios` + `kb_coverage_gaps`)**: The mutation's args validator gained `kb_coverage_gaps: v.optional(v.array(v.string()))`. The handler conditionally spreads it into the patch (mirrors the `internal.ts:53` pattern). The `explorations` table gained `kb_coverage_gaps: v.optional(v.array(v.string()))` as a sibling to `prd_coverage`.
- **AC6 (gap computation plumbing)**: `analyzeExploration` computes `kbCoverageGaps = kb ? computeKbCoverageGaps(kb.modules.map(m => m.name), validated) : undefined` inside the try (where `validated` is in scope) and passes it to `storeProposedScenarios`. No-KB path → `undefined` → field stays `undefined`.
- **AC7 (frontend)**: `Scenario` interface gained `kb_module?: string`. `ScenarioList.tsx` renders `KB: {module}` badge (neutral styling) when `kb_module` is present. `page.tsx` gained `kbCoverageGaps` memo + amber banner (mirrors `prdGaps` banner) when `kbCoverageGaps.length > 0`.
- **AC8 (scope boundary)**: No new tables (1 optional field on `explorations`), no new internal queries (reuses 5.1's `readKnowledgeBaseQuery`), no new dependencies, no new directories. No new agent tool (exploration uses pre-prompt injection, not the tool loop).
- **AC9 (tests)**: 17 new tests total — 11 in `agents.test.ts` (9 `computeKbCoverageGaps` unit + 2 zod schema), 2 integration in `ai.kbContext.test.ts` (KB-present + KB-absent), 4 frontend in `explore.test.tsx` (badge present/absent + banner present/absent). All assert CONTENT (specific strings), not types.
- **AC10 (validators + immutability + verification)**: All new Convex fields are `v.optional(...)`. `computeKbCoverageGaps` returns a new array. No code comments. Verification: lint (zero new errors), test:convex (1150 pass), test (485 pass), typecheck (868 lines, identical to baseline), build (succeeds).
- **Additional change**: `seedExploration` in `testHelpers.ts` was extended to accept `goal` and `captured_pages` overrides (the existing helper didn't support these fields, required for the integration test). Also added `kb_module: v.optional(v.string())` to the `storeProposedScenarios` scenarios arg validator (necessary for the mapped `kb_module` field to flow through Convex validation — mirrors the schema's `proposed_scenarios` shape).

### File List

**Modified source files:**
- `convex/ai/agents.ts` — added `computeKbCoverageGaps` pure function; added `kbModule` to `explorationScenarioSchema`; added KB cross-reference paragraph to `EXPLORATION_ANALYSIS_PROMPT`
- `convex/ai/exploreApp.ts` — extended import; added KB fetch + `kbContextSection` injection; added `kb_module: s.kbModule` to mapping; added `kbCoverageGaps` computation; passed to `storeProposedScenarios`; added `kbModule` line to `ANALYSIS_PROMPT`
- `convex/explorations/internal.ts` — extended `storeProposedScenarios` args + handler (conditional-spread `kb_coverage_gaps`; added `kb_module` to scenarios validator)
- `convex/schema.ts` — added `kb_coverage_gaps` to `explorations` table; added `kb_module` to `proposed_scenarios` nested validator
- `convex/testHelpers.ts` — extended `seedExploration` to accept `goal` + `captured_pages` overrides
- `src/app/(auth)/projects/[id]/explore/types.ts` — added `kb_module?: string` to `Scenario` interface
- `src/app/(auth)/projects/[id]/explore/ScenarioList.tsx` — added `KB: {module}` badge (conditional render)
- `src/app/(auth)/projects/[id]/explore/page.tsx` — added `kbCoverageGaps` memo + KB gaps banner

**Modified test files:**
- `convex/ai/agents.test.ts` — added `describe("computeKbCoverageGaps")` (9 unit tests) + 2 zod schema tests
- `convex/ai.kbContext.test.ts` — added `createExplorationAnalysisAgent` mock + 2 `analyzeExploration` integration tests
- `src/app/(auth)/projects/[id]/explore/explore.test.tsx` — added `analyzedWithKbModule` fixture + 4 frontend tests

## Change Log

- 2026-06-17: Story 5.4 implemented — KB context injection into exploration analysis + deterministic coverage gap computation + `kbModule` annotation + frontend badge/banner. 17 new tests, zero regressions. All 10 ACs satisfied.

### Review Findings

**3-layer review outcome:** Blind Hunter + Edge Case Hunter + Acceptance Auditor ran in parallel against `git diff HEAD -- convex/ src/` (600 lines, 11 files). 6 raw findings → 0 `decision-needed` (1 resolved), 1 `patch`, 0 `defer`, 5 dismissed as noise/false-positive.

**Dismissed (5):**
- Blind Hunter CRITICAL "camelCase/snake_case mismatch → all modules returned as gaps" — FALSE POSITIVE. `validated` (`exploreApp.ts:375`) is the camelCase zod-parsed array; the snake_case `.map()` (`:376-384`) assigns to a separate `scenarios` var. Line 385 passes `validated` (camelCase) to `computeKbCoverageGaps`, which reads `s.kbModule` correctly. Integration test asserts `kb_coverage_gaps` content `["Billing Module"]` and passes. Cold-read misread of the patch.
- Blind Hunter HIGH "inconsistent null checks (string vs object)" — DOCUMENTED INTENDED BEHAVIOR. Zero-module KB → `buildKbContextBlock` returns `""` (no injection) AND `kbCoverageGaps = []` (stored, signals "KB present, full coverage"). The `[]` vs `undefined` distinction is core to AC5/AC6 (spec error-handling table row 2).
- Blind Hunter MEDIUM "unguarded `kb.modules.map` if query returns shape without modules" — TYPE CONTRACT GUARANTEES SHAPE. `ReadKnowledgeBaseResult.modules[].name` is required `string` (`tools/logic.ts:29`); the query returns `null` or a fully-shaped object, never a modules-less truthy value. Speculative.
- Acceptance Auditor LOW "non-surgical re-indentation of pre-existing `buildNlFormatRetryPrompt` test" — NO BEHAVIORAL IMPACT. Braces balance, test stays in its describe, all 96 tests in `agents.test.ts` pass. Harmless side effect of inserting the new `describe("computeKbCoverageGaps")` block; reverting provides no value.
- Edge Case Hunter MEDIUM "truncated KB modules always flagged as coverage gaps" — DISMISSED BY USER. Decision point resolved: current behavior accepted as intentionally conservative (a module not annotated by the LLM — whether due to no matching page OR due to truncation out of the 6000-char prompt — is flagged as a gap). Over-reporting at ~20-40+ modules is acceptable; the banner copy ("no matching exploration page") is slightly imprecise for the truncation case but the conservative signal is preferred. Re-open if real-world large KBs surface user confusion.

**Actionable:**

- [x] [Review][Patch] Completion Notes miscount new tests (15 → 17) [5-4-exploration-cross-references-kb-modules.md:441] — FIXED 2026-06-17. Dev Agent Record + Change Log counts corrected to 17 (11+2+4). Doc-only; no AC impact.

---
baseline_commit: 498ece8
---

# Story 5.2: readBaselineRd Agent Tool

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As the Test Generation Agent,
I want a `readBaselineRd` tool that returns the latest Baseline RD sections and confidence scores,
so that I can use accurate requirements context when generating tests.

## Acceptance Criteria

1. **AC1 — `readBaselineRd` tool definition follows the installed Agent tool pattern**: A NEW tool `readBaselineRd` is added to the object returned by `createToolDefinitions()` in `convex/ai/tools/definitions.ts`. It mirrors `readKnowledgeBase` (lines 38-49) / `readProjectContext` (lines 26-37) exactly: `createTool({ description, inputSchema: z.object({ project_id: z.string() }), execute: async (ctx, input) => { const err = validateConvexId(input.project_id, "project_id"); if (err) return { error: err }; return ctx.runQuery(internal.ai.tools.queries.readBaselineRdQuery, { project_id: input.project_id as Id<"projects"> }); } })`. The `z` import is `from "zod/v3"` (the file's existing import — NOT `from "zod"`). The `validateConvexId` reuse is mandatory — it is the installed convention; the ADR 0008 §Integration Bridge code example (lines 111-119) OMITS it (aspirational pseudo­code) and must NOT be copied verbatim (C4 gate, see Task 0). Because `createTestGenerationAgent` passes `tools: createToolDefinitions()` wholesale, adding the key auto-wires the tool into the Test Generation Agent — NO change to `createTestGenerationAgent` is required.

2. **AC2 — `readBaselineRdLogic` returns the latest usable RD's sections + confidence**: A NEW pure logic function `readBaselineRdLogic(ctx, projectId)` is added to `convex/ai/tools/logic.ts`. It: (a) resolves the latest USABLE Baseline RD for the project via `.query("baseline_rds").withIndex("by_project_id_and_version", (q) => q.eq("project_id", projectId)).order("desc").take(10)` then `.find((r) => r.status !== "archived" && r.status !== "failed")` — this MIRRORS the two authoritative resolution sites: `getBaselineRd` at `convex/knowledge/queries.ts:178-187` AND `_getLatestBaselineRdForDrift` at `convex/knowledge/internal.ts:1019-1034`. The `.take(10)` + `.find()` (not `.first()`) is deliberate: the highest-version RD may be `archived`/`failed` (e.g. a failed regeneration created v3 with `status: "failed"` while v2 is `approved`); the scan skips unusable tops to find the latest usable one. (b) returns `null` if no usable RD exists (graceful empty — NO throw, per AC4); (c) returns `{ version: rd.version, status: rd.status, sections: rd.sections.map((s) => ({ id: s.id, title: s.title, content: s.content, confidence: s.confidence, divergence_note: s.divergence_note, bmad_alignment: s.bmad_alignment })) }`. The return type is a named `ReadBaselineRdResult` interface exported from `logic.ts`. The `divergence_note` (`string | undefined`) and `bmad_alignment` (`{ prd_section_title: string; agreement: "agree" | "diverge" | "partial" } | undefined`) are passed through as-is — they are high-value grounding (they tell the LLM where the RD diverges from the BMAD PRD), already validated at write-time by `rdSectionValidator` (`convex/lib/validation.ts:147-163`); do NOT runtime-revalidate.

3. **AC3 — `readBaselineRdQuery` internal query**: A NEW `internalQuery` `readBaselineRdQuery` is added to `convex/ai/tools/queries.ts` with `args: { project_id: v.id("projects") }` and `handler: async (ctx, args) => readBaselineRdLogic(ctx, args.project_id)`. Import `readBaselineRdLogic` from `./logic` alongside the existing imports. This mirrors `readKnowledgeBaseQuery` (lines 25-28) / `readProjectContextQuery` (lines 14-17) exactly. The query is INTERNAL (no auth check inside — the trust boundary is the agent invocation, matching the existing tool query pattern which ALL do NO workspace-ownership check; see Dev Notes "Auth/IDOR Boundary").

4. **AC4 — Graceful empty result, no error thrown**: When `readBaselineRdLogic` is invoked for (a) a project with no `baseline_rds` row, OR (b) a project whose RDs are ALL `archived` or `failed`, it returns `null` — it does NOT throw. The "ready-but-zero-sections" branch that exists for the KB tool (5.1) is NOT reachable here: `baselineRdSchema` requires `sections: z.array(...).min(1)` (`convex/knowledge/baselinePrompts.ts:31`) and every stored RD is backfilled with the six required sections (`ensureRequiredSections`); the function maps defensively regardless. All null/empty branches are tested (AC8).

5. **AC5 — Tool callable by the LLM (readBaselineRd hint in prompt)**: The existing local helper `buildKnowledgeBaseToolHint(projectId)` in `convex/ai/agents.ts` (added by Story 5.1, line 501) is RENAMED to `buildContextToolHints(projectId)` and EXTENDED so that, when `projectId` is non-empty, it emits a single shared `Project ID:` line followed by BOTH tool-hint lines — the existing `readKnowledgeBase` hint AND a NEW `readBaselineRd` hint (`If the project has a Baseline Requirements Document, use the readBaselineRd tool with this exact project_id to look up its RD sections and confidence scores before generating tests.`). When `projectId` is omitted/empty, the helper returns `""` — UNCHANGED (no regression; NEITHER tool name appears, mirroring 5.1's additive-only rule). The two prompt builders (`buildPrdGenerationPrompt`, `buildNlGenerationPrompt`) are updated only to call the renamed `buildContextToolHints(opts.projectId)` instead of the old name (mechanical rename at the two existing call sites — lines 520 and 561). **The `projectId?: string` opt on both builders AND its plumbing from `prdWorkflowActions.ts` / `nlWorkflowActions.ts` were ALREADY added by Story 5.1 — this story does NOT touch those action files.** The two retry-prompt builders (`buildPrdFormatRetryPrompt`, `buildNlFormatRetryPrompt`) are UNCHANGED (retries don't re-invoke tools). **Scope guard**: this injection is ONLY the project_id + one-line hints — it does NOT inject RD content (that is Story 5.3's concern, parallel to 5.1's scope guard).

6. **AC6 — Test Generation Agent inherits the tool automatically (verified)**: A test asserts that `createTestGenerationAgent(model).options.tools` includes a `readBaselineRd` key — mirror the 5.1 `readKnowledgeBase` wiring assertion: `expect(Object.keys(agent.options.tools ?? {})).toContain("readBaselineRd")`. The tool is registered just by virtue of being added to `createToolDefinitions()` — `createTestGenerationAgent` is NOT modified. The Exploration Analysis Agent is NOT wired in this story (Story 5.4 owns that — see Scope Boundary).

7. **AC7 — No schema changes, no new tables, no new dependencies, no new directories**: The `baseline_rds` table + its existing indexes (`by_workspace_id`, `by_project_id`, `by_project_id_and_version`) are reused as-is (`convex/schema.ts:444-462`). No new Convex table, no new index, no schema field. No new npm dependency. No new `convex/` directory (existing `convex/ai/tools/` from the pre-existing tool set — extended in 5.1 — is further extended; no `pnpm dev` restart needed). No frontend changes (the tool is invoked by the LLM inside the agent; the result never reaches React). This story is purely additive backend code + a one-helper rename/extension in `agents.ts`.

8. **AC8 — Tests (TDD, ≥80% coverage on new code)**:
   - **Backend logic tests** — EXTEND `convex/ai/agents.test.ts` (the existing `describe("Agent tools", ...)` block at line 255, do NOT create a new test file). Add a `describe("readBaselineRd", ...)` sub-block calling `readBaselineRdLogic` directly via `t.run(async (ctx) => { return readBaselineRdLogic(ctx, projectId); })` — mirror the `readKnowledgeBase` tests at lines 335-476 EXACTLY (same seed + invoke pattern). NOTE: `seedBaselineRd` requires a `knowledge_base_id` FK, so seed `seedWorkspace` → `seedProject` → `seedKnowledgeBase` → `seedBaselineRd` (the KB itself is NOT read by this tool; any status is fine — it just satisfies the FK, mirroring the drift test seeding at `convex/knowledge.driftReport.test.ts:49`). Tests:
     - Returns full shape for an `approved` RD: assert `result.version`, `result.status === "approved"`; assert `result.sections.length` matches the seed; assert `result.sections[0].id`, `.title`, `.content` equal the seeded values (C1 content assertion — specific value, NOT `typeof`); assert `result.sections[0].confidence` equals the seeded number.
     - Returns full shape for a `draft` RD (the default `seedBaselineRd` status) — verifies the tool does NOT over-filter to "approved"-only (the AC's "approved" is happy-path framing; the established resolution pattern keeps `draft` + `approved`, see Dev Notes "Approved vs Draft Semantics"). Assert `result.status === "draft"`.
     - Returns `null` when no RD exists (seed KB only, no `seedBaselineRd` → `result === null`).
     - Returns `null` when all RDs are `"archived"` (seed RD with `status: "archived"` → `result === null`).
     - Returns `null` when all RDs are `"failed"` (seed RD with `status: "failed"` → `result === null`).
     - Picks the LATEST version when multiple usable RDs exist (seed v1 `approved` with `sections[0].content: "v1 overview"` + v2 `approved` with `sections[0].content: "v2 overview"` → assert `result.version === 2` AND `result.sections[0].content === "v2 overview"`; use distinct content to disambiguate, NOT `setTimeout` — see deferred-work line 71/97 flaky-timer warning).
     - Skips `archived`/`failed` at the top, picks the next usable (seed v3 `failed` + v2 `approved` with distinct content → assert `result.version === 2` AND content matches v2). **This is the key edge case distinguishing `.take(10) + .find()` from `.first()` — do not skip it.**
     - Returns `divergence_note` + `bmad_alignment` on sections when seeded (seed a section with `divergence_note: "PRD mentions Vue."` and `bmad_alignment: { prd_section_title: "Tech Stack", agreement: "diverge" }` → assert these pass through on the matching section by `id`, mirroring `convex/knowledge.baselineRdEditor.test.ts:23-24,117-118`).
     - Returns `null` for a non-existent project_id (`"00000000000000000000000000000000" as Id<"projects">` → `result === null`; mirror `readKnowledgeBase` unknown-project test at lines 465-475).
   - **Prompt-builder tests** — EXTEND `convex/ai/agents.test.ts` `describe("Prompt content snapshots", ...)` (block at line 479). The existing 5.1 tests (lines 527-639) assert `readKnowledgeBase` presence/absence — they REMAIN VALID and must still pass (the renamed helper emits BOTH tool names when `projectId` is present, and NEITHER when absent). ADD tests:
     - `buildPrdGenerationPrompt({ ..., projectId: "abc123" })` output contains `readBaselineRd` AND (still) `readKnowledgeBase` AND `Project ID: abc123`.
     - `buildPrdGenerationPrompt` with `projectId` omitted AND with `projectId: ""` output does NOT contain `readBaselineRd` (additive-only — no regression when absent; the existing `readKnowledgeBase` omission tests at lines 544-574 must ALSO still pass).
     - `buildNlGenerationPrompt({ ..., projectId: "xyz789" })` output contains `readBaselineRd` AND `readKnowledgeBase` AND `Project ID: xyz789`.
     - `buildNlGenerationPrompt` with omitted `projectId` does NOT contain `readBaselineRd`.
     - `buildPrdFormatRetryPrompt` and `buildNlFormatRetryPrompt` output does NOT contain `readBaselineRd` (retries don't re-invoke tools — verify the retry builders are unchanged; extend the existing 5.1 retry assertions at lines 610-639 or add parallel ones).
   - **Agent-wiring test** — EXTEND `convex/ai/agents.test.ts` `describe("Agent definitions", ...)`: add a test that `createTestGenerationAgent(model)` produces an agent whose tool set includes `readBaselineRd` (e.g. `expect(Object.keys(agent.options.tools ?? {})).toContain("readBaselineRd")` — the `AgentTools extends ToolSet` record shape was already confirmed against `node_modules/@convex-dev/agent/dist/client/index.d.ts` in Story 5.1 Task 0; the same enumeration works here).
   - All existing tests pass — zero regressions (`pnpm test:convex`, `pnpm test`).

9. **AC9 — Convex validators + immutability + no-comments**: `readBaselineRdQuery` uses `v.id("projects")` on its arg (never bare `v.string()` at the query boundary — the tool definition's `validateConvexId` is the LLM-facing guard, the internal query's `v.id()` is the type-system guard). `readBaselineRdLogic` returns NEW objects (the `.map` produces fresh section objects; the `divergence_note`/`bmad_alignment` values are passed through by reference — acceptable since the LLM only reads the JSON serialization, never mutates). No code comments (project-context.md:51/93).

10. **AC10 — Verification (build/lint/test)**:
    - `pnpm lint` — zero new errors.
    - `pnpm test:convex` — all backend tests pass, zero regressions, new tests green.
    - `pnpm test` — all frontend tests pass, zero regressions (no frontend changes expected; confirm no frontend test imports the prompt builders).
    - `pnpm typecheck` — no NEW type errors beyond the pre-existing deep-instantiation cascade (Epic 4 retro D1 — this story adds NO new tables and NO nested validators, so it does NOT worsen the `TestConvexForDataModel` cascade; verify via `git stash && pnpm typecheck 2>&1 | wc -l` baseline vs. post-change count — baseline is 866 lines per Story 5.1).
    - `pnpm build` — note the current state: `next.config.ts` still has `typescript.ignoreBuildErrors: true` (Epic 4 retro D1, unresolved). The story does NOT remove the flag (out of scope — D1 is a separate `fix:` commit owned by Winston). The build MUST still succeed with the flag in place. Document that the flag's removal is tracked separately.

## Tasks / Subtasks

- [x] Task 0: Verify infrastructure claims (C4 spike-citation gate) (AC: #1, #2, #3, #5, #6, #8)
  - [x] Confirm `createToolDefinitions()` return object is passed wholesale to `createTestGenerationAgent` via `tools: createToolDefinitions()` (verified in Story 5.1 Task 0 at `convex/ai/agents.ts:217-224`). Adding a `readBaselineRd` key auto-wires it — NO agent-factory edit needed.
  - [x] Confirm the installed tool pattern uses `validateConvexId` — `convex/ai/tools/definitions.ts:7-10` (helper) + lines 31-32 / 43-44 (`readProjectContext` / `readKnowledgeBase` call it). ADR 0008 §Integration Bridge lines 111-119 OMITS it — that's aspirational pseudo­code; the INSTALLED code is authoritative. The story MUST use `validateConvexId` (C4 gate).
  - [x] Confirm `z` is imported `from "zod/v3"` in `definitions.ts` (line 2) — the agent tool schemas use the v3 compat import. Do NOT use `from "zod"` (v4) — mismatch with the existing file.
  - [x] Confirm `internalQuery` + `v.id("projects")` is the internal-query pattern — `convex/ai/tools/queries.ts:14-17` (`readProjectContextQuery`) and lines 25-28 (`readKnowledgeBaseQuery`). Mirror exactly.
  - [x] Confirm the latest-usable-RD resolution pattern — `convex/knowledge/queries.ts:178-187` (public `getBaselineRd`-style) AND `convex/knowledge/internal.ts:1019-1034` (`_getLatestBaselineRdForDrift`). BOTH use `.query("baseline_rds").withIndex("by_project_id_and_version", (q) => q.eq("project_id", ...)).order("desc").take(10)` then `.find((r) => r.status !== "archived" && r.status !== "failed")`. The tool logic mirrors this EXACTLY.
  - [x] Confirm the `baseline_rds` schema + index — `convex/schema.ts:444-462`. `status` is a union of `"draft" | "approved" | "archived" | "failed"` (lines 449-454). The compound index `by_project_id_and_version` = `["project_id", "version"]` (line 462) — `.order("desc")` reverses to version-descending WITHIN a project.
  - [x] Confirm the section validator shape — `convex/lib/validation.ts:147-163` (`rdSectionValidator`): `{ id: string, title: string, content: string, confidence: number, divergence_note?: string, bmad_alignment?: { prd_section_title: string, agreement: "agree"|"diverge"|"partial" } }`. The logic function maps to this exact shape.
  - [x] Confirm the existing tool internal queries do NO auth check — `readKnowledgeBaseLogic` (`logic.ts:39-69`) / `readProjectContextLogic` (lines 15-22) query directly with no `getMemberWorkspace`. `readBaselineRdLogic` mirrors this (trust boundary is the agent invocation; see Dev Notes "Auth/IDOR Boundary").
  - [x] Confirm `seedBaselineRd` exists in `convex/testHelpers.ts:221-241` with the overrides needed (`version`, `status`, `sections` with `id`/`title`/`content`/`confidence`/`divergence_note`/`bmad_alignment`). NOTE: it requires a `knowledgeBaseId` FK arg — seed `seedKnowledgeBase` first (any status; the KB is not read by this tool).
  - [x] Confirm Story 5.1 ALREADY added the `projectId?: string` opt to `buildPrdGenerationPrompt` + `buildNlGenerationPrompt` (agents.ts:548-567, 506-526) AND plumbed `projectId: String(args.project_id)` at `convex/ai/prdWorkflowActions.ts` + `convex/ai/nlWorkflowActions.ts`. This story does NOT touch those action files — only the local `buildKnowledgeBaseToolHint` helper in agents.ts.
  - [x] Confirm `buildKnowledgeBaseToolHint` is a LOCAL (non-exported) function at `convex/ai/agents.ts:501-504`, called only at lines 520 and 561. Renaming it to `buildContextToolHints` is safe (no external callers; the 5.1 prompt tests assert on the PROMPT OUTPUT containing `"readKnowledgeBase"` / `"Project ID:"`, not on the helper name, so they remain valid).
  - [x] Confirm `baselineRdSchema` requires `sections.min(1)` (`convex/knowledge/baselinePrompts.ts:31`) and every stored RD is backfilled with required sections (`ensureRequiredSections`) — so the "zero-sections" branch is unreachable in practice; document in AC4.
  - [x] Baseline `pnpm typecheck` = 866 lines (Story 5.1 baseline; this story adds no tables → no new cascade errors expected).

- [x] Task 1: Write `readBaselineRdLogic` tests FIRST (AC: #2, #4, #8) — TDD RED
  - [x] EXTEND `convex/ai/agents.test.ts` — add `describe("readBaselineRd", ...)` inside the existing `describe("Agent tools", ...)` block (do NOT create a new file; the convention is one test file per domain).
  - [x] Use `seedWorkspace` → `seedProject` → `seedKnowledgeBase` (any status; FK only) → `seedBaselineRd({ status: "approved", version: 1, sections: [...] })` with distinct `id`/`title`/`content`/`confidence` + one section with `divergence_note`/`bmad_alignment`.
  - [x] Test: approved RD returns full shape with content-assertions (specific `version`, `status`, specific `sections[0].id`/`title`/`content`/`confidence` — NOT `typeof`).
  - [x] Test: draft RD (default seed status) returns full shape (`status === "draft"`) — verifies no over-filtering to approved-only.
  - [x] Test: no RD → `null`.
  - [x] Test: all RDs `"archived"` → `null`.
  - [x] Test: all RDs `"failed"` → `null`.
  - [x] Test: latest version selected when multiple usable RDs exist (v1 + v2 approved, distinct content → assert version 2 + v2 content).
  - [x] Test: skips archived/failed at top, picks next usable (v3 failed + v2 approved → assert version 2 + v2 content).
  - [x] Test: `divergence_note` + `bmad_alignment` pass through on the seeded section (assert by `id`).
  - [x] Test: non-existent project_id → `null`.

- [x] Task 2: Implement `readBaselineRdLogic` (AC: #2, #4, #9) — TDD GREEN
  - [x] Add to `convex/ai/tools/logic.ts`. Export `interface ReadBaselineRdResult { version: number; status: "draft" | "approved"; sections: Array<{ id: string; title: string; content: string; confidence: number; divergence_note?: string; bmad_alignment?: { prd_section_title: string; agreement: "agree" | "diverge" | "partial" } }>; }`.
  - [x] `export async function readBaselineRdLogic(ctx: QueryCtx, projectId: Id<"projects">): Promise<ReadBaselineRdResult | null>`.
  - [x] Resolve latest usable RD: `const rds = await ctx.db.query("baseline_rds").withIndex("by_project_id_and_version", (q) => q.eq("project_id", projectId)).order("desc").take(10); const rd = rds.find((r) => r.status !== "archived" && r.status !== "failed");`
  - [x] `if (!rd) return null;`
  - [x] Return `{ version: rd.version, status: rd.status, sections: rd.sections.map((s) => ({ id: s.id, title: s.title, content: s.content, confidence: s.confidence, divergence_note: s.divergence_note, bmad_alignment: s.bmad_alignment })) }`.

- [x] Task 3: Add `readBaselineRdQuery` internal query (AC: #3) — TDD GREEN
  - [x] Add import `readBaselineRdLogic` to `convex/ai/tools/queries.ts` (alongside the existing logic imports, including the 5.1 `readKnowledgeBaseLogic` import).
  - [x] Add `export const readBaselineRdQuery = internalQuery({ args: { project_id: v.id("projects") }, handler: async (ctx, args) => readBaselineRdLogic(ctx, args.project_id) });`.

- [x] Task 4: Add `readBaselineRd` tool definition (AC: #1) — TDD GREEN
  - [x] Add to the object returned by `createToolDefinitions()` in `convex/ai/tools/definitions.ts`. Mirror `readKnowledgeBase` (lines 38-49) exactly: `description` (mention it returns the latest Baseline RD sections + confidence scores, returns null if none), `inputSchema: z.object({ project_id: z.string() })`, `execute` with `validateConvexId` guard → `ctx.runQuery(internal.ai.tools.queries.readBaselineRdQuery, { project_id: input.project_id as Id<"projects"> })`.

- [x] Task 5: Extend prompt hint + rename helper (AC: #5) — TDD RED → GREEN
  - [x] Task 5a (RED): EXTEND `convex/ai/agents.test.ts` `describe("Prompt content snapshots", ...)`. Add the readBaselineRd prompt tests (per AC8) BEFORE the helper change — confirm they fail (no `readBaselineRd` in output yet).
  - [x] Task 5b (GREEN): In `convex/ai/agents.ts`, RENAME `buildKnowledgeBaseToolHint` → `buildContextToolHints` (lines 501-504). Extend the body so that when `projectId` is truthy, the returned string contains BOTH the existing readKnowledgeBase hint line AND a new line: `If the project has a Baseline Requirements Document, use the readBaselineRd tool with this exact project_id to look up its RD sections and confidence scores before generating tests.` Keep the single shared `Project ID: ${projectId}` header line and the leading/trailing `\n`. Return `""` unchanged when `projectId` is falsy.
  - [x] Update the two call sites (agents.ts:520 and :561) from `buildKnowledgeBaseToolHint(opts.projectId)` → `buildContextToolHints(opts.projectId)` (mechanical rename).
  - [x] DO NOT modify `buildPrdFormatRetryPrompt` or `buildNlFormatRetryPrompt` (retries don't re-invoke tools).
  - [x] DO NOT touch `prdWorkflowActions.ts` or `nlWorkflowActions.ts` (5.1 already passes `projectId`).
  - [x] Verify the existing 5.1 prompt tests (lines 527-639) still pass — the renamed helper still emits `readKnowledgeBase` + `Project ID:` when `projectId` is present, and `""` when absent.

- [x] Task 6: Write agent-wiring test (AC: #6, #8) — TDD RED → GREEN
  - [x] EXTEND `convex/ai/agents.test.ts` `describe("Agent definitions", ...)`. Add a test asserting `createTestGenerationAgent(model)` exposes `readBaselineRd` in its tool set: `expect(Object.keys(agent.options.tools ?? {})).toContain("readBaselineRd")` (mirror the 5.1 `readKnowledgeBase` wiring test).

- [x] Task 7: Validation (AC: #10)
  - [x] `pnpm lint` — zero new errors.
  - [x] `pnpm test:convex` — all backend tests pass; new tests green; zero regressions.
  - [x] `pnpm test` — all frontend tests pass; zero regressions.
  - [x] `pnpm typecheck` — no NEW type errors (compare count vs. 866-line baseline; this story adds no tables/nested-validators so the deep-instantiation cascade is unchanged).
  - [x] `pnpm build` — succeeds (with the pre-existing `ignoreBuildErrors: true` still in place — D1 owns its removal).

## Dev Notes

### Scope Boundary

**This story implements:**
- ONE new logic function `readBaselineRdLogic` in `convex/ai/tools/logic.ts` (resolves latest usable RD via `.take(10) + .find(non-archived, non-failed)` + maps sections).
- ONE new exported interface `ReadBaselineRdResult` in `logic.ts`.
- ONE new `internalQuery` `readBaselineRdQuery` in `convex/ai/tools/queries.ts` (thin wrapper, mirrors `readKnowledgeBaseQuery`).
- ONE new tool definition `readBaselineRd` in `convex/ai/tools/definitions.ts` (mirrors `readKnowledgeBase`, auto-wires into Test Generation Agent).
- MINIMAL additive change to the local `agents.ts` hint helper: rename `buildKnowledgeBaseToolHint` → `buildContextToolHints` + add the readBaselineRd hint line + rename the two call sites. NO new opt on the prompt builders (5.1 added `projectId`), NO change to retry builders, NO change to the action call sites.
- Tests extending `convex/ai/agents.test.ts` (logic + prompt-builder + agent-wiring).

**This story does NOT implement:**
- Pre-prompt RD CONTENT injection into `buildPrdGenerationPrompt` / `buildNlGenerationPrompt` (Story 5.3 — that's the deterministic, always-on context block; THIS story only surfaces the project_id + a one-line hint so the tool is callable. The two are complementary: 5.2 = tool (agent pulls on demand); 5.3 = pre-prompt (deterministic context). See "Pre-Prompt Injection vs Agent Tool" below).
- Wiring `readBaselineRd` (or `readKnowledgeBase`) into the Exploration Analysis Agent (Story 5.4 — `createExplorationAnalysisAgent` currently takes NO `tools`; 5.4 adds tools there for page/module cross-referencing).
- Any frontend / UI change (the tool result never reaches React — it's consumed by the LLM inside the agent run).
- Any schema change, new table, new index, or new npm dependency.
- Any change to `readProjectContext` / `readExistingTests` / `readTestCode` / `readKnowledgeBase` (they remain as-is).
- Removing `typescript.ignoreBuildErrors: true` (Epic 4 retro D1 — separate `fix:` commit, owned by Winston).
- Fixing the multi-workspace IDOR on AI workflow actions (D5 / B3 — the logic function does NO auth, so it doesn't inherit D5 directly; the calling actions do, but that's systemic and pre-existing).
- A Playwright smoke test (D2 — this story has NO jsdom/browser-blind surface; the tool executes inside a Convex action).

### CRITICAL: Tool Pattern — Mirror `readKnowledgeBase`, NOT the ADR 0008 Pseudo-code

The installed `convex/ai/tools/definitions.ts` is the AUTHORITATIVE tool pattern (Story 5.1 codified this). ADR 0008 §Integration Bridge (lines 111-119) shows `readBaselineRd` WITHOUT `validateConvexId` — that is aspirational pseudo­code written before the `validateConvexId` helper existed. The C4 spike-citation gate (project-context.md:108) requires citing installed types; Task 0 verifies this. **Copy `readKnowledgeBase` (definitions.ts:38-49), NOT the ADR example.** The three differentiators:

1. `validateConvexId(input.project_id, "project_id")` MUST be called and its error returned as `{ error: err }` before `ctx.runQuery` (defensive guard against the LLM passing a human-readable name instead of a Convex ID).
2. `import { z } from "zod/v3"` (NOT `from "zod"` — v4 default; the file uses v3 compat).
3. `input.project_id as Id<"projects">` cast after validation (the internal query's `v.id("projects")` arg validator is the runtime guard).

### CRITICAL: RD Resolution Pattern — Mirror the TWO Authoritative Sites, NOT `.first()`

The latest-usable-RD resolution has TWO identical authoritative implementations — use the SAME shape:

- `convex/knowledge/queries.ts:178-187` (public `getBaselineRd`-style query)
- `convex/knowledge/internal.ts:1019-1034` (`_getLatestBaselineRdForDrift`)

Both: `.query("baseline_rds").withIndex("by_project_id_and_version", (q) => q.eq("project_id", projectId)).order("desc").take(10)` → `.find((r) => r.status !== "archived" && r.status !== "failed")`.

**Why `.take(10) + .find()` instead of `.first()`?** The compound index `by_project_id_and_version` orders by `(project_id, version)`; `.order("desc")` reverses to version-descending within a project. The single highest-version RD may be `archived` or `failed` (e.g. a regeneration created v3 with `status: "failed"` while v2 is `approved`). `.first()` would return the unusable top; `.take(10)` collects the top versions and `.find()` skips unusable ones to locate the latest USABLE RD. This is deliberate and is the established convention — mirror it exactly. The "skips archived/failed at top" test (AC8) guards this behavior.

**Why `by_project_id_and_version` (compound) and NOT `by_project_id`?** Both indexes exist (schema.ts:461-462). The two authoritative sites use the COMPOUND index because version-descending ordering is meaningful within a project. The plain `by_project_id` index orders by `_creationTime` (auto-appended) — which is usually-but-not-always correlated with `version`. Use the compound index to match the authoritative sites.

### CRITICAL: "Approved" vs "Draft" Semantics (AC2/AC4)

The epic AC frames the happy path as "an approved Baseline RD". But the established resolution pattern (`status !== "archived" && status !== "failed"`) keeps BOTH `draft` AND `approved`. **Mirror the established pattern — do NOT over-filter to `approved`-only.** Reasons:

1. `seedBaselineRd` (`testHelpers.ts:234`) defaults `status` to `"draft"`, and a freshly-generated RD is typically `draft` until a human approves it. Filtering to `approved`-only would make the tool return `null` for the most common post-generation state — defeating its purpose.
2. A `draft` RD is a fully-formed Requirements Document (six required sections backfilled by `ensureRequiredSections`); it is valid requirements context for test generation.
3. Both authoritative sites (`getBaselineRd`, `_getLatestBaselineRdForDrift`) treat `draft` as usable — the drift workflow generates reports AGAINST draft RDs. Consistency requires the tool to do the same.
4. `archived` (superseded) and `failed` (generation error) are the only genuinely-unusable statuses — they are correctly excluded.

The AC's word "approved" is happy-path framing, not a strict filter. The `draft`-RD test (AC8) explicitly guards this decision. If a reviewer insists on `approved`-only, the change is a one-line filter tightening — but the default, defensible choice is to mirror the existing pattern.

### CRITICAL: Auth / IDOR Boundary — The Tool Trust Boundary is the Agent Invocation

The existing tool internal queries (`readProjectContextQuery`, `readExistingTestsQuery`, `readTestCodeQuery`, `readKnowledgeBaseQuery`) perform NO workspace-ownership check — they query directly. This is intentional and correct: the queries are INTERNAL (only callable from other Convex functions via `ctx.runQuery(internal....)`), never exposed to the client. The trust boundary is the agent invocation chain:

```
client → generatePrdTests (public action) → prdWorkflow → agent.generateText → LLM → readBaselineRd tool → ctx.runQuery(internal.ai.tools.queries.readBaselineRdQuery)
```

The `project_id` originates from the client's `generatePrdTests({ project_id, suite_id })` call. The public action `generatePrdTests` calls `getProjectForAi` and fails if the project is missing — but does NOT verify the project belongs to the caller's workspace (a pre-existing B3 IDOR surface noted in deferred-work, inherited by all AI workflows, NOT introduced by this story). `readBaselineRdLogic` mirrors `readKnowledgeBaseLogic` (no auth) — do NOT add `getMemberWorkspace` inside the logic function (it would diverge from the established tool pattern and the function runs in an internal-query ctx where auth may not be available anyway).

**The B3 IDOR rule** (project-context.md:120-124) applies to PUBLIC functions accepting an `Id`. `readBaselineRdQuery` is INTERNAL — the rule does not directly apply. The public-surface IDOR hardening belongs to the AI workflow actions (`generatePrdTests`, `generateNlTests`, etc.) and is tracked separately. Document this for the reviewer — do NOT add a workspace check to the logic function.

### Why `null` for No-Usable-RD (AC4) — Match the Agent's "Tool Returned Nothing" Semantics

When no usable RD exists (none / all archived / all failed), the tool returns `null`. The LLM sees "the tool returned null" and reasons "no Baseline RD available" — it does NOT retry, throw, or hallucinate. This mirrors `readKnowledgeBaseLogic` returning `null` for a not-ready KB (logic.ts:48) and `readProjectContextLogic` returning `null` for an unknown project (logic.ts:19-20). `null` unambiguously means "no RD available."

### Why Include `divergence_note` / `bmad_alignment` (AC2) — Cheap, High-Value Grounding

The AC text says "sections with titles, content, and confidence scores" — it does NOT explicitly mention `divergence_note` or `bmad_alignment`. Including them is pragmatic enrichment: they are already on each section (validated at write-time by `rdSectionValidator`), and they give the LLM critical signal about WHERE the RD disagrees with the BMAD PRD (`agreement: "diverge"` + the note). The LLM can then weight those sections lower or flag ambiguity in generated tests. The cost is two optional fields in the JSON payload (negligible). The `id` field is included because the AC says "sections" and the RD's required section IDs (`overview`, `tech-stack`, `modules`, ...) are how the LLM identifies which section it's reading. If the reviewer feels `divergence_note`/`bmad_alignment` exceed the AC, they can be dropped without breaking anything — but their inclusion is recommended (parallel to 5.1's inclusion of `architecture_summary`/`tech_stack`).

### Pre-Prompt Injection vs. Agent Tool — Why Both (5.2 + 5.3)

Epic 4 retro insight #5 codifies the choice: **pre-prompt injection for one-shot structured generation; agent tools for interactive/agent flows**. Test generation is agentic (the LLM decides what to look up based on the PRD/scenario), so `readBaselineRd` is a TOOL (this story, parallel to 5.1's `readKnowledgeBase`). Story 5.3 adds PRE-PROMPT context injection (deterministic, always-on RD/KB summary block) — a DIFFERENT mechanism. They coexist:
- 5.2's tool: LLM calls `readBaselineRd("proj_xyz")` on demand → gets full section + confidence detail when it needs to ground a specific test.
- 5.3's pre-prompt: every test-gen prompt includes a short RD/KB summary upfront → broad grounding without a tool round-trip.

This story's prompt change (AC5) is the MINIMUM needed to make the tool callable (project_id + one-line hint). It is NOT the 5.3 pre-prompt content block. The two stories touch the same builder functions but add different content (5.2 = tool hint; 5.3 = content block) — no collision.

### Why 5.2 Does NOT Touch the Action Call Sites (unlike 5.1)

Story 5.1 had to plumb `projectId: String(args.project_id)` into `prdWorkflowActions.ts` and `nlWorkflowActions.ts` because the opt didn't exist yet. **5.1 already did that plumbing.** The `projectId` now flows end-to-end from the action args → the prompt builders. So 5.2's ONLY prompt-side change is extending the local `buildKnowledgeBaseToolHint` helper (rename + add the readBaselineRd hint line). This is the key "What NOT to Reinvent" point — do NOT re-edit the action files.

### Existing APIs to Reuse (NO reinvention)

| API | Location | Purpose |
|-----|----------|---------|
| `validateConvexId` | `convex/ai/tools/definitions.ts:7-10` | LLM-facing ID format guard — reuse in the new tool's `execute` |
| `createTool` | `@convex-dev/agent` | Tool factory — same import as the file already uses |
| `internalQuery` | `convex/_generated/server` | Internal query wrapper — same as `readKnowledgeBaseQuery` |
| `readKnowledgeBase` (full pattern) | `definitions.ts:38-49` + `queries.ts:25-28` + `logic.ts:39-69` | **THE template** — copy structure exactly (this is the closest sibling, added in 5.1) |
| `readKnowledgeBaseLogic` test | `agents.test.ts:335-476` | **THE test pattern** — `t.run(async (ctx) => readXxxLogic(ctx, id))` |
| latest-usable-RD resolution | `knowledge/queries.ts:178-187` + `knowledge/internal.ts:1019-1034` | `.withIndex("by_project_id_and_version").order("desc").take(10)` + `.find(non-archived, non-failed)` — reuse the query shape inside the logic function |
| `rdSectionValidator` (section shape) | `convex/lib/validation.ts:147-163` | The stored section shape — the `.map` mirrors these fields |
| `seedBaselineRd` | `testHelpers.ts:221-241` | Test seed (version, status, sections with id/title/content/confidence/divergence_note/bmad_alignment). NOTE: requires `knowledgeBaseId` FK — seed `seedKnowledgeBase` first |
| `seedKnowledgeBase`, `seedWorkspace`, `seedProject` | `testHelpers.ts` | Test seed foundation (KB needed only to satisfy the RD's `knowledge_base_id` FK) |
| `buildKnowledgeBaseToolHint` | `convex/ai/agents.ts:501-504` (5.1) | The local helper to RENAME → `buildContextToolHints` + EXTEND with the readBaselineRd line |

### What NOT to Reinvent

| Concern | Reuse | Do NOT build |
|---------|-------|--------------|
| Tool definition shape | Copy `readKnowledgeBase` (definitions.ts:38-49) | A new tool-registration mechanism, OR the ADR 0008 pseudo-code (missing `validateConvexId`) |
| Internal query shape | Copy `readKnowledgeBaseQuery` (queries.ts:25-28) | A public query with auth — the tool pattern is internal-only |
| Logic function shape | Copy `readKnowledgeBaseLogic` (logic.ts:39-69) — query, return `null` on missing | A `getMemberWorkspace` call (diverges from the tool pattern; auth is at the agent-invocation boundary) |
| RD resolution | `.withIndex("by_project_id_and_version").order("desc").take(10)` + `.find(non-archived, non-failed)` (knowledge/queries.ts:178-187 + internal.ts:1019-1034) | `.first()` (returns unusable top), OR the plain `by_project_id` index, OR a new "getLatestRd" helper — inline the query |
| Section shape | Map to the `rdSectionValidator` fields (validation.ts:147-163) | A new section type, OR runtime-revalidating the section JSON |
| Prompt project_id plumbing | 5.1 already added `projectId` to the builders + the action call sites | Re-editing `prdWorkflowActions.ts` / `nlWorkflowActions.ts` — 5.1 already passes `projectId: String(args.project_id)` |
| Prompt hint | RENAME `buildKnowledgeBaseToolHint` → `buildContextToolHints` + add the readBaselineRd line | A second parallel hint helper, OR a new `projectId` opt |
| Test seed | `seedBaselineRd` (+ `seedKnowledgeBase` for the FK) (testHelpers.ts:221-241, 125-160) | Local seed functions — the project rule is "never define local seed functions" (project-context.md:80) |
| Test file location | EXTEND `convex/ai/agents.test.ts` | A new `convex/ai/tools.test.ts` or `convex/ai/readBaselineRd.test.ts` — one test file per domain at `convex/` root |

### Error Handling (C1 Pre-Review Checklist)

Per Epic 3 retro action C1 (project-context.md:106), enumerate error paths BEFORE implementation:

| Path | Surfaced as | Notes |
|------|-------------|-------|
| LLM passes a human-readable name instead of a Convex ID | `validateConvexId` returns `{ error: "Invalid project_id 'foo'. You must pass the Convex document ID..." }` | The tool returns the error object; the LLM sees it and corrects. NO throw. Mirrors `readKnowledgeBase` / `readProjectContext`. |
| LLM passes a valid-format but non-existent project_id | `readBaselineRdLogic` → no RD found → returns `null` | The LLM sees `null` and reasons "no RD." NO throw. |
| Project exists but has no RD | Returns `null` | Per AC4. NO throw. |
| Project exists, all RDs `archived` | Returns `null` | Per AC4 — archived = superseded. NO throw. |
| Project exists, all RDs `failed` | Returns `null` | Per AC4 — failed = generation error, unusable. NO throw. |
| Project exists, latest RD `failed` but older RD `approved` | Returns the older `approved` RD | The `.take(10) + .find()` scan skips the failed top. NOT null. |
| `ctx.runQuery` itself throws (Convex infrastructure failure) | Propagates up through the agent → the agent run fails | Pre-existing pattern; the agent's outer action has the catch block. NOT this story's concern. |

**No error is silently swallowed at the logic-function level.** The function either returns data, returns `null` (semantically "no usable RD"), or propagates an infrastructure error. The `validateConvexId` path returns a structured `{ error }` object (NOT a throw — the LLM consumes it).

### Dual-Write / Atomicity (C1 Checklist)

- **No dual-writes.** `readBaselineRdLogic` is READ-ONLY (no `ctx.db.patch`/`insert`/`delete`). The prompt-hint change is pure string construction. There is NO cross-system coordination, NO status mutation, NO dual-write.
- **TOCTOU**: N/A — no writes.
- **Subscription reconciliation**: N/A — internal queries don't subscribe.

### Test Quality (C1 Checklist)

Per C1, tests assert CONTENT not just TYPE (Epic 4 reviews caught multiple "test passes on empty string" gaps):
- Approved-RD test: `expect(result.version).toBe(2)` (specific number) — NOT `typeof result.version === "number"`.
- `status` content: `expect(result.status).toBe("approved")` (specific string).
- Section content: seed `sections: [{ id: "overview", title: "Overview", content: "Auth + billing app.", confidence: 0.82 }]` → `expect(result.sections[0].id).toBe("overview")`, `expect(result.sections[0].title).toBe("Overview")`, `expect(result.sections[0].content).toBe("Auth + billing app.")`, `expect(result.sections[0].confidence).toBe(0.82)` — specific values, NOT `typeof`.
- Latest-version selection: seed v1 with `sections[0].content: "v1 overview"` + v2 with `sections[0].content: "v2 overview"` → `expect(result.version).toBe(2)` AND `expect(result.sections[0].content).toBe("v2 overview")` (NOT just `result !== null`).
- Skip-top edge case: seed v3 `failed` + v2 `approved` → `expect(result.version).toBe(2)` AND `expect(result.sections[0].content).toBe("v2 overview")`.
- `divergence_note`/`bmad_alignment` pass-through: seed a section with both → assert by `id`: `expect(section.divergence_note).toBe("PRD mentions Vue.")` AND `expect(section.bmad_alignment?.agreement).toBe("diverge")`.
- Prompt-builder test: `expect(prompt).toContain("Project ID: abc123")` (specific ID) AND `expect(prompt).toContain("readBaselineRd")` (specific tool name) — NOT `prompt.includes("RD")`.
- Negative prompt test: `expect(prompt).not.toContain("readBaselineRd")` when `projectId` omitted — verifies the additive-only / no-regression rule.

### Test-Fidelity (Epic 4 retro insight #2 — jsdom-blind surfaces)

This story has NO jsdom/browser-blind surface. The logic function + internal query + prompt hint are all pure/backend — fully testable in `convex-test` (edge-runtime). The agent-wiring test (AC6) asserts on the agent's static options, not on a streamed/generated response. NO Playwright smoke needed (D2 does not block this story). The one fidelity caveat: the tests do NOT verify the LLM actually invokes `readBaselineRd` in a real generation (that would require a live LLM call — out of scope for unit tests; the tool's callability is verified via the prompt containing the project_id + the readBaselineRd hint + the tool being in the agent's tool set).

### React 19 + Next.js 16 Rules

- N/A — no frontend changes in this story. The prompt hint is in `convex/ai/agents.ts` (backend). No `"use client"`, no `router.push`, no `forwardRef` concerns.

### Convex Gotchas

- `_creationTime` is auto-appended — but the compound `by_project_id_and_version` index orders by `(project_id, version)`, NOT by `_creationTime`. `.order("desc")` reverses to version-descending WITHIN a project. This is why the two authoritative sites use this compound index (version is the meaningful ordering key for RDs).
- The `by_project_id_and_version` index is NOT unique — a project can have multiple RD rows with different versions (regeneration creates a new one). `.take(10) + .find()` picks the latest usable one. Verify with the multiple-RD + skip-top tests (AC8).
- `baseline_rds.sections` is `v.array(rdSectionValidator)` — each section is validated at write time. The logic function passes the fields through; do NOT runtime-validate them (the schema guarantees the shape; the AI generation writes them and the AI test-gen reads them — both sides tolerate the validated shape).
- The internal query's `v.id("projects")` arg validator rejects malformed IDs at the Convex boundary — but the tool's `validateConvexId` runs FIRST (in the `execute`) and returns a structured error, so the internal query only sees valid-format IDs. Belt-and-suspenders (identical to 5.1).

### File Organization

NEW backend code (existing files EXTENDED — no new files, no new directories):
```
convex/ai/tools/
├── definitions.ts          # EXTEND — add readBaselineRd to createToolDefinitions() return object
├── logic.ts                # EXTEND — add ReadBaselineRdResult interface + readBaselineRdLogic function
└── queries.ts              # EXTEND — add readBaselineRdQuery internalQuery
```

MODIFIED backend (prompt hint helper rename + extension):
```
convex/ai/
└── agents.ts               # MODIFY — rename buildKnowledgeBaseToolHint → buildContextToolHints; extend body with readBaselineRd hint line; rename 2 call sites (lines 520, 561). NO new opt, NO change to retry builders, NO change to action files.
```

MODIFIED backend test (EXTEND, do NOT create new):
```
convex/ai/
└── agents.test.ts          # EXTEND — add describe("readBaselineRd") + readBaselineRd prompt-builder tests + readBaselineRd agent-wiring test
```

**No new directories.** All edits go into existing `convex/ai/tools/` and `convex/ai/` files. No `pnpm dev` restart needed (no new `convex/` directory).

**No schema changes.** `baseline_rds` + its indexes are reused as-is.

**No new dependencies.** `createTool`, `internalQuery`, `v`, `z` are all already imported in the files being extended.

### Previous Story Intelligence

**Story 5.1 (readKnowledgeBase Agent Tool) — the DIRECT predecessor and closest sibling:**
1. 5.1 established the exact pattern this story mirrors: `definitions.ts` tool → `queries.ts` internalQuery → `logic.ts` pure function + exported interface. Copy that three-file shape verbatim (only the table/index/resolution differ).
2. 5.1's C4 Task 0 discipline (verify every infrastructure claim against installed code) is inherited — this story's Task 0 catches the SAME `validateConvexId` discrepancy with ADR 0008 (lines 111-119 omit it; installed code requires it).
3. 5.1's `null`-for-not-ready semantics (logic.ts:48) is mirrored here as `null`-for-no-usable-RD.
4. 5.1 ALREADY added `projectId?: string` to `buildPrdGenerationPrompt` + `buildNlGenerationPrompt` AND plumbed it from the action call sites. **5.2 does NOT re-do that work** — it only extends the local hint helper. This is the single biggest difference from 5.1's task list (5.1 had 8 tasks including call-site plumbing; 5.2 has 7, dropping the call-site plumbing).
5. 5.1's review deferred 4 items (cross-workspace IDOR, `validateConvexId` regex looseness, unbounded payload, execute-wrapper untested) — all are systemic/pre-existing and apply identically here (same tool pattern). The unbounded-payload concern is LOWER for this story because RD sections are bounded text (not arbitrarily-nested `apis`/`data_models` JSON); still, a very large RD could approach tool-result limits — track as the same future-hardening item.

**Story 4.4 (Story Export) — gold-standard spec discipline:**
1. The C1 pre-review checklist (error paths + test-asserts-on-content + dual-write check) is applied above — keep the discipline.
2. The "Existing APIs to Reuse" + "What NOT to Reinvent" table format is inherited — every reuse target is cited with a file:line.

**Story 4.1 (Impact Analysis Agent) — Task 0 C4-gate precedent:**
1. 4.1's Task 0 caught a FALSE spike claim. This story's Task 0 verifies the ADR 0008 `readBaselineRd` pseudo-code against the installed `definitions.ts` (same `validateConvexId` catch as 5.1).

**Epic 4 retrospective — defects to avoid (D-series + insights):**

| Epic 4 Lesson | Mitigation in This Story |
|-------------------|--------------------------|
| D1 TS `ignoreBuildErrors` rot (insight #1) | Do NOT remove the flag (out of scope); DO verify via `pnpm typecheck` that no NEW errors are introduced (this story adds no tables/nested-validators → cascade unchanged at 866 lines) |
| jsdom test-fidelity (insight #2) | N/A — no jsdom surface; all tests are `convex-test` (edge-runtime) |
| C4 spike-citation gate (insight #3) | Task 0 verifies every infrastructure claim against installed `.d.ts`/source — especially the `validateConvexId` discrepancy with ADR 0008 §Integration Bridge lines 111-119 |
| C1 pre-review checklist (insight #4) | Error-handling table + test-quality section above; target ≤5 review patches (5.1 shipped 0 patches) |
| Pre-prompt vs tools (insight #5) | Conscious choice: `readBaselineRd` is a TOOL (agentic test-gen), NOT pre-prompt injection. Story 5.3 adds the pre-prompt content block separately. |
| Deep `DataModel` from nested objects (insight #8) | This story adds NO tables and NO nested validators → does NOT worsen the `TestConvexForDataModel` cascade. Verified by the typecheck count comparison in AC10. |
| D5 multi-workspace IDOR (Critical, 4-epic carry-forward) | The logic function does NO auth → does not inherit D5 directly. The calling AI actions do inherit it (systemic). NOT blocking this story; NOT fixable here. |
| D2 Playwright smoke gate | N/A — no browser/jsdom surface in this story. |

### Git Intelligence

Baseline: latest `main` = `498ece8` (Story 5.1 implementation). Relevant recent commits:
- `498ece8` — Story 5.1 (`readKnowledgeBase` Agent Tool) — the DIRECT template for this story; the tool files (`definitions.ts`, `queries.ts`, `logic.ts`) now contain the `readKnowledgeBase` implementation to copy; the prompt builders already carry the `projectId` opt + `buildKnowledgeBaseToolHint` helper to extend.
- `56050e5` — Epic 4 retrospective (D-series actions; this story's Dev Notes inherit the insights).
- `bb1aa54` — Story 4.4 (Story Export) — gold-standard spec + C1 checklist discipline.

NEW schema: none. NEW `convex/` directory: none (existing `convex/ai/tools/`). NEW dependencies: none. NEW tables: none (insight #8 — no deep-instantiation cascade impact).

Single `feat:` commit per story (follow `498ece8` / `bb1aa54` convention).

### Deferred Work Relevant to This Story

Per retro action A8, review `_bmad-output/implementation-artifacts/deferred-work.md`:

- **Cross-workspace IDOR on AI workflow actions** (`generatePrdTests` etc. — deferred by 5.1 review): the public actions accept `project_id` without workspace-ownership verification. The `readBaselineRd` tool inherits this surface (it trusts the project_id passed by the agent). NOT introduced by this story; NOT fixable here (it's a cross-cutting change to all AI workflow actions). Track as a separate security hardening story (B3).
- **`validateConvexId` regex looseness** (deferred by 5.1 review): `/^[a-z0-9]{10,}$/i` lets malformed IDs reach the runtime `v.id("projects")` validator. Identical gap across all sibling tools; fix belongs in `validateConvexId` itself. NOT in this story.
- **Unbounded RD payload** (parallel to 5.1's unbounded-KB-payload defer): a very large RD (many sections, long content) could approach tool-result/context limits. Lower risk than the KB case (sections are bounded text, not arbitrary JSON), but track as future hardening (cap section count + truncate long content).
- **Tool `execute` / `validateConvexId` error branch untested** (deferred by 5.1 review): only the pure logic function is unit-tested; the execute wrapper is not. Systemic test pattern across all tool tests. NOT in this story.
- **D5 multi-workspace `.first()`** (deferred-work; Epic 4 retro Critical): N/A — this story's logic uses `.take(10) + .find()` (not `.first()`), and does NO auth. The calling AI actions inherit D5 (systemic). NOT in this story.
- **D1 TS gate** (Epic 4 retro): the `ignoreBuildErrors` flag stays. NOT in this story.
- **D2 Playwright smoke** (Epic 4 retro): N/A for this story (no browser surface).

### Project Structure Notes

- All new code is in EXISTING files under `convex/ai/tools/` and `convex/ai/`. No new directories.
- `logic.ts` stays a pure-logic module (no `internalQuery` wrapper, no Convex imports beyond `QueryCtx` + `Id` types — mirrors the existing `readKnowledgeBaseLogic`/`readProjectContextLogic`). Fully unit-testable via direct invocation in `t.run(async (ctx) => readBaselineRdLogic(ctx, id))`.
- `queries.ts` stays a thin wrapper file (one `internalQuery` per logic function — the ratio is now 5:1 after 5.1 + 5.2).
- `definitions.ts` stays the tool-registration file (one `createTool` per tool in the returned object — 7 tools after 5.2: readExistingTests, readProjectContext, readKnowledgeBase, readBaselineRd, readTestCode, readPreviousExplorations, readRecentFailures).
- The `ReadBaselineRdResult` interface is exported from `logic.ts` (not a separate types file — cohesion over type-directory pattern, mirroring 5.1's `ReadKnowledgeBaseResult`).
- Backend tests EXTEND `convex/ai/agents.test.ts` (one test file per domain at `convex/` root — per project-context.md:79, do NOT create `convex/ai/tools.test.ts`).

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 5.2] — ACs and user story (lines 804-821)
- [Source: _bmad-output/planning-artifacts/epics.md#Epic 5] — Epic context (lines 258-264, 781-784)
- [Source: _bmad-output/planning-artifacts/epics.md#FR-40] — Test Gen Agent gains readBaselineRd tool (line 66, 183)
- [Source: _bmad-output/planning-artifacts/epics.md#ARCH-9] — Integration bridge is tool-based (line 131)
- [Source: docs/adr/0008-combined-analyst-test-platform.md#Integration Bridge] — Tool pseudo-code (lines 111-119) — AUTHORITATIVE for the CONCEPT but NOT for the code shape (omits `validateConvexId`; Task 0 C4-gate catch, same as 5.1). The installed `definitions.ts` is the code authoritative source.
- [Source: docs/adr/0008-combined-analyst-test-platform.md#Agent Definitions] — "Test Generation Agent gains readBaselineRd tool — returns the latest Baseline RD sections and confidence scores" (line 91)
- [Source: _bmad-output/implementation-artifacts/5-1-read-knowledge-base-agent-tool.md] — THE direct predecessor + closest sibling; this story mirrors its three-file pattern (definitions/queries/logic) and its prompt-hint approach, differing only in table/index/resolution + the fact that 5.1 already plumbed `projectId`.
- [Source: _bmad-output/implementation-artifacts/4-4-story-export.md] — Gold-standard spec + C1 checklist discipline + "Existing APIs to Reuse" / "What NOT to Reinvent" table format.
- [Source: _bmad-output/implementation-artifacts/4-1-impact-analysis-agent.md] — Task 0 C4-gate precedent (spike false-claim catch) + agent-component wrapper discipline.
- [Source: _bmad-output/implementation-artifacts/epic-4-retrospective.md] — Insight #5 (pre-prompt vs tools — the conscious choice for this story); insight #8 (deep DataModel — this story adds no tables); D-series critical-path items (D1/D2/D5 — none block this story).
- [Source: _bmad-output/implementation-artifacts/deferred-work.md] — cross-workspace IDOR (B3), `validateConvexId` regex, unbounded payload, execute-wrapper untested (all pre-existing/systemic, none introduced here).
- [Source: _bmad-output/project-context.md] — Critical rules: no-comments (51/93), ConvexError (48), "use node" isolation (49 — N/A here, the tool files export queries/internal functions only), IDOR B3 (120-124 — applies to PUBLIC functions; this is internal), C4 spike-citation (108), C1 checklist (106), reserved index names (67 — N/A, no new indexes; `_creationTime` note applies to the compound index).
- [Source: convex/ai/tools/definitions.ts:7-10, 26-49] — **THE tool definition template** (`validateConvexId` helper + `readProjectContext` + `readKnowledgeBase` tools — copy the KB sibling exactly).
- [Source: convex/ai/tools/logic.ts:24-69] — **THE logic-function template** (`ReadKnowledgeBaseResult` interface + `readKnowledgeBaseLogic` — copy structure; swap KB table+index for `baseline_rds` + `by_project_id_and_version` + `.take(10)+.find()`).
- [Source: convex/ai/tools/queries.ts:14-28] — **THE internal-query template** (`readProjectContextQuery` + `readKnowledgeBaseQuery`).
- [Source: convex/ai/agents.ts:501-504, 520, 561] — **`buildKnowledgeBaseToolHint`** local helper + its 2 call sites — RENAME → `buildContextToolHints` + EXTEND with readBaselineRd line.
- [Source: convex/ai/agents.ts:217-224] — **`createTestGenerationAgent`** passes `tools: createToolDefinitions()` — adding a key auto-wires the tool (verified in 5.1).
- [Source: convex/ai/agents.test.ts:255-476] — **THE test block to extend** (`describe("Agent tools")` — `readKnowledgeBase` logic-function-direct invocation pattern to mirror for `readBaselineRd`).
- [Source: convex/ai/agents.test.ts:479-639] — **THE prompt-content test block to extend** (`describe("Prompt content snapshots")` — 5.1's readKnowledgeBase prompt tests remain valid; add readBaselineRd assertions).
- [Source: convex/knowledge/queries.ts:170-201] — **public RD query** — latest-usable-RD-resolution pattern (`.withIndex("by_project_id_and_version").order("desc").take(10)` + `.find(non-archived, non-failed)`).
- [Source: convex/knowledge/internal.ts:1019-1034] — **`_getLatestBaselineRdForDrift`** — IDENTICAL latest-usable-RD-resolution pattern (internal query; second authoritative site).
- [Source: convex/knowledge/internal.ts:967-1017] — **`_getKbForDriftReport`** — shows the section-mapping shape `{ id, title, content }` (lines 992-999); this story's logic ALSO includes `confidence` + `divergence_note` + `bmad_alignment` (the AC requires confidence; the others are high-value grounding).
- [Source: convex/schema.ts:444-462] — **`baseline_rds` table** — field shapes + indexes. `status` union `"draft"|"approved"|"archived"|"failed"` (lines 449-454); compound index `by_project_id_and_version` = `["project_id", "version"]` (line 462).
- [Source: convex/lib/validation.ts:147-163] — **`rdSectionValidator`** — the stored section shape the logic function maps to.
- [Source: convex/knowledge/baselinePrompts.ts:4-32] — **`RdSection` type + `baselineRdSchema`** — `sections.min(1)` (line 31) confirms the zero-sections branch is unreachable.
- [Source: convex/testHelpers.ts:221-241] — **`seedBaselineRd`** — test seed helper (reuse; note the required `knowledgeBaseId` FK arg). Lines 212-219 show the default sections.
- [Source: convex/knowledge.baselineRdEditor.test.ts:23-24,117-118] — example seed of `divergence_note` + `bmad_alignment` + content assertions on them — mirror for the pass-through test.

## Dev Agent Record

### Agent Model Used

glm-5.2 (zai-coding-plan/glm-5.2)

### Debug Log References

- Task 0 C4 gate: every infrastructure claim verified against installed code (definitions.ts:7-10/26-49, queries.ts:14-28, logic.ts, schema.ts:444-462, validation.ts:147-163, knowledge/queries.ts:178-187, knowledge/internal.ts:1019-1034, testHelpers.ts:221-241). ADR 0008 §Integration Bridge pseudo-code confirmed to OMIT `validateConvexId` — installed pattern followed, NOT the ADR.
- RED phase confirmed: 9 readBaselineRdLogic tests failed with `readBaselineRdLogic is not a function` before implementation.
- Type error during GREEN: `.find()` predicate does not narrow `rd.status` in TS, so `rd.status` stayed the full `"draft"|"approved"|"archived"|"failed"` union. Fixed with a safe narrowing cast `rd.status as ReadBaselineRdResult["status"]` (provably correct — the find predicate already excluded archived/failed). This is type-only; runtime unaffected (verified by re-running tests).

### Completion Notes List

- AC1: `readBaselineRd` tool added to `createToolDefinitions()` in definitions.ts — mirrors `readKnowledgeBase` exactly, including the mandatory `validateConvexId` guard + `zod/v3` import + `as Id<"projects">` cast.
- AC2: `readBaselineRdLogic` + `ReadBaselineRdResult` interface added to logic.ts — resolves latest usable RD via `.withIndex("by_project_id_and_version").order("desc").take(10)` + `.find(non-archived, non-failed)`, mirroring BOTH authoritative sites (knowledge/queries.ts:178-187 + knowledge/internal.ts:1019-1034). Sections mapped to id/title/content/confidence/divergence_note/bmad_alignment.
- AC3: `readBaselineRdQuery` internalQuery added to queries.ts — thin wrapper mirroring `readKnowledgeBaseQuery`.
- AC4: Returns `null` (no throw) for no RD / all archived / all failed — verified by 3 tests.
- AC5: `buildKnowledgeBaseToolHint` renamed → `buildContextToolHints` + extended with the readBaselineRd hint line; both call sites (agents.ts:520, :561) renamed. Returns `""` unchanged when projectId falsy. Retry builders + action files untouched.
- AC6: `createTestGenerationAgent(model).options.tools` includes `readBaselineRd` — verified by dedicated agent-wiring test (tool auto-wires via `tools: createToolDefinitions()`).
- AC7: No schema changes, no new tables/indexes/dependencies/directories — purely additive in existing files.
- AC8: 17 new tests added to `convex/ai/agents.test.ts` (9 logic-function + 7 prompt-builder + 1 agent-wiring). All assert content with specific values (C1 discipline), not just types. The "skips archived/failed at top" edge case guards the `.take(10)+.find()` choice over `.first()`.
- AC9: `v.id("projects")` on the query arg; logic returns new objects via `.map`; no comments added.
- AC10: `pnpm lint` (0 new errors — 1 pre-existing error identical to baseline 498ece8), `pnpm test:convex` (1110 passed, +17 new, 0 regressions), `pnpm test` (481 passed, 0 regressions), `pnpm typecheck` (866 lines = baseline, 0 new errors), `pnpm build` (succeeds with pre-existing `ignoreBuildErrors: true` flag still in place — D1 owns its removal).

### File List

- convex/ai/tools/logic.ts (MODIFIED — added `ReadBaselineRdResult` interface + `readBaselineRdLogic` function)
- convex/ai/tools/queries.ts (MODIFIED — added `readBaselineRdQuery` internalQuery + import)
- convex/ai/tools/definitions.ts (MODIFIED — added `readBaselineRd` tool to `createToolDefinitions()`)
- convex/ai/agents.ts (MODIFIED — renamed `buildKnowledgeBaseToolHint` → `buildContextToolHints`, extended body with readBaselineRd hint, renamed 2 call sites)
- convex/ai/agents.test.ts (MODIFIED — added `readBaselineRd` describe block (9 logic tests) + 7 prompt-builder tests + 1 agent-wiring test; added `seedBaselineRd` import)

### Change Log

- 2026-06-16: Implemented Story 5.2 — `readBaselineRd` agent tool (logic + internal query + tool definition + prompt-hint extension + 17 tests). All validation gates pass (lint/typecheck at baseline, tests green, build succeeds).

### Review Findings

3-layer adversarial review (Blind Hunter, Edge Case Hunter, Acceptance Auditor) — 2026-06-16. 0 decision-needed, 1 patch, 5 defer, 3 dismissed (status cast verified sound; `sections` null-guard verified required by schema; status-cast positive note).

- [x] [Review][Patch] Dev Agent Record test-count claim said "18 new (9 logic + 8 prompt-builder + 1 wiring)" — corrected to 17 (9 logic + 7 prompt-builder + 1 wiring) across AC8/AC10/File-List/Change-Log [5-2-read-baseline-rd-agent-tool.md:428,430,438,442] — APPLIED.
- [x] [Review][Defer] `.take(10)` truncation can miss a usable RD when a project has >10 consecutive archived/failed versions at the top [convex/ai/tools/logic.ts:100-106] — deferred, pre-existing. Mirrored EXACTLY from the two authoritative resolution sites (knowledge/queries.ts:178-187 + knowledge/internal.ts:1019-1034); spec mandates exact mirroring. Systemic across all three sites — fixing one creates inconsistency. Future hardening: paginate or add a `[project_id, status]` index across all sites.
- [x] [Review][Defer] Tool description omits the `{ error }` validation-failure return shape, leaving three disjoint return shapes (`ReadBaselineRdResult | null | { error }`) undocumented for the LLM [convex/ai/tools/definitions.ts:50-61] — deferred, pre-existing. Inherited from all 5 sibling tool wrappers (same `{ error }` pattern + description style); spec mandates mirroring readKnowledgeBase. Systemic — align all five wrappers together.
- [x] [Review][Defer] Unbounded RD payload returned to the LLM tool (no section-count cap or content truncation) [convex/ai/tools/logic.ts:107-118] — deferred, pre-existing. Explicitly acknowledged in this story's "Deferred Work" section (parallel to 5.1's unbounded-KB defer); lower risk than KB (sections are bounded text). Future hardening: cap section count + truncate long content.
- [x] [Review][Defer] `validateConvexId` error branch (`execute` wrapper) untested for readBaselineRd [convex/ai/tools/definitions.ts:55-56] — deferred, pre-existing. Explicitly acknowledged in this story's "Deferred Work" section ("Tool execute / validateConvexId error branch untested — deferred by 5.1 review; systemic test pattern across all tool tests"). Systemic across all 5 tools.
- [x] [Review][Defer] No test covers the >10 RDs boundary (10+ archived/failed + one older usable) [convex/ai/agents.test.ts:555-591] — deferred, pre-existing. Coupled to the `.take(10)` truncation defer above; spec AC8 does not require it; testing now would lock in behavior scheduled for future change when truncation is addressed.

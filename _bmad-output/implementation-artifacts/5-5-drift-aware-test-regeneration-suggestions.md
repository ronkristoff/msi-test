---
baseline_commit: 1db1d0c7a2968e132d3a0f2cae7e1cbb87189886
---

# Story 5.5: Drift-Aware Test Regeneration Suggestions

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want the system to detect which modules changed after a KB re-sync and flag tests needing regeneration,
so that I can keep tests in sync with code changes.

## Acceptance Criteria

1. **AC1 — `computeModuleFingerprint` + `diffModuleSnapshots` are NEW exported pure functions in a NEW file `convex/knowledge/moduleDiff.ts`**: Two NEW pure helpers live in a NEW file `convex/knowledge/moduleDiff.ts` (the file is the "module-diff helper home" — small, focused, high-cohesion; no new `convex/` directory since `convex/knowledge/` already exists → no `pnpm dev` restart needed). (a) `computeModuleFingerprint(module: ModuleFingerprintInput): string` accepts `{ name, description?, files?, apis?, data_models?, user_flows?, dependencies? }` and returns a deterministic hex string (FNV-1a 32-bit hash, `Math.imul`-based — no crypto dep). The hash is over the joined `|`-separated serialization: `name|description|files.join(",")|JSON.stringify(apis ?? null)|JSON.stringify(data_models ?? null)|JSON.stringify(user_flows ?? null)|dependencies.join(",")`. (b) `diffModuleSnapshots(prev: ModuleFingerprint[], next: ModuleFingerprint[]): ModuleDiff` accepts two arrays of `{ name, fingerprint }` and returns `{ added: string[]; removed: string[]; changed: string[] }` — `added` = names in `next` not in `prev`; `removed` = names in `prev` not in `next`; `changed` = names in both whose fingerprint differs. BOTH functions are PURE (no `ctx`, no I/O, never throw, never mutate inputs) and are EXPORTED so they can be unit-tested directly with exact input control (mirrors 5.3's `truncateContext` + 5.4's `computeKbCoverageGaps` export rationale). The `ModuleFingerprintInput` + `ModuleFingerprint` + `ModuleDiff` interfaces are EXPORTED types from the same file (imported by `internal.ts` for the diff step + by the schema's optional field shape). The hash handles the `unknown`-typed `apis`/`user_flows` defensively via `JSON.stringify(... ?? null)` (never throws on `undefined` — symmetric to 5.3's `renderApis`/`renderUserFlows` `unknown` handling at `agents.ts:575-599`).

2. **AC2 — `_snapshotModulesForResync` internal mutation captures pre-resync module fingerprints onto the KB record**: A NEW internal mutation `_snapshotModulesForResync` is added to `convex/knowledge/internal.ts` (alongside the existing `_resetKbForResync` at `internal.ts:421-439` — sibling re-sync helper). It takes `knowledge_base_id: v.id("knowledge_bases")`. The handler: (a) reads all `kb_modules` for the KB via `withIndex("by_knowledge_base_id", ...).collect()` (the same index used by `_deleteModulesByKb` at `internal.ts:385-419`); (b) maps each to `{ name: m.name, fingerprint: computeModuleFingerprint({ name: m.name, description: m.description ?? null, files: m.files ?? [], apis: m.apis ?? null, user_flows: m.user_flows ?? null, dependencies: m.dependencies ?? [] }) }`; (c) patches the KB via `ctx.db.patch(args.knowledge_base_id, { previous_module_fingerprints: fingerprints })`. It is IDEMPOTENT — calling it twice on the same KB overwrites the snapshot (the last call wins, which is correct for back-to-back re-syncs). It does NOT throw when the KB has zero modules (returns an empty-array snapshot — the diff step will then treat the entire post-resync module set as `added`, which produces no stale tests — accurate for a project that gained modules but had none before). It does NOT throw when the KB doc doesn't exist (defensive `if (!kb) return;` — mirrors `_updateKbStatus` at `internal.ts:96-98`).

3. **AC3 — `_storeModuleDiff` internal mutation + `_handleIngestionComplete` success branch computes + persists the diff**: A NEW internal mutation `_storeModuleDiff` is added to `internal.ts`. It takes `knowledge_base_id: v.id("knowledge_bases")`, `diff: v.object({ added: v.array(v.string()), removed: v.array(v.string()), changed: v.array(v.string()) })`. The handler patches the KB with `module_diff: { ...args.diff, computed_at: Date.now() }`. The EXISTING `_handleIngestionComplete` mutation (`internal.ts:297-334`) is EXTENDED — the early-return guard at line 319 (`if (args.result.kind !== "failed") return;`) is RESTRUCTURED to a 3-branch dispatch: `failed` (existing failure logic unchanged — sets KB `error` + project `kb_status: "error"`); `canceled` (no-op `return`); `success` (NEW — the diff-computation path). On the `success` branch: (a) read the KB doc; (b) if `kb.previous_module_fingerprints` is `undefined`/absent → `return` (initial ingestion has no snapshot — additive no-op); (c) else read fresh `kb_modules` via `withIndex("by_knowledge_base_id", ...).collect()`, map each to `{ name, fingerprint: computeModuleFingerprint(...) }`, call `diffModuleSnapshots(kb.previous_module_fingerprints, nextFingerprints)`, then `ctx.db.patch(args.context.knowledge_base_id, { module_diff: { ...diff, computed_at: Date.now() }, previous_module_fingerprints: undefined })` — the snapshot is CLEARED in the SAME patch (single atomic Convex doc write — mirrors the C1 atomicity rule). The `success` branch is the ONLY new code path; `failed` + `canceled` are byte-identical to pre-5.5. The diff computation is bounded: a typical project has ≤50 modules (`EXTRACTION_MAX_MODULES = 50` in `constraints.ts:48`), so the read + map + diff is O(50) — well under the 2-minute NFR-6 turnaround (the workflow's GitHub fetch + AI extraction dominates wall-clock; this post-step adds milliseconds).

4. **AC4 — `resyncKnowledgeBase` action calls `_snapshotModulesForResync` BEFORE `_deleteModulesByKb`**: The EXISTING `resyncKnowledgeBase` action (`triggerIngestion.ts:98-201`) is EXTENDED with ONE new `ctx.runMutation` call inserted BEFORE the `_deleteModulesByKb` call at `triggerIngestion.ts:158`. The new call: `await ctx.runMutation(internal.knowledge.internal._snapshotModulesForResync, { knowledge_base_id: existingKb._id })`. Rationale for ordering: the snapshot MUST capture modules BEFORE deletion (otherwise there is nothing to diff against). The placement is AFTER the existing `_updateKbStatus({ status: "building" })` call at `triggerIngestion.ts:151-156` (per the Story 1.8 review fix — building status is set BEFORE destructive cleanup so a failed cleanup leaves the KB visibly building, not silently "ready" with empty data). The `triggerIngestion` action (initial ingestion — `triggerIngestion.ts:22-96`) is UNCHANGED — initial ingestion has no previous modules to snapshot; the diff step's `previous_module_fingerprints === undefined` guard at AC3 handles the no-snapshot case (additive no-op — verified end-to-end by AC9's integration test). This story does NOT introduce a TOCTOU fix for the resync race (deferred from Story 1.8 review — pre-existing).

5. **AC5 — NEW optional schema fields on `knowledge_bases`**: The `knowledge_bases` table (`schema.ts:379-396`) gains TWO new optional fields, both backward-compatible (existing KB docs get `undefined` — no migration, per Convex optional-field semantics documented in project-context.md:131): (a) `previous_module_fingerprints: v.optional(v.array(v.object({ name: v.string(), fingerprint: v.string() })))` — the transient pre-resync snapshot, CLEARED after the diff is computed (set only by `_snapshotModulesForResync`, cleared by `_handleIngestionComplete` success branch); (b) `module_diff: v.optional(v.object({ added: v.array(v.string()), removed: v.array(v.string()), changed: v.array(v.string()), computed_at: v.number() }))` — the persistent diff result, replaced on each re-sync. Both fields are siblings to the existing `last_synced_at` field at `schema.ts:393` (same "post-sync metadata" grouping). No new table, no new index (the diff step uses the existing `kb_modules.by_knowledge_base_id` index; the stale-tests query uses the existing `explorations.by_project_id` + `suites.by_exploration_id` + `tests.by_suite_id` indexes). No reserved index names touched (project-context.md:67). No new npm dependency (FNV-1a is hand-rolled — ~6 lines).

6. **AC6 — NEW public query `getStaleTests` in `convex/knowledge/queries.ts` returns flagged tests**: A NEW public query `getStaleTests` is added to `convex/knowledge/queries.ts` (alongside the existing `getKnowledgeBase`/`getModules` queries — the project-scoped read-query home). It takes `project_id: v.id("projects")` and uses `getOptionalOwnedEntity(ctx, args.project_id, "projects")` for the ownership check (project rule: "never inline ownership checks" — project-context.md:122; returns `[]` fast if not owned). The handler: (a) reads the latest KB via `withIndex("by_project_id", ...).order("desc").first()` (the SAME pattern as `readKnowledgeBaseLogic` at `logic.ts:43-47`); (b) if no KB OR `kb.module_diff` is `undefined` OR `removed.length + changed.length === 0` → return `[]` fast (no diff, or no stale-relevant changes); (c) else collect the module names to flag = `[...module_diff.removed, ...module_diff.changed]` (NOT `added` — new modules are a coverage gap, not a stale-test signal — see Dev Notes "Why `changed` + `removed`, not `added`"); (d) scan explorations for the project via `withIndex("by_project_id", ...).collect()` (the SAME pattern as the existing exploration scans in `suites/queries.ts:286-296`); for each exploration, scan `proposed_scenarios` for any scenario whose `kb_module` is in the flag set (case-insensitive after `trim().toLowerCase()` — mirrors `computeKbCoverageGaps` normalization at `agents.ts` 5.4); collect matching `exploration_id`s into a `Set`; (e) for each matching `exploration_id`, find suites via `withIndex("by_exploration_id", q => q.eq("exploration_id", eid))` (indexed — `schema.ts:99`); (f) for each suite, find tests via `withIndex("by_suite_id", q => q.eq("suite_id", suite._id))` (indexed — `schema.ts:127`); (g) deduplicate tests by `_id` (a test may map to multiple changed modules — return once with the first-matched module name); (h) return `Array<{ _id, name, suite_id, suite_name, module_name, reason: "changed" | "removed" }>`. The query is O(explorations × scenarios) + O(matched_suites × tests_per_suite) — bounded for typical projects (a few explorations, ≤20 scenarios each, ≤50 tests per suite). No new index needed. The query FOLLOWS the established ownership pattern (no inline check). The query does NOT scan `tests.playwright_code` for module file paths (the LLM-annotated `kb_module` is the explicit, deterministic link — see Dev Notes "Why exploration-based, not code-scan").

7. **AC7 — Frontend surfaces flagged tests as a banner on the project detail page with a "Regenerate" link per test**: A NEW client component `StaleTestsBanner` is added at `src/app/(auth)/projects/[id]/StaleTestsBanner.tsx` (alongside the project page — colocated, frontend convention per project-context.md:88). It calls `useQuery(api.knowledge.queries.getStaleTests, { project_id })` (the new query from AC6) and renders an amber banner (mirroring the `prdGaps`/`kbCoverageGaps` banner styling at `explore/page.tsx:634-641` and 5.4's `kbCoverageGaps` banner) WHEN the result is non-empty. The banner shows: a header line `<N> test(s) may be stale due to recent Knowledge Base re-sync.`; a list of tests (each with `name`, `suite_name`, and the matching `module_name` + `reason`); and a `<Link>` "Regenerate" button per test pointing to `/projects/{id}/suites/{suite_id}` (the existing suite detail page at `src/app/(auth)/projects/[id]/suites/[suiteId]/page.tsx` — where the user can edit/approve/replace the test inline per FR-56; TRUE one-click AI regeneration is documented as deferred in Dev Notes). The banner is rendered in `src/app/(auth)/projects/[id]/page.tsx` ABOVE the "Suites" section (the most relevant surface — the developer is already looking at the project's suites/tests). When `getStaleTests` returns `[]` OR is still loading, the banner is NOT rendered (no visual change for projects with no stale tests or no KB). The banner reads `module_diff.computed_at` indirectly (via the query result) to show "Re-synced <date>" context — MIRROR NOT REQUIRED; the simpler copy omits the date (the banner is non-blocking; the user can navigate to the Knowledge page for re-sync timestamps). The component follows React 19 + Next.js 16 rules: NO `router.push` in render body (the `<Link>` is a pure anchor — no side effects), NO `forwardRef`, NO new data fetching beyond the one `useQuery`.

8. **AC8 — No new tables beyond the two optional KB fields; no new internal queries for module fetch (reuses `kb_modules.by_knowledge_base_id`); no new dependencies; no new directories**: The `knowledge_bases` table gains TWO optional fields (`previous_module_fingerprints`, `module_diff`). No new Convex table, no new index. No new npm dependency (FNV-1a is hand-rolled). No new `convex/` directory (existing `convex/knowledge/`, `convex/schema.ts`, and `src/app/(auth)/projects/[id]/` are extended — the NEW `convex/knowledge/moduleDiff.ts` is a file inside an EXISTING directory, so no `pnpm dev` restart needed). No new internal query (the diff step reads `kb_modules` directly via `ctx.db.query` inside the mutation — `_handleIngestionComplete` is already a mutation with DB access). The new public query (`getStaleTests`) follows the existing `getKnowledgeBase`/`getModules` pattern. This story is: ONE new pure-helpers file (`moduleDiff.ts` with `computeModuleFingerprint` + `diffModuleSnapshots` + 3 types) + ONE new internal mutation (`_snapshotModulesForResync`) + ONE new internal mutation (`_storeModuleDiff`) + ONE extended internal mutation (`_handleIngestionComplete` success branch) + ONE action call-site extension (`resyncKnowledgeBase`) + TWO optional schema fields + ONE new public query (`getStaleTests`) + ONE new frontend component (`StaleTestsBanner`) + ONE page extension (project detail) + tests.

9. **AC9 — Tests (TDD, ≥80% coverage on new code)**:
   - **`computeModuleFingerprint` + `diffModuleSnapshots` unit tests** — NEW file `convex/knowledge/moduleDiff.test.ts` (the pure-helpers test home; colocated with `moduleDiff.ts` per the project's "one test file per domain" rule — project-context.md:79). Pure functions have NO DB/action surface, so this file runs under the standard convex vitest config (no `t.action()` → no root-level requirement). Tests (all assert CONTENT — specific values, per C1 checklist at project-context.md:106):
     - `computeModuleFingerprint` is DETERMINISTIC: same input → same output (call twice, assert equal). Different name → different output. Different `apis` → different output. Different `user_flows` → different output. Different `files` → different output. Different `dependencies` → different output. Different `description` → different output.
     - `computeModuleFingerprint` is DEFENSIVE on `unknown` shapes: `apis: { weird: "shape" }` does NOT throw; `apis: null` does NOT throw; `apis: undefined` does NOT throw; `user_flows: [{ route: "/x" }]` does NOT throw. Returns a string in all cases (specific assertion: `typeof fp === "string" && fp.length > 0`).
     - `computeModuleFingerprint` returns a hex string (matches `/^[0-9a-f]+$/`).
     - `diffModuleSnapshots` returns `{ added: [], removed: [], changed: [] }` when `prev` and `next` are identical (same names + fingerprints).
     - `diffModuleSnapshots` returns `added: ["NewMod"]` when `next` has a module not in `prev`.
     - `diffModuleSnapshots` returns `removed: ["OldMod"]` when `prev` has a module not in `next`.
     - `diffModuleSnapshots` returns `changed: ["Mod"]` when both have "Mod" but fingerprints differ.
     - `diffModuleSnapshots` handles empty inputs: `prev: []`, `next: []` → all empty; `prev: []`, `next: [a, b]` → `added: [a, b]`; `prev: [a, b]`, `next: []` → `removed: [a, b]`.
     - `diffModuleSnapshots` does NOT mutate its inputs (call it, then assert `prev` and `next` arrays are unchanged — immutability rule per project-context.md:50).
     - `diffModuleSnapshots` with duplicate names in `prev` (degenerate — shouldn't happen but defensive): the last entry wins (`Map` semantics). Assert no throw + a specific deterministic result.
   - **`_snapshotModulesForResync` + `_storeModuleDiff` + `_handleIngestionComplete` integration tests** — NEW file `convex/knowledge.staleTests.test.ts` at `convex/` ROOT (root-level per the 5.3/5.4 PROVEN convention — every convex test that calls `t.run` against internal mutations lives at root with the `"./**/*.ts"` module map; subdir placement breaks module resolution per the 5.3 review). Use the shared seed helpers from `convex/testHelpers.ts` (`seedWorkspace`, `seedProject`, `seedKnowledgeBase`, `seedModule`, `seedSuite`, `seedTestDoc`, `seedFullStack`). Tests:
     - `_snapshotModulesForResync`: seed a ready KB with 2 modules → call the mutation → assert the KB doc's `previous_module_fingerprints` is an array of 2 `{ name, fingerprint }` entries matching the seeded module names + NON-EMPTY hex fingerprints (specific assertions: `expect(kb.previous_module_fingerprints?.length).toBe(2)`, `expect(kb.previous_module_fingerprints?.[0].name).toBe("Auth Module")`, `expect(kb.previous_module_fingerprints?.[0].fingerprint).toMatch(/^[0-9a-f]+$/)`).
     - `_snapshotModulesForResync` with zero modules: seed a ready KB with no modules → call → assert `previous_module_fingerprints` is `[]` (NOT `undefined` — distinct from "no snapshot"; documents "KB had zero modules before re-sync").
     - `_snapshotModulesForResync` is idempotent: call twice → second call overwrites (assert the array reflects the second call's state, not appended).
     - `_snapshotModulesForResync` on a non-existent KB: does NOT throw (defensive `if (!kb) return`).
     - `_storeModuleDiff`: call with a sample diff → assert the KB doc's `module_diff` is `{ added: [...], removed: [...], changed: [...], computed_at: <number> }` (specific content — `expect(kb.module_diff?.removed).toEqual(["X"])`).
     - `_handleIngestionComplete` SUCCESS branch: seed a ready KB WITH `previous_module_fingerprints` set + 2 NEW modules (with one matching name but different description, one new name, one removed name from snapshot) → call `_handleIngestionComplete` with `result: { kind: "success", returnValue: {} }` → assert (a) `kb.module_diff` reflects the diff (specific names: `added`, `removed`, `changed`), (b) `kb.previous_module_fingerprints` is `undefined` (CLEARED in the same patch — atomicity assertion).
     - `_handleIngestionComplete` SUCCESS branch with NO snapshot (initial ingestion): seed a ready KB with NO `previous_module_fingerprints` + 2 modules → call with `result: { kind: "success", ... }` → assert `kb.module_diff` is `undefined` (additive no-op — no regression for initial ingestion) AND `kb.previous_module_fingerprints` remains `undefined`.
     - `_handleIngestionComplete` FAILED branch unchanged: seed a ready KB → call with `result: { kind: "failed", error: "..." }` → assert the existing failure logic still runs (`kb.status === "error"`, `kb.error_message` set) AND no `module_diff` is written (specific assertion: `expect(kb.module_diff).toBeUndefined()`).
     - `_handleIngestionComplete` CANCELED branch: call with `result: { kind: "canceled" }` → assert no KB mutation (no status change, no diff — pure no-op).
     - `resyncKnowledgeBase` action ordering: this is hard to test end-to-end (the workflow requires live GitHub + AI). INSTEAD, assert via a SPY/MOCK that `resyncKnowledgeBase` calls `_snapshotModulesForResync` BEFORE `_deleteModulesByKb` — OR document this as covered by code review + the unit-test coverage of `_snapshotModulesForResync` itself. The action's guard logic (`kb_status !== "ready"` → throw) is already covered by Story 1.8 tests; this story does NOT duplicate. (Decision: do NOT add an action-ordering test — the action is a thin orchestration layer; the snapshot mutation is unit-tested; the diff computation is unit-tested; the wiring is verified by code review. Mirrors the test-fidelity discipline in 5.3/5.4 Dev Notes — actions requiring live external APIs are out of scope for `convex-test`.)
   - **`getStaleTests` query integration tests** — EXTEND `convex/knowledge.staleTests.test.ts`. Seed the full chain: workspace → project → ready KB WITH `module_diff: { removed: ["Auth Module"], changed: ["Billing Module"], added: ["NewMod"], computed_at: ... }` → exploration with `proposed_scenarios: [{ name, description, flow_summary, area, kb_module: "Auth Module" }, { ..., kb_module: "Billing Module" }, { ..., kb_module: "Unchanged Module" }]` → suite with `exploration_id: <that exploration>` → 2 tests in that suite. Call `getStaleTests` → assert it returns the 2 tests (both flagged — one for "Auth Module" removed, one for "Billing Module" changed), AND does NOT return tests for the "Unchanged Module" scenario, AND each returned entry has the specific `module_name` + `reason` (CONTENT assertion: `expect(results[0].module_name).toBe("Auth Module")`, `expect(results[0].reason).toBe("removed")`). Edge cases: (a) `module_diff` `undefined` → `[]`; (b) `module_diff` with only `added` modules → `[]` (added does not flag); (c) KB has `module_diff` but no explorations match → `[]`; (d) ownership check: seed KB under workspace A, query as member of workspace B → `[]`.
   - **Frontend tests** — NEW file `src/app/(auth)/projects/[id]/StaleTestsBanner.test.tsx` (colocated with the component — frontend convention per project-context.md:78). Use the existing `vi.mock("convex/react", ...)` pattern from `knowledge.test.tsx:523-532` (the PROVEN mock factory — mock `useQuery` to return a fixture). Tests:
     - Renders the banner with N tests when `getStaleTests` returns non-empty (assert specific test names + module names appear in the DOM — `expect(screen.getByText("Login Flow")).toBeInTheDocument()`, `expect(screen.getByText(/Auth Module/)).toBeInTheDocument()`).
     - Renders a "Regenerate" link per test pointing to `/projects/{id}/suites/{suite_id}` (assert `expect(link.getAttribute("href")).toContain("/suites/")`).
     - Does NOT render the banner when `getStaleTests` returns `[]` (assert `expect(container.firstChild).toBeNull()` OR `expect(screen.queryByText(/stale/i)).not.toBeInTheDocument()`).
     - Does NOT render while `getStaleTests` is loading (`useQuery` returns `undefined` — assert no banner).
     - Renders multiple tests with correct deduplication (a test matching two changed modules appears ONCE — assert count).
   - All existing tests pass — zero regressions (`pnpm test:convex`, `pnpm test`).

10. **AC10 — Convex validators + immutability + no-comments + verification**:
    - `_snapshotModulesForResync` + `_storeModuleDiff` + the extended `_handleIngestionComplete` are `internalMutation`s with `v.` validators on every arg (project-context.md:117 — "All user inputs validated"). `getStaleTests` is a public `query` with `v.id("projects")` validator + `getOptionalOwnedEntity` ownership check (project-context.md:122 — "Never write a public function that accepts an `Id` without a workspace-ownership check"). The `_handleIngestionComplete` extension does NOT change its existing args validator (it still receives `workflowId` + `context` + `result` from the workflow engine).
    - `computeModuleFingerprint` + `diffModuleSnapshots` return NEW values (pure functions; read inputs, never mutate — `diffModuleSnapshots` builds new `Map`s and arrays, never writes to `prev`/`next`). The KB doc reads in mutations are read-only; the patches write new objects (immutability per project-context.md:50).
    - `previous_module_fingerprints` + `module_diff` are `v.optional(...)` — backward-compatible, no migration (Convex optional-field semantics — project-context.md:131). Existing KB docs get `undefined`; existing queries/mutations that don't read these fields are unaffected.
    - No code comments (project-context.md:51/93 — "No comments in code unless explicitly requested").
    - **Verification:**
      - `pnpm lint` — zero new errors.
      - `pnpm test:convex` — all backend tests pass, zero regressions, new tests green.
      - `pnpm test` — all frontend tests pass, zero regressions.
      - `pnpm typecheck` — no NEW type errors beyond the pre-existing deep-instantiation cascade (Epic 4 retro D1; baseline ~868 lines per Stories 5.3/5.4 — verified pre-implementation). This story adds TWO optional fields to an EXISTING table + ONE new file (`moduleDiff.ts`) with no nested validators — verify the cascade count does not meaningfully increase (compare via `git stash && pnpm typecheck 2>&1 | wc -l` baseline vs. post-change).
      - `pnpm build` — succeeds (the pre-existing `typescript.ignoreBuildErrors: true` flag at `next.config.ts` remains — D1 owns its removal, out of scope).

## Tasks / Subtasks

- [x] Task 0: Verify infrastructure claims (C4 spike-citation gate) (AC: #1, #2, #3, #4, #5, #6, #8)
  - [x] Confirm `resyncKnowledgeBase` action is at `triggerIngestion.ts:98-201` and is `"use node"` (file has `"use node"` at `triggerIngestion.ts:1`). Confirm the `_deleteModulesByKb` call is at `triggerIngestion.ts:158-160` — the new `_snapshotModulesForResync` call goes IMMEDIATELY BEFORE this line (after the `_updateKbStatus("building")` at `:151-156`, per the Story 1.8 review fix).
  - [x] Confirm `_handleIngestionComplete` is at `internal.ts:297-334` and is an `internalMutation` (NOT a query — has DB write access via `ctx.db`). Confirm its current early-return at `:319` (`if (args.result.kind !== "failed") return;`). Confirm the `result` validator is a 3-way union (`success { returnValue }`, `failed { error }`, `canceled`) at `:304-316`.
  - [x] Confirm `_deleteModulesByKb` is at `internal.ts:385-419` and reads `kb_modules` via `withIndex("by_knowledge_base_id", ...)` — the SAME index the new `_snapshotModulesForResync` will use.
  - [x] Confirm `_resetKbForResync` is at `internal.ts:421-439` (the sibling pattern for an internal re-sync helper — the new `_snapshotModulesForResync` + `_storeModuleDiff` follow this style).
  - [x] Confirm the `knowledge_bases` table is at `schema.ts:379-396` and `last_synced_at` (line 393) is the sibling pattern for an optional post-sync field. Confirm the new fields are siblings to it.
  - [x] Confirm `kb_modules` table is at `schema.ts:416-429` with `name: v.string()`, `description: v.optional(v.string())`, `files: v.optional(v.array(v.string()))`, `apis: v.optional(v.any())`, `user_flows: v.optional(v.any())`, `dependencies: v.optional(v.array(v.string()))`. These are the fields `computeModuleFingerprint` reads.
  - [x] Confirm `readKnowledgeBaseLogic` at `logic.ts:43-47` reads the latest KB via `.withIndex("by_project_id", ...).order("desc").first()` — `getStaleTests` reuses this pattern.
  - [x] Confirm `explorations` table has `by_project_id` index (`schema.ts:317`), `proposed_scenarios[].kb_module` is `v.optional(v.string())` (added by 5.4 — `schema.ts:300`), and `suites` has `by_exploration_id` index (`schema.ts:99`), `tests` has `by_suite_id` index (`schema.ts:127`). All required for the `getStaleTests` join chain.
  - [x] Confirm `getOptionalOwnedEntity` is imported in `queries.ts` (line 4) and follows the ownership pattern. Confirm `getKnowledgeBase` + `getModules` are existing public queries in the same file (the `getStaleTests` siblings).
  - [x] Confirm the `prdGaps` banner UI pattern is at `src/app/(auth)/projects/[id]/explore/page.tsx:634-641` (the amber banner structure to mirror for `StaleTestsBanner`). (Actual location `:639-657` — minor citation drift, pattern intact.)
  - [x] Confirm the project detail page is at `src/app/(auth)/projects/[id]/page.tsx` and the "Suites" section starts at `:275` (the banner insertion point is ABOVE this — between the header at `:215-272` and the Suites card at `:275`).
  - [x] Confirm `convex/knowledge/` already exists (NO new directory for `moduleDiff.ts` — avoids the `pnpm dev` restart constraint at project-context.md:68).
  - [x] Confirm `convex/testHelpers.ts` exports `seedWorkspace`, `seedProject`, `seedKnowledgeBase`, `seedModule`, `seedSuite`, `seedTestDoc` (verified lines 125-191 + earlier). These are reused for the integration tests — do NOT define local seed functions (project rule: project-context.md:80).
  - [x] Baseline `pnpm typecheck` = 868 lines (verified pre-implementation). Re-run after changes; this story adds 2 optional fields to an existing table + 1 new file with no nested validators — verify no meaningful cascade increase. (Post-implementation: 870 lines — +2 from the new test file's pre-existing `vite/client` + `import.meta.glob` type references, a pattern shared by all 61 root-level convex test files. 0 new implementation errors.)

- [x] Task 1: Write `computeModuleFingerprint` + `diffModuleSnapshots` tests FIRST (AC: #1, #9) — TDD RED
  - [x] CREATE `convex/knowledge/moduleDiff.test.ts` (NEW file — colocated with the source-to-be).
  - [x] Import types from `./moduleDiff` (will fail — file doesn't exist yet — RED).
  - [x] Test `computeModuleFingerprint` determinism (same input → equal output).
  - [x] Test `computeModuleFingerprint` field sensitivity (changing name/description/files/apis/user_flows/dependencies each change the output).
  - [x] Test `computeModuleFingerprint` defensiveness on `unknown` shapes (null/undefined/weird objects do not throw; returns hex string).
  - [x] Test `computeModuleFingerprint` returns hex string (regex `/^[0-9a-f]+$/`).
  - [x] Test `diffModuleSnapshots` all-equal → all empty arrays.
  - [x] Test `diffModuleSnapshots` added (next has new name).
  - [x] Test `diffModuleSnapshots` removed (prev has name not in next).
  - [x] Test `diffModuleSnapshots` changed (both have name, fingerprints differ).
  - [x] Test `diffModuleSnapshots` empty inputs (prev=[] next=[], prev=[] next=[a,b], prev=[a,b] next=[]).
  - [x] Test `diffModuleSnapshots` does NOT mutate inputs (call, then assert inputs unchanged).
  - [x] Test `diffModuleSnapshots` duplicate-name defensive case (no throw; deterministic result).
  - [x] Confirm RED (file/functions don't exist).

- [x] Task 2: Implement `computeModuleFingerprint` + `diffModuleSnapshots` + types (AC: #1, #10) — TDD GREEN
  - [x] CREATE `convex/knowledge/moduleDiff.ts`.
  - [x] EXPORT `interface ModuleFingerprintInput { name: string; description?: string | null; files?: string[]; apis?: unknown; user_flows?: unknown; dependencies?: string[] }`.
  - [x] EXPORT `interface ModuleFingerprint { name: string; fingerprint: string }`.
  - [x] EXPORT `interface ModuleDiff { added: string[]; removed: string[]; changed: string[] }`.
  - [x] Add INTERNAL `function fnv1aHex(s: string): string` — FNV-1a 32-bit hash returning hex (use `Math.imul` for the multiply; `>>> 0` for unsigned conversion). Pure, deterministic, no dep.
  - [x] EXPORT `function computeModuleFingerprint(module: ModuleFingerprintInput): string` — builds the `|`-joined serialization and returns `fnv1aHex(serialized)`. Defensive null-coalescing on every optional field.
  - [x] EXPORT `function diffModuleSnapshots(prev: ModuleFingerprint[], next: ModuleFingerprint[]): ModuleDiff` — build `prevMap: Map<string, string>` + `nextMap: Map<string, string>` (last entry wins on duplicate names — `Map` semantics), iterate `nextMap` for `added`/`changed`, iterate `prevMap` for `removed`. Return NEW arrays (never mutate inputs).
  - [x] Verify all Task 1 tests GREEN.

- [x] Task 3: Add the 2 optional schema fields (AC: #5, #8) — GREEN
  - [x] MODIFY `convex/schema.ts` `knowledge_bases` table (at `:379-396`): add `previous_module_fingerprints: v.optional(v.array(v.object({ name: v.string(), fingerprint: v.string() }))),` and `module_diff: v.optional(v.object({ added: v.array(v.string()), removed: v.array(v.string()), changed: v.array(v.string()), computed_at: v.number() })),` as siblings to `last_synced_at` (line 393).

- [x] Task 4: Write `_snapshotModulesForResync` + `_storeModuleDiff` tests FIRST (AC: #2, #3, #9) — TDD RED
  - [x] CREATE `convex/knowledge.staleTests.test.ts` at `convex/` ROOT (root-level for `t.run` against internal mutations — proven convention from 5.3/5.4).
  - [x] Set up the `import.meta.glob` module map pattern (mirror `convex/knowledge.resync.test.ts` if it exists; otherwise mirror `convex/ai.kbContext.test.ts`).
  - [x] Import seed helpers from `../testHelpers` (root-level file).
  - [x] Test `_snapshotModulesForResync`: seed ready KB + 2 modules → call mutation → assert `kb.previous_module_fingerprints` is 2 entries with correct names + hex fingerprints (CONTENT).
  - [x] Test `_snapshotModulesForResync` with zero modules → asserts `previous_module_fingerprints === []`.
  - [x] Test `_snapshotModulesForResync` idempotency (call twice → second overwrites).
  - [x] Test `_snapshotModulesForResync` on non-existent KB → no throw.
  - [x] Test `_storeModuleDiff`: call with sample diff → assert KB `module_diff` content + `computed_at` is a number.
  - [x] Confirm RED (mutations don't exist).

- [x] Task 5: Implement `_snapshotModulesForResync` + `_storeModuleDiff` (AC: #2, #3, #10) — TDD GREEN
  - [x] MODIFY `convex/knowledge/internal.ts`: import `computeModuleFingerprint` from `./moduleDiff` (extend the existing imports at the top).
  - [x] ADD `export const _snapshotModulesForResync = internalMutation({ args: { knowledge_base_id: v.id("knowledge_bases") }, handler: async (ctx, args) => { const kb = await ctx.db.get(args.knowledge_base_id); if (!kb) return; const modules = await ctx.db.query("kb_modules").withIndex("by_knowledge_base_id", q => q.eq("knowledge_base_id", args.knowledge_base_id)).collect(); const fingerprints = modules.map(m => ({ name: m.name, fingerprint: computeModuleFingerprint({ name: m.name, description: m.description ?? null, files: m.files ?? [], apis: m.apis ?? null, user_flows: m.user_flows ?? null, dependencies: m.dependencies ?? [] }) })); await ctx.db.patch(args.knowledge_base_id, { previous_module_fingerprints: fingerprints }); } })`.
  - [x] ADD `export const _storeModuleDiff = internalMutation({ args: { knowledge_base_id: v.id("knowledge_bases"), diff: v.object({ added: v.array(v.string()), removed: v.array(v.string()), changed: v.array(v.string()) }) }, handler: async (ctx, args) => { await ctx.db.patch(args.knowledge_base_id, { module_diff: { ...args.diff, computed_at: Date.now() } }); } })`.
  - [x] Verify all Task 4 tests GREEN.

- [x] Task 6: Extend `_handleIngestionComplete` with the success-branch diff computation (AC: #3, #10) — GREEN
  - [x] MODIFY `convex/knowledge/internal.ts` `_handleIngestionComplete` (at `:297-334`): import `computeModuleFingerprint` + `diffModuleSnapshots` from `./moduleDiff` (extend the existing import from Task 5).
  - [x] RESTRUCTURE the handler: replace the early `if (args.result.kind !== "failed") return;` with a 3-branch dispatch:
    - `failed` branch: KEEP the existing failure logic verbatim (`:321-332` — sets KB `error` + project `kb_status: "error"`).
    - `canceled` branch: `return;` (no-op).
    - `success` branch: NEW — read KB; if `!kb || !kb.previous_module_fingerprints` → `return;` (no snapshot = initial ingestion = no-op); else read fresh modules via `withIndex("by_knowledge_base_id", ...).collect()`, map each to `{ name, fingerprint: computeModuleFingerprint(...) }`, call `diffModuleSnapshots(kb.previous_module_fingerprints, nextFingerprints)`, then `ctx.db.patch(args.context.knowledge_base_id, { module_diff: { ...diff, computed_at: Date.now() }, previous_module_fingerprints: undefined })` (CLEAR snapshot in the SAME patch — atomicity).
  - [x] ADD integration tests for `_handleIngestionComplete` SUCCESS branch (extend `convex/knowledge.staleTests.test.ts` from Task 4): (a) with snapshot → diff computed + snapshot cleared; (b) without snapshot → no-op (no diff written); (c) FAILED branch unchanged → no diff; (d) CANCELED branch → no-op.
  - [x] Re-run existing Story 1.8 `_handleIngestionComplete` tests in `convex/knowledge.resync.test.ts` (if any) to confirm zero regressions on the FAILED branch.

- [x] Task 7: Extend `resyncKnowledgeBase` action with the snapshot call (AC: #4) — GREEN
  - [x] MODIFY `convex/knowledge/triggerIngestion.ts` `resyncKnowledgeBase` (at `:98-201`): insert `await ctx.runMutation(internal.knowledge.internal._snapshotModulesForResync, { knowledge_base_id: existingKb._id });` IMMEDIATELY BEFORE the `_deleteModulesByKb` call at `:158-160` (AFTER the `_updateKbStatus({ status: "building" })` at `:151-156`).
  - [x] DO NOT modify `triggerIngestion` (initial ingestion) — it has no previous modules to snapshot.
  - [x] DO NOT add an action-ordering test (out of scope for `convex-test` — the action requires live GitHub + AI; the snapshot mutation + diff computation are unit-tested; wiring is verified by code review — mirrors 5.3/5.4 test-fidelity discipline).

- [x] Task 8: Implement `getStaleTests` query + tests (AC: #6, #9) — GREEN
  - [x] ADD to `convex/knowledge/queries.ts`: `export const getStaleTests = query({ args: { project_id: v.id("projects") }, handler: async (ctx, args) => { ... } })`. Use `getOptionalOwnedEntity(ctx, args.project_id, "projects")` for the ownership check; return `[]` fast if not owned. Read latest KB; if `!kb || !kb.module_diff` → `[]`. Compute `flagSet = new Set([...module_diff.removed, ...module_diff.changed].map(s => s.trim().toLowerCase()))`; if `flagSet.size === 0` → `[]`. Scan explorations via `withIndex("by_project_id", ...).collect()`; for each, scan `proposed_scenarios` for matching `kb_module` (normalized); collect matching exploration IDs. For each matching exploration ID, scan suites via `withIndex("by_exploration_id", ...)`. For each suite, scan tests via `withIndex("by_suite_id", ...)`. Dedupe by test `_id` (Map keyed by `_id` → first match wins for `module_name` + `reason`). Return array of `{ _id, name, suite_id, suite_name, module_name, reason }`.
  - [x] EXTEND `convex/knowledge.staleTests.test.ts`: add `getStaleTests` integration tests per AC9 (full chain seed: workspace → project → ready KB WITH `module_diff` → exploration WITH `proposed_scenarios[].kb_module` → suite → tests). Assert CONTENT (specific test names + module names + reasons).
  - [x] Add edge-case tests: `module_diff` undefined → `[]`; only `added` modules → `[]`; no exploration matches → `[]`; cross-workspace ownership → `[]`.

- [x] Task 9: Frontend — `StaleTestsBanner` component + project page integration + tests (AC: #7, #9) — GREEN
  - [x] CREATE `src/app/(auth)/projects/[id]/StaleTestsBanner.tsx`: a `"use client"` component taking `{ projectId: string }` prop. Call `useQuery(api.knowledge.queries.getStaleTests, { project_id: projectId as Id<"projects"> })`. If `undefined` (loading) OR `length === 0` → return `null`. Else render an amber banner (mirror the `prdGaps`/`kbCoverageGaps` styling at `explore/page.tsx:634-641`) with: header `<N> test(s) may be stale due to recent Knowledge Base re-sync.`; a `<ul>` of tests (each `<li>` shows `test.name`, `suite.name`, `module_name`, `reason`); a `<Link href={\`/projects/${projectId}/suites/${test.suite_id}\`}>Regenerate</Link>` per test.
  - [x] MODIFY `src/app/(auth)/projects/[id]/page.tsx`: import `StaleTestsBanner` and render `<StaleTestsBanner projectId={params.id} />` BETWEEN the project header (`:215-272`) and the "Suites" card (`:275`). Place it inside the `<QueryResult>` child render (so it has access to the loaded project).
  - [x] CREATE `src/app/(auth)/projects/[id]/StaleTestsBanner.test.tsx`: mock `useQuery` per the `knowledge.test.tsx:523-532` pattern. Tests: (a) renders banner with specific test names + module names when non-empty; (b) renders "Regenerate" link per test with correct href; (c) does NOT render when `[]`; (d) does NOT render while loading (`undefined`); (e) dedupes correctly.

- [x] Task 10: Validation (AC: #10)
  - [x] `pnpm lint` — zero new errors.
  - [x] `pnpm test:convex` — all backend tests pass; new tests green; zero regressions.
  - [x] `pnpm test` — all frontend tests pass; zero regressions.
  - [x] `pnpm typecheck` — no NEW type errors (compare count vs. 868-line baseline; 2 optional field additions + 1 new file with no nested validators should not meaningfully worsen the cascade).
  - [x] `pnpm build` — succeeds (pre-existing `ignoreBuildErrors: true` still in place — D1 owns its removal).

## Dev Notes

### Scope Boundary

**This story implements:**
- ONE new pure-helpers file `convex/knowledge/moduleDiff.ts` with `computeModuleFingerprint(module)` + `diffModuleSnapshots(prev, next)` + 3 exported types (`ModuleFingerprintInput`, `ModuleFingerprint`, `ModuleDiff`).
- ONE new internal mutation `_snapshotModulesForResync` in `convex/knowledge/internal.ts` (captures pre-resync module fingerprints onto the KB record).
- ONE new internal mutation `_storeModuleDiff` in `convex/knowledge/internal.ts` (patches the KB with a computed diff — used by the `_handleIngestionComplete` success branch; kept as a separate mutation for testability + future reuse).
- EXTENDED `_handleIngestionComplete` mutation in `convex/knowledge/internal.ts` — RESTRUCTURED to a 3-branch dispatch; the NEW `success` branch computes the diff (when a snapshot exists) and writes it atomically (clears snapshot in the same patch).
- EXTENDED `resyncKnowledgeBase` action in `convex/knowledge/triggerIngestion.ts` — ONE new `ctx.runMutation(_snapshotModulesForResync, ...)` call BEFORE `_deleteModulesByKb`.
- TWO new optional schema fields on `knowledge_bases`: `previous_module_fingerprints` (transient) + `module_diff` (persistent).
- ONE new public query `getStaleTests` in `convex/knowledge/queries.ts` (joins `module_diff` → explorations → suites → tests via the 5.4 `kb_module` annotation).
- ONE new frontend component `StaleTestsBanner` in `src/app/(auth)/projects/[id]/`.
- ONE page extension on `src/app/(auth)/projects/[id]/page.tsx` (renders the banner).
- Tests: NEW `convex/knowledge/moduleDiff.test.ts` (pure functions) + NEW `convex/knowledge.staleTests.test.ts` at root (mutations + query integration) + NEW `src/app/(auth)/projects/[id]/StaleTestsBanner.test.tsx` (frontend).

**This story does NOT implement:**
- True one-click AI regeneration of an individual stale test. The "Regenerate" link routes to the existing suite detail page where the user can edit/approve/replace the test inline (FR-56). A new `regenerateTest` action that re-invokes the Test Generation Agent against a single test is OUT OF SCOPE — it requires a new AI workflow, a new mutation to atomically replace the test doc, and prompt design for "regenerate given the changed module context". Documented as future work.
- Scanning `tests.playwright_code` for changed-module file paths. The exploration-based signal (`suite.exploration_id → proposed_scenarios[].kb_module`) is the explicit, deterministic link added by 5.4 for this exact purpose. A code-scan heuristic is fragile (route/selector format variance) and is OUT OF SCOPE. See Dev Notes "Why exploration-based, not code-scan".
- Flagging tests for `added` modules. New modules are a COVERAGE GAP (no tests yet), not a stale-test signal. The banner is for stale tests; coverage gaps are a separate concern (5.4's `kb_coverage_gaps` already addresses that for exploration). See Dev Notes "Why `changed` + `removed`, not `added`".
- TOCTOU fix for the resync race (deferred from Story 1.8 review — pre-existing pattern; the snapshot-then-delete-then-workflow sequence inherits the same race window).
- Removing `typescript.ignoreBuildErrors: true` (Epic 4 retro D1 — separate `fix:` commit, owned by Winston).
- The D6 codebase-wide truncation rollout to `impactPrompts.ts`/`storyPrompts.ts` (separate task — this story has NO prompt-building code; `computeModuleFingerprint` operates on structured data, not text).
- Fixing the multi-workspace IDOR on `getStaleTests` query (N/A — `getStaleTests` DOES use `getOptionalOwnedEntity` per project rule; no inherited IDOR surface here, unlike the deferred `readKnowledgeBaseQuery`).
- A Playwright smoke test (D2 — this story's backend is `convex-test`; the frontend banner is jsdom. No browser surface).
- Wiring stale-test signals into PRD-generated or NL-generated suites. Those suite types have NO exploration→scenario→kb_module link (only `source_type === "url_exploration"` suites have an `exploration_id`). The story flagging is scoped to exploration-derived suites. See Dev Notes "Suites without `exploration_id`".

### CRITICAL: Reuse Story 1.8 + 5.4 — Do NOT Re-Query or Re-Invent

The diff machinery is THREE reusable pieces: (a) `computeModuleFingerprint` (pure), (b) `diffModuleSnapshots` (pure), (c) the existing `kb_modules.by_knowledge_base_id` index (used by `_deleteModulesByKb` since Story 1.5). **Do NOT:**
- Add a new "getModulesForDiff" internal query — `_snapshotModulesForResync` reads modules DIRECTLY via `ctx.db.query("kb_modules").withIndex(...)` inside the mutation (mutations have DB access; no `ctx.runQuery` indirection needed). This mirrors how `_deleteModulesByKb` (`internal.ts:385-419`) and `_resetKbForResync` (`internal.ts:421-439`) work — both read/patch the KB directly.
- Re-implement KB lookup — `_handleIngestionComplete` already receives `args.context.knowledge_base_id`; it reads the KB doc via `ctx.db.get` (the SAME pattern as the existing failure branch at `internal.ts:321`).
- Re-implement module-name normalization — `getStaleTests` mirrors 5.4's `computeKbCoverageGaps` trim + lowercase normalization (`agents.ts` 5.4) so the matching is consistent.
- Re-implement ownership checks — `getStaleTests` uses `getOptionalOwnedEntity` per project rule (project-context.md:122); the internal mutations are called from authenticated action contexts (the `resyncKnowledgeBase` action does its own auth at `triggerIngestion.ts:103-109`; `_handleIngestionComplete` is invoked by the workflow engine which already ran in an authenticated context — same trust boundary as Story 1.8).

### Why Compute the Diff on Workflow Success (not in the Action)

Two options for WHEN to compute the diff:
1. **In `resyncKnowledgeBase` action** (BEFORE deletion + AFTER workflow completion) — REJECTED: `start()` returns immediately (the workflow runs async); the action cannot `await` workflow completion. Snapshotting before deletion works, but the diff must happen elsewhere.
2. **In `_handleIngestionComplete` (workflow `onComplete`)** — ACCEPTED: this mutation runs when the workflow finishes (success or failure). The existing code already dispatches on `args.result.kind`; extending the `success` branch is a natural, additive change. The mutation has DB access (it's an `internalMutation`), so it can read fresh modules + patch the KB in one atomic operation. The diff is O(modules) — milliseconds — well under NFR-6.

This mirrors how Story 1.8 hooks RD archiving into the action (pre-workflow) and status updates into the workflow steps. The snapshot is the "pre" hook; the diff is the "post" hook.

### Why Snapshot on the KB Record (not a new table)

Two options for WHERE to store the pre-resync snapshot:
1. **New `kb_module_snapshots` table** — REJECTED: a new table per snapshot is heavyweight for transient data that's cleared after one use. It also requires a new index + a cleanup story (snapshots accumulate).
2. **Optional `previous_module_fingerprints` field on `knowledge_bases`** — ACCEPTED: the snapshot is scoped to the KB (single doc), transient (cleared after diff), and small (≤50 modules × ~16 hex chars = <1KB). One optional field, backward-compatible, no migration. The CLEAR-on-diff semantics (atomic single-doc patch) guarantees the snapshot doesn't leak across re-syncs.

The `module_diff` field is similarly stored on the KB record (one diff per re-sync, replaced on each re-sync — no history). A `module_diff_history` table is OUT OF SCOPE (audit log is a separate concern).

### Why `changed` + `removed`, not `added`

The AC says "tests whose source code references changed modules are flagged". Three diff categories:
- **`removed` modules** — the test references something that no longer exists. DEFINITELY stale. Flag.
- **`changed` modules** — the test references something modified since the test was generated. LIKELY stale. Flag.
- **`added` modules** — new code with no tests yet. This is a COVERAGE GAP, not a stale-test signal. The existing `kb_coverage_gaps` (5.4) already surfaces coverage gaps for exploration. Do NOT flag tests for `added` modules (no test references a module that didn't exist when the test was generated).

The `getStaleTests` flag set is `[...module_diff.removed, ...module_diff.changed]` (NOT `added`). Documented in the query + tested in AC9 (edge case: only `added` → `[]`).

### Why Exploration-Based Linking (not code-scan)

The AC phrase "tests whose source code references changed modules" has two interpretations:
1. **Code-scan**: scan `test.playwright_code` for substrings matching changed modules' `files` paths, `user_flows[].route`, or `apis[].path`. REJECTED because: (a) `apis`/`user_flows` are `v.any()` (shapes vary — ADR 0008 §Negative); (b) route/selector format variance (`/dashboard` vs `/app/dashboard` vs relative paths); (c) Playwright code uses locators (`page.locator(...)`) and URL navigation (`page.goto(...)`) that don't map cleanly to module `files`; (d) building a robust code→module matcher is a large, fragile subsystem (mirrors 5.4's "Why LLM-Driven Cross-Referencing" rejection of deterministic URL matching).
2. **Exploration-based link via the 5.4 `kb_module` annotation**: each suite has an `exploration_id`; the exploration's `proposed_scenarios[].kb_module` (added by 5.4) is the EXPLICIT, LLM-derived mapping from a generated scenario to the KB module it tests. Tests in that suite are by construction derived from those scenarios → they "reference" the annotated module. ACCEPTED because: (a) the link is already there (5.4 added it for exactly this purpose); (b) deterministic to query (no fuzzy matching); (c) covers the most common stale-test case (exploration-derived UI tests).

This is the SAME design philosophy as 5.4's "LLM-driven cross-referencing" — let the LLM (which already reasons semantically about pages) make the link; then derive signals deterministically. The exploration-based link is the v1 signal; a code-scan heuristic can be added later as a SECONDARY signal if real-world false-negatives surface.

### Suites without `exploration_id`

Only `source_type === "url_exploration"` suites have an `exploration_id` (`schema.ts:91` — `exploration_id` is optional, populated only for exploration-derived suites). PRD-generated (`source_type === "prd"`) and NL-generated (`source_type === "natural_language"`) suites have NO exploration link → NO `kb_module` annotation → CANNOT be flagged by this story's mechanism.

This is a documented scope limitation. Rationale: (a) PRD/NL tests are derived from text, not from explored pages — there's no natural module link; (b) flagging them would require either a code-scan (rejected above) or storing a `kb_module` annotation at test-generation time (a separate, larger story); (c) the exploration-based signal covers the primary use case (UI tests derived from page exploration, which are the most sensitive to code drift). Future work: extend test-generation to annotate every generated test with `kb_module` (would require schema + workflow changes — out of scope).

### Why FNV-1a (not `crypto` or `JSON.stringify` direct comparison)

Three options for the fingerprint:
1. **`JSON.stringify(module)` and string-compare** — REJECTED: brittle (key-order sensitivity — `JSON.stringify` is not key-order-stable across AI extractions; the same module could produce different serializations on two extractions, causing false `changed` flags).
2. **`crypto.createHash("sha256")`** — REJECTED: requires `node:crypto` (a `"use node"` file constraint — but `internal.ts` is NOT `"use node"` and adding the import would force it). Overkill for a 32-bit hash.
3. **FNV-1a 32-bit, hand-rolled** — ACCEPTED: ~6 lines, no dep, deterministic, fast, sufficient collision-resistance for ≤50 modules (the probability of a 32-bit collision among 50 items is ~3×10⁻⁵ — acceptable; a collision would cause a false `unchanged` flag for one module, which the user would catch on manual review). The hash is over a CONTROLLED serialization (field-by-field join with `|` separator + `JSON.stringify` per-field — NOT the whole object — so key order within `apis`/`user_flows` doesn't matter as long as the JSON stringification is stable for the SAME object; `JSON.stringify` IS stable for the same object literal, and the AI extraction produces consistent shapes within a single extraction run).

The hash is INTERNAL (`fnv1aHex` is not exported — only `computeModuleFingerprint` is). The serialization is documented in AC1 (the `|`-joined parts). If a reviewer disagrees, swapping to SHA-256 is a one-line change (move `moduleDiff.ts` to a `"use node"` file or use the synchronous `node:crypto` — but the current choice avoids the constraint).

### Why a Separate `_storeModuleDiff` Mutation

The diff is computed INSIDE `_handleIngestionComplete` (the success branch). Two options for writing it:
1. **Inline `ctx.db.patch` inside `_handleIngestionComplete`** — WORKS but couples the write to the handler, making it harder to unit-test the write in isolation.
2. **Separate `_storeModuleDiff` internal mutation called from `_handleIngestionComplete`** — ACCEPTED: the mutation is independently testable (Task 4 tests it directly); the handler's success branch becomes a thin orchestrator (compute diff → call mutation). Mirrors the existing `_resetKbForResync` / `_updateKbStatus` / `_setLastSyncedAt` pattern (each is a separate mutation called from the action/workflow). The cost is one extra `ctx.runMutation` indirection — negligible for a one-shot post-sync step.

### Why Clear `previous_module_fingerprints` in the Same Patch as `module_diff`

The `_handleIngestionComplete` success branch writes BOTH fields in ONE `ctx.db.patch`:
```ts
await ctx.db.patch(kbId, {
  module_diff: { ...diff, computed_at: Date.now() },
  previous_module_fingerprints: undefined,
});
```
Rationale: (a) ATOMICITY — Convex document patches are atomic at the doc level; a single patch guarantees the snapshot is cleared IFF the diff is written (no partial state where the snapshot lingers but the diff is missing). This satisfies the C1 dual-write atomicity rule (project-context.md:106 — "code writing to two systems... must be atomic or have defined reconciliation"). (b) The snapshot is TRANSIENT — once the diff is computed, the snapshot has no further use. Clearing it prevents stale-snapshot confusion on a subsequent failed re-sync (if the next re-sync fails, `_snapshotModulesForResync` will overwrite it fresh anyway, but clearing is cleaner).

### Additive-Only / No-Regression — The Four-Way Guarantee

This story MUST NOT change behavior when: (a) it's an initial ingestion (no prior modules), (b) a re-sync produces no module changes, (c) there are no exploration-derived suites, (d) the workflow fails or is canceled. Four layers guarantee it:
1. **Snapshot layer:** `_snapshotModulesForResync` is called ONLY from `resyncKnowledgeBase` (NOT `triggerIngestion`). Initial ingestion never sets `previous_module_fingerprints`.
2. **Diff layer:** `_handleIngestionComplete` success branch guards on `if (!kb.previous_module_fingerprints) return;` — no snapshot = no-op.
3. **Query layer:** `getStaleTests` returns `[]` fast when `kb.module_diff` is `undefined` OR `removed.length + changed.length === 0`.
4. **UI layer:** `StaleTestsBanner` returns `null` when `getStaleTests` returns `[]` or is loading.

Verified end-to-end by AC9: (a) `_handleIngestionComplete` with no snapshot → `module_diff` stays `undefined`; (b) `getStaleTests` with no `module_diff` → `[]`; (c) `StaleTestsBanner` with `[]` → not rendered.

### Error Handling (C1 Pre-Review Checklist)

Per Epic 3 retro action C1 (project-context.md:106), enumerate error paths BEFORE implementation:

| Path | Surfaced as | Notes |
|------|-------------|-------|
| `_snapshotModulesForResync` on non-existent KB | `if (!kb) return;` — silent no-op | NO throw. Defensive — should not happen (action already verified KB exists). |
| `_snapshotModulesForResync` with zero modules | Stores `previous_module_fingerprints: []` | NO throw. Diff step treats entire next-set as `added` → no stale tests. Accurate. |
| `_handleIngestionComplete` success branch on KB with no snapshot | `if (!kb.previous_module_fingerprints) return;` | NO throw. Initial ingestion no-op. |
| `_handleIngestionComplete` success branch on KB with snapshot but zero new modules | `diffModuleSnapshots(prev, [])` → `removed: [...prev names]`, `added: []`, `changed: []` | NO throw. All previous modules flagged as removed → all their tests stale. Accurate (the re-sync lost all modules — tests are stale). |
| `diffModuleSnapshots` with malformed input (non-array) | TypeScript prevents at compile time; runtime `Map(iterable)` would throw | NOT a concern — the function is called from typed call sites only (mutations reading typed Convex docs). |
| `computeModuleFingerprint` on module with `apis: undefined` | `JSON.stringify(undefined ?? null) === "null"` → no throw | NO throw. Defensive null-coalescing. |
| `computeModuleFingerprint` on module with circular `apis` | `JSON.stringify` throws on circular refs | THEORETICAL — `apis` is `v.any()` but AI extraction produces JSON-serializable shapes. NOT a concern in practice; if it surfaces, wrap `JSON.stringify` in try/catch returning `"<unstringifiable>"` (one-line fix). Document as a known fragility if it surfaces. |
| `getStaleTests` on project with no KB | `kb === null` → `return []` | NO throw. |
| `getStaleTests` on project the user doesn't own | `getOptionalOwnedEntity` returns `null` → `return []` | NO throw. Ownership check (project rule). |
| `getStaleTests` with `module_diff` but no matching explorations | Returns `[]` after scanning all explorations | NO throw. Accurate (no exploration-derived tests to flag). |
| `resyncKnowledgeBase` action fails between `_snapshotModulesForResync` and `_deleteModulesByKb` | Snapshot is set, modules NOT deleted, workflow NOT started | Pre-existing failure mode (the action's try/catch only wraps the workflow start). The KB remains `building` with modules intact + a stale `previous_module_fingerprints`. On the NEXT re-sync, `_snapshotModulesForResync` overwrites it. Acceptable. |
| `_handleIngestionComplete` itself throws (Convex infra failure) | Propagates — the workflow engine logs the failure; the KB stays `building` (workflow set it) | Pre-existing pattern (the failure branch has the same property). NOT this story's concern. |

**No error is silently swallowed at a level that hides a bug.** Empty results (`[]`, `undefined` snapshot, `null` KB) are documented "no signal" semantics (not errors). Infrastructure errors propagate.

### Dual-Write / Atomicity (C1 Checklist)

- **The diff write IS a dual-write** (`module_diff` + clear `previous_module_fingerprints`) — GUARANTEED atomic by writing BOTH fields in ONE `ctx.db.patch` (Convex doc-level atomicity). No reconciliation needed.
- **The snapshot + delete sequence is NOT atomic** (`_snapshotModulesForResync` then `_deleteModulesByKb` are separate mutations) — but this is the EXISTING resync pattern (Story 1.8 already sequences multiple mutations); the snapshot is idempotent (re-running overwrites), so a partial failure leaves a slightly stale snapshot, not a corrupt state.
- **TOCTOU:** the resync race (deferred from Story 1.8 review) is pre-existing — `_handleIngestionComplete` reads modules AFTER the workflow writes them; if a SECOND resync starts concurrently, the diff may compare against a transient state. This is the same race Story 1.8 documented; NOT introduced here.
- **Subscription reconciliation:** N/A — `getStaleTests` is a query (auto-re-runs when KB/explorations/suites/tests change); the frontend's `useQuery` auto-receives fresh results.

### Test Quality (C1 Checklist)

Per C1 (project-context.md:106), tests assert CONTENT not TYPE (Epic 4 reviews caught "passes on empty string" gaps):
- `computeModuleFingerprint`: `expect(fp1).toBe(fp2)` (determinism — specific equality) AND `expect(fp1).not.toBe(fp2)` when a field changes (specific inequality) — NOT `typeof fp === "string"`.
- `computeModuleFingerprint` hex regex: `expect(fp).toMatch(/^[0-9a-f]+$/)` — proves FNV-1a output format.
- `diffModuleSnapshots`: `expect(diff.removed).toEqual(["Auth Module"])` (specific module name) — NOT `Array.isArray(diff.removed)`.
- `_snapshotModulesForResync`: `expect(kb.previous_module_fingerprints?.[0].name).toBe("Auth Module")` AND `expect(kb.previous_module_fingerprints?.[0].fingerprint).toMatch(/^[0-9a-f]+$/)` — specific name + hex format.
- `_handleIngestionComplete` success: `expect(kb.module_diff?.removed).toEqual(["OldMod"])` AND `expect(kb.module_diff?.changed).toEqual(["ChangedMod"])` AND `expect(kb.previous_module_fingerprints).toBeUndefined()` (cleared — atomicity assertion).
- `getStaleTests`: `expect(results[0].name).toBe("Login Flow")` AND `expect(results[0].module_name).toBe("Auth Module")` AND `expect(results[0].reason).toBe("removed")` — specific test name + module + reason.
- Frontend: `expect(screen.getByText("Login Flow")).toBeInTheDocument()` AND `expect(screen.getByText(/Auth Module/)).toBeInTheDocument()` AND `expect(screen.getByRole("link", { name: /regenerate/i })).toHaveAttribute("href", expect.stringContaining("/suites/"))`.

### Test File Location

- **Pure helpers** (`computeModuleFingerprint` + `diffModuleSnapshots`) → NEW `convex/knowledge/moduleDiff.test.ts` (colocated with `moduleDiff.ts`. Pure functions have NO `t.action()` / `t.run` surface → can run from a subdir — does NOT hit the 5.3-discovered "subdir breaks `t.action()` resolution" constraint. The constraint is specifically for tests that call `t.action()` against `"use node"` actions; pure-function tests have no such call.).
- **Mutations + query integration** (`_snapshotModulesForResync` + `_storeModuleDiff` + `_handleIngestionComplete` + `getStaleTests`) → NEW `convex/knowledge.staleTests.test.ts` at `convex/` ROOT (root-level per the 5.3/5.4 PROVEN convention — tests that invoke `t.run` against internal mutations need the root-level `"./**/*.ts"` module map. Subdir placement breaks module resolution per the 5.3 review. Mirror `convex/knowledge.resync.test.ts` if it exists, else mirror `convex/ai.kbContext.test.ts`).
- **Frontend** (`StaleTestsBanner`) → NEW `src/app/(auth)/projects/[id]/StaleTestsBanner.test.tsx` (colocated with the component — frontend convention per project-context.md:78).

### React 19 + Next.js 16 Rules

- `StaleTestsBanner` is a `"use client"` component. The ONLY data fetching is `useQuery(api.knowledge.queries.getStaleTests, ...)` — no `router.push`/`replace` in render body (the `<Link>` is a pure anchor; Next.js 16 handles the navigation). No `forwardRef`. No new state.
- The banner's render is PURE from the query result — no React 19 render-rule concerns (no setState-on-other-components, no render-body side effects).
- The project page extension (`src/app/(auth)/projects/[id]/page.tsx`) only ADDS a `<StaleTestsBanner projectId={...} />` element between existing elements — no changes to the existing `useState`/`useEffect`/`useQuery` hooks. The component encapsulates its own data fetching.

### Convex Gotchas

- Adding OPTIONAL fields (`previous_module_fingerprints`, `module_diff`) to `knowledge_bases` is backward-compatible — existing KB docs get `undefined`. NO migration script. Convex validates NEW writes strictly; existing docs are untouched (project-context.md:131).
- `_creationTime` auto-append is irrelevant (no new indexes, no ordering reliance).
- `ctx.db.patch(id, { field: undefined })` REMOVES the optional field (the SAME mechanism `_resetKbForResync` uses at `internal.ts:426-437` to clear architecture fields). This is the correct way to clear `previous_module_fingerprints` after the diff.
- The `_handleIngestionComplete` extension does NOT change the function's args validator (still `workflowId` + `context` + `result` from the workflow engine) — the workflow engine call site at `triggerIngestion.ts:77` + `:182` is UNCHANGED.
- The `_snapshotModulesForResync` + `_storeModuleDiff` mutations are `internalMutation` (callable via `ctx.runMutation(internal.knowledge.internal._xxx, ...)` from the action + from `_handleIngestionComplete`). Internal mutations called from another internal mutation: `_handleIngestionComplete` does NOT call `_storeModuleDiff` via `ctx.runMutation` — it inlines the patch (the diff computation needs the modules read in the same transaction; calling out to another mutation would require passing the diff as args, which is fine but adds indirection). DECISION: inline the patch in `_handleIngestionComplete` AND keep `_storeModuleDiff` as a separate exported mutation for direct testability (Task 4 tests `_storeModuleDiff` directly; Task 6 tests the inlined patch via `_handleIngestionComplete`). Both paths produce the SAME KB shape — verified by the test fixtures.
- No reserved index names touched (no new indexes).

### File Organization

NEW backend code:
```
convex/knowledge/
└── moduleDiff.ts            # NEW — computeModuleFingerprint + diffModuleSnapshots + 3 exported types + internal fnv1aHex
```

MODIFIED backend (existing files EXTENDED — no new directories):
```
convex/knowledge/
├── internal.ts              # EXTEND — add _snapshotModulesForResync + _storeModuleDiff; restructure _handleIngestionComplete to 3-branch dispatch with NEW success-branch diff
├── queries.ts               # EXTEND — add getStaleTests public query
└── triggerIngestion.ts      # MODIFY — resyncKnowledgeBase gains ONE ctx.runMutation(_snapshotModulesForResync, ...) call before _deleteModulesByKb
convex/
└── schema.ts                # EXTEND — knowledge_bases gains previous_module_fingerprints + module_diff (both optional, siblings to last_synced_at)
```

NEW frontend code:
```
src/app/(auth)/projects/[id]/
└── StaleTestsBanner.tsx     # NEW — client component rendering the banner with Regenerate links
```

MODIFIED frontend:
```
src/app/(auth)/projects/[id]/
└── page.tsx                 # MODIFY — render <StaleTestsBanner projectId={params.id} /> above the Suites card
```

NEW tests:
```
convex/knowledge/
└── moduleDiff.test.ts       # NEW — pure-function unit tests (computeModuleFingerprint + diffModuleSnapshots)
convex/
└── knowledge.staleTests.test.ts  # NEW — root-level integration tests (_snapshotModulesForResync + _storeModuleDiff + _handleIngestionComplete branches + getStaleTests)
src/app/(auth)/projects/[id]/
└── StaleTestsBanner.test.tsx     # NEW — frontend component tests
```

**No new `convex/` directories** — `moduleDiff.ts` lives in the EXISTING `convex/knowledge/` directory. No `pnpm dev` restart needed (project-context.md:68).

**No new dependencies.** FNV-1a is hand-rolled (~6 lines, no `node:crypto`). `Set`, `Map`, `Math.imul`, `String.prototype.split`/`join` are runtime built-ins.

### Existing APIs to Reuse (NO reinvention)

| API | Location | Purpose |
|-----|----------|---------|
| `kb_modules.by_knowledge_base_id` index | `schema.ts:429` | Read modules for snapshot + diff (same index as `_deleteModulesByKb`) |
| `_resetKbForResync` pattern | `internal.ts:421-439` | The sibling internal-mutation pattern to mirror for `_snapshotModulesForResync` + `_storeModuleDiff` |
| `_handleIngestionComplete` | `internal.ts:297-334` | The workflow onComplete mutation to EXTEND (restructure to 3-branch dispatch) |
| `resyncKnowledgeBase` action | `triggerIngestion.ts:98-201` | The action to EXTEND (insert `_snapshotModulesForResync` call) |
| `readKnowledgeBaseLogic` KB lookup | `logic.ts:43-47` | The `.withIndex("by_project_id").order("desc").first()` pattern reused by `getStaleTests` |
| `getOptionalOwnedEntity` | `lib/requireAuth.ts` | Ownership check for `getStaleTests` (project rule — never inline) |
| `proposed_scenarios[].kb_module` | `schema.ts:300` (added by 5.4) | The exploration→module link the `getStaleTests` join uses |
| `explorations.by_project_id` index | `schema.ts:317` | Scan explorations for `getStaleTests` |
| `suites.by_exploration_id` index | `schema.ts:99` | Find suites for matching explorations |
| `tests.by_suite_id` index | `schema.ts:127` | Find tests for matching suites |
| `prdGaps` / `kbCoverageGaps` banner | `explore/page.tsx:634-641` | The amber banner UI pattern to MIRROR for `StaleTestsBanner` |
| `knowledge.test.tsx` mock pattern | `knowledge.test.tsx:523-532` | The `vi.mock("convex/react", ...)` factory to mirror for `StaleTestsBanner.test.tsx` |
| `EXTRACTION_MAX_MODULES = 50` | `constraints.ts:48` | Bounds the diff computation (≤50 modules → O(50) — well under NFR-6) |
| `seedWorkspace`, `seedProject`, `seedKnowledgeBase`, `seedModule`, `seedSuite`, `seedTestDoc` | `testHelpers.ts` | Test seed helpers (reuse, do NOT define local seeds — project-context.md:80) |
| Story 1.8 re-sync flow | `_bmad-output/implementation-artifacts/1-8-knowledge-base-re-sync.md` | The re-sync action this story EXTENDS (snapshot hook before delete; diff hook in onComplete) |
| Story 5.4 `kb_module` annotation | `_bmad-output/implementation-artifacts/5-4-exploration-cross-references-kb-modules.md` | The exploration→module link this story's `getStaleTests` consumes |

### What NOT to Reinvent

| Concern | Reuse | Do NOT build |
|---------|-------|--------------|
| Module fingerprinting | NEW `computeModuleFingerprint` (pure, FNV-1a) | `crypto.createHash` (forces `"use node"` on `internal.ts`) OR raw `JSON.stringify(module)` (key-order brittle) |
| Module diff | NEW `diffModuleSnapshots` (pure, set-based) | A fuzzy match (names + description similarity — overkill; exact name match + fingerprint compare is sufficient) |
| Module read for snapshot | `ctx.db.query("kb_modules").withIndex("by_knowledge_base_id", ...)` (direct in mutation) | A new "getModulesForDiff" internal query (mutations have DB access — no indirection needed) |
| KB lookup | `ctx.db.get(args.context.knowledge_base_id)` (direct in mutation) | `readKnowledgeBaseQuery` (that's for actions without DB access; mutations read directly) |
| Diff computation timing | `_handleIngestionComplete` success branch (workflow onComplete) | A new workflow step (more code; the onComplete hook is the natural post-sync moment) |
| Stale-test detection | NEW `getStaleTests` (deterministic join via 5.4 `kb_module`) | A code-scan of `tests.playwright_code` (fragile — see "Why exploration-based, not code-scan") |
| Stale-test signal source | `module_diff.removed` + `module_diff.changed` (NOT `added`) | Flagging tests for `added` modules (that's coverage gap, not staleness — 5.4 already covers that) |
| Stale-test UI | NEW `StaleTestsBanner` mirroring `prdGaps`/`kbCoverageGaps` banner | A new page (the banner is non-intrusive; the user already navigates via the project page) |
| Regenerate action | `<Link>` to existing suite detail page | A new `regenerateTest` AI action (out of scope — documented as future work) |
| Test seed | `seedWorkspace`, `seedProject`, `seedKnowledgeBase`, `seedModule`, `seedSuite`, `seedTestDoc` from `testHelpers.ts` | Local seed functions (project rule: project-context.md:80) |
| Integration test file location | `convex/knowledge.staleTests.test.ts` at `convex/` ROOT | A subdir file like `convex/knowledge/staleTests.test.ts` (would break `t.run` module resolution per 5.3 review) |

### Previous Story Intelligence

**Story 5.4 (Exploration Cross-References KB Modules) — the DIRECT predecessor and closest sibling:**
1. 5.4 added `proposed_scenarios[].kb_module` (LLM-derived scenario→module link) AND `kb_coverage_gaps` (deterministic KB-side gap computation). This story CONSUMES the `kb_module` annotation as the stale-test signal — the two stories are designed to compose: 5.4 links scenarios to modules at analysis time; 5.5 flags tests derived from those scenarios when the linked modules drift.
2. 5.4's `computeKbCoverageGaps` is the architectural template for `computeModuleFingerprint` + `diffModuleSnapshots` — pure, deterministic, exported for direct testing, case-insensitive normalization (mirrored in `getStaleTests`'s flag-set matching).
3. 5.4's additive-only / no-regression rule (three-layer guarantee: query → format → inject) is mirrored EXACTLY here (four-layer: snapshot → diff → query → UI).
4. 5.4's review finding (Edge Case Hunter MEDIUM — "truncated KB modules always flagged as gaps" — DISMISSED BY USER as intentionally conservative) applies analogously: this story's `getStaleTests` flags tests whose annotated module is in `changed`/`removed`; if the LLM in a prior exploration annotated a module that's since been removed by truncation (not real drift), the test is flagged. SAME conservative-by-design choice — over-reporting stale tests is preferred over under-reporting. Re-open if real-world false-positives surface.

**Story 1.8 (Knowledge Base Re-Sync) — the OTHER direct predecessor:**
1. 1.8 built `resyncKnowledgeBase` + `_handleIngestionComplete` + `_resetKbForResync`. This story EXTENDS two of those three (`resyncKnowledgeBase` + `_handleIngestionComplete`) with the snapshot + diff hooks. `_resetKbForResync` is UNCHANGED.
2. 1.8 explicitly deferred "module-level change detection / diff comparison (Story 5.5 — drift-aware test regeneration)" in its Scope Boundary. This story RESOLVES that deferral.
3. 1.8's review findings (TOCTOU race, non-atomic destructive cleanup, repo pre-check) are PRE-EXISTING — this story does NOT fix them (out of scope; the snapshot+diff hooks inherit the same trust boundary). The Story 1.8 review fix (set `building` status BEFORE destructive cleanup at `triggerIngestion.ts:151-156`) is PRESERVED — the new `_snapshotModulesForResync` call goes AFTER `_updateKbStatus("building")` and BEFORE `_deleteModulesByKb`, so a failed snapshot leaves the KB visibly `building` (not silently "ready" with a stale snapshot).

**Epic 4 retrospective — defects to avoid:**

| Epic 4 Lesson | Mitigation in This Story |
|-------------------|--------------------------|
| D1 TS `ignoreBuildErrors` rot | Do NOT remove the flag (out of scope); DO verify via `pnpm typecheck` that no NEW errors are introduced (2 optional fields + 1 new file with no nested validators should not worsen the cascade) |
| D6 structural-aware truncation | N/A — this story has NO prompt-building code; `computeModuleFingerprint` operates on structured data via controlled serialization, not text truncation |
| D7 token-budget blindness | N/A — no LLM calls in this story; the diff is pure computation |
| C4 spike-citation gate | Task 0 verifies every infrastructure claim against installed source — especially the `_handleIngestionComplete` 3-branch dispatch + the `kb_modules.by_knowledge_base_id` index + the `proposed_scenarios[].kb_module` field (5.4) + the `suites.by_exploration_id` + `tests.by_suite_id` indexes |
| C1 pre-review checklist | Error-handling table + test-quality section + dual-write atomicity section above; target ≤5 review patches (5.1/5.2/5.3/5.4 shipped 0-3) |
| jsdom test-fidelity (insight #2) | The frontend banner tests run in jsdom (no browser-blind surface — they assert on rendered text/links from props/state). The backend integration tests run in `convex-test` (edge-runtime). No Playwright surface (D2 N/A). |
| C2 async-timing verification | N/A — no spec claims of the form "the window is <Xms"; the NFR-6 "<2 minutes" turnaround is dominated by the existing workflow (GitHub fetch + AI extraction), NOT this story's milliseconds-scale post-step |
| D5 multi-workspace IDOR (Critical, 4-epic carry-forward) | `getStaleTests` uses `getOptionalOwnedEntity` (NO IDOR surface — owned-entity check is enforced). The internal mutations are called from authenticated action contexts (inheriting the same trust boundary as Story 1.8). NOT introduced by this story. |
| D2 Playwright smoke gate | N/A — no browser surface; backend is `convex-test`, frontend banner is jsdom |

### Git Intelligence

Baseline: latest `main` = `1db1d0c` (graphify regen after 5.4). Relevant recent commits:
- `2f5047d` — Story 5.4 (Exploration Cross-References KB Modules) — the DIRECT predecessor; added `proposed_scenarios[].kb_module` + `kb_coverage_gaps` (this story CONSUMES `kb_module` as the stale-test signal). Established `computeKbCoverageGaps` as the pure-function template.
- `b3983bf` — Story 5.3 (Context-Enhanced Test Gen Prompts) — DIRECT predecessor; established `truncateContext` + `buildKbContextBlock` + the additive-only three-layer guarantee (mirrored here as four-layer).
- `188aa4e` — Story 5.2 (`readBaselineRd` Agent Tool) — DIRECT predecessor; established the additive-only opt pattern.
- `498ece8` — Story 5.1 (`readKnowledgeBase` Agent Tool) — DIRECT predecessor; established `readKnowledgeBaseQuery` (reused by 5.4, NOT by this story directly — `getStaleTests` reads the KB doc directly via the public-query pattern).
- Story 1.8 commit (Knowledge Base Re-Sync) — the OTHER direct predecessor; built `resyncKnowledgeBase` + `_handleIngestionComplete` + `_resetKbForResync` (this story EXTENDS two of the three).

NEW schema: TWO optional fields on `knowledge_bases` (`previous_module_fingerprints` + `module_diff`). NEW `convex/` directory: none (`moduleDiff.ts` lives in the EXISTING `convex/knowledge/`). NEW dependencies: none (FNV-1a hand-rolled). NEW internal queries: none (mutations read modules directly). NEW tables: none (no deep-instantiation cascade impact).

### Deferred Work Relevant to This Story

Per retro action A8, review `_bmad-output/implementation-artifacts/deferred-work.md`:
- **True one-click AI regeneration**: this story's "Regenerate" link routes to the existing suite detail page; a new `regenerateTest` action that re-invokes the Test Generation Agent against a single test (with the changed module context injected via 5.3's `buildKbContextBlock`) is future work. Track under "test lifecycle automation".
- **Stale-test signal for PRD/NL-generated suites**: this story flags ONLY exploration-derived suites (those with `exploration_id`). Extending to PRD/NL suites requires either a code-scan heuristic or annotating every generated test with `kb_module` at generation time. Track under "test→module linking expansion".
- **Code-scan secondary signal**: a heuristic that scans `tests.playwright_code` for changed modules' `files` paths or `user_flows[].route` could surface stale tests in suites without exploration annotations. Track under "stale-test detection expansion" — REJECTED for v1 per Dev Notes "Why exploration-based, not code-scan".
- **`module_diff` history**: this story stores ONE diff per KB (replaced on each re-sync). An audit-log table tracking diff history across re-syncs is future work. Track under "KB audit log".
- **TOCTOU fix for the resync race** (deferred from Story 1.8): pre-existing; the snapshot+diff hooks inherit the same race window. NOT introduced here.
- **D5 multi-workspace IDOR**: N/A for this story (`getStaleTests` uses `getOptionalOwnedEntity`); the inherited surface is on the reused `readKnowledgeBaseQuery` (5.1) — NOT consumed directly here.

### Project Structure Notes

- All new backend code is in EXISTING files under `convex/knowledge/`, `convex/`. ONE new file (`moduleDiff.ts`) inside an EXISTING directory. No new directories.
- `moduleDiff.ts` is ~50 lines (2 functions + 3 types + 1 internal helper). Well under the 200-line typical.
- `internal.ts` grows by ~30 lines (2 new mutations + restructured `_handleIngestionComplete`). Currently 1035 lines → ~1065. NOTE: the file is ALREADY over the 800 soft cap (pre-existing). This story adds bounded ~30 lines; a future refactor extracting the BMAD-metadata + RD-storage helpers to `convex/knowledge/bmadStorage.ts` is warranted but OUT OF SCOPE (surgical-changes principle). Flag for a future cleanup story.
- `queries.ts` grows by ~40 lines (the `getStaleTests` handler). Currently 383 lines → ~425. Under the 800 cap.
- `triggerIngestion.ts` grows by 2 lines (the one new `ctx.runMutation` call). Currently 335 lines → ~337. Negligible.
- `schema.ts` grows by 4 lines (the 2 optional fields). Currently 530 lines → ~534. Negligible.
- Frontend: `StaleTestsBanner.tsx` is ~60 lines (new file); `page.tsx` grows by 2 lines (import + render).
- `computeModuleFingerprint` + `diffModuleSnapshots` + `getStaleTests` are EXPORTED (used across files + tested directly). The internal `fnv1aHex` is NOT exported.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 5.5] — ACs and user story (lines 867-883)
- [Source: _bmad-output/planning-artifacts/epics.md#Epic 5] — Epic context (lines 258-264, 781-784)
- [Source: _bmad-output/planning-artifacts/epics.md#FR-42] — Drift-aware test regeneration (line 185)
- [Source: _bmad-output/planning-artifacts/epics.md#NFR-6] — Drift-to-regeneration turnaround under 2 minutes (line 115)
- [Source: docs/adr/0008-combined-analyst-test-platform.md] — Authoritative for the combined-platform concept (KB + exploration + test gen)
- [Source: _bmad-output/implementation-artifacts/1-8-knowledge-base-re-sync.md] — DIRECT predecessor; built `resyncKnowledgeBase` + `_handleIngestionComplete` + `_resetKbForResync`; explicitly deferred "module-level change detection (Story 5.5)" in Scope Boundary; review fixes (set building before destructive cleanup; repo pre-check) PRESERVED.
- [Source: _bmad-output/implementation-artifacts/5-4-exploration-cross-references-kb-modules.md] — DIRECT predecessor; added `proposed_scenarios[].kb_module` (consumed by `getStaleTests`); `computeKbCoverageGaps` is the pure-function template; additive-only four-layer guarantee; review finding on conservative over-reporting applied.
- [Source: _bmad-output/implementation-artifacts/5-3-context-enhanced-test-generation-prompts.md] — DIRECT predecessor; `truncateContext` + `buildKbContextBlock` pure-function export rationale; root-level integration test convention.
- [Source: _bmad-output/implementation-artifacts/epic-4-retrospective.md] — D1 (TS ignoreBuildErrors rot — verified via typecheck); D6/D7 (N/A — no prompts/LLM); C4 spike-citation (Task 0); C1 checklist (error-handling table + dual-write atomicity); D5 (N/A — `getStaleTests` uses ownership check); D2 (N/A — no browser surface); C2 (N/A — no timing claims).
- [Source: _bmad-output/implementation-artifacts/deferred-work.md] — IDOR on `readKnowledgeBaseQuery` (inherited, NOT consumed directly); D7 token-budget (N/A); D6 rollout (N/A); true one-click regeneration (future work — this story's Regenerate links to suite detail).
- [Source: _bmad-output/project-context.md] — Critical rules: no-comments (51/93), constraints in `constraints.ts` (66/92), ConvexError (48), "use node" isolation (49), IDOR B3 (120-124 — applies to PUBLIC functions; `getStaleTests` uses ownership check), C4 spike-citation (108), C1 checklist (106), C2 timing (107 — N/A here), optional-field backward-compat (131), reserved index names (67), `getOptionalOwnedEntity` (122/65), shared seed helpers (80), one test file per domain (79), file size limits (87), no inline auth/ownership (122).
- [Source: convex/knowledge/internal.ts:297-334] — **`_handleIngestionComplete`** — the workflow onComplete mutation to EXTEND (restructure to 3-branch dispatch).
- [Source: convex/knowledge/internal.ts:385-419] — **`_deleteModulesByKb`** — the sibling internal-mutation pattern + the `kb_modules.by_knowledge_base_id` index usage.
- [Source: convex/knowledge/internal.ts:421-439] — **`_resetKbForResync`** — the sibling internal-mutation pattern to mirror for `_snapshotModulesForResync` + `_storeModuleDiff`.
- [Source: convex/knowledge/triggerIngestion.ts:98-201] — **`resyncKnowledgeBase`** — the action to EXTEND (insert `_snapshotModulesForResync` call before `_deleteModulesByKb` at line 158).
- [Source: convex/knowledge/queries.ts:32-45] — **`getProjectRepo`** — the public-query ownership pattern to mirror for `getStaleTests`.
- [Source: convex/ai/tools/logic.ts:43-47] — **`readKnowledgeBaseLogic`** KB lookup — the `.withIndex("by_project_id").order("desc").first()` pattern reused by `getStaleTests`.
- [Source: convex/schema.ts:379-396] — **`knowledge_bases` table** — add `previous_module_fingerprints` + `module_diff` (siblings to `last_synced_at` at line 393).
- [Source: convex/schema.ts:416-429] — **`kb_modules` table** — the fields `computeModuleFingerprint` reads (`name`, `description`, `files`, `apis`, `user_flows`, `dependencies`).
- [Source: convex/schema.ts:290-301] — **`proposed_scenarios` nested validator** — the `kb_module` field (added by 5.4) consumed by `getStaleTests`.
- [Source: convex/schema.ts:99] — **`suites.by_exploration_id` index** — used by `getStaleTests`.
- [Source: convex/schema.ts:127] — **`tests.by_suite_id` index** — used by `getStaleTests`.
- [Source: convex/lib/constraints.ts:48] — **`EXTRACTION_MAX_MODULES = 50`** — bounds the diff computation.
- [Source: src/app/(auth)/projects/[id]/explore/page.tsx:634-641] — **`prdGaps` banner** — the UI pattern to MIRROR for `StaleTestsBanner`.
- [Source: src/app/(auth)/projects/[id]/page.tsx:275] — **Suites card** — the insertion point for `StaleTestsBanner` (above it).
- [Source: src/app/(auth)/projects/[id]/knowledge/knowledge.test.tsx:523-532] — **`vi.mock("convex/react")` pattern** — the mock factory to mirror for `StaleTestsBanner.test.tsx`.
- [Source: convex/testHelpers.ts:125-191] — **`seedKnowledgeBase` + `seedModule`** — test seed helpers (reuse, do NOT define local seeds).
- [Source: convex/ai.kbContext.test.ts] — **5.3's root-level integration-test file** — the convention to mirror for `convex/knowledge.staleTests.test.ts` (root-level + `import.meta.glob` module map).

## Dev Agent Record

### Agent Model Used

glm-5.1 (zai-coding-plan/glm-5.1)

### Debug Log References

- Task 4 RED: initial non-existent-KB test used a malformed Convex ID string (`"k0000..."` — too short); the `v.id("knowledge_bases")` validator rejected it before the handler ran. Fixed by seeding a real KB then deleting it (the "valid-but-deleted" pattern from `convex/stories.test.ts:673`), so the ID passes validation and the handler's `if (!kb) return;` defensive guard is exercised. The mutation returns `null` (Convex undefined→null serialization) — assertion updated from `.toBeUndefined()` to `.toBeNull()`.
- Task 6: imported `computeModuleFingerprint` + `diffModuleSnapshots` from `./moduleDiff` in `internal.ts` (added to the existing import line). The 3-branch dispatch restructures the early `if (args.result.kind !== "failed") return;` into `canceled`/`failed`/`success` branches; the `failed` branch is byte-identical to the pre-5.5 logic; the `success` branch is the only new code path.
- Task 8: `getStaleTests` needed `Id` type import added to `queries.ts` (the file didn't previously import from `_generated/dataModel`). Caught by `pnpm typecheck` (3 TS2304 errors); fixed by adding `import type { Id } from "../_generated/dataModel";`.
- Task 0 citation drift: `prdGaps` banner is at `explore/page.tsx:639-646` (not `:634-641`); `_handleIngestionComplete` existing tests live in `convex/knowledge.embeddingActions.test.ts` (not `knowledge.resync.test.ts`). Both patterns intact — doesn't impact implementation.

### Completion Notes List

- **AC1 ✅** `computeModuleFingerprint` + `diffModuleSnapshots` exported pure functions in NEW `convex/knowledge/moduleDiff.ts` (FNV-1a 32-bit, `Math.imul`-based, no crypto dep). 3 exported types (`ModuleFingerprintInput`, `ModuleFingerprint`, `ModuleDiff`). Internal `fnv1aHex` not exported. Defensive `JSON.stringify(... ?? null)` on `unknown`-typed `apis`/`user_flows`.
- **AC2 ✅** `_snapshotModulesForResync` internal mutation added to `internal.ts` (alongside `_resetKbForResync`). Reads `kb_modules` via `withIndex("by_knowledge_base_id", ...)`, maps to fingerprints, patches KB. Defensive `if (!kb) return;`. Idempotent (overwrites). Zero-modules → `[]` snapshot.
- **AC3 ✅** `_handleIngestionComplete` restructured to 3-branch dispatch: `canceled` (clears `previous_module_fingerprints` — P2 fix), `failed` (clears `previous_module_fingerprints` — P2 fix; existing error-logic unchanged), `success` (NEW — computes diff inline when snapshot exists, writes `module_diff` + clears `previous_module_fingerprints` in ONE atomic patch — P6 deleted the separate `_storeModuleDiff` mutation, inlining the logic directly). Existing `knowledge.embeddingActions.test.ts` tests pass (zero regressions).
- **AC4 ✅** `resyncKnowledgeBase` action extended with ONE `ctx.runMutation(_snapshotModulesForResync, ...)` call inserted AFTER `_updateKbStatus({status:"building"})` and BEFORE `_deleteModulesByKb` (the correct ordering — snapshot must capture modules before deletion). `triggerIngestion` (initial ingestion) UNCHANGED. Story 1.8 resync tests pass (zero regressions).
- **AC5 ✅** Two optional schema fields added to `knowledge_bases` table (siblings to `last_synced_at`): `previous_module_fingerprints` (transient) + `module_diff` (persistent). Both `v.optional(...)` — backward-compatible, no migration.
- **AC6 ✅** `getStaleTests` public query added to `queries.ts`. Uses `getOptionalOwnedEntity` ownership check. Returns `[]` fast for: KB status not "ready" (P8 fix — hides banner during re-sync build window), no KB, no `module_diff`, only `added` modules, no matching explorations, cross-workspace access. P3 collapsed the N+1 fan-out: collects project's suites once (`suites.by_project_id`) + workspace's tests once (`tests.by_workspace_id`), joins in-memory. Join chain: `module_diff` (removed+changed, normalized lowercase — P7 fix) → explorations (`proposed_scenarios[].kb_module`) → suites → tests. Dedupes tests by `_id`.
- **AC7 ✅** `StaleTestsBanner` client component created at `src/app/(auth)/projects/[id]/StaleTestsBanner.tsx`. Renders amber banner (mirrors `prdGaps`/`kbCoverageGaps` styling) with `<N> test(s) may be stale...` header, per-test list (name, suite, module, reason), and `<Link>` "Regenerate" per test pointing to `/projects/{id}/suites/{suite_id}`. Returns `null` when `[]` or loading. Integrated into `page.tsx` between the project header and the Suites card. No `router.push` in render, no `forwardRef`, no new state.
- **AC8 ✅** No new tables (2 optional fields only), no new indexes, no new dependencies (FNV-1a hand-rolled), no new `convex/` directories (`moduleDiff.ts` in existing `convex/knowledge/`).
- **AC9 ✅** Tests (TDD, all assert CONTENT):
  - `convex/knowledge/moduleDiff.test.ts` — 26 pure-function tests (determinism, field sensitivity incl. data_models — P1, defensiveness, hex format, diff added/removed/changed/empty/immutability/duplicate-names, case-insensitive+whitespace-trimmed identity — P7).
  - `convex/knowledge.staleTests.test.ts` — 17 integration tests (snapshot capture/zero-modules/idempotency/non-existent-KB; `_handleIngestionComplete` success-with-snapshot/success-no-snapshot/failed-clears-snapshot—P2/canceled-clears-snapshot—P2; `getStaleTests` primary-flagging/no-diff/only-added/no-match/cross-workspace/no-KB/building-KB-returns-empty—P8).
  - `src/app/(auth)/projects/[id]/StaleTestsBanner.test.tsx` — 5 frontend tests (renders-with-content, regenerate-link-href, empty-no-render, loading-no-render, dedup).
- **AC10 ✅** Convex validators on every function arg. Immutability enforced (pure functions return new objects; `diffModuleSnapshots` builds new `Map`s/arrays; `diffModuleSnapshots` normalizes name keys without mutating inputs — P7). No code comments. Verification: `pnpm lint` (0 new errors in changed files), `pnpm test:convex` (1193 passed), `pnpm test` (490 passed), `pnpm typecheck` (0 errors in changed files — pre-existing cascade errors unchanged), `pnpm build` (✓ Compiled successfully).

### File List

**NEW files:**
- `convex/knowledge/moduleDiff.ts` — pure helpers (`computeModuleFingerprint`, `diffModuleSnapshots`, `fnv1aHex` internal) + 3 exported types
- `convex/knowledge/moduleDiff.test.ts` — 22 pure-function unit tests
- `convex/knowledge.staleTests.test.ts` — 15 root-level integration tests (mutations + query)
- `src/app/(auth)/projects/[id]/StaleTestsBanner.tsx` — client component rendering the stale-tests banner
- `src/app/(auth)/projects/[id]/StaleTestsBanner.test.tsx` — 5 frontend component tests

**MODIFIED files:**
- `convex/schema.ts` — `knowledge_bases` table gained `previous_module_fingerprints` + `module_diff` (both optional, siblings to `last_synced_at`)
- `convex/knowledge/internal.ts` — imported `computeModuleFingerprint` + `diffModuleSnapshots` from `./moduleDiff`; added `_snapshotModulesForResync` internal mutation; restructured `_handleIngestionComplete` to 3-branch dispatch with inline diff computation in the success branch (P6: deleted the separate `_storeModuleDiff` mutation); P2: canceled/failed branches now clear `previous_module_fingerprints`
- `convex/knowledge/queries.ts` — imported `Id` type; added `StaleTestResult` type + `getStaleTests` public query (P3: collapsed fan-out via suites.by_project_id + tests.by_workspace_id; P8: returns [] when status !== "ready"; P4: typed Map<string, StaleTestResult>)
- `convex/testHelpers.ts` — P9: added 3 shared seed helpers (`seedExplorationWithScenarios`, `seedSuiteWithExploration`, `seedTestInSuite`)
- `convex/knowledge/triggerIngestion.ts` — `resyncKnowledgeBase` action gained ONE `ctx.runMutation(_snapshotModulesForResync, ...)` call before `_deleteModulesByKb`
- `src/app/(auth)/projects/[id]/page.tsx` — imported `StaleTestsBanner`; rendered `<StaleTestsBanner projectId={project._id} />` between project header and Suites card

## Change Log

- 2026-06-17: Story 5.5 implemented — drift-aware test regeneration suggestions. Added module fingerprinting (FNV-1a) + diff computation on KB re-sync success + `getStaleTests` query joining module_diff → explorations → suites → tests + `StaleTestsBanner` UI. All 11 tasks complete via TDD red-green-refactor. 42 new tests (22 pure + 15 integration + 5 frontend). Zero regressions across 1187 convex + 490 frontend tests.
- 2026-06-18: BMAD adversarial code review completed — 3-layer review (Blind Hunter, Edge Case Hunter, Acceptance Auditor), 49 findings triaged → 9 patches applied + 4 deferred. See Review Findings below.

---

## Review Findings (2026-06-18)

**Method:** 3 parallel adversarial subagents (Blind Hunter, Edge Case Hunter, Acceptance Auditor) → 49 raw findings → triage: 5 user-decisions, 9 patches, 4 deferred, 14 dismissed.

### Patches Applied

| # | Finding | Fix |
|---|---------|-----|
| P1 | `data_models` field missing from fingerprint serialization (AC1 drift — schema has `data_models` on `kb_modules` but `computeModuleFingerprint` didn't hash it) | Added `data_models?` to `ModuleFingerprintInput` + `JSON.stringify(data_models ?? null)` to serialization in `moduleDiff.ts`; updated both call sites in `internal.ts` |
| P2 | `canceled`/`failed` branches in `_handleIngestionComplete` left stale `previous_module_fingerprints` → false diff on next re-sync | Both branches now `patch(kbId, { previous_module_fingerprints: undefined })` |
| P3 | `getStaleTests` had N+1 query fan-out (per-exploration → per-suite → per-test nested `ctx.db.query`) | Collapsed to 2 queries: `suites.by_project_id` once + `tests.by_workspace_id` once, joined in-memory via `Map<suiteId, tests[]>` |
| P4 | `getStaleTests` `Map` was typed `Map<string, any>` | Typed `Map<string, StaleTestResult>` |
| P5 | `StaleTestsBanner` `projectId` prop typed as `string` | Typed `Id<"projects">` |
| P6 | `_storeModuleDiff` was dead code (only called from `_handleIngestionComplete`; spec's own "Convex Gotchas" section contradicted itself — D1 decision: delete) | Deleted `_storeModuleDiff` mutation; inlined diff computation directly in the success branch |
| P7 | `diffModuleSnapshots` treated casing/whitespace-differing names as removed+added (e.g. "Auth Module" → "auth module" appeared as both) | Normalize keys via `trim().toLowerCase()` for identity matching; preserve original-cased `name` in output arrays |
| P8 | `getStaleTests` returned stale results during a new re-sync build window (banner flashed stale during "building" status) | Added `kb.status !== "ready"` early-return → `[]` |
| P9 | Test file defined local seed helpers (`seedExploration`, etc.) violating "never define local seed functions" convention | Added `seedExplorationWithScenarios`, `seedSuiteWithExploration`, `seedTestInSuite` to shared `testHelpers.ts`; removed local copies |

### Deferred (F1–F4 → `deferred-work.md`)

| # | Finding | Severity |
|---|---------|----------|
| F1 | TOCTOU race between `getStaleTests` and re-sync (pre-existing from 1.8) | MEDIUM |
| F2 | `internal.ts` exceeds 800-line file-size cap (~880 lines post-review) | MEDIUM |
| F3 | Dedup branch in `getStaleTests` dead + frontend test over-promises (P3 collapse made it unreachable) | LOW |
| F4 | Unbounded `.collect()` + no render cap in banner | LOW |

### Dismissed (14 findings)

Key dismissals: FNV-1a collision risk (spec's "Why FNV-1a" explicitly accepts), duplicate module names (AC9 tests last-wins behavior), `useQuery` returns Error type (false positive — Convex never returns Error objects), status "ready" not set in `_handleIngestionComplete` (set in `ingestionWorkflow.ts:137`), duplicate local `StaleTest` type in banner (frontend convention — only generated types imported, local type is a lint-only unused warning), `JSON.stringify` key-order sensitivity (D2 decision: spec's conservative over-reporting stance).

### Test Delta

| File | Before | After | Delta |
|------|--------|-------|-------|
| `moduleDiff.test.ts` | 22 | 26 | +4 (P1 data_models, P7 case-insensitive ×3) |
| `knowledge.staleTests.test.ts` | 15 | 17 | +2 net (−1 P6 _storeModuleDiff, +2 P2 canceled/failed, +1 P8 building-KB) |
| `StaleTestsBanner.test.tsx` | 5 | 5 | 0 (P5 prop-type fix only) |
| **Convex total** | 1187 | 1193 | +6 |

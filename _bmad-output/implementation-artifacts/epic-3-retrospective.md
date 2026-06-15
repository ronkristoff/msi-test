# Epic 3 Retrospective: AI Chat for BAs

**Date:** 2026-06-15
**Project:** msi-test
**Participants:** Amelia (Developer), John (PM), Winston (Architect), Murat (Test Architect), msi (Project Lead)
**Facilitator:** Amelia (Developer)

---

## Epic Summary

| Metric | Value |
|--------|-------|
| Stories completed | 4/4 (100%) |
| Tests passing | ~1,275 (943 backend + 332 frontend) |
| New tests added | ~130 (+79 backend, +51 frontend) |
| Production incidents | 0 |
| Code review patches applied | ~38 (13 + 3 + 9 + 14 incl. 2 decision-resolved) |
| Decision-needed review findings | 4 (1 in 3.1, 1 in 3.2, 0 in 3.3, 2 in 3.4) — all resolved |
| Critical bugs caught in review | 1 (optimistic-message duplicate for the entire streaming window — 3.4) |
| Spike corrections mid-implementation | 2 (3.1 join-table supersedes metadata; 3.4 optimistic-send premise empirically false) |
| New deferred work items | 11 |
| Deferred items closed this epic | 3 (rate-limit on `searchProjectRag`; `_getProjectWorkspaceForSearch` `.first()` ordering; IDOR comment de-staled) |

### Stories Delivered

| Story | Title | New Tests | Review Patches | Decision-Needed | Deferred Added |
|-------|-------|-----------|----------------|-----------------|----------------|
| 3.1 | Analyst Chat Agent & Thread Management | 17 backend | 13 | 1 (extended `getOwnedEntity` w/ custom msg) | 3 |
| 3.2 | RAG-Grounded Responses | 24 (18 BE + 6 rate-limit/KB) | 3 | 1 (rate-limit error propagation) | 6 |
| 3.3 | Chat Thread List & Navigation | 38 (12 helper + 7 BE + 19 FE) | 9 | 0 | 5 |
| 3.4 | Chat UI with Streaming Display | 51 FE (new + extended) | 14 | 2 (duplicate-window; ghost-on-failure) | 2 |

---

## Successes

### 1. Epic 2 Lessons Were Baked Into Every Story Spec — And Held
Every Epic 3 story spec opens with an "Avoid Epic 2's Recurring Defects" table mapping B1 (review gate), B3 (IDOR), B5 (`useErrorLogger` mock) to concrete mitigations. The single most important outcome: **the B1 review gate held across all four stories** — every story shipped with a `### Review Findings` section AND a `Status: done` header matching `sprint-status.yaml`. The Story 2.3 documentation gap that broke the Epic 1 agreement did not recur. Baking the rule into `project-context.md:105` as an *enforced gate* (not a team agreement) is what made it stick.

### 2. The B3 IDOR Pattern Was Applied Correctly To A Brand-New Surface (Chat)
The Agent Component's `threads`/`messages`/`streams` tables are **global** — not workspace-scoped. A `threadId` is an opaque string. Without ownership enforcement, any authenticated user could enumerate thread IDs and read another workspace's conversations. Story 3.1 centralized enforcement in `verifyThreadOwnership(ctx, threadId, membership)` (`convex/chat/internal.ts`) from the first commit, and **no public function in `convex/chat/` accepts a bare `threadId` without it**. The Epic 2 IDOR lesson (B3) generalized cleanly from `triggerBaselineRd` to chat — pattern reuse worked exactly as intended.

### 3. The Pre-Prompt RAG Injection Decision (Spike #2) Held Up End-To-End
The spike locked "RAG = pre-prompt injection via `system` override, not a tool" before implementation. Story 3.2 implemented it cleanly via `AgentPrompt.system` (which overrides agent `instructions`), re-including `ANALYST_CHAT_PROMPT` so nothing is lost. Deterministic, always-on, testable. Tool-based RAG was correctly deferred to v2. This is the strongest evidence that **front-loading architectural decisions in a spike pays off** — zero rework on the RAG plumbing across 3.2 → 3.3 → 3.4.

### 4. AI-Action Mocking Pattern Scaled From `generateObject` To `streamText`
Epic 2 established the hoist-`vi.mock("ai")` pattern for `generateObject`. Epic 3 extended it to streaming: `mockModel` from `@convex-dev/agent` + `vi.mock("./knowledge/rag", ...)` + component registration via `t.registerComponent("agent", ...)`. The `chatTest()` helper (3.1) became the reusable foundation — 3.2/3.3 reused it unchanged. Streaming tests (auto-title, RAG degradation, IDOR throws) all run without network calls.

### 5. Rate-Limiting Deferred Item Promoted And Resolved Before It Became Critical
Epic 2 retro flagged `searchProjectRag` rate limiting as "becomes production-critical in Epic 3 chat" (insight #5, action B4-adjacent). Story 3.2 promoted it to a BLOCKING prerequisite and wired `@convex-dev/rate-limiter` (`ragSearchPerWorkspace`, 20/min/workspace) — **before any chat traffic existed**. The deferred-work triage step before epic kickoff (Epic 2 action A7) is what caught this. The triage discipline is now a proven part of the workflow.

### 6. Opportunistic Debt Paydown Continued (A8 ✅)
Every Epic 3 story spec included a "Deferred Work to Resolve" section. Story 3.2 closed three items in one pass: the rate-limit prerequisite, the `_getProjectWorkspaceForSearch` `.first()`→`.order("desc").first()` fix, and it **verified the IDOR deferred-work comment was stale** (`getOptionalOwnedEntity` already enforces membership — the comment predated its use). De-staling the deferred-work list is as valuable as closing items.

### 7. The 3.3→3.4 Story Split Was The Right Call
Story 3.3 built the `[threadId]` page as read-only (non-streaming `useUIMessages`, no composer) with a reusable `MessageBubble`. Story 3.4 upgraded it to full chat with a surgical one-line options change (`stream: true`) plus the composer/typing-indicator/auto-scroll layer. The split let 3.3 ship a testable, reviewed foundation and 3.4 focus purely on streaming UX. The `MessageBubble` designed for reuse in 3.3 was reused in 3.4 with only an `isStreaming` prop addition — exactly as the spec anticipated.

---

## Challenges

### 1. Optimistic-Send Spec Premise Was Empirically FALSE (Story 3.4, CRITICAL)
The Story 3.4 spec dev-notes claimed the optimistic/subscription dedup window was "<500ms" and cleared `pendingMessages` in `onSent` (action resolve). **This is wrong.** `streamMessage` `await`s `thread.streamText(...)`, so the action does NOT resolve until streaming completes (10–30s typical). The subscription delivers the persisted user message almost immediately → the user's message rendered **twice for the entire streaming duration**, duplicate parked below the assistant reply. The 3.4 review caught it (decision-needed #1); the fix moved dedup to render-time filtering against delivered subscription messages. **Lesson: spec claims about async timing must be verified empirically, not asserted.** A "harmless <500ms double-display" assumption masked a 10–30s duplicate.

### 2. Spike Decision #1 (Thread Metadata) Was Wrong — Caught At Implementation Time
The streaming spike recommended storing `projectId`/`workspaceId` in "thread metadata via `updateThreadMetadata`". Story 3.1 discovered this **does not work in `@convex-dev/agent` v0.6.1** — `ThreadDoc` has no `metadata` field; `threadFieldsSupportingPatch` is `["status", "userId", "title", "summary"]`. The story corrected course to a `chat_threads` join table in our own schema (the only way to list threads per project + enforce workspace ownership). **Lesson: spikes must verify API claims against installed types, not library docs/marketing.** The correction was cheap because it was caught at story-start, not mid-implementation — but it should never have reached the story spec.

### 3. Review Findings Are Heavy — ~38 Patches Across 4 Stories
Epic 3 review volume: 13 + 3 + 9 + 14 = ~38 patches. Story 3.4 alone had 14 patches + 2 decision-needed. Several findings recurred across stories:
- **Spec/code drift on error handling** (3.1: raw error leak, asymmetric try/catch; 3.2: rate-limit silently swallowed; 3.4: stale error Alert, `void handleSubmit` dropping rejections).
- **Non-atomic dual-writes** (3.1: agent title + join title diverge; 3.4: pending + subscription duplicate).
- **Test gaps that would have shipped the bug green** (3.4: optimistic-render test never verified pending→cleared; 3.3: non-null preview test asserted only `typeof === "string"`, passing on `""`).
The 3-layer adversarial review is catching real defects (including a CRITICAL), but the volume suggests **the pre-review implementation pass is still leaving a discoverable defect class on the table**.

### 4. `pnpm build` Still Fails (Carried From Epic 2, Now Compounded)
The pre-existing TypeScript circular-inference error in `convex/knowledge/bmadActions.ts`/`baselineActions.ts` (deferred-work line 106, Epic 2) is **still unfixed**. Story 3.4 surfaced a *second* pre-existing build error (`ctx.logger` does not exist on query context — Convex API drift, `convex/chat/queries.ts:85`). Two stories now carry "Task 8 build claim is technically false" footnotes. The build is the only verification step that doesn't run clean; every story's validation section has to caveat it. **This is accumulating silent risk** — a real build regression introduced by a future story will be invisible against the noise.

### 5. No `*-free` Model Guard (B4) Is STILL Not Built — Now Live On The Highest-Volume Surface
Epic 2 retro promoted B4 (no `*-free` model guard) to High priority, noting "chat is the highest-volume AI surface." Epic 3 chat is now live with no guard. Story 3.1 and 3.2 both flagged it as out-of-scope (cross-cutting, no existing agent has the guard). Chat amplifies cost/quality cliffs faster than Epic 2's batch generation — a misconfigured workspace hits the cliff on every message. **B4 has now been deferred across two epics while the surface area it protects grew by the largest amount in the project.**

### 6. Spec Self-Contradictions Surfaced As Decision-Needed Findings
- Story 3.4 Task 4 said "parent owns error display"; Task 3 test required the Alert visible when rendering `ChatComposer` alone; AC9 said the composer displays the Alert. (Resolved: composer renders its own Alert.)
- Story 3.2 spec said AC6 KB-ordering needed `.first()`→`.order("desc").first()`; the code already had it (AC6 pre-satisfied).
**Lesson: ACs, task lists, and dev-notes are drifting out of sync.** A pre-dev spec-consistency pass would have eliminated both decision-needed findings.

---

## Key Insights

| # | Theme | Evidence | Applies To |
|---|-------|----------|------------|
| 1 | **Spec claims about async timing must be verified empirically, never asserted** | 3.4 "<500ms dedup window" was 10–30s; optimistic message duplicated for the whole stream | Any story involving action/subscription coordination, optimistic UI, debouncing |
| 2 | **Spikes must validate API claims against installed types, not docs** | 3.1 spike Decision #1 (thread metadata) was impossible in v0.6.1; join-table correction mid-spec | Every spike that locks an API-level decision |
| 3 | **The 3-layer review catches real defects — but the same defect classes recur** | Error-handling drift, non-atomic dual-writes, test-asserts-too-weak appeared in 2+ stories each | Pre-review self-checklist (see C1) |
| 4 | **A broken build is silent risk accumulating** | `pnpm build` fails on 2 pre-existing errors across Epic 2 + 3; every story's Task 8 caveat-it | All stories until fixed (see C3) |
| 5 | **Deferred items left unbuilt while their surface area explodes become strategic debt** | B4 (`*-free` guard) deferred across Epic 2 + 3 while chat (highest-volume AI surface) shipped without it | Cross-cutting hardening items — promote or schedule, don't re-defer |
| 6 | **The IDOR-on-`Id`-accepting-actions pattern generalizes beyond CRUD** | `verifyThreadOwnership` enforced ownership on a component-owned table (Agent's global `threads`) via a join table — B3 applied to a surface Epic 2 didn't imagine | All endpoints that accept a component/external-system ID |
| 7 | **ACs, task lists, and dev-notes drift out of sync within a single spec** | 3.4 error-display ownership contradiction; 3.2 AC6 pre-satisfied in code | Pre-dev spec-consistency check (part of C1) |
| 8 | **Pre-prompt RAG injection > tool-based RAG for v1 determinism** | Spike Decision #2 held end-to-end; zero rework on RAG plumbing across 3 stories; testable, always-on | Future agent features that need grounding (Epic 4 impact analysis, Epic 5 test gen) |

---

## Action Items

### Process Improvements

| # | Action | Owner | Success Criteria |
|---|--------|-------|------------------|
| C1 | **Pre-review self-checklist** for the three recurring defect classes: (a) error-handling paths (surfaced vs swallowed vs leaked), (b) atomicity of dual-writes / cross-system writes, (c) test-asserts-on-content-not-just-type (e.g. `typeof === "string"` must become `.toBe("expected")` or `.toMatch(/.../)`). Plus a spec-consistency sweep (ACs ↔ tasks ↔ dev-notes) before `review` transition. Goal: cut review patches per story from ~10 to ≤5. | Amelia | Checklist item in `project-context.md` + story template; applied from Epic 4 Story 4.1 |
| C2 | **Empirical verification requirement for async-timing claims in specs.** Any spec sentence of the form "the window is <Xms" or "this resolves before Y" must either cite an installed-type contract OR be marked `UNVERIFIED` and tested before the spec is locked. The 3.4 duplicate-window bug exists because a dev-note asserted timing it hadn't measured. | Amelia / Winston | Rule in `project-context.md`; referenced from every story spec's "Previous Story Intelligence" section |
| C3 | **Fix `pnpm build` before Epic 4 Story 4.1.** Two pre-existing errors (`bmadActions.ts`/`baselineActions.ts` circular inference; `ctx.logger` API drift in `chat/queries.ts`). The build is the only verification gate that doesn't run clean; every story since 2.3 has caveated it. A real regression will be invisible against the noise. | Winston | `pnpm build` exits 0; remove the "pre-existing build failure" caveat from the story template |
| C4 | **Spike API-claim verification gate.** Every spike decision that asserts an external-library API shape must cite the installed `.d.ts` path + line (e.g. `node_modules/@convex-dev/agent/dist/validators.d.ts`). Spikes that assert without citation get a verification task at the top of the first consuming story. The 3.1 metadata correction is the cautionary tale. | Winston | Spike template updated; verification task present in every spike-consuming story |

### Technical Debt

| # | Action | Owner | Priority | Status |
|---|--------|-------|----------|--------|
| — | ~~`searchProjectRag` rate limiting~~ | — | — | **✅ Closed in 3.2** (AC5 wired `ragSearchPerWorkspace` 20/min/workspace) |
| — | ~~`_getProjectWorkspaceForSearch` `.first()` ordering~~ | — | — | **✅ Closed in 3.2** (pre-satisfied in code; AC6 added test) |
| — | ~~IDOR deferred-work comment (line 7) stale~~ | — | — | **✅ Closed in 3.2** (verified `getOptionalOwnedEntity` enforces membership; comment de-staled) |
| C5 | **No `*-free` model guard (B4 carry-forward).** Chat shipped without it. A workspace-level model allowlist/denylist is the right home. Now protecting the highest-volume AI surface in the product. **Third epic carrying this.** | John | **Critical** (was High) |
| C6 | **N+1 component query fan-out in `listThreads`** (3.3 defer) — up to 50 parallel `ctx.runQuery(components.agent.messages.listMessagesByThreadId)` per subscription evaluation. Cache `last_message_preview` on the `chat_threads` row (written by `streamMessage`/`_updateThreadLastMessageAt`) and read it directly. | Amelia | Medium |
| C7 | **No timeout/abort on `streamMessage`** (3.4 defer) — Send button permanently disabled if the action hangs; only recovery is page reload. Add `AbortController` + cancel button. No AC in 3.4; non-trivial with Convex `useAction`. | Amelia | Medium |
| C8 | **`getOptionalMemberWorkspace` uses `.first()` for multi-workspace users** (carried from Epic 1, lines 48/96/99/105/114) — systemic. `listThreads`/`searchProjectRag`/`getThread` all inherit it. Cross-cutting fix: accept `workspace_id` param, look up via `by_workspace_id_and_user_id`. | Winston | Medium |
| C9 | **`pnpm build` pre-existing errors** (3.1/3.2/3.3/3.4 defer) — folded into C3 above (process fix owns the resolution). | Winston | High (via C3) |
| C10 | **Invalid `params.id` → infinite skeleton** (3.3 defer, codebase-wide) — `asId` is a pure type cast with no runtime validation; all `projects/[id]` pages hit validator-rejection → perpetual skeleton on bad IDs. Repo-wide `isValidId` guard before the query. | Amelia | Low |
| C11 | **`inputBase` duplicated in `ChatComposer`** (3.4 defer) — `FormField.inputBase` is a non-exported local; composer redefines identical classes. Export it and import. | Amelia | Low |

### Team Agreements

- **Spec-consistency sweep before `review`** (strengthens C1): before a story moves to `review`, re-read ACs ↔ Tasks ↔ Dev Notes ↔ "What NOT to Reinvent" table and resolve any contradiction. The 3.4 error-display ownership contradiction and 3.2 AC6-pre-satisfied cases both survived into review as decision-needed findings.
- **Carry-forward from Epic 1/2 (all held)**: never ship `v.any()` for frontend-consumed fields (✅ `chat_threads` fully typed); every story spec includes a deferred-work section (✅ all 4); `*-free` AI models not permitted for implementation (✅ `glm-5.2` used for all Epic 3 dev; guard still not built → C5).
- **Review gate (B1, enforced, held)**: every story's `done` transition requires (a) `### Review Findings` section present, (b) story-file `Status:` header matches `sprint-status.yaml`. **4/4 Epic 3 stories compliant.**

---

## Previous Retrospective Follow-Through

| Epic 2 Item | Status | Evidence |
|-------------|--------|----------|
| B1 review gate (Review Findings + status-header match) | ✅ **Applied** | All 4 Epic 3 stories have `### Review Findings` sections AND `Status: done` matching `sprint-status.yaml`. The Story 2.3 gap did not recur. |
| B2 `archiveByProjectStatus` helper | ➖ N/A | No archival mutations in Epic 3 (chat has no archive flow). Helper not needed; carry forward to whenever bulk archival recurs. |
| B3 IDOR pattern doc in `project-context.md` | ✅ **Applied** | `project-context.md:120` documents the pattern. All 4 stories applied it: `verifyThreadOwnership` (3.1), `getOptionalOwnedEntity` on `searchProjectRag` (3.2 verified), `getThread` (3.3), inherited (3.4). Insight #6 generalizes B3 to component-owned tables. |
| B4 no `*-free` model guard (promoted High) | ❌ **Not addressed — promoted Critical (C5)** | Story 3.1 and 3.2 both flag it as out-of-scope. Chat shipped without it. Now protecting the highest-volume AI surface. **Third epic carrying this; promoted to Critical.** |
| B5 `useErrorLogger` mock pattern (`vi.hoisted`) | ✅ **Applied** | Story 3.3 `chat.test.tsx:5-7` and 3.4 `ChatComposer.test.tsx` use `vi.hoisted` for single-fn reuse; `logError` assertions work. |
| Carry-forward: no `v.any()` for frontend fields | ✅ **Applied** | `chat_threads` fully typed (`thread_id: v.string()`, typed fields). Zero new `v.any()` in Epic 3. |
| Carry-forward: deferred-work section in every spec | ✅ **Applied** | All 4 Epic 3 story specs include "Deferred Work to Resolve This Story". |
| Carry-forward: `*-free` models not used in dev | ✅ **In practice** | `glm-5.2` used for all Epic 3 dev. Guard still not built (→ C5). |

**Net:** 5 of 7 action items fully applied (B1, B3, B5 + 2 carry-forwards); 1 N/A (B2); 1 broken/deferred (B4 → promoted Critical as C5). The one structural failure (B4) is the highest-stakes one — it protects the surface area that grew most this epic.

---

## Epic 4 Preparation: Feature Analysis & Story Management

### Dependencies on Epic 3

Epic 4 builds directly on Epic 3's chat substrate:

1. **Impact Analysis Agent (4.1)** runs via `generateObject` with a zod schema — reuses the agent-factory pattern (`createAnalystChatAgent` → `createImpactAnalysisAgent`) and the `getWorkspaceModel` BYOK resolution. New territory: **structured object generation with a defined schema** (existing factories are `generateObject` for extraction, but impact analysis has a richer nested schema).
2. **User Story Generation (4.2)** stores stories linked to a chat `thread_id` — depends on the `chat_threads` join table (3.1) and `verifyThreadOwnership` for thread-scoped story creation. **New `user_stories` table** with indexes `by_workspace_id`, `by_project_id`, `by_project_id_and_status`.
3. **BMAD-aware features (4.1, 4.2, 4.4)** require searching BMAD metadata (ADRs, conventions, story data) — the existing `searchProjectRag` searches **code chunks only**. BMAD metadata lives in `kb_bmad_metadata` (separate namespace, not yet populated for search). This is a **net-new RAG namespace** not built in Epic 3.
4. **Story status lifecycle (4.3)** draft → approved → exported with timestamps — TOCTOU risk on status transitions (the Epic 2 A4 lesson applies directly).

### Risks Identified

1. **IDOR on the new `user_stories` endpoints (B3 / C-series).** Story creation (4.2), status mutation (4.3), and export (4.4) all accept IDs (`thread_id`, `project_id`, `story_id`). Every endpoint must resolve ownership via `getOwnedEntity`/`getOptionalOwnedEntity`/`verifyThreadOwnership` from the first commit. The Epic 3 IDOR pattern (insight #6) applies — including for the new `story_id` surface.
2. **No `*-free` model guard (C5) — now protecting two high-volume surfaces.** Epic 4 adds impact analysis + story generation on top of chat. A misconfigured workspace amplifies cost/quality cliffs across all three. **Promote C5 to a prerequisite before Epic 4 Story 4.1**, not a parallel track.
3. **BMAD-aware RAG namespace is net-new and unspecified.** Stories 4.1/4.2/4.4 condition behavior on `bmad_detected = true` and search BMAD metadata. The current `searchProjectRag` searches code chunks only — it does NOT index `kb_bmad_metadata`. Either (a) extend `searchProjectRag` to a second namespace, or (b) add a `searchBmadMetadata` action. **This is a spike-worthy decision before 4.1 implementation**, mirroring the Epic 3 streaming spike.
4. **TOCTOU on story status transitions (4.3).** Draft → approved → exported with timestamp tracking. The Epic 2 A4 lesson (version-increment-into-mutation) applies: status check and status update must happen in the SAME mutation, not split across query→mutation. Story 4.3 must not repeat the `triggerBaselineRd` pattern.
5. **`generateObject` schema validation failures.** Impact analysis (4.1) and story generation (4.2) use structured outputs. AI providers occasionally return malformed JSON or skip required fields. The existing extraction agent (1.5) handles this; the new schemas are richer. Reuse the error-wrapping pattern (`buildBaselineRdErrorMessage` analog) and the hoist-`vi.mock("ai")` test pattern.
6. **`pnpm build` must be fixed (C3) before Epic 4.** Story 4.2 adds a new schema table — if the build is still broken, a real schema regression will be invisible. C3 is on the critical path.

### Applying Epic 3 Lessons to Epic 4

| Epic 3 Lesson | Epic 4 Mitigation |
|---------------|-------------------|
| IDOR on `Id`-accepting actions (insight #6) | Apply `getOwnedEntity`/`verifyThreadOwnership` to story creation, status mutation, export from first commit. New `story_id` surface gets the same treatment as `thread_id`. |
| Spec async-timing claims must be verified (insight #1) | If any Epic 4 spec claims "the action resolves before X" — verify against installed types or mark `UNVERIFIED` (C2). |
| Spike API claims must cite installed types (insight #2) | The BMAD-RAG namespace decision needs a spike citing `@convex-dev/rag` types + the `kb_bmad_metadata` schema. Don't repeat the metadata-field mistake. |
| Pre-prompt RAG > tool-based for v1 (insight #8) | Impact analysis (4.1) and story generation (4.2) should inject BMAD context via prompt/system override, not via agent tools — same determinism + testability win. |
| Pre-review self-checklist (C1) | Apply from Story 4.1: error paths, dual-write atomicity, test-asserts-on-content. Target ≤5 review patches/story. |
| TOCTOU on status transitions (Epic 2 A4) | Story 4.3 status mutations: check + update inside ONE mutation handler. No query→mutation split. |
| `*-free` model guard (C5) | **Prerequisite before 4.1** — chat + impact analysis + story gen all unprotected otherwise. |

---

## Significant Discoveries

**No epic plan changes required** for Epic 4's scope, but **three preparation additions** (not scope changes):

1. **BMAD-aware RAG namespace spike** — research task before Story 4.1 implementation. `searchProjectRag` currently searches code chunks only; BMAD metadata is a separate, unindexed namespace. Decide: extend `searchProjectRag` vs. new `searchBmadMetadata` action. Mirror the Epic 3 streaming spike (cite installed types, lock decisions before story creation).
2. **C5 (`*-free` model guard) promotion to Epic 4 prerequisite** — the guard has been deferred across two epics while the surface area it protects grew by the most. Promote to blocking before Story 4.1; do not defer a third time.
3. **C3 (`pnpm build` fix) on the Epic 4 critical path** — Story 4.2 adds a new schema table; a broken build masks real regressions. Fix before 4.1.

**No significant scope discoveries from Epic 3 invalidate Epic 4's plan.** The chat substrate (threads, ownership, BYOK model resolution, RAG injection, streaming) is stable and reused as-is. The one net-new capability Epic 4 needs (BMAD metadata search) is additive — it does not require changing any Epic 3 code.

---

## Readiness Assessment

| Dimension | Status | Notes |
|-----------|--------|-------|
| Testing & Quality | ✅ Pass | ~1,275 tests passing (943 backend + 332 frontend); CRITICAL duplicate-window bug caught + fixed in 3.4 review; 0 production incidents |
| Deployment | ⏳ Pending | Local dev only (unchanged from Epic 1/2) |
| Stakeholder Acceptance | N/A | Solo project, msi is the stakeholder |
| Technical Health | ⚠️ Mixed | IDOR/rate-limit debt paid down; build broken (C3); `*-free` guard missing (C5); N+1 fan-out accepted for v1 (C6) |
| Unresolved Blockers | 0 | All 4 stories `done` with Review Findings + status-header match (B1 gate held) |

---

## Commitments

- **4 new action items** (C1–C4) with clear ownership
- **3 deferred items closed** this epic (rate-limit; KB ordering; IDOR comment de-stale)
- **7 technical-debt items tracked** (C5–C11), one promoted to Critical (C5)
- **3 critical-path items** before Epic 4 Story 4.1 (BMAD-RAG spike; C5 guard; C3 build fix)
- **0 epic-plan changes** required for Epic 4; 3 preparation additions flagged
- **1 carry-forward agreement added** (spec-consistency sweep before `review`); all Epic 1/2 carry-forwards held

---

## Next Steps

1. **Update `project-context.md`** with C1 (pre-review checklist), C2 (async-timing verification rule), C4 (spike API-citation gate) — Winston/Amelia, before Epic 4 Story 4.1.
2. **Fix `pnpm build`** (C3) — two pre-existing errors (`bmadActions.ts`/`baselineActions.ts` circular inference; `chat/queries.ts:85` `ctx.logger` drift). `fix:` commit, separate from any feature work. Blocks clean verification for Epic 4.
3. **Build the `*-free` model guard (C5)** — workspace-level allowlist/denylist, applied cross-cutting to all agent factories (`createAnalystChatAgent`, `createExplorationAnalysisAgent`, future `createImpactAnalysisAgent`). **Prerequisite before Epic 4 Story 4.1.**
4. **Run BMAD-RAG namespace spike** — decide extend-`searchProjectRag` vs. new-`searchBmadMetadata` action; cite installed `@convex-dev/rag` types. Lock decision before Story 4.1 creation.
5. **Triage `deferred-work.md`** before Epic 4 kickoff (Epic 2 action A7, held in Epic 3) — promote any blocking items, close any stale comments.
6. **Begin Epic 4 story creation** with `create-story` when preparation (steps 1–4) complete.

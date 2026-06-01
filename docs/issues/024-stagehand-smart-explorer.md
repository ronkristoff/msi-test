# 024 — Stagehand Smart Explorer — replace `explorer.ts`

**Type**: HITL — needs human to verify exploration against a real app
**Status**: needs-review
**Blocked by**: 022

## What to build

Rewrite the Runner's `explorer.ts` to use Stagehand instead of raw Playwright DOM crawling. The Smart Explorer logs in via `act()` with variables, visits pages using `observe()` to discover interactive elements and `extract()` to produce rich per-page semantic descriptions. The LLM decides which links are meaningful to follow (skipping footers, legal pages, etc.). Interactive exploration is opt-in — Stagehand fills forms and clicks buttons when the user has enabled it. Screenshots captured per page. Live progress messages streamed to the UI. Output is the enriched `captured_pages` format with semantic descriptions, interactive element lists, and traced user flows. The existing Convex interface (`completeExploration`, `updateProgress`, `failExploration`) is preserved.

## Acceptance criteria

- [x] `explorer.ts` rewritten to use Stagehand SDK (`observe()`, `extract()`, `act()`)
- [x] Login handled via `act()` with variables (credentials never sent to LLM)
- [x] Per-page semantic descriptions produced: "This is a payroll dashboard with navigation to Employees, Payroll, Reports"
- [x] Interactive elements listed per page: buttons, forms, links, inputs with their purposes
- [x] LLM decides which links to follow (meaningful navigation only, skip noise)
- [x] Interactive exploration mode: Stagehand fills forms and clicks buttons when opted in
- [x] Screenshots captured per page and uploaded to Convex file storage
- [x] Live progress messages streamed: "Visiting page 3: Payroll (explored 2 interactive elements)"
- [x] Output shape compatible with existing Convex interface (`completeExploration` etc.)
- [ ] Traced user flows produced: "Login → Dashboard → Payroll → New Payroll Run (4-step wizard)"
- [x] Existing exploration tests updated or replaced for new implementation
- [ ] HITL: Verified against a real app (e.g., the HR payroll app)

## Implementation notes

- Shared types extracted to `runner/src/types.ts` (`CapturedPage`, `ExplorationWorkItem`)
- `capturePage` helper DRYs screenshot+upload+record pattern across login and main loop
- `extract()` + `extract(links)` + `observe()` run in parallel via `Promise.all`
- `handleFormLogin` returns `CapturedPage` instead of mutating by side effect
- `gotoWithRetry` replaces nested try-catch retry
- `sleep(page)` helper encapsulates `waitForTimeout?.()` optional chaining
- Schema: `interactive` field added to explorations table
- Query: `getPendingExplorations` returns `workspace_id`, `project_id`, `interactive`
- Tests: 35 runner tests pass, 241 Convex tests pass, 0 lint errors

## Blocked by

- 022 — Install Stagehand + wire BYOK config to Runner

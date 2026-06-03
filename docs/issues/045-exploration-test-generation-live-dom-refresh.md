# 045 — Exploration Test Generation with Live DOM Refresh

**Type**: AFK
**Status**: done

## What to build

Modify exploration-based test generation (`generateExplorationTests` and `generateExplorationTestsForArea`) to refresh live DOM snapshots for relevant pages before generating each test. The live snapshot supplements — does not replace — the exploration data. Exploration provides flow context (how pages connect, discovered navigation), while the live snapshot provides current DOM state (what's actually on the page right now).

Each generated test goes through the verify loop (same pattern as issue 043). Falls back to exploration-only data when Runner is unavailable.

## Acceptance criteria

- [x] `generateExplorationTests` refreshes live snapshot for each scenario's `relevant_page_urls` before AI generation
- [x] `generateExplorationTestsForArea` refreshes live snapshot for relevant pages per scenario
- [x] AI prompt includes both exploration flow context AND current live DOM
- [x] Live DOM snapshot is the primary source for locators; exploration data provides navigation/flow context
- [x] Verify loop runs on each generated test
- [x] Falls back to exploration-only data when `RUNNER_URL` is unset
- [x] Existing exploration generation tests updated to pass
- [x] New tests: generation with live refresh, generation with Runner unavailable (fallback), verify loop

## Blocked by

- 042 — Convex Snapshot Client + Action Cache

## Parent

- 027 — Hybrid test format — schema + AI generation (exploration test generation)

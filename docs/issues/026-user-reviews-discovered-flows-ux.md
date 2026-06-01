# 026 — User reviews discovered flows — exploration UX

**Type**: HITL — UI needs human design review
**Status**: done
**Blocked by**: 025

## What to build

Update the explore page UI to display discovered flows from the enriched exploration output. Users see flow cards with name, step count, pages involved, and complexity indicator. They select which flows to generate tests for. The existing scenario selection UI is enhanced to show flow-level context — what pages are involved, what the flow does, and estimated test complexity.

## Acceptance criteria

- [x] Explore page shows discovered flows as cards: name, step count, pages, complexity
- [x] Each flow card shows a brief description and the pages it traverses
- [x] User selects flows via checkboxes (same pattern as current scenario selection)
- [x] "Generate Tests from Selected" triggers test generation for selected flows
- [x] Flow context is passed to Test Generation Agent for richer test output
- [x] Screenshots from exploration displayed as thumbnails per flow
- [x] Existing scenario-based selection still works for backward compatibility
- [ ] HITL: Design review of the flow card layout and selection UX

## Implementation Summary

### Decomposed architecture
- `explore/types.ts` — shared types (`Scenario`, `CapturedPageWithUrl`, `DiscoveredFlow`, `SelectionMode`) and pure helpers (`matchScenariosToFlows`, `makeToggleHandler`, `toggleAll`, `flowDescription`, `complexityColor`)
- `explore/FlowCard.tsx` — flow card component with complexity badge, step count, auto-generated description, page thumbnails, and selectable checkbox
- `explore/ScenarioList.tsx` — scenario list with checkboxes, select all/deselect all
- `explore/page.tsx` — state orchestration and layout only (482 lines, down from 660 before decomposition)

### AI-tagged flow matching
- Analysis agent now tags each proposed scenario with `related_flows: string[]` (flow names it covers)
- `matchScenariosToFlows()` does exact name matching instead of fragile string `includes()` heuristic
- Falls back to all scenarios when no matches found

### Schema changes
- `discovered_flows` gained optional `description` field (backward compatible)
- `proposed_scenarios` gained optional `related_flows: string[]` field (backward compatible)
- `generateExplorationTests` action accepts optional `flow_context` string for richer test generation prompts

### Selection UX
- Two modes: Select Flows (default when flows exist) and Select Scenarios (toggle)
- Mode switch preserves both selections (no data loss)
- Generate button shows matched scenario count in flow mode
- Info banner shows "X flows selected — Y matching scenarios will be generated"
- Falls back to scenario-only view when no flows exist

### Tests
- `explore/explore.test.tsx` — 14 component tests covering flow cards, mode switching, selection, thumbnails, matched count
- `explore/types.test.tsx` — 6 unit tests for `matchScenariosToFlows` pure function
- All 108 frontend tests pass, all 245 Convex tests pass

## Blocked by

- 025 — Exploration output schema + flow discovery

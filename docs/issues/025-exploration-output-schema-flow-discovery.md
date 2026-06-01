# 025 — Exploration output schema + flow discovery

**Type**: AFK
**Status**: done
**Blocked by**: 024

## What to build

Update the `explorations` table schema to store the richer output from the Stagehand Smart Explorer. Replace flat `structure_text` with structured per-page semantic descriptions, interactive element inventories, and traced user flows as proper JSON data. Update Convex queries and mutations to handle the new shape. Update the Exploration Analysis Agent to read the richer structured data and propose test scenarios from traced flows instead of parsing raw DOM text.

## Acceptance criteria

- [x] `captured_pages` schema updated: each page has `semantic_description`, `interactive_elements` array, `screenshot_storage_id`
- [x] New `discovered_flows` field on explorations: array of `{name, steps, pages_involved, complexity}`
- [x] Convex queries updated to return structured exploration data
- [x] Exploration Analysis Agent reads structured flows and produces better scenario proposals
- [x] Backward compatible — old explorations with `structure_text` still readable
- [x] Convex tests for new schema shape and agent behavior

## Implementation Summary

### Schema changes
- `captured_pages` objects gained `semantic_description` (optional string) and `interactive_elements` (optional array of `{selector, description, element_type}`)
- New `discovered_flows` field on `explorations`: optional array of `{name, steps, pages_involved, complexity}`
- All new fields are optional — zero migration needed, backward compatible

### Runner changes
- `runner/src/types.ts`: Added `InteractiveElement`, `DiscoveredFlow` interfaces
- `runner/src/explorer.ts`: `visitPage()` now produces `semanticDescription` and `interactiveElements`; `capturePage()` stores them; `executeExploration()` builds `discovered_flows` via flow discovery
- `runner/src/flowDiscovery.ts`: New module — analyzes link graph to discover navigation flows with complexity classification
- `runner/src/convex-client.ts`: `completeExploration()` passes `discoveredFlows` to Convex

### Convex changes
- `convex/explorations/internal.ts`: `completeExplorationCapture` accepts new fields; `getExplorationForAnalysis` returns `discovered_flows`
- `convex/explorations/actions.ts`: `runnerCompleteExploration` accepts and passes new fields

### AI agent changes
- `convex/ai/agents.ts`: Updated `EXPLORATION_ANALYSIS_PROMPT` to reference structured data and flows
- `convex/ai/exploreApp.ts`: `analyzeExploration` and `generateExplorationTests` prefer `semantic_description` + `interactive_elements` over slicing `structure_text`; include `discovered_flows` in analysis prompt
- `convex/ai/healTest.ts`: Test healing context prefers structured data

### Frontend changes
- `src/app/(auth)/projects/[id]/explore/page.tsx`: Shows `semantic_description` and interactive element counts on page cards; displays discovered flows section with complexity badges

### Tests
- `runner/src/flowDiscovery.test.ts`: 9 unit tests for flow discovery algorithm
- `convex/explorations.test.ts`: 5 new tests for structured data storage, discovered_flows, and backward compatibility
- All 245 Convex tests pass, all 92 frontend tests pass

## Blocked by

- 024 — Stagehand Smart Explorer

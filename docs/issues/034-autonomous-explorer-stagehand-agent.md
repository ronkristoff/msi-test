# 034 — Autonomous Explorer (Level 2) — Stagehand `agent()`

**Type**: HITL — needs human to verify autonomous exploration against a real app
**Status**: needs-review
**Blocked by**: 024, 025

## What to build

Add an autonomous exploration mode alongside the scripted Smart Explorer. The user provides a goal (e.g., "explore this e-commerce app and find all testable user flows") and Stagehand's `agent()` decides what to click, where to navigate, and what to try. It discovers flows the scripted explorer would miss — hidden modals, error states, conditional UI. Output is the same format as Smart Explorer for seamless handoff to test generation. User can choose between scripted (Smart Explorer) and autonomous (Agent Explorer) when starting an exploration.

## Acceptance criteria

- [x] New exploration mode: "Autonomous" option alongside existing exploration trigger
- [x] User provides a goal in natural language when choosing autonomous mode
- [x] Stagehand `agent()` with `maxSteps` configurable explores the app autonomously
- [ ] Agent discovers flows the scripted explorer misses: hidden UI, error states, modals
- [x] Output format same as Smart Explorer: per-page semantics + traced flows
- [x] Progress messages streamed during autonomous exploration
- [x] Agent respects auth config (logs in before exploring)
- [x] Agent respects interactive opt-in (same safety model as Smart Explorer)
- [x] User can abort autonomous exploration mid-run
- [ ] HITL: Verified against a real app, compared with scripted explorer output

## Implementation notes

### Schema changes
- Added `exploration_mode: optional union("scripted" | "autonomous")` to explorations table (defaults to "scripted")
- Added `max_steps: optional number` to explorations table

### Convex changes
- `convex/explorations/mutations.ts`: `createExploration` accepts `exploration_mode` + `max_steps`; new `cancelExploration` mutation
- `convex/explorations/queries.ts`: `getPendingExplorations` returns `exploration_mode`, `max_steps`, `goal`
- `convex/explorations/actions.ts`: New `runnerGetExplorationStatus` action for abort polling
- `convex/explorations/internal.ts`: New `getExplorationStatus` internal query

### Runner changes
- `runner/src/types.ts`: Added `exploration_mode`, `max_steps`, `goal` to `ExplorationWorkItem`
- `runner/src/autonomous-explorer.ts`: New module — uses `stagehand.agent()` with `onStepFinish` callback to capture pages as agent explores
- `runner/src/explorer-auth.ts`: Extracted shared `handleFormLogin` + `captureScreenshot` from `explorer.ts`
- `runner/src/explorer.ts`: Now imports `handleFormLogin` from `explorer-auth.ts`
- `runner/src/convex-client.ts`: Added `getExplorationStatus` method
- `runner/src/index.ts`: Routes to `executeAutonomousExploration` vs `executeExploration` based on `exploration_mode`

### Frontend changes
- `src/app/(auth)/projects/[id]/explore/page.tsx`: Mode selector (Smart Explorer / Agent Explorer), maxSteps input (autonomous only), Cancel Exploration button, dynamic goal label

### Autonomous explorer architecture
- Auth handled same as scripted (form login via `act()` with variables, cookie injection)
- Agent instruction built from `goal` field or default thorough exploration prompt
- `onStepFinish` callback detects URL changes → captures page via `extract()`, screenshot, builds `CapturedPage`
- Cancel polling: every 5s checks exploration status via Convex, aborts agent if status is "failed"
- Post-completion: runs `discoverFlows()` on link graph + `extractFlowsFromActions()` from agent actions, deduplicates

### Tests
- `runner/src/autonomous-explorer.test.ts`: 11 tests for `buildInstruction`, `buildVariables`, `extractFlowsFromActions`
- `convex/explorations.test.ts`: 4 new tests (cancelExploration auth rejection, cancel logic, exploration_mode/max_steps in pending query, default mode)
- `src/app/(auth)/projects/[id]/explore/explore.test.tsx`: 8 new tests (mode selector, maxSteps, cancel button, goal label, autonomous mode creation)
- All 260 Convex tests pass, 105 frontend tests pass, 70 runner tests pass (1 pre-existing integration test failure unrelated to changes)
- 0 lint errors

## Blocked by

- 024 — Stagehand Smart Explorer (foundation)
- 025 — Exploration output schema (output format)

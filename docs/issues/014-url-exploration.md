# 014 — URL Exploration Flow

**Type**: HITL — needs human to verify Runner exploration against a real app
**Status**: Implemented (pending HITL verification)
**Blocked by**: 005, 009 ✅

## What to build

Guided app exploration. Runner renders the target app URL with Playwright, captures DOM snapshots and screenshots per page (including SPA content after hydration), sends structure to Convex. Exploration Analysis Agent proposes testable scenarios. User selects scenarios and triggers test generation. Real-time progress indicator during exploration.

End-to-end: User navigates to `/projects/[id]/explore` → enters URL → Runner renders pages, captures structure → progress shown in real-time → Exploration Analysis Agent proposes testable scenarios (name, description, flow) → user selects scenarios → clicks "Generate Tests" → Test Generation Agent produces Playwright code → tests appear in auto-created suite.

## Acceptance criteria

- [x] `/projects/[id]/explore` page has URL input and "Start Exploration" button
- [x] Runner renders target app URL with Playwright, capturing SPA content after hydration
- [ ] DOM snapshots and screenshots captured from each visited page *(DOM snapshots captured; screenshots now captured as PNG and uploaded to Convex storage — `screenshot_storage_id` field added to schema, resolved to URLs via `getExploration` query, displayed as thumbnail grid on explore page)*
- [x] Real-time progress indicator shows which page is being rendered
- [x] Captured structure sent to Convex where Exploration Analysis Agent proposes testable scenarios
- [x] Proposed scenarios displayed as selectable cards: name, description, flow summary
- [x] User can select specific scenarios via checkboxes
- [x] "Generate Tests from Selected" button triggers Test Generation Agent for selected scenarios
- [x] Generated tests stored with `source_type: "url_exploration"`, status `draft`
- [x] Auto-creates a new Suite with descriptive name (e.g., "Exploration — May 24")
- [x] `exploreApp` Convex action manages the exploration flow with real-time progress mutations
- [x] Runner does not click or navigate autonomously — renders and captures only

## Blocked by

- 005 — AI Provider Module (Exploration Analysis Agent, Test Generation Agent)
- 009 — Runner Foundation & Test Execution (Runner process with Playwright)

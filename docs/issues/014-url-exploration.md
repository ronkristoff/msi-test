# 014 — URL Exploration Flow

**Type**: HITL — needs human to verify Runner exploration against a real app
**Blocked by**: 005, 009

## What to build

Guided app exploration. Runner renders the target app URL with Playwright, captures DOM snapshots and screenshots per page (including SPA content after hydration), sends structure to Convex. Exploration Analysis Agent proposes testable scenarios. User selects scenarios and triggers test generation. Real-time progress indicator during exploration.

End-to-end: User navigates to `/projects/[id]/explore` → enters URL → Runner renders pages, captures structure → progress shown in real-time → Exploration Analysis Agent proposes testable scenarios (name, description, flow) → user selects scenarios → clicks "Generate Tests" → Test Generation Agent produces Playwright code → tests appear in auto-created suite.

## Acceptance criteria

- [ ] `/projects/[id]/explore` page has URL input and "Start Exploration" button
- [ ] Runner renders target app URL with Playwright, capturing SPA content after hydration
- [ ] DOM snapshots and screenshots captured from each visited page
- [ ] Real-time progress indicator shows which page is being rendered
- [ ] Captured structure sent to Convex where Exploration Analysis Agent proposes testable scenarios
- [ ] Proposed scenarios displayed as selectable cards: name, description, flow summary
- [ ] User can select specific scenarios via checkboxes
- [ ] "Generate Tests from Selected" button triggers Test Generation Agent for selected scenarios
- [ ] Generated tests stored with `source_type: "url_exploration"`, status `draft`
- [ ] Auto-creates a new Suite with descriptive name (e.g., "Exploration — May 24")
- [ ] `exploreApp` Convex action manages the exploration flow with real-time progress mutations
- [ ] Runner does not click or navigate autonomously — renders and captures only

## Blocked by

- 005 — AI Provider Module (Exploration Analysis Agent, Test Generation Agent)
- 009 — Runner Foundation & Test Execution (Runner process with Playwright)

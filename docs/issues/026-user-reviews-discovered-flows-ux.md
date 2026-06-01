# 026 — User reviews discovered flows — exploration UX

**Type**: HITL — UI needs human design review
**Status**: needs-triage
**Blocked by**: 025

## What to build

Update the explore page UI to display discovered flows from the enriched exploration output. Users see flow cards with name, step count, pages involved, and complexity indicator. They select which flows to generate tests for. The existing scenario selection UI is enhanced to show flow-level context — what pages are involved, what the flow does, and estimated test complexity.

## Acceptance criteria

- [ ] Explore page shows discovered flows as cards: name, step count, pages, complexity
- [ ] Each flow card shows a brief description and the pages it traverses
- [ ] User selects flows via checkboxes (same pattern as current scenario selection)
- [ ] "Generate Tests from Selected" triggers test generation for selected flows
- [ ] Flow context is passed to Test Generation Agent for richer test output
- [ ] Screenshots from exploration displayed as thumbnails per flow
- [ ] Existing scenario-based selection still works for backward compatibility
- [ ] HITL: Design review of the flow card layout and selection UX

## Blocked by

- 025 — Exploration output schema + flow discovery

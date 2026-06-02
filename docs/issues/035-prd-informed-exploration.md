# 035 — PRD-informed exploration

**Type**: AFK
**Status**: ready-for-review
**Blocked by**: 034

## What to build

When a project has a PRD, pass PRD context to the Stagehand agent during exploration. The agent specifically looks for features the PRD describes and cross-references discovered pages against PRD requirements. Flags gaps: "PRD says there should be a tax withholding feature — couldn't find it." This makes exploration targeted rather than purely discovery-based. Works with both Smart Explorer and Autonomous Explorer modes.

## Acceptance criteria

- [x] PRD text passed as context to Stagehand agent during exploration
- [x] Agent specifically navigates to and verifies features described in the PRD
- [x] Exploration output includes PRD coverage report: which requirements were found, which weren't
- [x] Gaps flagged: "PRD mentions X feature — not found during exploration"
- [x] Works with both Smart Explorer and Autonomous Explorer modes
- [x] PRD is optional — exploration works without it (same as today)
- [x] PRD context doesn't replace discovery — agent still explores beyond PRD scope
- [x] Test: mock PRD text, verify agent targets described features

## Blocked by

- 034 — Autonomous Explorer (agent infrastructure)

# 035 — PRD-informed exploration

**Type**: AFK
**Status**: needs-triage
**Blocked by**: 034

## What to build

When a project has a PRD, pass PRD context to the Stagehand agent during exploration. The agent specifically looks for features the PRD describes and cross-references discovered pages against PRD requirements. Flags gaps: "PRD says there should be a tax withholding feature — couldn't find it." This makes exploration targeted rather than purely discovery-based. Works with both Smart Explorer and Autonomous Explorer modes.

## Acceptance criteria

- [ ] PRD text passed as context to Stagehand agent during exploration
- [ ] Agent specifically navigates to and verifies features described in the PRD
- [ ] Exploration output includes PRD coverage report: which requirements were found, which weren't
- [ ] Gaps flagged: "PRD mentions X feature — not found during exploration"
- [ ] Works with both Smart Explorer and Autonomous Explorer modes
- [ ] PRD is optional — exploration works without it (same as today)
- [ ] PRD context doesn't replace discovery — agent still explores beyond PRD scope
- [ ] Test: mock PRD text, verify agent targets described features

## Blocked by

- 034 — Autonomous Explorer (agent infrastructure)

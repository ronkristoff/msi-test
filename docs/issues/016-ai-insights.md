# 016 — AI Insights Page

**Type**: AFK
**Blocked by**: 010
**Status**: Done

## What to build

Consolidated view of all AI-detected issues across runs. Each insight shows severity, frequency, root cause summary, and links to the related test failure. Sorted by severity/frequency so developers can prioritize fixes.

End-to-end: `/insights` page → `getAIInsights` query returns all insights for workspace → list grouped by issue pattern → each card shows severity, frequency count, root cause text, confidence → click navigates to the related run detail / test failure.

## Acceptance criteria

- [x] `/insights` page displays consolidated list of all AI insights for the workspace
- [x] Each insight card shows: severity level, frequency (how many runs this issue appeared in), root cause summary, confidence score
- [x] Insights sorted by severity and frequency (most critical first)
- [x] Click an insight navigates to the related test failure in run detail (`/runs/[id]`)
- [x] Filter by insight type: root_cause, flakiness_cluster
- [x] `getAIInsights` query returns insights scoped to workspace, sorted by recency and severity

## Blocked by

- 010 — Run Aggregation & Failure Analysis (AI insights data)

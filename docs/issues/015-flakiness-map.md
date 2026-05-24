# 015 — Flakiness Map Page

**Type**: AFK
**Blocked by**: 009, 010

## What to build

Flakiness heatmap showing test stability over time. Grid of tests vs runs with 5-step color scale (stable → critical). Filter to show only flaky or only stable tests. Flakiness percentage per test. AI analysis identifying root-cause clusters of flaky tests. Click a test row for detail panel with trend sparkline. CSV export.

End-to-end: `/flakiness-map` page → `getFlakinessMap` query computes per-test flakiness scores across last N runs → heatmap grid renders with color coding → click row opens detail panel → AI cluster analysis highlights systemic issues → CSV export downloads data.

## Acceptance criteria

- [ ] `/flakiness-map` page displays a heatmap grid: rows are tests, columns are runs
- [ ] Cells color-coded with 5-step scale: stable (green) → critical (red) based on flakiness
- [ ] Flakiness percentage shown per test row
- [ ] Filter toggle: show only flaky tests, only stable tests, or all
- [ ] AI flakiness cluster analysis identifies groups of tests that fail together (shared root cause)
- [ ] Cluster analysis displayed as annotations or grouped sections on the heatmap
- [ ] Click a test row to open a detail panel with: test name, flakiness trend sparkline, recent run history
- [ ] "Export CSV" button downloads flakiness data as a CSV file
- [ ] `getFlakinessMap` query computes flakiness scores from run history efficiently

## Blocked by

- 009 — Runner Foundation & Test Execution (run history data)
- 010 — Run Aggregation & Failure Analysis (AI insights for cluster analysis)

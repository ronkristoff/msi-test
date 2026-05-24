# 011 — Dashboard Page

**Type**: AFK
**Blocked by**: 009, 010

## What to build

The main dashboard showing test health at a glance. Overall pass rate percentage, failed/flaky/total counts with trend arrows, pass rate trend chart over last 20 runs, recent failure cards with AI root cause analysis and suggested fixes, and currently running tests with live progress bars.

End-to-end: `/dashboard` page loads → `getDashboardStats` query computes aggregates → trend chart renders last 20 runs → recent failure cards show AI insights from `ai_insights` table → active runs show live progress via Convex subscriptions → all updates in real-time.

## Acceptance criteria

- [ ] `/dashboard` page displays overall pass rate as a percentage
- [ ] Failed, flaky, and total test counts shown with trend arrows (up/down compared to previous period)
- [ ] Pass rate trend chart visualizes last 20 runs on a line/bar chart
- [ ] Recent failure cards show: test name, error summary, AI root cause analysis, suggested fix, confidence score
- [ ] Active runs section shows currently running tests with live progress bars (test name, step progress)
- [ ] All dashboard data updates in real-time via Convex subscriptions (no manual refresh needed)
- [ ] `getDashboardStats` query computes all aggregates efficiently
- [ ] Dashboard loads scoped to current workspace

## Blocked by

- 009 — Runner Foundation & Test Execution (run data for stats)
- 010 — Run Aggregation & Failure Analysis (AI insights for failure cards)

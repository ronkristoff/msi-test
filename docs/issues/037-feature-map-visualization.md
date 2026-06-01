# 037 — Feature Map Visualization (PRD → Visual Graph)

**Type**: AFK
**Status**: needs-triage
**Blocked by**: 025

## What to build

Replace the flat checkbox list of proposed scenarios on the Explore page with an interactive feature/use-case graph. Top-level nodes are areas (e.g. "Auth", "Checkout", "Dashboard") discovered from exploration. Child nodes are individual testable scenarios under each area. Users select scenarios by clicking nodes. Coverage gaps are immediately visible — areas with no proposed scenarios appear as empty branches. The graph makes it obvious what the AI found and what it missed.

Uses the structured `discovered_flows` and `proposed_scenarios` data from issue 025. The existing `area` field on each scenario provides the grouping. No new schema tables needed.

## Acceptance criteria

- [ ] New `<FeatureMapGraph>` component renders an interactive tree where top-level nodes are areas and children are scenarios
- [ ] Each scenario node shows: name, description (truncated), status indicator (selected/unselected)
- [ ] Area nodes show a count badge of selected/total scenarios
- [ ] Clicking a scenario node toggles selection (same as checkbox behavior today)
- [ ] Visual coverage indicators: blue border = selected for generation, gray = unselected, green = area fully covered
- [ ] Empty area branches (areas with zero proposed scenarios) are visible with a "No scenarios found" label — coverage gaps are immediately obvious
- [ ] Graph replaces the flat scenario list on `/projects/[id]/explore` when `proposed_scenarios` data is available
- [ ] Flat scenario list remains as a collapsible "List View" fallback toggle below the graph
- [ ] "Generate Tests from Selected (N)" button and "New Exploration" button remain functional below the graph
- [ ] Graph uses a lightweight library (reactflow or custom SVG tree) — no heavy D3 dependency
- [ ] Responsive: collapses to stacked area cards on narrow screens (<768px)
- [ ] Captured pages screenshot grid remains above the graph as it exists today

## Blocked by

- 025 — Exploration output schema + flow discovery (provides structured discovered_flows data)

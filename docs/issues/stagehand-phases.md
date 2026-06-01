# Stagehand Integration Roadmap

This document consolidates the Stagehand integration into phases, showing the dependency chain and ordering across all 15 issues (022–036).

---

## Phase 1 — Foundation (022, 023)

Install Stagehand, wire BYOK config, and add test data/auth configuration to projects.

```
022 — Stagehand install + BYOK wiring
  └── 023 — Test data & auth config on projects
```

**Goal:** Stagehand is installed and can launch a browser using the workspace's AI provider. Projects can store auth credentials and test data for use during exploration and execution.

---

## Phase 2 — Smart Exploration (024, 025, 026, 034, 035)

Replace the MVP's static render-and-capture with Stagehand-powered autonomous exploration.

```
024 — Stagehand Smart Explorer
  ├── 025 — Exploration output schema + flow discovery
  │     └── 026 — User reviews discovered flows UX
  ├── 034 — Autonomous explorer (Stagehand agent)
  └── 035 — PRD-informed exploration
```

**Goal:** Exploration discovers interactive flows (behind login, multi-step forms, SPAs). The AI proposes scenarios from real user journeys, not just static DOM. Users review a feature map and select what to test.

---

## Phase 3 — Hybrid Test Format & Execution (027, 028)

Introduce the NL+code hybrid test format and execute it with Stagehand.

```
025 (from Phase 2)
  └── 027 — Hybrid test format + AI generation
        └── 028 — Stagehand test executor
```

**Goal:** Tests can be stored as natural language instructions + optional code assertions. Stagehand executes the NL steps, making tests self-healing by default. Pure Playwright tests continue to work unchanged.

---

## Phase 4 — Self-Healing (029, 030, 031)

Build the auto-heal loop: detect failures, repair tests, persist knowledge.

```
028 (from Phase 3)
  ├── 029 — Auto-heal with confidence threshold
  │     └── 030 — Learned healing persists across runs
  └── 031 — Cached login flows
```

**Goal:** Failed tests are automatically repaired. High-confidence fixes are auto-applied; low-confidence fixes queue for human review. Healing knowledge accumulates over time, preventing repeat failures.

---

## Phase 5 — Polish & Optimization (032, 033, 036)

Clean up the browser infrastructure, add model override settings, and add lightweight server-side tasks.

```
022 (from Phase 1)
  ├── 032 — Browser AI model override settings
  └── 033 — Remove browser-api / browser-sessions (cleanup)
  └── 036 — Convex-Stagehand component for lightweight tasks
```

**Goal:** The system is clean — no deprecated browser API code. Users can override the AI model for browser-specific tasks. Quick checks (URL reachability, page change detection) run server-side without the Runner.

---

## Full Dependency Graph

```
022 ─┬─► 023
     ├─► 024 ─┬─► 025 ─┬─► 026
     │         ├─► 034   └─► 027 ──► 028 ─┬─► 029 ──► 030
     │         └─► 035                      └─► 031
     ├─► 032
     ├─► 033
     └─► 036
```

## New Features (Independent of Stagehand Chain)

These issues extend the platform but are not blocked by the Stagehand integration:

- **037** — Feature Map Visualization (blocked by 025 only)
- **038** — Scheduled Monitoring (blocked by 009, independent of Stagehand)
- **039** — Test Lists (blocked by 004 + 009, independent of Stagehand)
- **040** — NL Chat Refinement (blocked by 005 + 004, independent of Stagehand)

## Long-Term Vision

See `docs/issues/stagehand-phase3-vision.md` for Phase 3+ items not yet broken into issues: recording/playback, Coolify containers, managed AI, visual regression, multi-model orchestration, and test suite optimization.

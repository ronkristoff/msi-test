# 034 — Autonomous Explorer (Level 2) — Stagehand `agent()`

**Type**: HITL — needs human to verify autonomous exploration against a real app
**Status**: needs-triage
**Blocked by**: 024, 025

## What to build

Add an autonomous exploration mode alongside the scripted Smart Explorer. The user provides a goal (e.g., "explore this e-commerce app and find all testable user flows") and Stagehand's `agent()` decides what to click, where to navigate, and what to try. It discovers flows the scripted explorer would miss — hidden modals, error states, conditional UI. Output is the same format as Smart Explorer for seamless handoff to test generation. User can choose between scripted (Smart Explorer) and autonomous (Agent Explorer) when starting an exploration.

## Acceptance criteria

- [ ] New exploration mode: "Autonomous" option alongside existing exploration trigger
- [ ] User provides a goal in natural language when choosing autonomous mode
- [ ] Stagehand `agent()` with `maxSteps` configurable explores the app autonomously
- [ ] Agent discovers flows the scripted explorer misses: hidden UI, error states, modals
- [ ] Output format same as Smart Explorer: per-page semantics + traced flows
- [ ] Progress messages streamed during autonomous exploration
- [ ] Agent respects auth config (logs in before exploring)
- [ ] Agent respects interactive opt-in (same safety model as Smart Explorer)
- [ ] User can abort autonomous exploration mid-run
- [ ] HITL: Verified against a real app, compared with scripted explorer output

## Blocked by

- 024 — Stagehand Smart Explorer (foundation)
- 025 — Exploration output schema (output format)

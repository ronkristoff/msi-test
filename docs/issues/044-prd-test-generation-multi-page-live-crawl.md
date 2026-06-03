# 044 — PRD Test Generation with Multi-Page Live Crawl

**Type**: AFK
**Status**: ready-for-human

## What to build

Rewrite PRD test generation (`generatePrdTests`) as a durable workflow. Before AI generation, extract URLs from the PRD text (absolute URLs and relative paths), then snapshot each discovered URL plus the project's `app_url` and login page. All snapshots are included in the AI prompt so the agent sees the real DOM for every page the PRD describes. The same verify-then-generate loop from issue 043 applies to each generated test.

Falls back to current behavior (PRD-only context, no verify) when Runner is unavailable.

## Acceptance criteria

- [x] `generatePrdTests` triggers a durable workflow
- [x] Workflow extracts URLs from PRD text using `extractUrlsFromText()` (issue 042)
- [x] Workflow snapshots all discovered URLs + `app_url` + login page in parallel (respecting rate limits)
- [x] AI prompt includes multi-page live DOM context tagged by page URL
- [x] Verify loop runs on each generated test (same pattern as issue 043)
- [x] Falls back to current behavior when `RUNNER_URL` is unset
- [x] Suite progress shows workflow step during generation
- [x] Tests: URL extraction from PRD text, multi-page snapshot, verify loop, fallback without Runner

## Blocked by

- ~~042 — Convex Snapshot Client + Action Cache~~ (done)

## Parent

- 007 — PRD-Based Test Generation (original feature)

## Implementation

- `convex/ai/prdWorkflow.ts` — durable workflow (URL extraction, multi-page snapshots, verify loop)
- `convex/ai/prdWorkflowActions.ts` — AI generation action with multi-page DOM context
- `convex/ai/generatePrdTests.ts` — thin action that starts the workflow
- `convex/ai/workflowShared.ts` — shared helpers (buildSnapshotContext, buildRetryContext, runVerifyLoop, cancelSuiteGeneration)
- `convex/ai/prdWorkflow.test.ts` — 364 tests passing
- `convex/ai/agents.ts` — PRD prompt builders (buildPrdGenerationPrompt, buildPrdFormatRetryPrompt)

Note: Snapshots are fetched sequentially (Convex workflow steps are sequential checkpoints), not in parallel as originally spec'd. This aligns with the `@convex-dev/workflow` architecture where each step is a durability boundary.

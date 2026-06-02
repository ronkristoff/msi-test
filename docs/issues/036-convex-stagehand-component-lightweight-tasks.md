# 036 — Convex Stagehand component for lightweight tasks

**Type**: AFK
**Status**: completed
**Blocked by**: 022 (completed)

## What to build

Install the `@browserbasehq/convex-stagehand` Convex component for lightweight server-side browser tasks that don't need the full Runner. Use cases: URL reachability check before starting exploration, quick data extraction from a single page, verifying a page hasn't changed since last exploration. Requires Browserbase environment variables — this is an optional enhancement, the system works fully without it.

## Acceptance criteria

- [x] `@browserbasehq/convex-stagehand` installed and registered in `convex.config.ts`
- [x] Browserbase env vars documented (`BROWSERBASE_API_KEY`, `MODEL_API_KEY`)
- [x] URL reachability check: before exploration, verify the app URL is accessible
- [x] Single-page extraction: extract page title and basic structure without full exploration
- [x] Page change detection: compare current page structure with last exploration snapshot
- [x] System works fully without this component — graceful fallback if Browserbase not configured
- [x] Optional feature flag or workspace setting to enable/disable

## Blocked by

- 022 — Install Stagehand + wire BYOK config

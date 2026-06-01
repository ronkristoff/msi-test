# 036 — Convex Stagehand component for lightweight tasks

**Type**: AFK
**Status**: needs-triage
**Blocked by**: 022

## What to build

Install the `@browserbasehq/convex-stagehand` Convex component for lightweight server-side browser tasks that don't need the full Runner. Use cases: URL reachability check before starting exploration, quick data extraction from a single page, verifying a page hasn't changed since last exploration. Requires Browserbase environment variables — this is an optional enhancement, the system works fully without it.

## Acceptance criteria

- [ ] `@browserbasehq/convex-stagehand` installed and registered in `convex.config.ts`
- [ ] Browserbase env vars documented (`BROWSERBASE_API_KEY`, `MODEL_API_KEY`)
- [ ] URL reachability check: before exploration, verify the app URL is accessible
- [ ] Single-page extraction: extract page title and basic structure without full exploration
- [ ] Page change detection: compare current page structure with last exploration snapshot
- [ ] System works fully without this component — graceful fallback if Browserbase not configured
- [ ] Optional feature flag or workspace setting to enable/disable

## Blocked by

- 022 — Install Stagehand + wire BYOK config

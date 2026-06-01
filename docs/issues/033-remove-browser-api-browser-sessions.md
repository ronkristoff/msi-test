# 033 — Remove browser-api and browser-sessions

**Type**: AFK
**Status**: needs-triage
**Blocked by**: 024

## What to build

Stagehand replaces all browser session management. Delete `runner/src/browser-sessions.ts` (persistent session manager), `runner/src/browser-api.ts` (HTTP API server), and `convex/ai/browserClient.ts` (Convex-side HTTP client). Clean up any imports, routes, or references. Update or remove related tests. The Runner no longer exposes an HTTP API for browser control — Stagehand handles everything.

## Acceptance criteria

- [ ] `runner/src/browser-sessions.ts` deleted
- [ ] `runner/src/browser-api.ts` deleted
- [ ] `convex/ai/browserClient.ts` deleted
- [ ] All imports and references to deleted files cleaned up
- [ ] Runner no longer starts an HTTP server for browser control
- [ ] Related tests (`browser-api.test.ts`, `browser-sessions.test.ts`) removed or replaced
- [ ] No dead code remaining in Runner or Convex referencing the old browser API

## Blocked by

- 024 — Stagehand Smart Explorer (proves Stagehand replaces the old browser management)

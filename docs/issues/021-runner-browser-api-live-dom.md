# 021 — Runner Browser API for Live DOM Context

**Status**: needs-triage
**Type**: Feature
**Depends on**: 020 (AI generation actions, heal/regenerate actions, runner infrastructure)

## Problem Statement

AI test generation and healing are "blind" — the AI writes Playwright code without ever seeing the actual page. It guesses locators from stale exploration data, PRD text, or error messages. This produces tests that fail on first run (wrong selectors, missing elements, fabricated text) and heal attempts that swap one broken selector for another.

A QA engineer generates tests from a PRD. The AI invents `page.getByRole('button', { name: 'Submit Order' })` because the PRD mentions submitting orders. The actual button says "Place Order". First run fails. The healer sees a TimeoutError, gets the same stale PRD, and changes the timeout — still wrong. Three more heal cycles before it works (or the user gives up and writes the test manually).

## Solution

Give the AI live DOM context by adding an HTTP API to the Runner that exposes Playwright's browser automation. When the AI needs to generate or heal a test, Convex actions call the Runner to navigate to the target page, capture an AI-optimized accessibility snapshot (using Playwright 1.60's `page.ariaSnapshot({ mode: 'ai' })`), and return the live DOM state with element references. The AI then writes or fixes tests against verified elements that actually exist on the page.

The Runner already manages browsers for test execution and exploration. This PRD extends it to serve as a persistent browser context server for AI operations — reusing auth sessions, caching page state, and cleaning up idle contexts automatically.

## User Stories

### Test Generation with Live DOM

1. As a QA engineer, I want AI-generated tests to use correct locators from the start, so that tests pass on first run more often
2. As a QA engineer, I want the AI to see the actual elements on the page when generating tests from a PRD, so that it doesn't invent selectors or text that don't exist
3. As a QA engineer, I want the AI to see the actual elements on the page when generating tests from natural language, so that locators match the real DOM
4. As a QA engineer, I want the AI to see authenticated pages when generating tests, so that it can write tests for protected routes without guessing login flows
5. As a QA engineer, I want generated tests to use the correct text values from the page (button labels, headings, form fields), so that assertions match reality
6. As a QA engineer, I want the AI to know which elements don't exist on the page, so that it doesn't generate tests for features that aren't built yet

### AI Heal with Live DOM

7. As a QA engineer, I want the AI healer to see the current page state when fixing a failing test, so that it can identify the real cause of the failure
8. As a QA engineer, I want the healer to see the actual DOM after authentication, so that it can fix tests that fail because of auth-related page state
9. As a QA engineer, I want the healer to fix locator drift (element text/role changed), so that it uses the current value instead of the old one
10. As a QA engineer, I want the healer to correctly fix timeout errors by seeing what's actually on the page, so that it doesn't just increase timeouts blindly
11. As a QA engineer, I want the healer to fix tests in fewer attempts, so that I spend less time reviewing healed code
12. As a QA engineer, I want the healer to distinguish between "element doesn't exist" and "page didn't load", so that it applies the right fix

### Runner Browser API

13. As the system, I want the Runner to expose an authenticated HTTP API for browser operations, so that Convex actions can request live DOM context on demand
14. As the system, I want the Runner to maintain per-project browser sessions, so that auth state is preserved across multiple AI operations for the same project
15. As the system, I want the Runner to automatically close idle browser sessions, so that browser resources don't leak over time
16. As the system, I want the Runner Browser API to be optional, so that existing deployments without a reachable Runner URL continue to work (falling back to stale exploration data)
17. As the system, I want the Runner to handle concurrent requests from different projects, so that multiple AI operations can run in parallel without interference
18. As the system, I want the Runner to reuse the same browser instance for all sessions, so that Chromium launch overhead is minimized

### Reliability and Fallback

19. As a QA engineer, I want test generation and healing to still work when the Runner is unavailable, so that I'm not blocked by infrastructure issues
20. As a QA engineer, I want the system to automatically retry Runner connections, so that transient network issues don't fail my generation or heal operation
21. As the system, I want the Convex action to time out gracefully when the Runner is slow, so that AI operations don't hang indefinitely

## Implementation Decisions

### Architecture

The Runner gains an HTTP API server (using Node's built-in `http` module — no new dependencies). Convex actions call this API via `fetch()` to get live DOM context before AI generation or healing. The API is authenticated with the existing `RUNNER_SECRET`.

This follows the existing pattern from ADR-0001 and ADR-0002: the Runner is a separate process that communicates with Convex. ADR-0002 chose outbound-only connections (Convex subscriptions). This PRD adds an inbound HTTP API to the Runner — a new communication direction. The Runner already runs as a long-lived process, so adding an HTTP listener is natural. The Runner still doesn't need a public URL for test execution dispatch (that stays via Convex subscriptions). The Browser API HTTP listener only needs to be reachable from the Convex action's server-side Node.js environment.

### No `@playwright/mcp` Dependency

This PRD deliberately avoids using the `@playwright/mcp` package. Playwright 1.60 (already installed) includes `page.ariaSnapshot({ mode: 'ai' })` which produces the same ref-tagged accessibility tree that MCP's `browser_snapshot` returns. Using the native Playwright API directly gives full control over browser lifecycle, session management, and concurrency without the MCP protocol layer.

### Deep Modules

1. **Runner Browser API** (`runner/src/browser-api.ts`) — HTTP server with endpoints for browser operations. Encapsulates HTTP routing, request parsing, response formatting, and authentication. All browser interaction details are hidden behind this API.

2. **Browser Session Manager** (`runner/src/browser-sessions.ts`) — Manages per-project browser contexts with auth state caching and auto-expiry. Encapsulates Chromium launch, context creation, page lifecycle, and inactivity cleanup. The Browser API calls into this module and never touches Playwright directly.

3. **Convex Browser Client** (`convex/ai/browserClient.ts`) — HTTP client for Convex actions to call the Runner Browser API. Encapsulates URL construction, auth headers, error handling, timeout management, and null-fallback when Runner is unavailable. AI actions call this client and receive structured snapshot data or null.

### Shallow Changes

4. **Heal with Live DOM** — Modified `convex/ai/healTest.ts` and `convex/ai/regenerateTest.ts` call `browserClient.getLiveSnapshot()` before AI generation. Parse target URL from failing test code, navigate, get snapshot, include in prompt. Falls back to stale exploration data when Runner is unavailable.

5. **Generation with Live DOM** — Modified `convex/ai/generateNlTests.ts` and `convex/ai/generateExplorationTests.ts` call `browserClient.getLiveSnapshot()` to capture the target page state before generating tests. Falls back to existing behavior (exploration data, PRD context) when Runner is unavailable.

6. **Runner Bootstrap** — Modified `runner/src/index.ts` starts the Browser API HTTP server alongside the existing polling loop.

### Browser Session Manager Interface

The session manager maintains a map of `project_id → BrowserSession` where each session has:
- A `BrowserContext` (isolated cookies, localStorage, service workers)
- An active `Page`
- A `lastActivity` timestamp
- An `authed` boolean (whether login has been performed)

Sessions are created on first request for a project and reused for subsequent requests. Auth is performed once per session (form login or cookie injection using the project's `explore_auth_mode` configuration). Sessions auto-close after 10 minutes of inactivity via a periodic sweep.

### Browser API Endpoints

All endpoints require `Authorization: Bearer <RUNNER_SECRET>` header.

- `POST /browser/navigate` — `{ project_id, url }` → navigates the project's browser session to the URL, performs auth if needed, returns `{ snapshot, url, title }`
- `POST /browser/snapshot` — `{ project_id }` → returns current page's AI-optimized aria snapshot
- `POST /browser/login` — `{ project_id }` → performs login flow for the project (form or cookie auth), returns success/failure
- `POST /browser/context/close` — `{ project_id }` → closes the project's browser session, releasing resources

The `/browser/navigate` endpoint is the primary entry point — it handles session creation, auth, navigation, and snapshot capture in one call. The other endpoints exist for finer-grained control when needed.

### Snapshot Format

Using Playwright 1.60's `page.ariaSnapshot({ mode: 'ai' })` which returns a compact accessibility tree with element refs:

```
- heading "Dashboard" [level=1]
- navigation:
  - link "Projects" [ref=e3]
  - link "Settings" [ref=e4]
- button "New Project" [ref=e5]
- textbox "Search projects..." [ref=e6]
- table:
  - row: "My App — https://myapp.com"
  - row: "Store — https://store.example.com"
```

This is ~200-400 tokens per snapshot (vs. thousands for raw DOM/HTML). Element refs (`e3`, `e5`) enable deterministic interaction. The AI consumes this directly in its prompt.

### Configuration

New environment variables:
- `RUNNER_API_PORT` — port for the Browser API HTTP server (default: `8931`)
- `RUNNER_URL` — set in Convex's environment to tell actions where the Runner API is reachable (e.g., `http://localhost:8931`). If not set, live DOM features are disabled and all actions fall back to current behavior.

No schema changes required — the Runner reuses the project's existing auth configuration fields (`explore_auth_mode`, `explore_username`, `explore_password`, etc.).

### Fallback Behavior

When `RUNNER_URL` is not configured or the Runner is unreachable:
- `healTest` uses stale exploration data (current behavior)
- `generateNlTests` uses PRD context (current behavior)
- `generateExplorationTests` uses exploration snapshots (current behavior)
- No errors are thrown — the system silently degrades

This makes the feature opt-in for existing deployments. Setting `RUNNER_URL` in Convex's environment activates live DOM context.

### Concurrency

The Runner handles one browser operation at a time per project (serial within a session). Different projects can be served in parallel (separate browser contexts). The Browser API queues concurrent requests for the same project.

### Contradiction with ADR-0002

ADR-0002 states the Runner "only makes outbound connections to Convex — no public URL, no ingress, no tunneling." This PRD adds an inbound HTTP API to the Runner, which technically requires ingress. However:
- The Runner API only needs to be reachable from Convex actions (same machine or same network in dev)
- For production, the Runner would need a reachable URL (tunnel, internal DNS, or container networking)
- Test execution dispatch still uses Convex subscriptions (ADR-0002 unchanged)
- The Browser API is a separate, optional channel — the Runner works without it

## Testing Decisions

### What makes a good test

Test external behavior, not implementation details. Assert on HTTP responses, session state transitions, and snapshot output. Mock Playwright where needed for unit tests. Integration tests use a real Chromium instance.

### Modules to test

**Browser Session Manager (unit)**
- Creates session on first request for a project
- Reuses session on subsequent requests for the same project
- Creates separate sessions for different projects
- Closes sessions after inactivity threshold
- Reports authed/not-authed state correctly
- Prior art: `convex/locking.test.ts` (similar state management patterns)

**Convex Browser Client (unit)**
- Returns snapshot when Runner is available and responds successfully
- Returns null when Runner URL is not configured
- Returns null when Runner is unreachable (network error)
- Returns null when Runner returns an error status
- Sends correct auth header
- Times out gracefully on slow Runner
- Prior art: `convex/ai/generateNlTests.test.ts` (testing action behavior with mocked dependencies)

**Browser API Endpoints (integration)**
- `/browser/navigate` returns valid snapshot with element refs
- `/browser/navigate` handles auth for form-based projects
- `/browser/navigate` handles auth for cookie-based projects
- `/browser/navigate` creates session if none exists
- Rejects requests without valid auth header
- Returns meaningful error for unreachable URLs
- Prior art: `runner/integration.test.ts` (existing runner integration test)

**Heal with Live DOM (integration)**
- Healer includes live snapshot in prompt when Runner is available
- Healer falls back to exploration data when Runner is unavailable
- Healer extracts correct target URL from failing test code
- Prior art: `convex/ai/healTest.test.ts` (when it exists)

## Out of Scope

- Replacing the existing explorer with Browser API-based exploration (separate PRD)
- Generation from PRD with live DOM (`generatePrdTests`) — can be added later following the same pattern as NL and heal
- Browser API authentication beyond `RUNNER_SECRET` (no per-user auth)
- Screenshots via the Browser API (snapshots are sufficient for AI)
- Browser API rate limiting (Runner handles one request per project at a time)
- Production deployment strategy for Runner API (tunneling, DNS, container networking)
- Visual regression testing using the Browser API
- Multi-step flow recording (navigate → interact → capture at each step) — future enhancement

## Further Notes

- This PRD introduces a new communication direction in the Runner architecture (inbound HTTP alongside outbound Convex subscriptions). This is the first step toward the Runner being a full browser automation server, not just a test executor.
- The `page.ariaSnapshot({ mode: 'ai' })` API was added in Playwright 1.59. We are on 1.60. No dependency upgrades needed.
- The Browser API reuses the project's existing auth configuration (`explore_auth_mode`, `explore_username`, `explore_password`). No new configuration UI is needed.
- Live DOM context is most impactful for healing (immediate quality improvement) and NL generation (user sees correct tests). PRD generation benefits less because the PRD itself is the primary context — but locator quality still improves.
- Future work could add multi-step navigation (navigate → click → snapshot → click → snapshot) to generate tests for multi-page flows. This PRD focuses on single-page snapshots as the foundation.

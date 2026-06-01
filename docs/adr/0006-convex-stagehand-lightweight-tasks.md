# ADR 0006: Convex-Stagehand Component for Lightweight Server-Side Browser Tasks

## Status

Accepted

## Context

The Runner (ADR 0001) handles all browser tasks today — exploration, test execution, and any Playwright interaction. This works but has downsides for small, quick browser operations:

1. **Latency** — the Runner polls for pending work on a 2-second interval. Quick checks (is this URL reachable?) take at least 2 seconds to even start.
2. **Resource cost** — the Runner is a long-lived Node.js process. Quick one-off browser tasks (fetch a page title, verify a URL) don't justify keeping a full Runner instance running.
3. **No lightweight path** — every browser operation, no matter how simple, goes through the full Runner pipeline (claim run, write config, execute, stream results, heartbeat).

`@browserbasehq/convex-stagehand` is a Convex component that runs Stagehand directly inside Convex actions. It uses Browserbase's cloud browser infrastructure — no local Chromium needed. Actions can perform quick browser operations (navigate, extract, interact) without the Runner.

Alternatives considered:
- **Route everything through the Runner** — keep the single execution path. Simple but over-engineered for quick checks.
- **Spin up ephemeral Runner instances** — container-per-task (planned for Coolify in Phase 3). Heavy for a 2-second URL check.
- **Use fetch() for URL checks** — works for reachability but cannot render JavaScript, capture screenshots, or interact with the page.

## Decision

Install the `@browserbasehq/convex-stagehand` component for lightweight server-side browser tasks that don't need the full Runner. Three use cases:

1. **URL reachability check** — before starting a full exploration, verify the app URL returns a loadable page. Fail fast if the URL is unreachable.
2. **Single-page extraction** — extract page title and basic structure from a single URL without a full exploration cycle. Useful for project creation and quick previews.
3. **Page change detection** — compare current page structure with the last exploration snapshot to determine if re-exploration is needed.

This is an **optional enhancement**. The system works fully without Browserbase configured. If the environment variables are missing, these features are skipped with graceful fallback.

## Consequences

- Quick browser tasks (sub-5-second operations) execute instantly in Convex actions instead of waiting for Runner polling.
- No Runner process needed for lightweight checks — reduces operational overhead.
- Requires Browserbase account and API key (`BROWSERBASE_API_KEY`, `MODEL_API_KEY` environment variables).
- Feature flag or workspace setting controls whether these capabilities are active.
- Full exploration and test execution still go through the Runner — this component only handles quick, targeted operations.
- Added dependency on `@browserbasehq/convex-stagehand` and Browserbase infrastructure.
- Cost: Browserbase charges per browser session. Lightweight tasks should be metered to avoid surprise bills.

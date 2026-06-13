# Architecture — Runner (Playwright)

## Executive Summary

The Runner is a **stateless Node.js process** that acts as the Playwright execution engine. It subscribes to Convex for pending work, executes tests (Playwright or Stagehand), explores apps, and writes results back. It also serves a local HTTP API for Convex AI actions to access live browser state.

## Technology Stack

| Category | Technology | Version |
|---|---|---|
| Runtime | Node.js (via tsx) | — |
| Language | TypeScript | 5.x |
| Browser Engine | Playwright | 1.60.0 |
| AI Browser Agent | Stagehand | 3.4.0 |
| Backend Client | Convex (ConvexHttpClient) | 1.39.1 |
| Testing | vitest | 4.1.7 |

## Architecture Pattern

**Poll-Based Worker.** Single-threaded event loop:
- Poll Convex every 2s for pending work
- Process one work item at a time (sequential execution)
- Send heartbeats every 30s during active runs
- Serve HTTP API on a separate port for Convex→Runner communication

## Execution Modes

| Mode | File | Description |
|---|---|---|
| **Playwright** | `executor.ts` | Spawn `npx playwright test`, collect results + artifacts |
| **Stagehand** | `stagehand-executor.ts` | AI-powered browser agent with self-healing |
| **Discovery** | `link-crawler.ts` | Crawl pages, extract links, detect flows |
| **Autonomous Explorer** | `autonomous-explorer.ts` | AI explores app without scripts |
| **Scripted Explorer** | `explorer.ts` | Structured exploration with PRD guidance |
| **Feedback Discovery** | `feedback-discovery.ts` | Detect UI feedback states |

## Snapshot API

Local HTTP server on port 8931 (127.0.0.1 only):

| Endpoint | Purpose |
|---|---|
| `POST /snapshot` | Capture page structure (ARIA snapshot, interactive elements) |
| `POST /validate-test` | Run Playwright test snippet for validation |
| `POST /discover-feedback` | Interact and discover feedback messages |

## Convex Contract

The Runner calls 17 Convex functions:
- **2 queries** (no auth): `getPendingWork`, `getPendingExplorations`
- **15 actions** (RUNNER_SECRET auth): claim/write/complete/heartbeat for runs and explorations, plus file upload URL generation and AI config retrieval

See [API Contracts — Runner](./api-contracts-runner.md) for full contract.

## Data Models

Types are defined in `runner/src/types.ts`:
- `RunWorkItem`, `RunTestItem`, `TestStep` — work input
- `ExplorationWorkItem` — exploration work input
- `CapturedPage`, `DiscoveredPage`, `DiscoveredFlow` — exploration output
- `InteractiveElement`, `NavMenuItem`, `PrdCoverageItem` — page analysis

See [Data Models — Runner](./data-models-runner.md) for full type catalog.

## Lifecycle

```
Startup → Poll loop (2s) → Find work → Claim → Execute → Report → Cleanup → Poll...
                                  ↑                                    │
                                  └────────────────────────────────────┘
```

Graceful shutdown: SIGINT/SIGTERM → cancel/force-complete active work → exit.

## Testing Strategy

- **Runner**: vitest (separate config at `runner/vitest.config.ts`)
- **Test files**: `runner/**/*.test.ts`
- **Mock utilities**: `runner/src/test-utils/stagehand-mocks.ts` provides mock factories for client, page, and Stagehand contexts
- **Integration test**: `runner/integration.test.ts` tests real Playwright against a local HTTP server

# ADR 0001: Separate Test Execution Runner

## Status

Accepted

## Context

MSITest needs to execute Playwright E2E tests against real browsers. Convex is the primary backend (database, functions, real-time subscriptions), but Convex actions run in a serverless Node.js environment that cannot install or launch Chromium binaries, has limited filesystem access, and enforces timeouts.

The initial PRD stated "Playwright running locally on the server" and "runs server-side in a Convex action." These are in tension because Playwright requires a persistent browser process, disk access for screenshots/video/traces, and no hard timeout constraints.

## Decision

Test execution runs in a **separate Node.js process** (the "Runner") outside Convex. The Runner receives execution requests, runs Playwright with full filesystem access, and writes results back to Convex.

Convex remains the source of truth for all state. The Runner is a stateless execution engine.

## Consequences

- We must define a communication protocol between Convex and the Runner (request dispatch, result streaming, authentication).
- Deployment is now two processes instead of one (Convex handles itself; the Runner must be deployed and managed separately).
- The Runner can be containerized independently (Docker) when sandboxing is needed post-MVP.
- Convex actions trigger runs but delegate execution to the Runner.
- Screenshots, videos, and traces are written to disk by the Runner, then uploaded to Convex file storage.

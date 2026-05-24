# ADR 0002: Runner Uses Convex Subscriptions for Dispatch

## Status

Accepted

## Context

ADR 0001 established that the Runner is a separate Node.js process outside Convex. We need a communication protocol for: (1) dispatching execution requests from Convex to the Runner, and (2) streaming step results back from the Runner to Convex in real-time.

Alternatives considered:
- **Polling** — Runner queries Convex on an interval. Simple but adds latency.
- **HTTP trigger** — Convex calls Runner's HTTP endpoint. Fast but requires the Runner to have a public ingress (URL/tunnel).
- **Convex subscriptions** — Runner watches a Convex query via WebSocket for pending runs. Zero-latency push, no ingress needed.

## Decision

The Runner uses Convex's built-in real-time subscriptions to watch for pending runs. When a run transitions to "pending" status, the Runner picks it up, executes Playwright, and writes results back via Convex mutations as each step completes.

The Runner only makes outbound connections to Convex — no public URL, no ingress, no tunneling.

## Consequences

- Dispatch is instant (WebSocket push from Convex).
- Real-time step updates flow naturally: Runner calls a Convex mutation after each step, and frontend subscriptions pick up the change immediately.
- The Runner can run behind a firewall or on localhost — only outbound connectivity to Convex is required.
- We need a Convex query that returns "pending runs" for the Runner to subscribe to.
- We need to handle subscription reconnection and duplicate run pickup (idempotency).

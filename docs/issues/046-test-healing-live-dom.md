# 046 — Test Healing with Live DOM

**Type**: AFK
**Status**: done

## What to build

Modify the test healing flow (`healTest` and `healAllFailed`) to fetch a fresh live snapshot of the failing test's target URL before calling the heal agent. The agent sees the current DOM and can accurately fix selector drift, changed button text, missing elements, and page structure changes. Without live DOM, the healer relies on stale exploration data and error messages — it often swaps one broken selector for another.

For batch healing (`healAllFailed`), snapshots are cached so multiple failed tests targeting the same page share a single crawl.

## Acceptance criteria

- [x] `healTest` extracts the target URL from the failing test code (`page.goto(...)` regex)
- [x] `healTest` calls `getLiveSnapshot()` for the target URL before invoking the heal agent
- [x] Heal prompt includes live DOM context when available: "Current page state (captured just now)" with aria snapshot + interactive elements
- [x] `healAllFailed` reuses cached snapshots for tests targeting the same URL
- [x] Falls back to current behavior (exploration data + error message) when Runner is unavailable
- [x] Existing heal tests updated to pass
- [x] New tests: heal with live snapshot, heal with Runner unavailable (fallback), batch heal shares cache, URL extraction from test code

## Blocked by

- 042 — Convex Snapshot Client + Action Cache

## Parent

- 021 — Runner Browser API for Live DOM (original live DOM healing design)

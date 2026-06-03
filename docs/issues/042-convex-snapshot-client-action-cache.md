# 042 — Convex Snapshot Client + Action Cache

**Type**: AFK
**Status**: done

## What to build

Install `@convex-dev/action-cache` and `@convex-dev/rate-limiter`. Create two new modules that let Convex AI actions request live DOM context from the Runner Snapshot API (issue 041):

1. **`convex/ai/browserClient.ts`** — HTTP client that calls `POST /snapshot` and `POST /validate-test` on the Runner. Returns structured data on success, `null` on any failure (Runner down, `RUNNER_URL` unset, timeout, error). Never throws — callers fall back gracefully.

2. **`convex/ai/snapshotFormatter.ts`** — Formats `SnapshotData` into AI prompt sections. Produces a human-readable block with aria accessibility tree, interactive elements with suggested Playwright locators, and page metadata. Also includes `extractUrlsFromText()` for pulling URLs from PRD text for multi-page crawling.

Snapshot results are cached via `ActionCache` with 30-minute TTL — generating 5 tests for the same page only crawls once.

New env var: `RUNNER_URL` (e.g. `http://localhost:8931`). If unset, all live DOM features silently disable and actions use existing behavior.

## Acceptance criteria

- [x] `@convex-dev/action-cache` and `@convex-dev/rate-limiter` installed and wired in `convex/convex.config.ts`
- [x] `getLiveSnapshot()` returns `SnapshotData` when Runner is available, `null` when not
- [x] `validateTest()` returns `{ passed, error_message?, snapshot_at_failure? }` when available, `null` when not
- [x] Both functions return `null` (never throw) when `RUNNER_URL` is unset, Runner is unreachable, or request times out (30s)
- [x] Snapshot results cached with 30-min TTL via ActionCache — subsequent calls for same URL within TTL hit cache
- [x] Rate limiter prevents more than 10 snapshot requests per workspace per minute
- [x] `snapshotFormatter.ts` produces AI prompt section with: page title, aria snapshot, interactive elements with suggested locators
- [x] `extractUrlsFromText()` extracts absolute URLs and relative paths from arbitrary text
- [x] Unit tests for: successful fetch, Runner down fallback, missing env var, cache hit/miss, formatter output, URL extraction

## Blocked by

- 041 — Runner Snapshot API (the server this client calls)

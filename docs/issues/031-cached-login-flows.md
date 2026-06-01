# 031 — Cached login flows

**Type**: AFK
**Status**: needs-triage
**Blocked by**: 028

## What to build

Enable Stagehand's `cacheDir` for the Runner. The first time Stagehand logs into an app, the login flow (navigate, fill credentials, submit) is cached locally. Subsequent runs replay the cached login instantly — zero LLM tokens, sub-second execution. If the login page changes, the cache misses, Stagehand re-learns the flow, and it's cached again. Cache is stored per-project to isolate different apps.

## Acceptance criteria

- [ ] Stagehand initialized with `cacheDir` pointing to a per-project cache directory
- [ ] First login for a project: LLM-powered, cached to disk
- [ ] Second+ login for same project: replayed from cache, no LLM tokens consumed
- [ ] Login page change: cache miss → fresh LLM call → re-cached
- [ ] Cache directory created under a configurable path (default: `.stagehand-cache/`)
- [ ] Cache keyed by project ID so different apps don't share login caches
- [ ] Runner tests: verify cache is created on first run, used on second run

## Blocked by

- 028 — Stagehand test executor in Runner

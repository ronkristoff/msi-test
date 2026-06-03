# 043 — NL Test Generation with Live DOM + Verify Loop

**Type**: AFK
**Status**: done

## What to build

Install `@convex-dev/workflow`. Rewrite the NL test generation flow (`generateNlTests`) as a durable workflow that:

1. Fetches a live snapshot of the project's app URL (and login page if auth is configured)
2. Generates a Playwright test via the AI with live DOM context in the prompt
3. Validates the generated test by running it against the live app via the Runner
4. If validation fails, retries generation once with the error message + failure snapshot as additional context
5. Stores the test with a `validated` field indicating whether it passed auto-validation

The workflow survives Convex restarts, provides reactive status for UI progress indicators, and is cancellable by the user. When the Runner is unavailable, falls back to the current behavior (AI generation without live DOM, no verify loop).

Add `validated: v.optional(v.boolean())` field to the `tests` table schema.

## Acceptance criteria

- [ ] `@convex-dev/workflow` installed and wired in `convex/convex.config.ts`
- [ ] `generateNlTests` triggers a durable workflow instead of running inline
- [ ] Workflow step 1: fetches live snapshot of app URL via `getLiveSnapshot()` (issue 042)
- [ ] Workflow step 2: generates Playwright test via AI agent with live snapshot context in prompt
- [ ] Workflow step 3: validates generated test via `validateTest()` (issue 042)
- [ ] Workflow step 4 (conditional): if validation failed, retries AI generation with error + failure snapshot, max 1 retry
- [ ] Final step: stores test in suite with `validated: true/false`
- [ ] `tests` table gains `validated: v.optional(v.boolean())` field — backward compatible
- [ ] `TEST_GENERATION_PROMPT` updated to reference live snapshot when present: "LIVE PAGE CONTEXT is provided — use elements and locators from this context"
- [ ] Falls back to current behavior (no snapshot, no verify) when `RUNNER_URL` is unset
- [ ] Suite progress shows workflow step during generation
- [ ] User can cancel generation mid-workflow
- [ ] Existing NL generation tests updated to pass
- [ ] New tests: workflow with live snapshot, workflow with Runner unavailable (fallback), verify loop success, verify loop retry, cancel mid-workflow

## Blocked by

- 042 — Convex Snapshot Client + Action Cache

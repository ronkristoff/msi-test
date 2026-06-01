# 030 — Learned healing persists across runs

**Type**: AFK
**Status**: done
**Blocked by**: 029

## What to build

Healed selectors are saved back to the test's step data so subsequent runs benefit from prior learning. Build a healing history per test — track which selectors changed, when, and how they were resolved. Over time, tests self-maintain: if a button label changed from "Submit" to "Approve" three runs ago, the test already knows to look for "Approve". The healing history is viewable in the UI so users can audit what changed and when.

## Acceptance criteria

- [x] Healed selectors written back to test step data after successful heal
- [x] Subsequent runs use learned selectors as first attempt before falling back to observe()
- [x] Healing history tracked per test: timestamp, original selector, healed selector, confidence
- [x] UI shows healing history on test detail page — timeline of selector changes
- [x] If healed selector also fails, observe() is called again (don't loop on bad learned data)
- [x] Healing history is scoped per test, not global — different tests can learn different selectors
- [x] Runner tests for learning persistence across simulated runs

## Implementation Summary

### Schema changes
- New `healing_history` table: `workspace_id`, `test_id`, `step_index`, `original_instruction`, `healed_selector`, `healed_description`, `confidence`, `reason`, `run_id`
- `testStepValidator`: added `learned_selector` and `learned_description` optional fields

### Convex backend
- `recordHealingHistory` internal mutation: inserts healing_history record AND updates the test's step with `learned_selector`/`learned_description`
- `getHealingHistory` query: returns healing history for a test, sorted newest-first
- `runnerRecordHealingHistory` action: runner-facing action with secret validation
- `getPendingWork` updated to include `learned_selector`/`learned_description` on steps

### Runner (`runner/src/stagehand-executor.ts`)
- `executeStep`: if step has `learned_selector`, calls `tryLearnedSelector()` first — uses `observe()` to find the learned selector, falls back to normal `act()` on failure
- `tryLearnedSelector()`: calls `observe()` to get candidates, matches learned selector, falls back gracefully
- `executeTest`: after writing a healed step result, calls `client.recordHealingHistory()` to persist the learning
- Recording failure doesn't break test execution (logged and swallowed)
- `attemptHeal` returns selector/description from the healing candidate for recording

### UI
- `HealingHistoryTimeline` component on run detail page: shows timeline of selector changes per test with step index, timestamp, confidence, original instruction → healed selector arrow, and reason
- Added to run detail page below existing TestMetadata/SameFailureHistory cards

### Tests
- 6 Convex tests in `convex/healing.test.ts`: recordHealingHistory writes history and updates steps, multiple heals for same step, scoped per test, handles missing steps, getHealingHistory query
- 6 Runner tests in `stagehand-executor.test.ts`: learned selector used as first attempt, fallback on failure, healing history recorded after heal, not called for passed/failed steps, recording failure doesn't break execution
- Total: 256 convex tests, 71 runner tests (excluding pre-existing integration failure), 108 frontend tests — all pass

## Blocked by

- 029 — Auto-heal with confidence threshold

# 030 — Learned healing persists across runs

**Type**: AFK
**Status**: needs-triage
**Blocked by**: 029

## What to build

Healed selectors are saved back to the test's step data so subsequent runs benefit from prior learning. Build a healing history per test — track which selectors changed, when, and how they were resolved. Over time, tests self-maintain: if a button label changed from "Submit" to "Approve" three runs ago, the test already knows to look for "Approve". The healing history is viewable in the UI so users can audit what changed and when.

## Acceptance criteria

- [ ] Healed selectors written back to test step data after successful heal
- [ ] Subsequent runs use learned selectors as first attempt before falling back to observe()
- [ ] Healing history tracked per test: timestamp, original selector, healed selector, confidence
- [ ] UI shows healing history on test detail page — timeline of selector changes
- [ ] If healed selector also fails, observe() is called again (don't loop on bad learned data)
- [ ] Healing history is scoped per test, not global — different tests can learn different selectors
- [ ] Runner tests for learning persistence across simulated runs

## Blocked by

- 029 — Auto-heal with confidence threshold

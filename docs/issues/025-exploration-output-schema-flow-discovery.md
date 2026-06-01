# 025 — Exploration output schema + flow discovery

**Type**: AFK
**Status**: needs-triage
**Blocked by**: 024

## What to build

Update the `explorations` table schema to store the richer output from the Stagehand Smart Explorer. Replace flat `structure_text` with structured per-page semantic descriptions, interactive element inventories, and traced user flows as proper JSON data. Update Convex queries and mutations to handle the new shape. Update the Exploration Analysis Agent to read the richer structured data and propose test scenarios from traced flows instead of parsing raw DOM text.

## Acceptance criteria

- [ ] `captured_pages` schema updated: each page has `semantic_description`, `interactive_elements` array, `screenshot_storage_id`
- [ ] New `discovered_flows` field on explorations: array of `{name, steps, pages_involved, complexity}`
- [ ] Convex queries updated to return structured exploration data
- [ ] Exploration Analysis Agent reads structured flows and produces better scenario proposals
- [ ] Backward compatible — old explorations with `structure_text` still readable
- [ ] Convex tests for new schema shape and agent behavior

## Blocked by

- 024 — Stagehand Smart Explorer

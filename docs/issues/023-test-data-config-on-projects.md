# 023 — Test data config on projects

**Type**: AFK
**Status**: in-progress
**Blocked by**: None — can start immediately

## What to build

Add a `test_data` optional JSON field to the `projects` table. Users can define key-value pairs (e.g., employee name, test email, default salary) in project settings. Stagehand uses these as variables in `act()` calls during exploration and test execution, providing consistent data across runs. When no test data is configured, the AI generates plausible data automatically. This enables deterministic runs for CI while keeping zero-config quick exploration working.

## Acceptance criteria

- [x] `test_data` optional JSON field added to `projects` table in schema
- [x] Project settings UI has a "Test Data" section for adding/editing key-value pairs
- [x] Frontend validation (zod schema) for test data format
- [x] Runner receives test_data as part of the job payload
- [x] When test data is present, Stagehand uses it as `%variable%` placeholders in act() calls
- [x] When test data is absent, AI generates plausible data (documented behavior, no error)
- [x] Convex tests for project mutations with test_data field
- [x] Existing project functionality unchanged

## Blocked by

None - can start immediately

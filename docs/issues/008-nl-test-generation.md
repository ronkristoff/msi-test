# 008 — Natural Language Test Generation

**Type**: AFK
**Blocked by**: 004, 005

## What to build

Generate Playwright tests from plain English descriptions. User types a test scenario (e.g., "test that checkout works with Visa") and the Test Generation Agent produces a Playwright test. Supports multiple scenarios in one request.

End-to-end: Suite page "Describe a test" input → Convex action `generateTests` with `source_type: "natural_language"` → Test Generation Agent produces Playwright code → stored as draft test in suite → user reviews and approves.

## Acceptance criteria

- [x] "Describe a Test" text input available on suite page
- [x] User can type a test scenario in plain English (e.g., "test that login works with valid credentials")
- [x] Test Generation Agent produces complete Playwright test file from the description
- [x] Multiple scenarios can be submitted in one request (batch generation)
- [x] Each generated test stored with `source_type: "natural_language"`, status `draft`
- [x] Auto-creates a new Suite if no suite is specified (e.g., "NL Tests — May 24")
- [x] User can re-generate a specific test with AI (regenerate button on test card)

## Blocked by

- 004 — Suite & Test CRUD (suite creation, test storage)
- 005 — AI Provider Module (Test Generation Agent)

# 007 — PRD-Based Test Generation

**Type**: AFK
**Blocked by**: 004, 005

## What to build

Generate Playwright tests from PRD content. User provides PRD text (typed) or uploads a Markdown/PDF file. The Test Generation Agent produces complete Playwright test files stored as draft tests in an auto-created Suite. User can batch-generate from multiple PRD sections. Loading state shows streaming progress.

End-to-end: Project page "Generate from PRD" action → Convex action `generateTests` receives PRD content → calls Test Generation Agent → stores generated Playwright code as draft tests → auto-creates Suite (e.g., "PRD Tests — May 24") → user sees generated tests in suite review page → streaming progress shown in UI.

## Acceptance criteria

- [x] "Generate Tests from PRD" action available on project page
- [x] Accepts PRD as typed text or uploaded Markdown/PDF file
- [x] PDF content is extracted and passed to the Test Generation Agent as text
- [x] Test Generation Agent produces complete, valid Playwright test files (TypeScript with `import { test, expect }`)
- [x] Each generated test stored with `source_type: "prd"`, status `draft`
- [x] Auto-creates a new Suite with descriptive name (e.g., "PRD Tests — May 24")
- [x] User can specify multiple test scenarios in one generation request
- [x] Streaming progress shown during generation (loading spinner or progress indicator)
- [x] Generated tests appear in the suite review page for editing/approval

## Blocked by

- 004 — Suite & Test CRUD (suite creation, test storage, code editor)
- 005 — AI Provider Module (Test Generation Agent)

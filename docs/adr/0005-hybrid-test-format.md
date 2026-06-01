# ADR 0005: Hybrid Test Format — NL Steps + Code Assertions

## Status

Accepted

## Context

MSITest stores tests as complete Playwright TypeScript files (`playwright_code` field on the `tests` table). This gives users full code ownership and portability, but creates two problems:

1. **Fragility** — CSS selectors, XPath expressions, and wait conditions break on UI changes. The AI heal feature (issue 029) can fix failures, but the underlying format is inherently brittle.
2. **Accessibility barrier** — Non-developers cannot review or modify Playwright code. Tests are locked to people who can read TypeScript.

Meanwhile, Stagehand (ADR 0004) can execute natural language instructions against a live browser. This creates an opportunity: store tests as a sequence of NL instructions for the interaction steps, with optional inline code for precise assertions.

Alternatives considered:
- **Pure NL tests** — store only natural language descriptions, execute entirely via Stagehand. Maximum flexibility but no way to express precise assertions ("the table should have exactly 5 rows").
- **Pure code tests only** — keep current Playwright-only format. Proven and portable, but fragile and developer-only.
- **Two separate test types with no interop** — maintain NL tests and code tests as separate entities. Duplicates infrastructure and confuses users about which to use.

## Decision

Introduce a hybrid test format. Each test has an `execution_type` field (`"playwright"` or `"stagehand"`) and an optional `steps` array. The `steps` array contains objects with:

- `instruction` (string) — NL description of the browser action (e.g., "Click the 'Add to Cart' button")
- `assertion_code` (string, optional) — inline JavaScript/TypeScript for precise data assertions
- `expected_outcome` (string, optional) — human-readable description of what should happen

Tests with `execution_type: "playwright"` use the existing `playwright_code` field and execute via raw Playwright. Tests with `execution_type: "stagehand"` use the `steps` array and execute via Stagehand's NL action system.

Both formats coexist. The Test Generation Agent can produce either format. Users can convert between them (with AI assistance). Legacy tests default to `execution_type: "playwright"`.

## Consequences

- NL-step tests are self-healing by default — Stagehand re-resolves the action against the current page on every run.
- Non-developers can read and modify the NL instructions without touching code.
- Precise assertions (data validation, count checks, state verification) remain possible via inline code.
- Test editor UI needs a dual view: NL steps editor + code editor toggle.
- The `tests` table gains `execution_type` and `steps` fields alongside the existing `playwright_code`.
- Runner/executor must handle both execution paths (raw Playwright for code tests, Stagehand for NL tests).
- New tests generated from exploration (issue 024) default to `execution_type: "stagehand"`. Tests generated from PRD or NL prompts can be either format based on user preference.

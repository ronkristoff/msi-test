# ADR 0004: Stagehand for AI-Driven Browser Interactions

## Status

Accepted

## Context

The MVP uses raw Playwright in the Runner for test execution (ADR 0001) and a render-and-capture approach for exploration — the Runner loads pages, takes DOM snapshots, and the AI infers flows from the static structure. This works for basic pages but cannot handle interactive flows (login forms, multi-step wizards, dynamic content requiring clicks).

Stagehand (by Browserbase) is an AI-powered browser automation library built on Playwright that uses LLM calls to interact with pages using natural language instructions. It handles selector resolution, waits, and error recovery autonomously.

Alternatives considered:
- **Continue with raw Playwright + AI-generated selectors** — the AI generates CSS/XPath selectors that may break on UI changes. High maintenance.
- **Custom AI-action layer on top of Playwright** — build our own NL-to-action mapping. Significant engineering effort to match Stagehand's reliability.
- **Stagehand for everything** — replace Playwright entirely. Overkill for simple test execution where selectors are known and stable.

## Decision

Use Stagehand for two specific capabilities where AI-driven browser interaction adds clear value:

1. **Smart Exploration** (issue 024) — Stagehand's `agent()` autonomously navigates the target app, filling forms, clicking buttons, and discovering flows that a static render-and-capture approach would miss. This replaces the Runner's naive page rendering with intelligent crawling.

2. **Test Execution of NL-step tests** (issue 028) — For tests stored in the hybrid NL+code format (ADR 0005), Stagehand executes NL instructions by translating them into browser actions at runtime. For pure Playwright tests, the Runner continues using raw Playwright directly.

Raw Playwright remains the execution engine for standard `playwright_code` tests. Stagehand is an addition, not a replacement.

## Consequences

- Exploration discovers deeper flows (behind login, multi-step forms, SPAs with dynamic content).
- NL-step tests are self-healing by default — Stagehand re-resolves selectors on every run using the page's current DOM.
- Added dependency on `@browserbasehq/stagehand` and its Playwright version pin.
- Stagehand requires an LLM for every browser action, increasing token usage during exploration and NL test execution.
- BYOK config (workspace AI provider) is reused for Stagehand's LLM calls — no separate AI configuration needed.
- Test execution of pure Playwright tests is unaffected — no performance or reliability change.

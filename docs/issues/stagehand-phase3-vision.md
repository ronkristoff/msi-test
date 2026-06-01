# Phase 3 — Full Vision

This is the long-term roadmap for MSITest's Stagehand integration. These items are not yet broken into implementable issues — they represent the strategic direction after Phase 1+2 (issues 022–036) are complete.

---

## Full Autonomous Agent (Level 3)

End-to-end autonomous testing. The user says "test my HR payroll app" and the system explores, generates tests, executes them, heals failures, and surfaces results — all without human intervention beyond the initial request.

- Stagehand `agent()` handles the full lifecycle: explore → generate → execute → heal
- User intervention only for approval gates (optional — power users can skip)
- Self-improving: every run makes the test suite more resilient
- Rich AI analysis of results: root cause, flakiness patterns, suggested fixes

## Recording / Playback

User manually walks through a flow in the browser. Stagehand observes and records every action (clicks, form fills, navigations). The AI then converts the recording into a clean hybrid NL+code test. This is how non-technical users create tests — just demonstrate what you want tested.

- Stagehand watches user actions via Playwright's recording capabilities
- AI converts raw recording into structured NL steps + assertions
- User edits the generated test before saving
- Recordings can be replayed as self-healing tests

## SaaS on Coolify — Container-per-Job Scaling

Deploy the Runner as a scalable service on Coolify. Each exploration or test run spins up an isolated container with its own Chromium instance. Coolify auto-scales replicas based on Convex queue depth.

- Runner packaged as a Docker container
- Coolify manages replica scaling based on job queue
- Each container handles one job, then dies — perfect isolation
- No cross-tenant browser state or memory leaks
- Cost optimization: containers spin down when queue is empty

## MSITest-Provided AI Option (Free Tier)

Offer a managed AI option for users who don't want to bring their own API key. MSITest hosts a proxy to OpenAI/Anthropic and includes a token allowance per workspace.

- Workspace gets a "Managed AI" option alongside BYOK
- Token allowance per month (free tier) or pay-per-use (paid tier)
- MSITest proxies LLM calls, user never handles API keys
- Onboarding friction drops to zero — sign up, point at app, get tests

## Multi-Model Agent Orchestration

Use different models for different tasks within a single test lifecycle:
- Fast cheap model (GPT-4o-mini) for routine browser actions
- Smart model (Claude Sonnet) for complex test generation and failure analysis
- Vision model for screenshot comparison and visual regression
- Embedding model for semantic page clustering (group similar pages)

## Visual Regression Testing

Beyond functional testing — detect visual changes between runs. Stagehand captures screenshots, and a vision model compares them against baselines. Flags unintended visual changes (layout shifts, missing elements, color changes) even when tests pass.

## Test Suite Optimization

AI analyzes test suite health and suggests optimizations:
- Remove redundant tests that cover the same flow
- Prioritize tests by failure rate and business impact
- Suggest new tests for uncovered flows discovered during healing
- Flakiness prediction — flag tests likely to fail before they do

# MSITest — Domain Context

## Glossary

- **MSITest** — The autonomous AI testing platform. Users provide app URLs, PRDs, or natural language; MSITest generates Playwright tests, executes them, and surfaces results with AI analysis.
- **Workspace** — Top-level organizational container. Owns all projects, AI provider config, and integrations. Single workspace per user for MVP.
- **Project** — An application under test. Defined by a name (unique within a workspace) and an app URL (scheme auto-prepended). Has at most one PRD — either typed text or an uploaded file (.md, .pdf, .txt, up to 10MB), never both. Replacing the PRD clears the previous one. Scoped to a workspace; no limit on project count per workspace.
- **Suite** — A named group of tests within a project.
- **Test** — A single Playwright test scenario. Stored as editable TypeScript code with a source type (url_exploration, prd, natural_language) and status (draft, approved).
- **Run** — An execution of one or more tests. Can be a suite run (references suite_id), a single-test run, or a rerun (references rerun_of_run_id). Tracks trigger type (manual, ci, scheduled, rerun), environment, overall status, runner_id (which Runner is executing), and last_heartbeat_at (liveness signal). A Run stuck in running status without a recent heartbeat is marked failed. Re-runs create new Run records linked to the original via rerun_of_run_id.
- **Step** — A single action within a test execution. Records the command, locator, pass/fail/skipped status, screenshot, and timing.
- **Runner** — The separate Node.js process that executes Playwright tests outside Convex. Stateless execution engine; Convex is the source of truth for all state.
- **Exploration** — The guided flow where the Runner navigates a target app URL, renders each page with Playwright (including SPA content), takes DOM snapshots and screenshots, and sends structure to Convex where the AI proposes testable scenarios for user selection. The Runner does not click or navigate autonomously — it renders and captures. The AI infers flows from the rendered structure.
- **AI Insight** — An AI-generated analysis linked to a test failure. Contains root cause text, suggested fix, and confidence score.
- **Flakiness** — A measure of test instability across multiple runs. Computed as the ratio of inconsistent results (pass then fail, or vice versa) over recent run history.
- **Environment** — A named deployment target (e.g. staging, production) with a base URL, scoped to a project.
- **AI Agent** — A specialized `@convex-dev/agent` instance with a defined role, system prompt, and tools. MSITest defines three: Test Generation Agent, Exploration Analysis Agent, and Failure Analysis Agent. Agents are module-level definitions; the AI model is injected per-call from the workspace's BYOK config.
- **Thread** — A persistent conversation context managed by `@convex-dev/agent`. Test Generation threads are scoped per suite (derived ID `testGen:${suiteId}`). Exploration Analysis threads are caller-managed. Failure Analysis is one-shot (no thread).
- **Agent Tool** — A Convex query that an AI agent can invoke during generation to fetch context from the database. Five tools are defined: `readExistingTests`, `readProjectContext`, `readTestCode`, `readPreviousExplorations` (stub), `readRecentFailures` (stub).
- **AI Error** — A structured error from AI operations. Uses `ConvexError` with `{ type: "ai_error", code, message }` where code is one of: `invalid_api_key`, `rate_limit`, `timeout`, `malformed_response`.

## Data Hierarchy

Workspace → Project → Suite → Test → Run → Step

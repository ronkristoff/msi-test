# MSITest — Domain Context

## Glossary

- **MSITest** — The autonomous AI testing platform. Users provide app URLs, PRDs, or natural language; MSITest generates Playwright tests, executes them, and surfaces results with AI analysis.
- **Workspace** — Top-level organizational container. Owns all projects, AI provider config, and integrations. Single workspace per user for MVP.
- **Project** — An application under test. Defined by a name and app URL. May have an associated PRD (text or uploaded file).
- **Suite** — A named group of tests within a project.
- **Test** — A single Playwright test scenario. Stored as editable TypeScript code with a source type (url_exploration, prd, natural_language) and status (draft, approved).
- **Run** — An execution of one or more tests. Can be a suite run (references suite_id), a single-test run, or a rerun (references rerun_of_run_id). Tracks trigger type (manual, ci, scheduled, rerun), environment, overall status, runner_id (which Runner is executing), and last_heartbeat_at (liveness signal). A Run stuck in running status without a recent heartbeat is marked failed. Re-runs create new Run records linked to the original via rerun_of_run_id.
- **Step** — A single action within a test execution. Records the command, locator, pass/fail/skipped status, screenshot, and timing.
- **Runner** — The separate Node.js process that executes Playwright tests outside Convex. Stateless execution engine; Convex is the source of truth for all state.
- **Exploration** — The guided flow where the Runner navigates a target app URL, renders each page with Playwright (including SPA content), takes DOM snapshots and screenshots, and sends structure to Convex where the AI proposes testable scenarios for user selection. The Runner does not click or navigate autonomously — it renders and captures. The AI infers flows from the rendered structure.
- **AI Insight** — An AI-generated analysis linked to a test failure. Contains root cause text, suggested fix, and confidence score.
- **Flakiness** — A measure of test instability across multiple runs. Computed as the ratio of inconsistent results (pass then fail, or vice versa) over recent run history.
- **Environment** — A named deployment target (e.g. staging, production) with a base URL, scoped to a project.

## Data Hierarchy

Workspace → Project → Suite → Test → Run → Step

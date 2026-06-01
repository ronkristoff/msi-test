# MSITest — Domain Context

## Glossary

- **MSITest** — The autonomous AI testing platform. Users provide app URLs, PRDs, or natural language; MSITest generates Playwright tests, executes them, and surfaces results with AI analysis.
- **Workspace** — Top-level organizational container. Owns all projects, AI provider config, and integrations. Single workspace per user for MVP.
- **Project** — An application under test. Defined by a name (unique within a workspace) and an app URL (scheme auto-prepended). Has at most one PRD — either typed text or an uploaded file (.md, .pdf, .txt, up to 10MB), never both. Replacing the PRD clears the previous one. Scoped to a workspace; no limit on project count per workspace.
- **Suite** — A named group of tests within a project.
- **Test** — A single test scenario. Stored in either Playwright TypeScript code (`playwright_code`, execution_type `"playwright"`) or hybrid NL+code steps (`steps` array, execution_type `"stagehand"`). Has a source type (url_exploration, prd, natural_language) and status (draft, approved, healing).
- **Hybrid Test Format** — A test representation that combines natural language instructions for browser interaction with optional inline code for precise assertions. Each step has an `instruction` (NL), optional `assertion_code` (JS/TS), and optional `expected_outcome` (NL). Executed by Stagehand (ADR 0005).
- **Run** — An execution of one or more tests. Can be a suite run (references suite_id), a single-test run, a test-list run (references test_list_id), or a rerun (references rerun_of_run_id). Tracks trigger type (manual, ci, scheduled, rerun), environment, overall status, runner_id (which Runner is executing), and last_heartbeat_at (liveness signal). A Run stuck in running status without a recent heartbeat is marked failed. Re-runs create new Run records linked to the original via rerun_of_run_id.
- **Step** — A single action within a test execution. Records the command, locator, pass/fail/skipped status, screenshot, and timing.
- **Runner** — The separate Node.js process that executes Playwright tests outside Convex. Stateless execution engine; Convex is the source of truth for all state.
- **Exploration** — The guided flow where the system navigates a target app URL. In MVP, the Runner renders pages with Playwright (including SPA content), takes DOM snapshots and screenshots, and sends structure to Convex where the AI proposes testable scenarios. With Stagehand (ADR 0004), the Smart Explorer uses `agent()` to autonomously click, fill forms, and discover interactive flows beyond static rendering. The AI proposes testable scenarios for user selection.
- **Stagehand** — An AI-powered browser automation library by Browserbase, built on Playwright. Uses LLM calls to translate natural language instructions into browser actions. MSITest uses Stagehand for smart exploration (autonomous page crawling) and execution of hybrid NL+code tests (ADR 0004).
- **Browserbase** — Cloud browser infrastructure provider. Provides remote Chromium instances accessible via API. Used by the Convex-Stagehand component for lightweight server-side browser tasks without the Runner (ADR 0006).
- **Auto-Heal** — The system's ability to automatically repair failing tests. When a test fails, the AI analyzes the error, the current page state, and the test code to produce a corrected version. Healing can be manual (user clicks "AI Heal") or automatic (Stagehand re-resolves selectors at runtime for NL-step tests). Healed tests are saved as draft for user review. See issues 029–030.
- **Healing Confidence Threshold** — A configurable score (0–1) that determines whether an auto-healed test is accepted automatically or queued for human review. Set at the workspace level (issue 029).
- **Learned Healing** — Healing knowledge that persists across runs. When the AI heals a selector or timing issue, the fix is recorded and applied proactively in future runs before the test fails again (issue 030).
- **Feature Map** — A structured visualization of a PRD's features and use cases, rendered as an interactive graph. Top-level nodes are areas (Auth, Checkout, Dashboard); child nodes are individual testable scenarios. Makes coverage gaps immediately visible (issue 037).
- **Discovered Flow** — A traced user flow found during exploration. Each flow has a name, step sequence, pages involved, and complexity rating. Stored in the `explorations.discovered_flows` field (issue 025).
- **Test List** — A cross-project grouping of individual tests into a named, executable list. Like a "playlist" for tests — points to tests in their original suites without copying. Used for targeted re-runs, CI gates, and scheduled monitoring (issue 039).
- **Schedule** — A recurring run configuration. Targets a suite or test list, an environment, and a cadence (hourly, daily, weekly). Managed via Convex crons. Each scheduled run links back to its originating schedule via `schedule_id` (issue 038).
- **Monitoring** — The practice of running test suites on a cadence to catch regressions. Powered by Schedules. The monitoring page shows all schedules, run history, and run-vs-run diffs (which tests flipped status between consecutive runs).
- **NL Chat Refinement** — A chat interface for modifying tests using natural language. Instead of editing Playwright code, the user describes changes in plain English and the AI applies them to the test. Uses persistent threads scoped per test (issue 040).
- **AI Insight** — An AI-generated analysis linked to a test failure. Contains root cause text, suggested fix, and confidence score.
- **Flakiness** — A measure of test instability across multiple runs. Computed as the ratio of inconsistent results (pass then fail, or vice versa) over recent run history.
- **Environment** — A named deployment target (e.g. staging, production) with a base URL, scoped to a project.
- **AI Agent** — A specialized `@convex-dev/agent` instance with a defined role, system prompt, and tools. MSITest defines three: Test Generation Agent, Exploration Analysis Agent, and Failure Analysis Agent. Agents are module-level definitions; the AI model is injected per-call from the workspace's BYOK config.
- **Thread** — A persistent conversation context managed by `@convex-dev/agent`. Test Generation threads are scoped per suite (derived ID `testGen:${suiteId}`). Exploration Analysis threads are caller-managed. Failure Analysis is one-shot (no thread).
- **Agent Tool** — A Convex query that an AI agent can invoke during generation to fetch context from the database. Five tools are defined: `readExistingTests`, `readProjectContext`, `readTestCode`, `readPreviousExplorations` (stub), `readRecentFailures` (stub).
- **AI Error** — A structured error from AI operations. Uses `ConvexError` with `{ type: "ai_error", code, message }` where code is one of: `invalid_api_key`, `rate_limit`, `timeout`, `malformed_response`.
- **Constraint** — A shared validation rule (e.g., name length 1-100, password min 8) defined once in `convex/lib/constraints.ts` and consumed by both frontend zod schemas and backend Convex validators. Prevents drift between client and server validation.
- **Owned Entity** — Any database document scoped to a workspace. The ownership check (`entity.workspace_id === workspace._id`) is centralized in `getOptionalOwnedEntity` — queries and mutations use this instead of inline guards.
- **Tool Logic** — The pure database query functions behind each Agent Tool, defined in `convex/ai/tools/logic.ts`. Tested directly without agent infrastructure. Internal queries and tool definitions are thin adapters over this layer.
- **Convex-Stagehand Component** — An optional Convex component (`@browserbasehq/convex-stagehand`) that runs lightweight browser tasks directly inside Convex actions using Browserbase's cloud browsers. Used for URL reachability checks, single-page extraction, and page change detection. System works fully without it (ADR 0006).

## Data Hierarchy

Workspace → Project → Suite → Test → Run → Step

Workspace → Schedule → Run (scheduled runs)
Workspace → Test List → Test (cross-project grouping, pointers only)

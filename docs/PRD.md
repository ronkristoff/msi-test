# MSITest — Autonomous AI Testing Platform

## Problem Statement

Engineering teams using AI coding tools generate code faster than they can verify it. Manual test writing is a bottleneck. Existing test runners (Playwright, Cypress) require developers to hand-author tests. Teams need an autonomous AI agent that generates E2E tests from their app, PRD, or natural language descriptions, executes them in real browsers with full telemetry, analyzes failures with AI-powered root cause analysis, and surfaces everything in an intelligent dashboard — so they can ship production-ready code with confidence.

## Solution

MSITest is an autonomous AI testing platform. Users provide their app URL, a PRD (typed or uploaded as Markdown/PDF), or natural language test descriptions. The AI generates Playwright test suites, the user reviews and approves them, and MSITest executes them with full capture (screenshots at every step, video, console logs, traces). Results surface in a rich dashboard with AI root cause analysis and suggested code fixes for every failure. A flakiness heatmap tracks test stability over time.

## User Stories

### Auth & Onboarding

1. As a developer, I want to sign in with email and password, so that I can access my workspace
2. As a developer, I want to sign in with Google OAuth, so that I can authenticate without creating a new account
3. As a developer, I want to create a new account, so that I can start using MSITest
4. As a developer, I want to reset my password, so that I can recover access to my account

### Workspace & Project Management

5. As a developer, I want to create a workspace, so that I can organize my projects
6. As a developer, I want to create a project by providing an app name and URL, so that MSITest knows what application to test
7. As a developer, I want to upload a PRD as a text description during project creation, so that the AI generates tests aligned with my requirements
8. As a developer, I want to upload a PRD as a Markdown or PDF file during project creation, so that I can use existing product documentation
9. As a developer, I want to view and manage all my projects, so that I can navigate between them
10. As a developer, I want to configure my AI provider (endpoint URL, API key, model name) in workspace settings, so that MSITest uses my preferred OpenAI-compatible LLM (GLM, OpenAI, DeepSeek, Ollama, etc.)
11. As a developer, I want to update my profile information, so that my account details stay current

### AI Test Generation — URL-Based Exploration

12. As a developer, I want the AI to explore my app by navigating its pages after I provide a URL, so that it discovers testable flows autonomously
13. As a developer, I want to see a list of discovered pages and user flows (e.g. "Login", "Checkout", "Dashboard"), so that I can choose which ones to generate tests for
14. As a developer, I want to select specific discovered flows for test generation, so that I control which tests are created
15. As a developer, I want to watch the AI's exploration progress in real-time, so that I can see what it's finding

### AI Test Generation — PRD-Based

16. As a developer, I want to type feature requirements and have the AI generate Playwright tests from them, so that tests match my product specs
17. As a developer, I want to upload a Markdown file with requirements and have the AI generate tests from it, so that I can reuse existing documentation
18. As a developer, I want to upload a PDF file with requirements and have the AI generate tests from it, so that I can use formal product specs

### AI Test Generation — Natural Language

19. As a developer, I want to describe a test scenario in plain English (e.g. "test that checkout works with Visa"), so that the AI generates the corresponding Playwright code
20. As a developer, I want to specify multiple test scenarios in one request, so that I can batch-generate tests

### Test Suite Review & Editing

21. As a developer, I want to see all AI-generated tests in a suite, so that I can review what will run
22. As a developer, I want to view the generated Playwright code for each test, so that I can verify correctness
23. As a developer, I want to edit the generated Playwright code, so that I can customize test behavior
24. As a developer, I want to approve tests for execution, so that only validated tests run
25. As a developer, I want to delete individual generated tests, so that I can remove irrelevant scenarios
26. As a developer, I want to re-generate a specific test with AI, so that I can get a fresh attempt

### Test Execution

27. As a developer, I want to click "Run Tests" to execute a test suite, so that I can validate my application
28. As a developer, I want to see real-time progress during test execution (which test is running, which step), so that I can monitor live
29. As a developer, I want to run a single test individually, so that I can debug specific failures
30. As a developer, I want to re-run a failed test, so that I can check if a failure is flaky

### Dashboard

31. As a developer, I want to see overall pass rate as a percentage, so that I can assess test health at a glance
32. As a developer, I want to see counts of failed, flaky, and total tests with trend arrows, so that I can understand the current state
33. As a developer, I want to see a pass rate trend chart over the last 20 runs, so that I can spot regressions over time
34. As a developer, I want to see recent failure cards with AI root cause analysis and suggested fixes, so that I can fix failures quickly
35. As a developer, I want to see currently running tests with live progress bars, so that I can monitor active executions
36. As a developer, I want to export dashboard data, so that I can share reports with my team

### Test Runs List

37. As a developer, I want to see a paginated list of all test runs, so that I can browse execution history
38. As a developer, I want to filter runs by status (All/Failed/Flaky/Running/Passed), so that I can find specific run types
39. As a developer, I want to filter runs by branch, environment, and result, so that I can narrow down to relevant runs
40. As a developer, I want to search runs by name, file, or ID, so that I can find a specific run quickly
41. As a developer, I want to sort runs by recency, duration, failure count, or flakiness, so that I can prioritize my attention
42. As a developer, I want to click a run to see its full detail, so that I can investigate results

### Run Detail

43. As a developer, I want to see a split-panel layout with test list on the left and detail on the right, so that I can navigate tests without losing context
44. As a developer, I want to see failed tests listed first in the test list, so that I can address failures immediately
45. As a developer, I want to see a step-by-step execution timeline with pass/fail/skipped states, so that I can pinpoint exactly where a test failed
46. As a developer, I want to see a screenshot captured at every step, so that I can visually trace the test execution
47. As a developer, I want to navigate between step screenshots (prev/next), so that I can scrub through the test visually
48. As a developer, I want to see browser console output with color-coded log levels (info/warn/error), so that I can debug client-side issues
49. As a developer, I want to see AI root cause analysis for every failure with confidence percentage, so that I can understand why the test failed
50. As a developer, I want to see AI-suggested code fixes with the exact change, so that I can apply the fix directly
51. As a developer, I want to see the same failure across previous runs, so that I can tell if it's a recurring issue
52. As a developer, I want to see test metadata (duration, attempts, environment, retries), so that I have full context
53. As a developer, I want to download test logs, so that I can analyze them offline

### Flakiness Map

54. As a developer, I want to see a heatmap grid of tests vs runs color-coded by flakiness, so that I can visually identify flaky patterns
55. As a developer, I want to filter the heatmap to show only flaky or only stable tests, so that I can focus on problem areas
56. As a developer, I want to see flakiness percentage per test, so that I can prioritize fixes
57. As a developer, I want to see AI analysis identifying root-cause clusters of flaky tests, so that I can address systemic issues
58. As a developer, I want to click a test row to see its detail panel with trend sparkline, so that I can investigate individual flakiness
59. As a developer, I want to export the flakiness data as CSV, so that I can share it with my team

### Suites Management

60. As a developer, I want to see a list of all test suites in a project, so that I can manage test organization
61. As a developer, I want to see the number of tests and last run status for each suite, so that I can assess suite health at a glance
62. As a developer, I want to create a new suite, so that I can group related tests
63. As a developer, I want to run an entire suite with one click, so that I can validate a feature area
64. As a developer, I want to delete or archive a suite, so that I can clean up obsolete tests

### Environments

65. As a developer, I want to define target environments (staging, production, dev) with base URLs, so that I can run tests against different deployments
66. As a developer, I want to select which environment to run tests against, so that I can validate the right deployment
67. As a developer, I want to see which environment each run was executed against, so that I can correlate results with deployments

### AI Insights

68. As a developer, I want to see a consolidated list of all AI-detected issues across runs, so that I can prioritize fixes
69. As a developer, I want to see severity and frequency for each AI insight, so that I know what matters most
70. As a developer, I want to click an insight to navigate to the related test failure, so that I can take action

### CI Pipelines

71. As a developer, I want to configure GitHub webhook integrations, so that tests can be triggered from CI
72. As a developer, I want to see the status of connected CI pipelines, so that I know integrations are working
73. As a developer, I want to see which runs were triggered by CI vs manually, so that I can distinguish run sources

### Slack Alerts

74. As a developer, I want to configure Slack webhook URLs, so that my team receives test result notifications
75. As a developer, I want to define alert rules (e.g. "notify on failure", "notify on flaky increase"), so that I only get relevant alerts
76. As a developer, I want to test my Slack integration with a sample message, so that I can verify it works before relying on it

### Settings

77. As a developer, I want to configure my AI provider (endpoint URL, API key, model name), so that MSITest uses my preferred LLM
78. As a developer, I want to update my account email and password, so that I can manage my credentials
79. As a developer, I want to manage my workspace settings, so that I can control project-level defaults

## Implementation Decisions

### Tech Stack

- **Frontend**: Next.js + React (App Router)
- **Backend**: Convex (database, functions, file storage, real-time subscriptions)
- **Test Execution**: Playwright running locally on the server
- **AI**: BYOK via OpenAI-compatible chat completions API format. Single model config per workspace (endpoint URL, API key, model name). Supports GLM, OpenAI, DeepSeek, Mistral, Ollama, and any OpenAI-compatible provider.
- **Auth**: Better Auth with email/password and Google OAuth
- **Real-time**: Convex subscriptions for live run progress and dashboard updates

### Data Hierarchy

Workspace → Project → Suite → Test → Run → Step

Single workspace per user for MVP. The `workspace_id` foreign key is present on all entities from day one to support multi-tenancy later without a migration.

### Modules

#### 1. Auth Module (shallow)

Delegates entirely to Better Auth. Handles session management, email/password flows, Google OAuth. Exposes current user and workspace context to all other modules.

#### 2. Project Module (shallow CRUD)

Convex mutations and queries for projects. Each project stores: name, `app_url`, `prd_text` (optional), `prd_file_id` (optional Convex file storage reference). Project creation is a multi-step wizard in the UI.

#### 3. AI Provider Module (deep)

Encapsulates all AI interactions behind a unified interface. Accepts the workspace's AI config (endpoint, key, model). Speaks the OpenAI chat completions format. Exposes four functions:

- `generateTestsFromURL(discoveredFlows)` — produces Playwright test scenarios from discovered app flows
- `generateTestsFromPRD(prdContent)` — produces test scenarios from requirements text
- `generateTestsFromPrompt(userPrompt)` — produces test scenarios from natural language
- `analyzeFailure(testCode, error, screenshots, consoleLogs)` — produces root cause analysis and suggested fix

This module is testable in isolation by mocking the HTTP calls to the AI endpoint.

#### 4. Exploration Module (deep)

Orchestrates the guided URL exploration flow. Uses Playwright to navigate the provided app URL, extracts page routes, clickable elements, form inputs, and navigation flows. Sends discovered structure to the AI Provider Module which proposes testable scenarios. Returns a list of proposed scenarios (name, description, flow summary) for user selection. Runs as a Convex action with real-time progress updates.

#### 5. Test Generation Module (deep)

Takes selected exploration scenarios, PRD content, or natural language prompts. Calls the AI Provider Module to generate Playwright TypeScript code. Stores generated tests in the database as editable code strings with `draft` status. User reviews, edits, and sets status to `approved`.

#### 6. Test Execution Module (deep — highest risk)

Accepts a test or suite ID. For each approved test, writes the Playwright code to a temp directory, spawns a Playwright process with:

- Screenshots captured at every step via Playwright's trace and screenshot API
- Video recording enabled
- Console output captured via `page.on('console')` events
- Full trace file captured
- Step-by-step trace data parsed from Playwright's `.trace.zip` output

Streams results back to Convex in real-time as each step completes. This module runs server-side in a Convex action and is the most operationally complex piece of the system.

#### 7. Run Aggregation Module (deep)

After a run completes, computes: pass/fail/flaky counts, total duration, per-step timing. For each failed test, calls the AI Provider Module's `analyzeFailure` function with the test code, error message, screenshot at failure point, and console output. Stores the AI insight (root cause analysis, suggested fix, confidence score) linked to the test and run.

#### 8. Flakiness Module (deep)

Computes per-test flakiness scores based on pass/fail history across the last N runs. Powers the heatmap grid with a 5-step color scale (stable → critical). Identifies flakiness clusters (groups of tests that fail together, suggesting a shared root cause). Runs as Convex queries.

#### 9. Real-time Module (shallow)

Convex subscription wiring. Frontend subscribes to: active run progress, step-level updates during execution, dashboard stat changes. No complex logic — leverages Convex's built-in reactivity.

#### 10. Notification Module (medium)

Slack webhook integration. Accepts alert rules (trigger event type, optional threshold). Formats and sends Slack messages with run summary. GitHub webhook listener endpoint that creates runs when receiving push/pull_request events.

### Schema (Convex)

- **workspaces** — id, name, owner_id, ai_config (endpoint_url, api_key, model_name), created_at
- **projects** — id, workspace_id, name, app_url, prd_text, prd_file_id, created_at
- **suites** — id, project_id, name, description, created_at
- **tests** — id, suite_id, name, description, playwright_code (string), source_type (url_exploration | prd | natural_language), status (draft | approved), created_at
- **runs** — id, suite_id or test_id, project_id, trigger_type (manual | ci | scheduled), branch, commit, environment, status (running | passed | failed | flaky), started_at, finished_at, duration_ms
- **steps** — id, run_id, test_id, step_number, command, locator, status (passed | failed | skipped), error_message, screenshot_file_id, duration_ms
- **run_results** — id, run_id, test_id, status, duration_ms, retries, console_logs (array of {level, text, timestamp}), trace_file_id, video_file_id
- **ai_insights** — id, workspace_id, test_id, run_id, type (root_cause | flakiness_cluster), analysis_text, suggested_fix, confidence_score, created_at
- **environments** — id, project_id, name, base_url, created_at
- **integrations** — id, workspace_id, type (slack | github), config (JSON), status, created_at
- **alert_rules** — id, integration_id, trigger_event, threshold, enabled

### API Surface (Convex Functions)

**Queries**: `getDashboardStats`, `getRuns` (paginated, filtered, sorted), `getRunDetail`, `getSteps`, `getFlakinessMap`, `getTests`, `getSuites`, `getProjects`, `getAIInsights`, `getEnvironments`, `getIntegrations`

**Mutations**: `createProject`, `updateProject`, `createSuite`, `updateSuite`, `deleteSuite`, `approveTest`, `updateTestCode`, `deleteTest`, `triggerRun`, `rerunTest`, `saveAIConfig`, `createEnvironment`, `updateEnvironment`, `saveIntegration`, `saveAlertRule`

**Actions**: `exploreApp` (async, real-time progress), `generateTests` (from PRD, prompt, or exploration selection), `executeRun` (async Playwright execution with streaming), `analyzeFailure` (AI root cause for a specific failure), `sendTestNotification` (Slack webhook dispatch)

### Pages & Routes (14 total)

1. `/login` — email/password + Google OAuth
2. `/dashboard` — stats, trend chart, recent failures with AI insights, active runs
3. `/runs` — paginated/filterable runs table with tabs
4. `/runs/[id]` — split-panel run detail with step timeline, screenshots, console, AI root cause
5. `/flakiness-map` — heatmap grid with AI cluster analysis
6. `/projects/new` — project creation wizard (name, URL, PRD text/file upload)
7. `/projects/[id]/explore` — AI exploration view with discovered flows and selection
8. `/projects/[id]/suites/[suiteId]` — test suite review and code editor
9. `/suites` — suite management list
10. `/environments` — environment configuration
11. `/insights` — aggregated AI insights across all runs
12. `/integrations/ci` — CI pipeline configuration
13. `/integrations/slack` — Slack alert configuration
14. `/settings` — AI provider config, profile, workspace settings

### Design System

Airtable-inspired blue palette. Accent `#1b61c9`. Large border radii (12px/16px). Blue sidebar with white text. Status pills with dot indicators. Monospace fonts for all technical content. All existing "TestPulse" branding consolidated to "MSITest".

## Testing Decisions

### What Makes a Good Test

Test external behavior, not implementation details. Mock external dependencies (AI API HTTP calls, Playwright browser instance). Assert on observable outputs: database state after mutations, query return values, AI prompt construction, error handling paths. Tests should be deterministic and not depend on real browser availability or real AI API responses.

### Modules to Test

**AI Provider Module (unit tests)**

- Mock the HTTP layer. Verify correct request payloads are sent to the OpenAI-compatible endpoint for each of the four functions.
- Verify error handling: rate limits, invalid API keys, timeouts, malformed responses.
- Verify the response parsing extracts test code, root cause text, and confidence scores correctly.

**Exploration Module (integration tests)**

- Mock Playwright browser. Provide a fixture HTML page structure. Verify the module discovers pages, forms, navigation links, and proposes scenarios.
- Verify the AI Provider is called with the correct discovered structure.
- Verify edge cases: auth walls, infinite redirects, empty pages.

**Test Generation Module (unit tests)**

- Verify Playwright code is correctly stored in the database with draft status.
- Verify code validation (does the generated code parse as valid TypeScript?).
- Verify different source types (url_exploration, prd, natural_language) produce correctly typed records.

**Test Execution Module (integration tests — highest priority)**

- Use a minimal Playwright test against a local HTML fixture served by the test runner.
- Verify: screenshots are captured per step, console output is recorded, step trace data is parsed, results are written to Convex, real-time updates are emitted.
- Verify error paths: test timeout, browser crash, invalid test code.

**Run Aggregation Module (unit tests)**

- Seed fixture step results. Verify pass/fail/flaky counts, duration calculations.
- Verify AI Provider is called with correct failure context.
- Verify AI insights are stored with correct linkage to test and run.

No prior art exists — this is a greenfield project with no existing test patterns to follow.

## Out of Scope

- Multi-tenant workspaces and team management (data model supports it via `workspace_id`, UI and permissioning deferred)
- Public marketing/landing page
- Automated CI/CD triggers via GitHub OAuth (webhook listener infrastructure is built, but the GitHub App OAuth flow is deferred)
- Scheduled/cron test runs
- URL-based PRD ingestion from Notion, Google Docs, or Confluence
- Fully autonomous app exploration (guided selection only for MVP)
- Separate AI model configs per task (single model for generation, exploration, and analysis)
- Browser sandboxing and Docker isolation (local Playwright execution only)
- Billing, pricing, and usage metering
- Video playback in the run detail UI (video files are captured and stored, but the in-app player is post-MVP)
- Mobile-responsive optimization beyond basic sidebar collapse

## Further Notes

- The project currently consists of 7 static HTML mockup files that define the visual direction. These will be consolidated and rebuilt as Next.js pages using the Airtable-inspired blue design system, rebranded from "TestPulse" to "MSITest".
- The AI Provider Module's use of the OpenAI chat completions format means it supports GLM, OpenAI, DeepSeek, Mistral, Ollama, and any compatible provider without code changes — only the config differs.
- Test Execution is the most operationally risky module. Local Playwright execution is acceptable for MVP but will need sandboxing (Docker containers or a browser-as-a-service provider like Browserbase) before onboarding real users who need isolation and scale.
- The 14 pages break into: 5 existing mockups to rebuild (login, dashboard, runs, run detail, flakiness map) + 9 new pages to design and build (project creation, AI exploration, test suite editor, suites, environments, AI insights, CI pipelines, Slack alerts, settings).
- The Exploration Module's guided approach (AI proposes, user selects) is a deliberate MVP simplification over fully autonomous exploration. This reduces AI hallucination risk and gives users control over coverage scope.

# MSI Forge — Product Requirements Document

## 1. Vision

Engineering teams using AI coding tools generate code faster than they can verify it. Business analysts responsible for client projects struggle when context is locked in a single BA's head. Requirements Documents go stale; code becomes the only reliable source of truth. Feature requests pile up waiting for the "right" person to return.

**MSI Forge** solves both problems in one platform:

- **Analyst modules** reverse-engineer production code into a living Knowledge Base. Any BA can query any project instantly, generate accurate Baseline Requirements Documents, analyze feature requests with grounded impact analysis, and produce user stories — all backed by actual code evidence.
- **Test modules** generate and execute Playwright tests using that same code intelligence. Tests are grounded in accurate, code-derived Requirements Documents instead of stale uploads. Live exploration combined with Knowledge Base context produces more precise test plans.

The integration insight: BAs produce accurate RDs from live code, and those RDs feed test generation with ground-truth context. The result — any BA can work on any project on day one, and any developer can generate accurate tests for any feature.

## 2. Target Users

### 2.1 Business Analysts

Use the **Analyst modules** to onboard projects, generate Baseline RDs from code, analyze feature requests, generate user stories, and answer client questions through a ChatGPT-style interface grounded in the project's Knowledge Base.

### 2.2 Developers and QA Engineers

Use the **Test modules** to generate Playwright tests from PRDs, Baseline RDs, or natural language; execute tests with full telemetry (screenshots, video, traces, console logs); analyze failures with AI root cause analysis; and monitor test health over time.

### 2.3 Non-Users (v1)

External clients (no client-facing access in v1), developers writing production code (not a code generation tool), automated CI/CD pipelines.

## 3. Key User Journeys

### UJ-1: BA onboards a new project

Ana is a BA asked to take over a project she's never worked on. She enters the project name and GitHub repo URL, optionally uploads an old Requirements Document, and clicks "Analyze." The system reads the repo, indexes the code, and generates a Baseline RD with a Drift Report showing where the old RD diverges from code reality. Ana reviews, edits, and approves the Baseline RD. She now has a complete, accurate picture of what the app does — without reading a single line of code.

### UJ-2: BA analyzes a feature request

Ana receives a feature request from a client for a project she took over yesterday. She pastes the request into the chat. The AI responds with a structured impact analysis: affected modules, APIs, data models, user flows, and hidden dependencies. It generates user stories with acceptance criteria. Ana refines through follow-up questions, approves the stories, and exports them. In under 5 minutes, she has work that would normally take hours.

### UJ-3: BA answers an urgent client question

A client asks whether the system supports multi-currency. The original BA is on leave. Ana asks the chat, which queries the Knowledge Base and responds with specific code evidence: "No — all amounts stored as PHP in a single currency field. The payments module has no currency conversion logic." Ana responds to the client confidently in seconds.

### UJ-4: Developer generates context-aware tests

A developer opens a project that has a Baseline RD (produced by a BA via the Analyst modules). They trigger PRD-based test generation. The system reads the Baseline RD alongside live page exploration, producing tests that understand the actual module structure, API surface, and user flows — not just the raw PRD text. Tests are more accurate and fewer are needed to cover the same ground.

### UJ-5: Developer runs tests and analyzes failures

The developer runs the generated test suite. Tests execute with screenshots at every step, video recording, console output capture, and full traces. A test fails. The AI analyzes the failure with root cause analysis and suggests a code fix. The developer applies the fix and re-runs.

### UJ-6: Drift triggers test regeneration

A BA re-syncs a project's Knowledge Base after a code update. The system detects that three modules changed. It flags which existing tests may be stale and suggests regeneration. The developer reviews the flagged tests and triggers targeted regeneration for the affected modules only.

## 4. Glossary

### Shared

- **MSI Forge** — The unified AI platform combining code intelligence (Analyst) and test automation (Test).
- **Project** — A client engagement. Has an optional app URL (for testing) and an optional GitHub repo URL (for code analysis). Belongs to a workspace.
- **Workspace** — Top-level organizational container. Owns all projects, AI provider config, and integrations. Single workspace per user for MVP.
- **Thread** — A persistent conversation context. BA chat threads are scoped per project. Test generation threads are scoped per suite.
- **Environment** — A named deployment target (staging, production) with a base URL, scoped to a project.

### Analyst

- **Knowledge Base** — A structured, indexed representation of a project's codebase. Contains architecture summary, module map, code chunk embeddings, API surface, data models, and user flows. Built during onboarding, refreshed on demand.
- **Baseline RD** — A Requirements Document generated by AI from the production codebase. The authoritative description of what the app currently does. Editable by BAs. Versioned.
- **Old RD** — An existing Requirements Document uploaded by the BA. Serves as format reference and business context, not source of truth.
- **Drift Report** — A comparison between the Old RD and current codebase. Lists features added, removed, or changed since the Old RD was written.
- **Code Chunk** — A segment of source code stored in the Knowledge Base with a vector embedding for semantic search.
- **Module** — A major feature area detected in the codebase by AI. Contains related APIs, data models, and user flows.
- **Feature Request** — A client requirement analyzed against the Knowledge Base to produce impact analysis and user stories.
- **Impact Analysis** — A structured breakdown of which modules, APIs, data models, and user flows are affected by a Feature Request.
- **User Story** — A structured requirement generated by AI with title, description, acceptance criteria, and affected system components.

### Test

- **Suite** — A named group of tests within a project.
- **Test** — A single test scenario. Stored as Playwright TypeScript code or hybrid NL+code steps.
- **Run** — An execution of one or more tests. Tracks trigger type, environment, overall status, and per-test results.
- **Step** — A single action within a test execution. Records command, locator, pass/fail status, screenshot, and timing.
- **Exploration** — A guided flow where the system navigates a target app URL, captures page structure, and proposes testable scenarios.
- **AI Insight** — An AI-generated analysis linked to a test failure with root cause, suggested fix, and confidence score.
- **Flakiness** — A measure of test instability computed as the ratio of inconsistent results over recent run history.

## 5. Features

### 5.1 Project Management

Projects are the shared foundation. A project can be Analyst-only (repo URL, no app URL), Test-only (app URL, no repo), or both.

| FR | Requirement |
|---|---|
| FR-1 | BA or developer creates a project with a name, optional app URL, and optional GitHub repo URL |
| FR-2 | BA uploads an existing Requirements Document (Word, PDF, or Markdown) as optional context for drift detection |
| FR-3 | BA enters a GitHub PAT token to connect the repository; PAT is encrypted at rest and never returned to the frontend |
| FR-4 | BA clicks "Analyze" to trigger the code ingestion pipeline; progress is visible in real-time with stage indicators |

### 5.2 Knowledge Base Construction (Analyst)

The ingestion pipeline reads the production codebase, chunks the code, generates vector embeddings, and extracts structured knowledge.

| FR | Requirement |
|---|---|
| FR-5 | System reads all relevant source files from the connected GitHub repository with configurable include/exclude patterns |
| FR-6 | System splits source code into meaningful chunks grouped by file and directory |
| FR-7 | System generates vector embeddings for each code chunk stored in per-project namespaces |
| FR-8 | AI extracts architecture summary: tech stack, framework, folder structure, architecture type |
| FR-9 | AI identifies major modules and maps files to modules with cross-module dependencies |
| FR-10 | AI extracts all API endpoints with input/output shapes and HTTP methods |
| FR-11 | AI extracts database schemas, table definitions, and entity relationships |
| FR-12 | AI reconstructs user-facing flows by analyzing routes, pages, and component relationships |

### 5.3 Baseline RD and Drift Report (Analyst)

| FR | Requirement |
|---|---|
| FR-13 | AI generates a structured Requirements Document from the Knowledge Base with sections: Overview, Tech Stack, Modules, API Surface, Data Model, User Flows. Each section has a confidence score. If an Old RD exists, the Baseline RD mirrors its section format where possible |
| FR-14 | AI produces a Drift Report comparing Old RD against Knowledge Base with items categorized as added, removed, or changed |
| FR-15 | BA views the Baseline RD as formatted HTML and edits individual sections inline. Edits are saved and versioned. Confidence scores are visible per section |
| FR-16 | BA views the Drift Report as a structured list grouped by type, with each item linking to the relevant Baseline RD section |

### 5.4 AI Chat Interface (Analyst)

| FR | Requirement |
|---|---|
| FR-17 | BA starts a new chat thread within a project. Thread title is auto-generated from the first message |
| FR-18 | BA sends messages; AI responds with streaming output. Message history is preserved within the thread |
| FR-19 | Every AI response is grounded in the project's Knowledge Base using RAG. AI references specific modules, files, APIs, or data models and cites sources. If the KB doesn't contain the answer, the AI says so |
| FR-20 | When a BA pastes a feature request, AI generates a structured impact analysis: affected modules, APIs, data models, user flows, hidden dependencies |
| FR-21 | AI generates user stories from a feature request with title, description (As a... I want... So that...), numbered acceptance criteria, and affected components. Stories are stored as structured artifacts |
| FR-22 | BA refines analysis through follow-up questions ("Expand story 3", "What about the reporting module?"). AI maintains full conversation context |
| FR-23 | BA asks free-form questions about the project and receives grounded answers citing specific code evidence |

### 5.5 User Story Management (Analyst)

| FR | Requirement |
|---|---|
| FR-24 | BA views all user stories across all chat threads for a project, filtered by status |
| FR-25 | BA changes story status through the lifecycle: draft → approved → exported. Changes tracked with timestamps |
| FR-26 | BA exports user stories as downloadable Markdown file or copyable text |
| FR-27 | BA exports the Baseline RD in Markdown or HTML format |
| FR-28 | BA triggers a re-sync of the Knowledge Base. Previous Baseline RD is archived; a new version is generated |

### 5.6 AI Test Generation — URL-Based Exploration (Test)

| FR | Requirement |
|---|---|
| FR-29 | Runner renders app pages with Playwright (including SPA content), takes DOM snapshots and screenshots |
| FR-30 | AI proposes testable flows based on rendered page structure for user selection |
| FR-31 | User selects specific proposed flows for test generation |
| FR-32 | Exploration progress visible in real-time |

### 5.7 AI Test Generation — PRD-Based (Test)

| FR | Requirement |
|---|---|
| FR-33 | Developer types feature requirements and AI generates Playwright tests from them |
| FR-34 | Developer uploads a Markdown or PDF file with requirements for test generation |
| FR-35 | When a Baseline RD exists for the project, test generation includes its context (modules, API surface, user flows) alongside the PRD text for more accurate tests |

### 5.8 AI Test Generation — Natural Language (Test)

| FR | Requirement |
|---|---|
| FR-36 | Developer describes a test scenario in plain English and AI generates Playwright code |
| FR-37 | Developer specifies multiple scenarios for batch generation |
| FR-38 | When a Knowledge Base exists, NL generation includes KB context for grounded locator and flow suggestions |

### 5.9 Context-Aware Test Generation (Integration Bridge)

The Analyst-to-Test bridge. When a project has a Knowledge Base and Baseline RD, test generation becomes context-aware.

| FR | Requirement |
|---|---|
| FR-39 | Test Generation Agent gains a `readKnowledgeBase` tool that returns module names, API surface, data models, and user flows |
| FR-40 | Test Generation Agent gains a `readBaselineRd` tool that returns the latest Baseline RD sections and confidence scores |
| FR-41 | Exploration Analysis Agent cross-references discovered pages against KB modules and flags coverage gaps |
| FR-42 | When a project's Knowledge Base is re-synced, the system detects which modules changed and flags which tests may need regeneration |

### 5.10 Test Execution and Results (Test)

| FR | Requirement |
|---|---|
| FR-43 | Developer runs a test suite with real-time progress monitoring |
| FR-44 | Screenshots captured at every step, video recording, console output capture, full traces |
| FR-45 | Developer runs a single test individually for debugging |
| FR-46 | Developer re-runs a failed test to check for flakiness |

### 5.11 AI Root Cause Analysis and Healing (Test)

| FR | Requirement |
|---|---|
| FR-47 | AI generates root cause analysis for every test failure with confidence score and suggested fix |
| FR-48 | Auto-heal repairs failing tests with a configurable confidence threshold; healed tests saved as draft for review |
| FR-49 | Healing knowledge persists across runs; fixes applied proactively before tests fail again |

### 5.12 Dashboard and Analytics (Test)

| FR | Requirement |
|---|---|
| FR-50 | Overall pass rate, failed/flaky/total counts with trend arrows |
| FR-51 | Pass rate trend chart over last 20 runs |
| FR-52 | Recent failure cards with AI root cause analysis and suggested fixes |
| FR-53 | Currently running tests with live progress bars |
| FR-54 | Flakiness heatmap grid color-coded by stability with AI cluster analysis |

### 5.13 Suite and Test Management (Test)

| FR | Requirement |
|---|---|
| FR-55 | Suite CRUD with descriptive auto-generated names per generation source |
| FR-56 | Test review: view generated Playwright code, edit inline, approve for execution, delete, re-generate |
| FR-57 | Environment management: define staging/production/dev targets with base URLs |
| FR-58 | Test lists: cross-project grouping of tests into named, executable lists |

### 5.14 Monitoring and Scheduling (Test)

| FR | Requirement |
|---|---|
| FR-59 | Scheduled test runs on cadence (hourly, daily, weekly) via Convex crons |
| FR-60 | Monitoring page: all schedules, run history, run-vs-run diffs |

### 5.15 Export and Integrations (Shared)

| FR | Requirement |
|---|---|
| FR-61 | Export user stories as Markdown |
| FR-62 | Export Baseline RD as Markdown or HTML |
| FR-63 | Export dashboard data |
| FR-64 | Slack webhook integration with configurable alert rules |
| FR-65 | GitHub webhook listener for CI-triggered runs |

### 5.16 Settings and Authentication (Shared)

| FR | Requirement |
|---|---|
| FR-66 | Sign in with email and password, or Google OAuth |
| FR-67 | Workspace creation with required AI provider config (BYOK — any OpenAI-compatible endpoint) |
| FR-68 | Update AI provider config, profile, workspace settings |

## 6. Non-Goals (Explicit)

- Code generation or modification — MSI Forge reads and analyzes code; it does not write or modify production code
- CI/CD pipeline integration beyond webhook triggers
- Project management features (not a replacement for Jira or Azure DevOps)
- Real-time code monitoring (Knowledge Base refreshed on demand, not continuously)
- Client-facing access (internal BAs and developers only in v1)
- Role-based access control (all users have equal access in v1)
- Billing, pricing, and usage metering
- Mobile-responsive optimization beyond basic sidebar collapse

## 7. MVP Scope

### 7.1 In Scope

**Analyst modules:**
- Project creation with GitHub repo connection
- Old RD upload and text extraction
- Code ingestion pipeline (read, chunk, embed, index)
- Knowledge Base construction (architecture, modules, APIs, data models, user flows)
- Baseline RD generation with confidence scores
- Drift Report generation
- Baseline RD viewer and editor
- ChatGPT-style chat with streaming and RAG
- Feature request analysis with impact breakdown
- User story generation with acceptance criteria
- Story management and export
- Knowledge Base refresh (manual trigger)

**Test modules:**
- URL-based exploration with scenario selection
- PRD-based test generation (enhanced with Baseline RD context)
- Natural language test generation (enhanced with KB context)
- Test execution via Runner with full telemetry
- AI root cause analysis and auto-heal
- Dashboard, runs list, run detail, flakiness heatmap
- Suite and test management
- Environments, test lists, schedules
- Slack and GitHub integrations

**Shared:**
- Better Auth (email/password + Google OAuth)
- Multi-project dashboard
- BYOK AI provider config
- Self-hosted deployment via Coolify

### 7.2 Out of Scope for MVP

- Azure DevOps integration (push stories as work items)
- Confluence or other doc source integration
- OAuth-based GitHub authentication (PAT only)
- Automated scheduled Knowledge Base refresh
- Audit logging of user actions
- Mobile-responsive design optimization
- Multi-tenant data isolation
- Video playback in run detail UI
- Fully autonomous app exploration (guided selection only)
- Parallel test execution
- Separate AI model configs per task

## 8. Success Metrics

### Primary

| ID | Metric | Target | Validates |
|---|---|---|---|
| SM-1 | BA adoption | 4/5 BAs use MSI Forge weekly within 4 weeks | FR-17, FR-18 |
| SM-2 | Time-to-impact-analysis | Under 5 minutes from feature request to completed analysis | FR-20 |
| SM-3 | Test accuracy improvement | Tests generated with Baseline RD context have 20% fewer false failures than tests generated without | FR-39, FR-40 |

### Secondary

| ID | Metric | Target | Validates |
|---|---|---|---|
| SM-4 | Story acceptance rate | 70%+ AI-generated stories approved without major rewrites | FR-21 |
| SM-5 | Knowledge Base accuracy | BAs rate Baseline RD "mostly/fully accurate" for 4/5 projects | FR-13 |
| SM-6 | Cross-project coverage | 4/5 active projects onboarded within 6 weeks | FR-1, FR-4 |
| SM-7 | Drift-to-regeneration turnaround | Time from KB re-sync to test regeneration suggestion under 2 minutes | FR-42 |

### Counter-metrics (do not optimize)

| ID | Metric | Why not |
|---|---|---|
| SM-C1 | Chat message volume | High count could mean excessive back-and-forth, not quality |
| SM-C2 | Baseline RD length | Longer doesn't mean better |
| SM-C3 | Test count | More tests doesn't mean better coverage |

## 9. Open Questions

1. What is the Z.AI API endpoint URL and model name for the OpenAI-compatible API?
2. Does Coolify have specific requirements for deploying Next.js + Convex, or can it run any Docker container?
3. For projects with multiple GitHub repositories (frontend + backend separate), should the system support connecting multiple repos to a single project?
4. What is the maximum project codebase size to support? (Affects ingestion time and token budget.)
5. Should there be a limit on chat threads per project?

## 10. Assumptions

1. Z.AI provides an OpenAI-compatible API. If the API differs significantly, integration code needs adjustment.
2. GitHub PAT tokens grant sufficient access to private repos. Organization SSO policies may restrict this.
3. Small-to-medium repos can be fully read in a single ingestion run within GitHub API rate limits.
4. Convex vector store provides sufficient similarity search quality for RAG. If insufficient, an external vector DB may be needed.
5. Old RD formats are roughly similar across projects but not identical. AI adapts per project.
6. Pilot scope: ~5 users (BAs + developers) and ~5 projects.
7. Code analysis quality from LLM is sufficient for accurate impact analysis. May need prompt iteration.

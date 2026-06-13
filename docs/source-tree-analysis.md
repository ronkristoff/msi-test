# Source Tree Analysis

## Project Structure

MSITest is a multi-part TypeScript monorepo with three parts: **Frontend** (Next.js), **Backend** (Convex), and **Runner** (Playwright execution engine).

---

## Annotated Directory Tree

```
msi-test/
│
├── README.md                         # Project README
├── CONTEXT.md                        # Domain glossary and data hierarchy
├── AGENTS.md                         # Agent quick reference (commands, architecture, conventions)
├── package.json                      # Root package: shared deps (Next.js, Convex, Playwright, AI)
├── pnpm-workspace.yaml               # pnpm config (ignoredBuiltDependencies)
├── tsconfig.json                     # Root TypeScript config (Next.js, excluding convex/runner)
├── next.config.ts                    # Next.js 16 config
├── postcss.config.mjs                # Tailwind v4 PostCSS plugin
├── vitest.config.ts                  # Frontend vitest (jsdom, @/* alias)
├── eslint.config.mjs                 # ESLint (next/core-web-vitals + typescript)
├── .env.local                        # Local env vars (Convex URLs, RUNNER_SECRET)
│
├── docs/                             # 📚 Documentation hub
│   ├── PRD.md                        # Full product requirements document
│   ├── project-scan-report.json      # This workflow's state file
│   ├── adr/                          # 7 architectural decision records (0001-0007)
│   ├── agents/                       # Agent docs (domain.md, issue-tracker, triage-labels)
│   └── issues/                       # 40+ feature/bug issue tracking files
│
├── public/                           # Static assets (favicon, images)
│
├── src/                              # 🖥️ FRONTEND — Next.js 16 (App Router)
│   ├── proxy.ts                      # Edge middleware: cookie-based auth gate
│   │
│   ├── app/                          # Next.js App Router pages
│   │   ├── layout.tsx                # Root layout (HTML shell, ConvexClientProvider)
│   │   ├── page.tsx                  # Redirect / → /login
│   │   ├── api/auth/[...all]/route.ts # Better Auth HTTP handler
│   │   ├── (public)/login/page.tsx    # Login/signup page
│   │   └── (auth)/                   # Authenticated routes
│   │       ├── layout.tsx            # Auth gate: workspace routing + AppLayout wrapper
│   │       ├── dashboard/page.tsx    # Dashboard: stats, charts, recent failures, active runs
│   │       ├── onboarding/page.tsx   # Sidebarless onboarding flow
│   │       ├── runs/page.tsx         # Run history table
│   │       ├── runs/[id]/page.tsx    # Run detail + results + artifacts
│   │       ├── flakiness-map/page.tsx # Heatmap grid + AI clusters
│   │       ├── insights/page.tsx     # AI root cause analysis
│   │       ├── settings/page.tsx     # Workspace settings (4 tabs)
│   │       ├── projects/page.tsx     # Project list
│   │       ├── projects/new/page.tsx  # Create project
│   │       ├── projects/[id]/page.tsx # Project overview
│   │       ├── projects/[id]/settings/page.tsx # Project settings
│   │       ├── projects/[id]/generate/page.tsx # PRD test generation
│   │       ├── projects/[id]/generate-nl/page.tsx # NL test generation
│   │       ├── projects/[id]/explore/page.tsx # URL exploration
│   │       ├── projects/[id]/environments/page.tsx # Environment management
│   │       ├── projects/[id]/suites/[suiteId]/page.tsx # Suite detail
│   │       ├── test-lists/page.tsx    # Test list management
│   │       ├── test-lists/[id]/page.tsx # Test list detail
│   │       ├── monitoring/page.tsx    # Scheduled runs
│   │       └── monitoring/[id]/page.tsx # Schedule detail + diff
│   │
│   ├── components/                   # Reusable UI components (54 files)
│   │   ├── ui/                       # Design system primitives (Button, Card, Input, etc.)
│   │   ├── dashboard/                # Dashboard sub-components (StatsGrid, charts, etc.)
│   │   ├── RunDetail/                # Run detail sub-components (test list, timeline, screenshots)
│   │   ├── FlakinessMap/             # Flakiness map sub-components (heatmap, filters, export)
│   │   ├── AppLayout.tsx             # App shell: sidebar + topbar + breadcrumbs
│   │   ├── AIConfigForm.tsx          # AI provider config form
│   │   ├── RunsList.tsx              # Full runs table with filters
│   │   ├── TestChat.tsx              # AI test refinement chat
│   │   ├── TaskTray.tsx              # Real-time task status indicator
│   │   ├── Logo.tsx                  # SVG logo
│   │   └── ...                       # Other domain components
│   │
│   ├── lib/                          # Shared utilities (16 files)
│   │   ├── convex.ts                 # Convex API + type re-exports
│   │   ├── auth-client.ts            # Better Auth client
│   │   ├── auth-server.ts            # Better Auth SSR token handling
│   │   ├── schemas.ts                # All zod validation schemas
│   │   ├── constraints.ts            # Shared validation constants (re-exports convex/lib/)
│   │   ├── types.ts                  # Frontend-specific types
│   │   ├── dashboard-types.ts        # Dashboard type derivations
│   │   ├── run-detail-types.ts       # Run detail type derivations
│   │   ├── format.ts                 # Date/time/number formatters
│   │   ├── urls.ts                   # URL validation/normalization
│   │   ├── run-status.ts             # Run status → variant mapping
│   │   ├── flakiness-colors.ts       # Flakiness level → color mapping
│   │   ├── source-types.ts           # Source type labels
│   │   ├── ai-presets.ts             # AI provider presets (OpenAI, Anthropic, etc.)
│   │   ├── error-logger.ts           # Global error logging
│   │   ├── use-breadcrumbs.ts        # Dynamic breadcrumb resolver
│   │   └── use-file-upload.ts        # Convex file upload hook
│   │
│   └── test/                         # Test setup
│       └── setup.ts                  # @testing-library/jest-dom/vitest auto-load
│
├── convex/                           # ⚙️ BACKEND — Convex serverless functions
│   ├── schema.ts                     # Data model: 18 tables with indexes
│   ├── auth.ts                       # Better Auth component + factory
│   ├── auth.config.ts                # Better Auth provider config
│   ├── convex.config.ts              # Component registration (6 components)
│   ├── http.ts                       # HTTP route handler (Better Auth callbacks)
│   ├── crons.ts                      # 5 cron jobs
│   ├── tsconfig.json                 # Convex TypeScript config (ESNext target)
│   ├── vitest.config.ts              # Convex vitest (edge-runtime)
│   ├── README.md                     # Convex readme
│   │
│   ├── lib/                          # Shared Convex utilities
│   │   ├── requireAuth.ts            # Auth helpers (requireAuth, getOptionalOwnedEntity, etc.)
│   │   ├── validation.ts             # Input validators (name, URL, API key masking, test step validators)
│   │   ├── constraints.ts            # Shared constants (NAME_MIN, NAME_MAX, PASSWORD_MIN, URL helpers)
│   │   ├── locking.ts                # Lock stale threshold constant
│   │   ├── runner.ts                 # Runner secret validation
│   │   └── resolveSuiteTests.ts      # Test ID resolution for suites
│   │
│   ├── workspaces/                   # Workspace CRUD
│   │   ├── queries.ts                # getCurrentUser, hasWorkspace, getWorkspaceForUser
│   │   ├── mutations.ts              # createWorkspace, updateWorkspace
│   │   └── actions.ts                # runnerGetWorkspaceAiConfig
│   │
│   ├── users/                        # User profile
│   │   └── mutations.ts              # updateUserName, updateUserPassword
│   │
│   ├── members/                      # Workspace membership
│   │   ├── queries.ts                # getMembers, getCurrentMember
│   │   └── mutations.ts              # joinWorkspace, removeMember, regenerateInviteCode
│   │
│   ├── projects/                     # Project CRUD + auth config
│   │   ├── queries.ts                # getProjects, getProject, getProjectForAi
│   │   └── mutations.ts              # createProject, updateProject, archive/unarchive
│   │
│   ├── suites/                       # Suite management
│   │   ├── queries.ts                # getSuites, getSuite, getActiveTasks, getTaskOutcomes, etc.
│   │   └── mutations.ts              # createSuite, updateSuite, deleteSuite, markStaleGenerations
│   │
│   ├── tests/                        # Test CRUD + locking
│   │   ├── queries.ts                # getTests, getTestInternal
│   │   └── mutations.ts              # create/update/delete tests, lock/unlock, approveAll
│   │
│   ├── runs/                         # Run execution + lifecycle
│   │   ├── queries.ts                # getPendingWork, getRunDetail, getWorkspaceRuns, etc.
│   │   ├── mutations.ts              # triggerRun, rerunTest, runAllTests
│   │   ├── actions.ts                # runnerClaimRun, runnerCompleteRun, analyzeFailures, autoHeal
│   │   └── internal.ts               # Internal claim/complete/heartbeat/stale-cleanup logic
│   │
│   ├── environments/                 # Environment management
│   │   ├── queries.ts                # getEnvironments, getWorkspaceEnvironments
│   │   └── mutations.ts              # create/update/delete environment
│   │
│   ├── explorations/                 # App exploration + page capture
│   │   ├── queries.ts                # getExploration, getPendingExplorations, getSuitesForExploration
│   │   ├── mutations.ts              # create/cancel/complete exploration, markGeneratedAreas
│   │   ├── actions.ts                # runnerClaimExploration, runnerCompleteExploration, etc.
│   │   └── internal.ts               # Internal status/progress/scenario management
│   │
│   ├── schedules/                    # Scheduled test runs
│   │   ├── queries.ts                # getSchedules, getScheduleRuns, getScheduleRunDiff
│   │   ├── mutations.ts              # create/update/delete schedule
│   │   └── internal.ts               # triggerScheduledRun, checkScheduledRuns (cron)
│   │
│   ├── test_lists/                   # Cross-project test grouping
│   │   ├── queries.ts                # getTestLists, getTestListDetail, getApprovedTestsForWorkspace
│   │   └── mutations.ts              # create/update/delete list, add/remove tests
│   │
│   ├── dashboard/                    # Dashboard aggregation
│   │   └── queries.ts                # getDashboardStats, getActiveRuns
│   │
│   ├── insights/                     # AI-generated insights
│   │   └── queries.ts                # getAIInsights
│   │
│   ├── flakiness/                    # Flakiness analysis
│   │   ├── queries.ts                # getFlakinessMap
│   │   └── actions.ts                # analyzeFlakinessClusters
│   │
│   ├── files/                        # File storage
│   │   └── actions.ts                # generateUploadUrl, runnerGenerateUploadUrl
│   │
│   ├── logs/                         # Error logging
│   │   └── mutations.ts              # logError (public)
│   │
│   ├── stagehand/                    # Browser-based page operations
│   │   ├── actions.ts                # checkUrlReachability, extractPageInfo, detectPageChanges
│   │   └── internal.ts               # getLastCapturedPage
│   │
│   ├── ai/                           # AI test generation + healing
│   │   ├── model.ts                  # AI config retrieval, model creation
│   │   ├── agents.ts                 # Agent factory functions
│   │   ├── generatePrdTests.ts        # PRD → Playwright tests
│   │   ├── generateNlTests.ts         # Natural language → Playwright tests
│   │   ├── healTest.ts               # AI test healing
│   │   ├── healLiveDom.ts            # Live DOM-based healing
│   │   ├── refineTest.ts             # Post-heal test refinement
│   │   ├── exploreApp.ts             # Exploration data → test scenarios
│   │   ├── prdWorkflow.ts            # PRD generation workflow
│   │   ├── nlWorkflow.ts             # NL generation workflow
│   │   ├── prdWorkflowActions.ts     # PRD workflow entry points
│   │   ├── nlWorkflowActions.ts      # NL workflow entry points
│   │   ├── browserClient.ts          # Runner HTTP client (snapshot, validate, feedback)
│   │   ├── snapshotFormatter.ts      # DOM snapshot formatting for AI
│   │   ├── snapshotAction.ts         # Live DOM snapshot action
│   │   ├── feedbackDiscovery.ts      # UI feedback state discovery
│   │   ├── resolveContext.ts         # Generation context builder
│   │   ├── workflowShared.ts         # Shared workflow utilities
│   │   ├── formatPages.ts            # Page formatting for AI prompts
│   │   ├── formatElements.ts         # Element formatting
│   │   ├── authContext.ts            # Auth-aware prompt instructions
│   │   ├── suiteStatus.ts            # Suite status update helpers
│   │   ├── diff.ts                   # Code diff formatter
│   │   ├── parse.ts                  # AI response JSON extraction
│   │   ├── errors.ts                 # AI error parsing
│   │   └── aiRateLimit.ts            # Rate limiting constants
│   │
│   ├── _generated/                   # 🔧 Auto-generated Convex types (never edit)
│   │   ├── api.d.ts                  # All function signatures
│   │   ├── dataModel.d.ts            # All table document types
│   │   ├── server.d.ts               # Server-side Convex API
│   │   └── ai/guidelines.md          # Convex AI coding guidelines
│   │
│   └── ai/__fixtures__/              # AI test fixtures
│       └── test-generation-response.md
│
└── runner/                           # 🏃 RUNNER — Playwright execution engine
    ├── vitest.config.ts              # Runner vitest config
    ├── integration.test.ts           # End-to-end test against real Playwright
    │
    └── src/                          # Runner source
        ├── index.ts                  # Entry point: poll loop, work dispatch, shutdown
        ├── config.ts                 # Configuration (env var parsing)
        ├── convex-client.ts          # Convex HTTP client wrapper (17 function calls)
        ├── types.ts                  # TypeScript types (work items, results, config)
        ├── executor.ts               # Playwright test executor (spawn + collect results)
        ├── stagehand-executor.ts     # Stagehand AI browser test executor
        ├── stagehand.ts              # Stagehand SDK initialization
        ├── explorer.ts               # Scripted exploration (Stagehand observe/act/extract)
        ├── autonomous-explorer.ts    # Autonomous AI exploration (no script)
        ├── link-crawler.ts           # Multi-page link discovery + flow detection
        ├── flowDiscovery.ts          # Flow extraction from link graphs
        ├── feedback-discovery.ts     # UI feedback state detection
        ├── prd-utils.ts              # PRD keyword extraction + coverage checking
        ├── explorer-utils.ts         # Shared exploration utilities
        ├── playwright-spawn.ts       # Playwright process spawning
        ├── reporter.ts               # Playwright reporter (JSON output)
        ├── snapshot-api.ts           # Local HTTP API for Convex (snapshot, validate, feedback)
        │
        ├── types/                    # Additional type definitions
        │   └── ...
        │
        └── test-utils/               # Test infrastructure
            └── stagehand-mocks.ts    # Mock factories for unit tests
```

---

## Cross-Part Integration Points

```
┌──────────────┐     Convex Reactive     ┌───────────────┐
│   Frontend   │◄───────────────────────►│    Backend    │
│  (Next.js)   │   useQuery/useMutation  │   (Convex)    │
│              │   useAction             │               │
└──────────────┘                         └───────┬───────┘
                                                 │
                                     Runner Action Contract
                                     (RUNNER_SECRET auth)
                                                 │
                                          ┌──────┴──────┐
                                          │    Runner    │
                                          │ (Playwright) │
                                          └─────────────┘

Runner ↔ Convex:
  - Runner polls: getPendingWork(), getPendingExplorations()
  - Runner claims: runnerClaimRun(), runnerClaimExploration()
  - Runner reports: runnerWriteStepResult(), runnerCompleteRun(), runnerCompleteExploration()
  - Runner heartbeats: runnerHeartbeat() every 30s

Convex ↔ Runner (snapshot API):
  - Convex calls runner HTTP API (localhost:8931) for live DOM snapshot, test validation, feedback discovery
```

---

## Critical Directories Summary

| Part | Directory | Purpose |
|---|---|---|
| Frontend | `src/app/` | All route pages (22 routes) |
| Frontend | `src/components/` | Reusable UI components (54 files) |
| Frontend | `src/lib/` | Shared utilities, types, schemas (16 files) |
| Backend | `convex/schema.ts` | Data model definitions (18 tables) |
| Backend | `convex/*/queries.ts` | Read functions (16 files across 12 modules) |
| Backend | `convex/*/mutations.ts` | Write functions (11 files across 10 modules) |
| Backend | `convex/*/actions.ts` | Async functions (6 files across 6 modules) |
| Backend | `convex/ai/` | AI agents, workflows, healing, generation |
| Backend | `convex/lib/` | Shared backend utilities (6 files) |
| Runner | `runner/src/index.ts` | Entry point (poll loop, dispatch) |
| Runner | `runner/src/convex-client.ts` | Convex HTTP contract |
| Runner | `runner/src/executor.ts` | Playwright execution |
| Runner | `runner/src/stagehand-executor.ts` | Stagehand AI execution |
| Runner | `runner/src/snapshot-api.ts` | Local HTTP API for Convex→Runner calls |

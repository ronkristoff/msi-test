# API Contracts — Frontend (Next.js)

## Overview

The frontend communicates exclusively with the **Convex backend** via real-time reactive queries, mutations, and actions. There are no REST endpoints or custom API clients — all data flows through Convex's type-safe API layer.

**Patterns:**
- `useQuery(api.<module>.<function>)` — reactive reads (auto-update on DB changes)
- `useMutation(api.<module>.<function>)` — writes (called imperatively)
- `useAction(api.<module>.<function>)` — async AI/file operations
- `"skip"` pattern — conditional queries: `useQuery(api.foo.bar, condition ? args : "skip")`

**Auth:** Better Auth via `@convex-dev/better-auth` (email/password + Google OAuth)

---

## HTTP Route Handler

| Route | Methods | Handler | Purpose |
|---|---|---|---|
| `/api/auth/[...all]` | `GET`, `POST` | `src/app/api/auth/[...all]/route.ts` | Better Auth callbacks via `convexBetterAuthNextJs` |

---

## Convex Query Registry

### Workspaces

| Function | Purpose |
|---|---|
| `api.workspaces.queries.getCurrentUser` | Current authenticated user (or null) |
| `api.workspaces.queries.hasWorkspace` | Boolean — user has workspace |
| `api.workspaces.queries.getWorkspaceForUser` | User's workspace with masked API key |

### Projects

| Function | Purpose |
|---|---|
| `api.projects.queries.getProjects` | List projects for workspace (filterable) |
| `api.projects.queries.getProject` | Single project detail |

### Suites

| Function | Purpose |
|---|---|
| `api.suites.queries.getSuite` | Single suite detail with test count |
| `api.suites.queries.getSuites` | Suite list enriched with test counts |
| `api.suites.queries.getFunctionalSuites` | Functional suites for a project |
| `api.suites.queries.getActiveTasks` | Active generating/running/exploring/healing tasks |
| `api.suites.queries.getTaskOutcomes` | Batch completion check for progress polling |
| `api.suites.queries.getSuitesForWorkspace` | All suites across workspace (insights) |
| `api.suites.queries.getRegressionMembers` | Regression suite members |
| `api.suites.queries.getRegressionsForMemberSuite` | Parent regression suites |

### Tests

| Function | Purpose |
|---|---|
| `api.tests.queries.getTests` | List tests for a suite |

### Runs

| Function | Purpose |
|---|---|
| `api.runs.queries.getWorkspaceRuns` | Runs with filters (status, branch, env, search, sort) |
| `api.runs.queries.getRunDetail` | Full run detail with results, steps, artifacts |
| `api.runs.queries.getRunFilterOptions` | Filter metadata (branches, environments, status counts) |
| `api.runs.queries.getActiveRunForSuite` | Current running run for a suite |
| `api.runs.queries.getLatestFailureForTest` | Latest failure info for a test |
| `api.runs.queries.getSameFailureHistory` | Last 5 failures for same test |
| `api.runs.queries.getStepScreenshotUrl` | Screenshot file URL |
| `api.runs.queries.getConsoleLogUrl` | Console log file URL |
| `api.runs.queries.getResultArtifactUrls` | All artifact URLs for a result |
| `api.runs.queries.getHealingHistory` | Healing history entries for a test |

### Environments

| Function | Purpose |
|---|---|
| `api.environments.queries.getEnvironments` | List for a project |
| `api.environments.queries.getWorkspaceEnvironments` | All environments in workspace |

### Explorations

| Function | Purpose |
|---|---|
| `api.explorations.queries.getLatestActiveExploration` | Most recent active exploration |
| `api.explorations.queries.getExploration` | Full exploration with screenshot URLs |
| `api.explorations.queries.getSuitesForExploration` | Generated suites for an exploration |

### Test Lists

| Function | Purpose |
|---|---|
| `api.test_lists.queries.getTestLists` | All test lists with member counts |
| `api.test_lists.queries.getTestListDetail` | Full detail with members + runs |
| `api.test_lists.queries.getTestListsForTest` | Lists containing a test |
| `api.test_lists.queries.getApprovedTestsForWorkspace` | All approved tests (with search) |

### Dashboard

| Function | Purpose |
|---|---|
| `api.dashboard.queries.getDashboardStats` | Pass rate, trends, flaky count, recent failures |
| `api.dashboard.queries.getActiveRuns` | Currently running runs |

### Insights

| Function | Purpose |
|---|---|
| `api.insights.queries.getAIInsights` | AI analysis enriched with test names |

### Flakiness

| Function | Purpose |
|---|---|
| `api.flakiness.queries.getFlakinessMap` | Cross-run matrix with flakiness percentages |

### Schedules

| Function | Purpose |
|---|---|
| `api.schedules.queries.getSchedules` | All schedules enriched |
| `api.schedules.queries.getSchedule` | Single schedule |
| `api.schedules.queries.getScheduleRuns` | Paginated runs for a schedule |
| `api.schedules.queries.getScheduleRunDiff` | Diff between two schedule runs |

### Members

| Function | Purpose |
|---|---|
| `api.members.queries.getMembers` | All workspace members |
| `api.members.queries.getCurrentMember` | Current user's membership record |

---

## Convex Mutation Registry

### Workspaces

| Function | Purpose |
|---|---|
| `api.workspaces.mutations.createWorkspace` | Create workspace + owner membership |
| `api.workspaces.mutations.updateWorkspace` | Update name, AI config, heal threshold, stagehand flag |

### Users

| Function | Purpose |
|---|---|
| `api.users.mutations.updateUserName` | Update display name + sync memberships |
| `api.users.mutations.updateUserPassword` | Change password |

### Projects

| Function | Purpose |
|---|---|
| `api.projects.mutations.createProject` | Create project (name, URL, PRD, test_data) |
| `api.projects.mutations.updateProject` | Update project fields, auth config, PRD |
| `api.projects.mutations.archiveProject` | Archive project |
| `api.projects.mutations.unarchiveProject` | Restore archived project |

### Suites

| Function | Purpose |
|---|---|
| `api.suites.mutations.createSuite` | Create functional suite |
| `api.suites.mutations.createRegressionSuite` | Create regression suite with member suites |
| `api.suites.mutations.createSuitesForExploration` | Batch create suites per area (post-exploration) |
| `api.suites.mutations.updateSuite` | Update name/description |
| `api.suites.mutations.deleteSuite` | Delete suite + tests + members |
| `api.suites.mutations.addSuiteMember` | Add suite/test to regression |
| `api.suites.mutations.retrySuiteGeneration` | Retry failed suite generation |

### Tests

| Function | Purpose |
|---|---|
| `api.tests.mutations.updateTestCode` | Update playwright code, steps, name, status |
| `api.tests.mutations.updateTestStatus` | Change status (draft/approved/healing) |
| `api.tests.mutations.deleteTest` | Delete a test |
| `api.tests.mutations.lockTest` | Lock for editing |
| `api.tests.mutations.unlockTest` | Unlock |
| `api.tests.mutations.approveAllTests` | Batch-approve all draft tests in suite |

### Runs

| Function | Purpose |
|---|---|
| `api.runs.mutations.triggerRun` | Create run + run_results |
| `api.runs.mutations.rerunTest` | Create rerun from existing run |
| `api.runs.mutations.runAllTests` | Run all approved tests in project |

### Environments

| Function | Purpose |
|---|---|
| `api.environments.mutations.createEnvironment` | Create environment (name + URL) |
| `api.environments.mutations.updateEnvironment` | Update name/URL |
| `api.environments.mutations.deleteEnvironment` | Delete |

### Explorations

| Function | Purpose |
|---|---|
| `api.explorations.mutations.createExploration` | Create exploration (mode, max_steps) |
| `api.explorations.mutations.cancelExploration` | Cancel active exploration |
| `api.explorations.mutations.startDeepExploration` | Start capture phase with selected pages |
| `api.explorations.mutations.updateDiscoveredPages` | Add extra URLs |
| `api.explorations.mutations.markGeneratedAreas` | Track generated areas |

### Test Lists

| Function | Purpose |
|---|---|
| `api.test_lists.mutations.createTestList` | Create test list |
| `api.test_lists.mutations.updateTestList` | Update name/description |
| `api.test_lists.mutations.deleteTestList` | Delete list + members |
| `api.test_lists.mutations.addTestToList` | Add single test |
| `api.test_lists.mutations.addTestsToList` | Batch-add tests |
| `api.test_lists.mutations.removeTestFromList` | Remove test |

### Schedules

| Function | Purpose |
|---|---|
| `api.schedules.mutations.createSchedule` | Create schedule (min 60s cadence) |
| `api.schedules.mutations.updateSchedule` | Update name, cadence, env, enabled |
| `api.schedules.mutations.deleteSchedule` | Delete |

### Members

| Function | Purpose |
|---|---|
| `api.members.mutations.joinWorkspace` | Join via invite code |

### Logs

| Function | Purpose |
|---|---|
| `api.logs.mutations.logError` | Client error logging (public, no auth) |

---

## Convex Action Registry

| Function | Purpose |
|---|---|
| `api.ai.generatePrdTests.generatePrdTests` | Generate tests from PRD text |
| `api.ai.generateNlTests.generateNlTests` | Generate tests from natural language |
| `api.ai.exploreApp.generateExplorationTestsForArea` | Generate tests from exploration area |
| `api.ai.exploreApp.retryExplorationGeneration` | Retry failed scenario generation |
| `api.ai.exploreApp.retryFailedScenarios` | Retry specific failed scenarios |
| `api.ai.healTest.healTest` | AI-powered test healing |
| `api.ai.refineTest.refineTest` | Refine test after healing |
| `api.flakiness.actions.analyzeFlakinessClusters` | AI flakiness cluster analysis |
| `api.files.actions.generateUploadUrl` | Auth-gated file upload URL |

---

## Auth Flow

1. **Edge proxy** (`src/proxy.ts`): Cookie-only session check → redirects unauthenticated to `/login`
2. **Auth layout** (`src/app/(auth)/layout.tsx`): Convex query-based workspace/onboarding routing
3. **Convex client** (`src/components/ConvexClientProvider.tsx`): `ConvexBetterAuthProvider` bridges Better Auth session to Convex
4. **Auth client** (`src/lib/auth-client.ts`): `createAuthClient` with `convexClient()` plugin
5. **Auth server** (`src/lib/auth-server.ts`): `convexBetterAuthNextJs` for SSR token passthrough

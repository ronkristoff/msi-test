# API Contracts — Backend (Convex)

## Overview

The Convex backend provides a serverless compute layer with 18 database tables, organized into 16 domain modules. Functions follow the Convex pattern: `queries.ts` (reads), `mutations.ts` (writes), `actions.ts` (async/AI), `internal.ts` (internal-only functions).

**Auth model:** Three-tier — `requireAuth(ctx)` for mutations, `getOptionalOwnedWorkspace(ctx)` for public queries, `getOptionalOwnedEntity(ctx, id, table)` for entity lookups.

---

## Module Inventory

### 1. Workspaces (`convex/workspaces/`)
| Function | Type | Purpose |
|---|---|---|
| `getCurrentUser` | query | Current authenticated user |
| `hasWorkspace` | query | Boolean — user has workspace |
| `getWorkspaceForUser` | query | User's workspace (masked API key) |
| `createWorkspace` | mutation | Create workspace + owner membership |
| `updateWorkspace` | mutation | Update name, AI config, heal threshold, stagehand |
| `runnerGetWorkspaceAiConfig` | action | Runner-only AI config retrieval |

### 2. Users (`convex/users/`)
| Function | Type | Purpose |
|---|---|---|
| `updateUserName` | mutation | Update display name + sync memberships |
| `updateUserPassword` | mutation | Change password via Better Auth |

### 3. Members (`convex/members/`)
| Function | Type | Purpose |
|---|---|---|
| `getMembers` | query | All workspace members |
| `getCurrentMember` | query | Current user's membership |
| `joinWorkspace` | mutation | Join via invite code |
| `removeMember` | mutation | Remove member (owner-only) |
| `regenerateInviteCode` | mutation | New 8-char invite code |

### 4. Projects (`convex/projects/`)
| Function | Type | Purpose |
|---|---|---|
| `getProjects` | query | List (filterable active/archived) |
| `getProject` | query | Single project (masked secrets) |
| `getProjectForAi` | internalQuery | Unmasked project for AI/runner |
| `createProject` | mutation | Create (name, URL, PRD, test_data) |
| `updateProject` | mutation | Update fields, auth config, PRD |
| `archiveProject` | mutation | Set status to archived |
| `unarchiveProject` | mutation | Restore to active |

### 5. Suites (`convex/suites/`)
| Function | Type | Purpose |
|---|---|---|
| `getSuites` | query | Suite list with test counts |
| `getSuite` | query | Single suite with test count |
| `getRegressionMembers` | query | Regression member suites/tests |
| `getFunctionalSuites` | query | Functional suites for project |
| `getRegressionsForMemberSuite` | query | Parent regression suites |
| `getSuitesForWorkspace` | query | All suites (insights) |
| `getActiveTasks` | query | Active generating/running/exploring/healing tasks |
| `getTaskOutcomes` | query | Batch completion check |
| `createSuite` | mutation | Create functional suite |
| `updateSuite` | mutation | Update name/description |
| `deleteSuite` | mutation | Delete suite + tests + members |
| `createRegressionSuite` | mutation | Create regression with member suites |
| `addSuiteMember` | mutation | Add to regression |
| `removeSuiteMember` | mutation | Remove from regression |
| `retrySuiteGeneration` | mutation | Retry failed generation |
| `createSuitesForExploration` | mutation | Batch create per-area suites |
| `updateSuiteStatus` | internalMutation | Update status, unlock on ready/failed |
| `markStaleGenerations` | internalMutation | Cron: fail stuck generations |

### 6. Tests (`convex/tests/`)
| Function | Type | Purpose |
|---|---|---|
| `getTests` | query | List for a suite |
| `getTestInternal` | internalQuery | Internal test doc fetch |
| `updateTestCode` | mutation | Update code, steps, name, status, heal timestamps |
| `updateTestStatus` | mutation | Change status (draft/approved/healing) |
| `setTestHealing` | internalMutation | Runner sets healing status |
| `setTestDraft` | internalMutation | Runner resets to draft |
| `setTestApproved` | internalMutation | Runner sets approved |
| `approveAllTests` | mutation | Batch-approve draft tests |
| `deleteTest` | mutation | Delete test |
| `createTestFromGeneration` | internalMutation | Create from AI output |
| `lockTest` | mutation | Lock for editing |
| `unlockTest` | mutation | Unlock |
| `resetStaleHealingTests` | internalMutation | Cron: reset stuck healing tests |

### 7. Runs (`convex/runs/`)
| Function | Type | Purpose |
|---|---|---|
| `getPendingWork` | query | Unclaimed running runs for runner |
| `getRunDetail` | query | Full detail with results, steps, artifacts |
| `getActiveRunForSuite` | query | Currently running run |
| `getWorkspaceRuns` | query | Runs with filtering/sorting |
| `getRunFilterOptions` | query | Filter metadata |
| `getSameFailureHistory` | query | Last 5 failures for test |
| `getStepScreenshotUrl` | query | Screenshot file URL |
| `getConsoleLogUrl` | query | Console log file URL |
| `getResultArtifactUrls` | query | All artifact URLs |
| `getLatestFailureForTest` | query | Latest failure error + steps |
| `getRunForAnalysis` | internalQuery | Data for AI failure analysis |
| `getHealingHistory` | query | Healing history for test |
| `triggerRun` | mutation | Create run + run_results |
| `rerunTest` | mutation | Create rerun |
| `runAllTests` | mutation | Run all approved tests in project |
| `runnerClaimRun` | action | Runner claims pending run |
| `runnerWriteStepResult` | action | Runner writes step result |
| `runnerWriteRunResult` | action | Runner writes run_result |
| `runnerCompleteRun` | action | Runner marks complete → triggers analysis + auto-heal |
| `runnerForceCompleteRun` | action | Runner force-completes |
| `runnerHeartbeat` | action | Runner heartbeat |
| `analyzeFailures` | internalAction | AI failure root-cause analysis |
| `runnerRecordHealingHistory` | action | Record healing event |
| `autoHealAndRerun` | internalAction | Auto-heal + create rerun |
| `claimRun` | internalMutation | Internal claim logic |
| `writeStepResult` | internalMutation | Insert step row |
| `writeRunResult` | internalMutation | Patch run_result |
| `completeRun` | internalMutation | Aggregate + finalize run |
| `forceCompleteRun` | internalMutation | Force-complete with status |
| `updateRunHeartbeat` | internalMutation | Upsert heartbeat |
| `markStaleRuns` | internalMutation | Cron: time out stale runs |
| `clearStaleTestLocks` | internalMutation | Cron: clear stale locks |
| `storeAiInsight` | internalMutation | Insert AI insight |
| `recordHealingHistory` | internalMutation | Store healing entry + update learned selectors |
| `markAutoHealAttempted` | internalMutation | Flag auto-heal |
| `createAutoHealRerun` | internalMutation | Create rerun with healed tests |

### 8. Environments (`convex/environments/`)
| Function | Type | Purpose |
|---|---|---|
| `getEnvironments` | query | List for project |
| `getWorkspaceEnvironments` | query | All in workspace |
| `getEnvironment` | query | Single |
| `createEnvironment` | mutation | Create (name + URL) |
| `updateEnvironment` | mutation | Update name/URL |
| `deleteEnvironment` | mutation | Delete |

### 9. Explorations (`convex/explorations/`)
| Function | Type | Purpose |
|---|---|---|
| `getExploration` | query | Full with screenshot URLs |
| `getExplorationsByProject` | query | All for project |
| `getLatestActiveExploration` | query | Most recent active |
| `getPendingExplorations` | query | Pending with auth config (runner) |
| `getSuitesForExploration` | query | Generated suites |
| `createExploration` | mutation | Create (mode, max_steps) |
| `cancelExploration` | mutation | Cancel active |
| `startDeepExploration` | mutation | Start capture phase |
| `updateDiscoveredPages` | mutation | Add extra URLs |
| `markExplorationCompleted` | mutation | Manual completion |
| `markGeneratedAreas` | mutation | Track generated areas |
| `runnerClaimExploration` | action | Runner claims |
| `runnerUpdateExplorationProgress` | action | Runner updates progress |
| `runnerCompleteExploration` | action | Submit captured pages → AI analysis |
| `runnerGetExplorationStatus` | action | Poll status |
| `runnerFailExploration` | action | Report failure |
| `runnerCompleteDiscovery` | action | Submit discovered pages + cookies |
| `claimExploration` | internalMutation | Internal claim |
| `completeDiscovery` | internalMutation | Store discovered pages |
| `updateExplorationProgress` | internalMutation | Progress update |
| `completeExplorationCapture` | internalMutation | Store captured pages |
| `storeProposedScenarios` | internalMutation | Store AI scenarios |
| `updateExplorationStatus` | internalMutation | Generic status update |
| `getExplorationStatus` | internalQuery | Status + error |
| `getExplorationAuthConfig` | internalQuery | Auth config for runner |
| `getExplorationForAnalysis` | internalQuery | Data for AI analysis |

### 10. Schedules (`convex/schedules/`)
| Function | Type | Purpose |
|---|---|---|
| `getSchedules` | query | All enriched |
| `getSchedule` | query | Single |
| `getScheduleRuns` | query | Paginated runs |
| `getScheduleRunDiff` | query | Diff between runs |
| `createSchedule` | mutation | Create (min 60s cadence) |
| `updateSchedule` | mutation | Update name, cadence, env |
| `deleteSchedule` | mutation | Delete |
| `triggerScheduledRun` | internalMutation | Trigger due schedule |
| `checkScheduledRuns` | internalMutation | Cron: find + trigger due schedules |

### 11. Test Lists (`convex/test_lists/`)
| Function | Type | Purpose |
|---|---|---|
| `getTestLists` | query | All with member counts + last run |
| `getTestListDetail` | query | Full detail with members + runs |
| `getApprovedTestsForWorkspace` | query | All approved with search |
| `getTestListsForTest` | query | Lists containing test |
| `createTestList` | mutation | Create |
| `updateTestList` | mutation | Update name/description |
| `deleteTestList` | mutation | Delete list + members |
| `addTestToList` | mutation | Add single test |
| `removeTestFromList` | mutation | Remove test |
| `addTestsToList` | mutation | Batch-add tests |

### 12. Dashboard (`convex/dashboard/`)
| Function | Type | Purpose |
|---|---|---|
| `getDashboardStats` | query | Pass rate, trends, flaky count, recent failures |
| `getActiveRuns` | query | Currently running runs with progress |

### 13. Insights (`convex/insights/`)
| Function | Type | Purpose |
|---|---|---|
| `getAIInsights` | query | AI insights enriched with test names |

### 14. Flakiness (`convex/flakiness/`)
| Function | Type | Purpose |
|---|---|---|
| `getFlakinessMap` | query | Cross-run matrix with flakiness percentages |
| `analyzeFlakinessClusters` | action | AI flakiness cluster analysis |

### 15. Files (`convex/files/`)
| Function | Type | Purpose |
|---|---|---|
| `generateUploadUrl` | action | Auth-gated upload URL |
| `runnerGenerateUploadUrl` | action | Runner-secret-gated upload URL |

### 16. Logs (`convex/logs/`)
| Function | Type | Purpose |
|---|---|---|
| `logError` | mutation | Client error logging (public) |

### 17. Stagehand (`convex/stagehand/`)
| Function | Type | Purpose |
|---|---|---|
| `checkUrlReachability` | action | Check URL via Browserbase |
| `extractPageInfo` | action | Extract page title, headings, links |
| `detectPageChanges` | action | Compare with last captured page |

### 18. AI (`convex/ai/`)
| Function | Type | Purpose |
|---|---|---|
| `analyzeExploration` | internalAction | Analyze captured data → scenarios |
| `healTest` | action | AI heal a failed test |
| `healTestLiveDom` | internalAction | Heal with live DOM access |
| `refineTest` | action | Refine after healing |
| `generateNlTests` | action | Generate from natural language |
| `generatePrdTests` | action | Generate from PRD |
| `startPrdGeneration` | action | Entry for PRD generation workflow |
| `startNlGeneration` | action | Entry for NL generation workflow |
| `discoverFeedback` | internalAction | Discover UI feedback states |
| `getSnapshotAction` | internalAction | Fetch live DOM snapshot via runner |

---

## Cron Jobs

| Cron | Interval | Purpose |
|---|---|---|
| `markStaleRuns` | 60s | Time out runs with stale heartbeats (>120s) |
| `clearStaleTestLocks` | 5min | Clear stale editing locks (>30min) |
| `checkScheduledRuns` | 60s | Find + trigger due schedules |
| `markStaleGenerations` | 2min | Fail suites stuck generating (>10min) |
| `resetStaleHealingTests` | 2min | Reset tests stuck healing (>10min) |

---

## Runner Contract

The external Runner process authenticates with a shared `RUNNER_SECRET`. All runner-facing functions are actions (prefixed `runner*`) that validate the secret before delegating to internal mutations/queries.

**Work Polling:**
- `api.runs.queries.getPendingWork` — poll for unclaimed runs
- `api.explorations.queries.getPendingExplorations` — poll for unclaimed explorations

**Run Lifecycle:**
1. Runner polls `getPendingWork` → finds running run
2. Claims via `api.runs.actions.runnerClaimRun`
3. Sends heartbeats via `api.runs.actions.runnerHeartbeat` (every 30s)
4. Executes tests → writes step results via `api.runs.actions.runnerWriteStepResult`
5. Writes per-test results via `api.runs.actions.runnerWriteRunResult`
6. Completes via `api.runs.actions.runnerCompleteRun` → triggers `analyzeFailures` + `autoHealAndRerun`

**Exploration Lifecycle:**
1. Runner polls `getPendingExplorations` → finds pending
2. Claims via `api.explorations.actions.runnerClaimExploration`
3. Sends progress via `api.explorations.actions.runnerUpdateExplorationProgress`
4. Polls status via `api.explorations.actions.runnerGetExplorationStatus`
5. Completes discovery via `api.explorations.actions.runnerCompleteDiscovery`
6. Completes capture via `api.explorations.actions.runnerCompleteExploration`

---

## Components

| Component | Purpose |
|---|---|
| `@convex-dev/better-auth` | Authentication (Better Auth) |
| `@convex-dev/agent` | AI agent framework for LLM interactions |
| `@browserbasehq/convex-stagehand` | Browser-based page extraction via Browserbase |
| `@convex-dev/action-cache` | Action result caching |
| `@convex-dev/rate-limiter` | Rate limiting |
| `@convex-dev/workflow` | Durable workflow execution (test generation pipelines) |

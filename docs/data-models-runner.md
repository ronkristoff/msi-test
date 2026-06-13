# Data Models — Runner (Playwright)

## Overview

The Runner defines its own TypeScript types for work items, configuration, and output data. These live in `runner/src/types.ts` and supporting modules.

---

## Work Item Input Types

### RunWorkItem

```typescript
{
  run_id: string
  workspace_id: string
  project_id: string
  environment_id?: string
  base_url: string
  trigger_type: "manual" | "ci" | "scheduled" | "rerun"
  tests: RunTestItem[]
  run_result_ids: Record<string, string>  // test_id → run_result_id
  auth_mode?: "none" | "form" | "cookie"
  login_url?: string
  test_username?: string
  test_password?: string
  auth_cookies?: AuthCookie[]
  test_data?: Record<string, string>
  heal_confidence_threshold?: number
}
```

### RunTestItem

```typescript
{
  _id: string
  name: string
  playwright_code?: string
  execution_type?: "playwright" | "stagehand"
  steps?: TestStep[]
}
```

### TestStep

```typescript
{
  instruction: string
  assertion_code?: string
  expected_outcome?: string
  learned_selector?: string
  learned_description?: string
}
```

### ExplorationWorkItem

```typescript
{
  exploration_id: string
  url: string
  workspace_id: string
  auth_mode: "none" | "form" | "cookie"
  login_url?: string
  username?: string
  password?: string
  cookie_name?: string
  cookie_value?: string
  additional_urls?: string[]
  interactive: boolean
  exploration_mode: "scripted" | "autonomous"
  max_steps?: number
  goal?: string
  prd_text?: string
  selected_pages?: string[]
  phase?: "discover" | "capture"
}
```

---

## Output/Result Types

### InteractiveElement

```typescript
{
  selector: string
  description: string
  element_type: string
  role?: string
  aria_label?: string
  label_text?: string
  placeholder?: string
  name?: string
  id?: string
  type?: string
  href?: string
  data_testid?: string
  suggested_locator: string
}
```

### AuthCookie

```typescript
{
  name: string
  value: string
  domain: string
  path: string
}
```

### DiscoveredFlow

```typescript
{
  name: string
  description?: string
  steps: string[]
  pages_involved: number[]
  complexity: "low" | "medium" | "high"
}
```

### DiscoveredPage

```typescript
{
  url: string
  title: string
}
```

### CapturedPage

```typescript
{
  url: string
  title: string
  structure_text: string
  screenshot_storage_id?: string
  semantic_description?: string
  interactive_elements?: InteractiveElement[]
  nav_menu?: NavMenuItem[]
}
```

### NavMenuItem

```typescript
{
  text: string
  href: string
}
```

### PrdCoverageItem

```typescript
{
  feature: string
  found: boolean
  evidence?: string
}
```

---

## Snapshot API Types

### SnapshotResponse

```typescript
{
  url: string
  title: string
  bodyText: string
  interactiveElements: InteractiveElement[]
  duplicatePatterns: Array<{ text: string; count: number; locations: string[] }>
  sections: Array<{ tag: string; text: string }>
}
```

### ValidateTestResponse

```typescript
{
  passed: boolean
  error?: string
  steps?: Array<{ step_number: number; status: string; error?: string }>
}
```

### FeedbackDiscoveryResponse

```typescript
{
  triggers: string[]
  feedback: Array<{
    type: "aria" | "toast" | "visual" | "text" | "dialog" | "url_change"
    message: string
    element?: string
    screenshot_storage_id?: string
  }>
}
```

---

## Configuration

The Runner has no config files — all configuration is via environment variables:

| Variable | Required | Default | Description |
|---|---|---|---|
| `NEXT_PUBLIC_CONVEX_URL` | Yes | — | Convex deployment URL |
| `RUNNER_SECRET` | Yes | — | Shared secret for Convex auth |
| `RUNNER_API_PORT` | No | `8931` | Snapshot API HTTP port |
| `RUNNER_URL` | Yes (Convex) | — | Runner endpoint for Convex to call |

Runtime-injected env vars (set per-run by the executor):
- `MSITEST_REPORTER_DIR` — Playwright reporter output directory
- `TEST_USERNAME`, `TEST_PASSWORD`, `TEST_LOGIN_URL` — form auth credentials
- `TEST_AUTH_MODE` — auth mode for test runs
- `NODE_PATH` — override to find playwright binary

---

## RunnerConvexClient Methods

The `RunnerConvexClient` (`runner/src/convex-client.ts`) is a wrapper around `ConvexHttpClient` that provides typed methods:

- `getPendingWork()` — calls `api.runs.queries.getPendingWork`
- `getPendingExplorations()` — calls `api.explorations.queries.getPendingExplorations`
- `claimRun(runId, runnerId)` — calls `api.runs.actions.runnerClaimRun`
- `claimExploration(id, runnerId, status)` — calls `api.explorations.actions.runnerClaimExploration`
- `writeStepResult(...)` — calls `api.runs.actions.runnerWriteStepResult`
- `writeRunResult(...)` — calls `api.runs.actions.runnerWriteRunResult`
- `completeRun(...)` — calls `api.runs.actions.runnerCompleteRun`
- `forceCompleteRun(...)` — calls `api.runs.actions.runnerForceCompleteRun`
- `sendHeartbeat(runId)` — calls `api.runs.actions.runnerHeartbeat`
- `generateUploadUrl()` — calls `api.files.actions.runnerGenerateUploadUrl`
- `updateExplorationProgress(...)` — calls `api.explorations.actions.runnerUpdateExplorationProgress`
- `completeExploration(...)` — calls `api.explorations.actions.runnerCompleteExploration`
- `completeDiscovery(...)` — calls `api.explorations.actions.runnerCompleteDiscovery`
- `failExploration(...)` — calls `api.explorations.actions.runnerFailExploration`
- `getExplorationStatus(id)` — calls `api.explorations.actions.runnerGetExplorationStatus`
- `getWorkspaceAiConfig(workspaceId)` — calls `api.workspaces.actions.runnerGetWorkspaceAiConfig`
- `recordHealingHistory(...)` — calls `api.runs.actions.runnerRecordHealingHistory`

All methods throw on non-2xx responses.

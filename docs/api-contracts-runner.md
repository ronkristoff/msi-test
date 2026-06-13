# API Contracts — Runner (Playwright)

## Overview

The Runner is a stateless Node.js process that subscribes to Convex for pending work and writes results back. It runs Playwright and Stagehand tests in a separate process, communicating with Convex via the `ConvexHttpClient`.

**Authentication:** Shared `RUNNER_SECRET` environment variable, validated by Convex on every `runner*` action.

---

## Convex ↔ Runner Contract

### Queries Called (no auth)

| Function | Purpose |
|---|---|
| `api.runs.queries.getPendingWork` | Poll for unclaimed runs with full test data |
| `api.explorations.queries.getPendingExplorations` | Poll for unclaimed explorations with auth config |

### Actions Called (RUNNER_SECRET auth)

| Function | Purpose |
|---|---|
| `api.runs.actions.runnerClaimRun` | Atomically claim a run (set runner_id + started_at) |
| `api.runs.actions.runnerWriteStepResult` | Write per-step result (passed/failed/skipped/healed) |
| `api.runs.actions.runnerWriteRunResult` | Write per-test result with artifact IDs |
| `api.runs.actions.runnerCompleteRun` | Complete run → triggers AI analysis + auto-heal |
| `api.runs.actions.runnerForceCompleteRun` | Force-complete (cancelled/timed_out) |
| `api.runs.actions.runnerHeartbeat` | Heartbeat every 30s during execution |
| `api.runs.actions.runnerRecordHealingHistory` | Record healing event |
| `api.explorations.actions.runnerClaimExploration` | Claim exploration |
| `api.explorations.actions.runnerUpdateExplorationProgress` | Stream progress |
| `api.explorations.actions.runnerCompleteExploration` | Submit captured pages |
| `api.explorations.actions.runnerCompleteDiscovery` | Submit discovered pages + cookies |
| `api.explorations.actions.runnerFailExploration` | Mark as failed |
| `api.explorations.actions.runnerGetExplorationStatus` | Poll for cancel signal |
| `api.workspaces.actions.runnerGetWorkspaceAiConfig` | Fetch AI provider config |
| `api.files.actions.runnerGenerateUploadUrl` | Generate file upload URL |

---

## Runner Architecture

### Poll Loop (2s interval)

```
┌─────────────────────────────────────────────┐
│  poll() every 2000ms                       │
│  ┌─ getPendingWork()                       │
│  │   → if found: claimRun() → execute()    │
│  └─ getPendingExplorations()               │
│      → if found: claimExploration() → ...  │
└─────────────────────────────────────────────┘
```

- Sequential execution (one work item at a time)
- Explorations prioritized over runs
- Atomic claiming prevents duplicate execution

### Execution Modes

1. **Playwright (`executor.ts`)**: Generates temp playwright config, writes `.spec.ts` files, spawns `npx playwright test`, collects results + artifacts (screenshots, video, trace, console), uploads to Convex storage.

2. **Stagehand (`stagehand-executor.ts`)**: AI-powered browser agent via Stagehand SDK. Supports self-healing when Playwright selectors fail. Handles form-based and cookie-based auth.

3. **Discovery (`link-crawler.ts`)**: Crawls pages via Playwright, extracts links, captures cookies, builds link graph, discovers multi-page flows.

4. **Autonomous Explorer (`autonomous-explorer.ts`)**: Stagehand AI agent explores app autonomously — captures pages, interactive elements, nav menus, PRD coverage, flows.

5. **Scripted Explorer (`explorer.ts`)**: Structured exploration using Stagehand's `observe`/`act`/`extract` with PRD-guided link prioritization.

6. **Feedback Discovery (`feedback-discovery.ts`)**: Interacts with page elements to discover UI feedback states (validation errors, confirmations, error messages, dialogs).

### Snapshot API (localhost:8931)

Three HTTP endpoints for the Convex backend to call during AI operations:

| Endpoint | Method | Purpose |
|---|---|---|
| `/snapshot` | POST | Capture page structure (ARIA snapshot, interactive elements, sections) |
| `/validate-test` | POST | Run Playwright test snippet for validation |
| `/discover-feedback` | POST | Interact with page and discover feedback messages |

### Configuration

All via environment variables:

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `NEXT_PUBLIC_CONVEX_URL` | Yes | — | Convex deployment URL |
| `RUNNER_SECRET` | Yes | — | Shared secret for Convex auth |
| `RUNNER_API_PORT` | No | `8931` | Snapshot API port |
| `RUNNER_URL` | Yes (Convex) | — | Runner HTTP endpoint (used by `browserClient.ts`) |

---

## Work Item Types

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
  run_result_ids: Record<string, string>
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

## Async Patterns

| Pattern | Interval | Purpose |
|---|---|---|
| Poll loop | 2s | Main work discovery |
| Heartbeat | 30s | Keep run alive during execution |
| Cancel polling | 5s | Check exploration cancel signal during autonomous exploration |
| DOM stability | 500ms (max 10s) | Wait for dynamic page content to settle |
| Feedback settle | 500ms (max 8s) | Wait for feedback UI to appear after interaction |
| Login element wait | 500ms (max 8s) | Wait for form fields to render during auth |
| Session idle timeout | 10min | Auto-close idle Stagehand instances |
| Convex retry | 3x | Retry on "Function execution timed out" errors |

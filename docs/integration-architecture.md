# Integration Architecture

## Overview

MSITest is a three-part system where **Convex is the single source of truth** for all state. The frontend and runner communicate exclusively through Convex.

---

## Communication Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        Convex Backend                           │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌────────────┐  │
│  │  Queries  │  │ Mutations │  │  Actions  │  │   Cron     │  │
│  │ (reactive)│  │  (write)  │  │ (async)   │  │  (timers)  │  │
│  └─────┬─────┘  └─────┬─────┘  └─────┬─────┘  └─────┬──────┘  │
│        │              │              │               │          │
│        │    ┌─────────┴─────────┐    │               │          │
│        │    │   18 Tables      │    │               │          │
│        │    │  (source of      │    │               │          │
│        │    │   truth)         │    │               │          │
│        │    └──────────────────┘    │               │          │
└────────┼───────────────┼────────────┼───────────────┼──────────┘
         │               │            │               │
    useQuery()      useMutation()  useAction()    Scheduled
    (WebSocket      (HTTP POST)    (HTTP POST)    Triggers
     reactive)          │            │
         │               │            │
    ┌────┴───────┐       │       ┌────┴───────┐
    │  Frontend  │◄──────┘       │   Runner   │
    │ (Next.js)  │               │ (Playwright)│
    │            │               │             │
    │  Browser   │               │  - Poll: 2s │
    │  Real-time │               │  - Heartbeat│
    │  updates   │               │    : 30s    │
    └────────────┘               └──────┬──────┘
                                        │
                                   HTTP API
                                   :8931
                                        │
                                   ┌────┴───────┐
                                   │  Convex AI │
                                   │  Actions   │
                                   │            │
                                   │  snapshot  │
                                   │  validate  │
                                   │  feedback  │
                                   └────────────┘
```

---

## Integration Points

### 1. Frontend ↔ Convex Backend

| Aspect | Details |
|---|---|
| **Protocol** | WebSocket (reactive queries) + HTTP POST (mutations/actions) |
| **Auth** | Better Auth session token, bridged via `ConvexBetterAuthProvider` |
| **Data flow** | Frontend reads via `useQuery` (auto-reactive), writes via `useMutation`/`useAction` |
| **Pattern** | All server state flows through Convex — React state used only for UI ephemerals |
| **Type safety** | `convex/_generated/api.d.ts` and `dataModel.d.ts` provide full type coverage |

### 2. Frontend ↔ Better Auth

| Aspect | Details |
|---|---|
| **Protocol** | HTTP (OAuth redirects, auth callbacks) |
| **Route** | `/api/auth/[...all]` → `convexBetterAuthNextJs` handler |
| **Providers** | Email/password + Google OAuth |
| **Session** | Cookie-based, accessed via `useSession()` from `@convex-dev/better-auth` |

### 3. Runner ↔ Convex Backend

| Aspect | Details |
|---|---|
| **Protocol** | HTTP POST (ConvexHttpClient actions) |
| **Auth** | Shared `RUNNER_SECRET` header, validated by each `runner*` action |
| **Polling** | Every 2s for `getPendingWork` + `getPendingExplorations` |
| **Atomic claim** | `runnerClaimRun` / `runnerClaimExploration` — only one runner processes each item |
| **Heartbeat** | Every 30s during active execution to prevent stale run timeout |
| **Results** | Per-step and per-test results written via `runnerWriteStepResult` / `runnerWriteRunResult` |
| **Artifacts** | Screenshots, videos, traces, console logs uploaded to Convex File Storage via `runnerGenerateUploadUrl` |

### 4. Convex Backend ↔ Runner (Snapshot API)

| Aspect | Details |
|---|---|
| **Protocol** | HTTP POST (JSON) |
| **Direction** | Convex AI actions → Runner (localhost or `RUNNER_URL`) |
| **Endpoints** | `/snapshot` (DOM capture), `/validate-test` (test validation), `/discover-feedback` (UI feedback states) |
| **Auth** | Not separately authenticated — only called from within Convex actions (which are already auth-gated) |
| **Session** | Runner manages Stagehand browser sessions with 10min idle timeout |

### 5. Convex Cron ↔ Convex Mutations

| Aspect | Details |
|---|---|
| **Trigger** | Timer-based, runs in Convex Cloud |
| **Frequency** | Every 60s (stale runs, scheduled runs), every 2min (stale generations, stale healing), every 5min (stale locks) |
| **Functions** | `markStaleRuns`, `clearStaleTestLocks`, `checkScheduledRuns`, `markStaleGenerations`, `resetStaleHealingTests` |
| **Direction** | Cron calls internal mutations directly (in-process) |

---

## Auth Flow Across Parts

```
1. User logs in (email/password or Google OAuth)
   └─ Better Auth creates session cookie
      └─ ConvexBetterAuthProvider reads cookie → bridges token to Convex

2. Frontend Convex queries now carry auth context
   └─ requireAuth(ctx) on mutations
   └─ getOptionalOwnedWorkspace(ctx) on queries

3. Runner authenticates via RUNNER_SECRET (shared secret)
   └─ validateRunnerSecret() in convex/lib/runner.ts

4. Runner needs workspace AI config for Stagehand
   └─ runnerGetWorkspaceAiConfig() — action, secret-gated

5. Convex AI actions call Runner snapshot API
   └─ No additional auth — internal to the deployment
```

---

## Data Flow: Test Run Lifecycle

```
1. User triggers run (Frontend → api.runs.mutations.triggerRun)
   └─ Creates run doc + run_result docs (status: "running")

2. Runner polls (getPendingWork → finds "running" run)
   └─ Claims run (runnerClaimRun → sets runner_id + started_at)

3. Runner executes tests (Playwright or Stagehand)
   ├─ Sends heartbeats every 30s
   ├─ Writes step results (runnerWriteStepResult)
   └─ Writes test results (runnerWriteRunResult + uploads artifacts)

4. Runner completes (runnerCompleteRun)
   └─ completeRun aggregates pass/fail counts
   └─ analyzeFailures runs AI root-cause analysis
   └─ autoHealAndRerun detects healable failures + creates rerun

5. Frontend sees results (useQuery reactive refresh)
   └─ Run detail page shows results, steps, screenshots
   └─ Dashboard updates pass rate stats
```

---

## Shared Dependencies

All three parts share the root `package.json` with pnpm as the package manager. Key shared dependencies:

| Dependency | Used By | Purpose |
|---|---|---|
| `convex` | Frontend, Backend, Runner | Convex client + server SDK |
| `typescript` | All | Type checking across all parts |
| `vitest` | All | Testing framework |
| `@playwright/test` / `playwright` | Runner (execution), Frontend (types) | Browser automation |
| `@browserbasehq/stagehand` | Backend, Runner | AI-powered browser agent |
| `better-auth` | Frontend, Backend | Authentication |

No monorepo workspace packages or shared library packages — everything lives in the root project.

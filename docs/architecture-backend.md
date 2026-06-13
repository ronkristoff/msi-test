# Architecture — Backend (Convex)

## Executive Summary

The backend is a **Convex serverless** backend providing the single source of truth for all application state. It consists of 18 database tables, ~120 functions across 16 domain modules, 5 cron jobs, and 6 registered components. All business logic, auth, AI operations, and data persistence live here.

## Technology Stack

| Category | Technology | Version |
|---|---|---|
| Platform | Convex | 1.39.1 |
| Language | TypeScript (ESNext) | 5.x |
| Auth | better-auth + @convex-dev/better-auth | 1.6.11 / 0.12.2 |
| AI Framework | @convex-dev/agent + ai + @ai-sdk/openai | 0.6.1 / 6.0 / 3.0 |
| Workflow Engine | @convex-dev/workflow | 0.4.3 |
| Browser Automation | @browserbasehq/convex-stagehand + stagehand | 0.1.1 / 3.4.0 |
| Rate Limiting | @convex-dev/rate-limiter | 0.3.2 |
| Caching | @convex-dev/action-cache | 0.3.0 |
| Testing | vitest + convex-test + @edge-runtime/vm | 4.1.7 / 0.0.53 / 5.0 |

## Architecture Pattern

**Serverless + Event-Driven.** Convex provides:
- **Reactive queries** — data auto-pushes to subscribed clients
- **Mutations** — ACID writes with automatic retry on optimistic concurrency conflicts
- **Actions** — async Node.js functions for AI calls and external API integrations
- **Cron jobs** — scheduled background tasks
- **Workflows** — durable, long-running multi-step pipelines
- **File storage** — managed artifact storage for screenshots, videos, traces
- **Components** — pluggable modules (auth, agent, stagehand, etc.)

## Module Organization

The backend is organized by domain into 16 directories, each containing queries, mutations, and optionally actions and internal functions:

| Module | Purpose | Function Count |
|---|---|---|
| `workspaces/` | Workspace CRUD + AI config | 6 |
| `users/` | User profile updates | 2 |
| `members/` | Workspace membership | 5 |
| `projects/` | Project CRUD + auth config | 7 |
| `suites/` | Suite management + generation | 17 |
| `tests/` | Test CRUD + locking + healing | 12 |
| `runs/` | Run lifecycle + results + analysis | 30+ |
| `environments/` | Environment management | 6 |
| `explorations/` | App exploration + page capture | 20+ |
| `schedules/` | Scheduled run management | 8 |
| `test_lists/` | Cross-project test grouping | 11 |
| `dashboard/` | Aggregated dashboard stats | 2 |
| `insights/` | AI analysis retrieval | 1 |
| `flakiness/` | Flakiness analysis | 2 |
| `files/` | File upload URL generation | 2 |
| `logs/` | Client error logging | 1 |
| `stagehand/` | Browser-based page operations | 3 |
| `ai/` | AI test generation, healing, exploration | 20+ |

See [API Contracts — Backend](./api-contracts-backend.md) for full function registry.

## Data Architecture

18 tables across 7 domains, all with `workspace_id` for multi-tenant isolation:
- **Core Auth/Org**: workspaces, workspace_members, error_logs
- **Project/Test Config**: projects, suites, tests, suite_members, test_lists, test_list_members
- **Execution/Results**: runs, run_results, steps, run_heartbeats
- **AI/Analysis**: ai_insights, healing_history
- **Environments**: environments, integrations, alert_rules
- **Exploration**: explorations
- **Schedules**: schedules

See [Data Models — Backend](./data-models-backend.md) for full schema.

## Auth & Security

Three-tier authorization:
1. **`requireAuth(ctx)`** — for mutations (user must be authenticated)
2. **`getOptionalOwnedWorkspace(ctx)`** — for public queries (returns data only if user owns it)
3. **`getOptionalOwnedEntity(ctx, id, table)`** — for single-entity lookups

Runner auth uses shared secret pattern (`validateRunnerSecret()` in `convex/lib/runner.ts`). API keys are masked (`maskApiKey()`) before being returned to clients.

## Components

| Component | Purpose |
|---|---|
| `@convex-dev/better-auth` | Authentication (email/password + Google OAuth) |
| `@convex-dev/agent` | AI agent framework for LLM interactions |
| `@browserbasehq/convex-stagehand` | Browser-based UI testing via Browserbase |
| `@convex-dev/action-cache` | Caching for action results |
| `@convex-dev/rate-limiter` | Rate limiting for expensive operations |
| `@convex-dev/workflow` | Durable workflows for test generation pipelines |

## Cron Jobs

| Job | Interval | Purpose |
|---|---|---|
| `markStaleRuns` | 60s | Time out runs with dead heartbeats |
| `checkScheduledRuns` | 60s | Trigger due scheduled runs |
| `markStaleGenerations` | 2min | Fail stuck test generation |
| `resetStaleHealingTests` | 2min | Reset stuck healing tests |
| `clearStaleTestLocks` | 5min | Clear stale editing locks |

## Testing Strategy

- **Runner**: vitest with @edge-runtime/vm
- **Convex testing**: `convex-test` with `import.meta.glob` module map
- **Test files**: `convex/**/*.test.ts`
- **Seed helpers**: `convex/testHelpers.ts` (`seedWorkspace`, `seedProject`, `seedSuite`, `seedTestDoc`, `seedFullStack`)
- **Auth**: Tests use `convex-test`'s `asUser` method for identity simulation

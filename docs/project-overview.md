# Project Overview — MSITest

## Summary

**MSITest** is an AI-powered test generation and execution platform. Users define projects with target URLs, provide PRDs or natural language descriptions, and the platform generates, executes, and auto-heals Playwright/Stagehand tests. It includes app exploration capabilities, flakiness detection, scheduled monitoring, and AI-powered failure analysis.

## Quick Reference

| Attribute | Value |
|---|---|
| **Repository Type** | Multi-part (3 parts: frontend, backend, runner) |
| **Primary Language** | TypeScript |
| **Architecture** | Serverless backend (Convex) + web frontend (Next.js) + stateless runner (Node.js/Playwright) |
| **Package Manager** | pnpm 10.33.2 |
| **Monorepo** | Single `package.json` at root |

## Tech Stack Summary

| Part | Key Technologies |
|---|---|
| **Frontend** | Next.js 16, React 19, Tailwind CSS v4, react-hook-form, zod, recharts, sonner |
| **Backend** | Convex 1.39, better-auth, @convex-dev/agent, @convex-dev/workflow, stagehand |
| **Runner** | Node.js (tsx), Playwright 1.60, Stagehand 3.4 |

## Repository Structure

```
msi-test/
├── src/            # Frontend (Next.js 16 App Router)
├── convex/         # Backend (Convex serverless functions + schema)
├── runner/         # Runner (Playwright execution engine)
└── docs/           # Documentation hub (PRD, ADRs, issues)
```

## Documentation Index

### Generated Documentation

| Document | Description |
|---|---|
| [Project Overview](./project-overview.md) | This document |
| [Source Tree Analysis](./source-tree-analysis.md) | Annotated directory tree with 28 critical folders |
| [Integration Architecture](./integration-architecture.md) | How the 3 parts communicate |
| [Development Guide](./development-guide.md) | Setup, commands, conventions |
| [Deployment Guide](./deployment-guide.md) | Deployment steps per part |

### Architecture (per part)

| Document | Part |
|---|---|
| [Architecture — Frontend](./architecture-frontend.md) | Next.js frontend |
| [Architecture — Backend](./architecture-backend.md) | Convex backend |
| [Architecture — Runner](./architecture-runner.md) | Playwright runner |

### API Contracts

| Document | Part |
|---|---|
| [API Contracts — Frontend](./api-contracts-frontend.md) | Convex functions called by frontend |
| [API Contracts — Backend](./api-contracts-backend.md) | All Convex functions (queries, mutations, actions) |
| [API Contracts — Runner](./api-contracts-runner.md) | Runner ↔ Convex contract |

### Data Models

| Document | Part |
|---|---|
| [Data Models — Backend](./data-models-backend.md) | All 18 database tables |
| [Data Models — Frontend](./data-models-frontend.md) | Frontend types and patterns |
| [Data Models — Runner](./data-models-runner.md) | Runner types |

### Component & State

| Document | Part |
|---|---|
| [UI Component Inventory](./ui-component-inventory-frontend.md) | 54 components cataloged |
| [State Management](./state-management-frontend.md) | Frontend state architecture |

### Existing Documentation

| Document | Description |
|---|---|
| [PRD](./PRD.md) | Full product requirements document |
| [CONTEXT.md](../CONTEXT.md) | Domain glossary and data hierarchy |
| [AGENTS.md](../AGENTS.md) | Agent quick reference |
| [ADR 0001](../docs/adr/0001-separate-test-runner.md) | Separate test runner decision |
| [ADR 0002](../docs/adr/0002-runner-convex-subscriptions.md) | Runner Convex subscriptions |
| [ADR 0003](../docs/adr/0003-convex-agent-component.md) | Convex agent component |
| [ADR 0004](../docs/adr/0004-stagehand-browser-interactions.md) | Stagehand browser interactions |
| [ADR 0005](../docs/adr/0005-hybrid-test-format.md) | Hybrid test format |
| [ADR 0006](../docs/adr/0006-convex-stagehand-lightweight-tasks.md) | Convex Stagehand lightweight tasks |
| [ADR 0007](../docs/adr/0007-scheduled-monitoring-crons.md) | Scheduled monitoring crons |

## Getting Started

```bash
pnpm install
pnpm dev          # Starts Convex + Next.js + Runner concurrently
```

See [Development Guide](./development-guide.md) for detailed setup instructions.

# Project Documentation Index

## Project Overview

- **Type:** Multi-part monorepo with 3 parts
- **Primary Language:** TypeScript
- **Architecture:** Serverless backend (Convex) + web frontend (Next.js) + stateless runner (Playwright)

---

## Quick Reference

### Frontend (Next.js)
- **Type:** web
- **Tech Stack:** Next.js 16.2.6, React 19.2.4, Tailwind CSS v4, react-hook-form, zod, recharts
- **Root:** `src/`
- **Entry Point:** `src/app/layout.tsx`

### Backend (Convex)
- **Type:** backend
- **Tech Stack:** Convex 1.39.1, better-auth, @convex-dev/agent, stagehand 3.4
- **Root:** `convex/`
- **Entry Point:** `convex/schema.ts`

### Runner (Playwright)
- **Type:** backend
- **Tech Stack:** Node.js (tsx), Playwright 1.60.0, Stagehand 3.4.0
- **Root:** `runner/`
- **Entry Point:** `runner/src/index.ts`

---

## Generated Documentation

### Overview & Structure
- [Project Overview](./project-overview.md)
- [Source Tree Analysis](./source-tree-analysis.md)

### Architecture
- [Architecture — Frontend](./architecture-frontend.md)
- [Architecture — Backend](./architecture-backend.md)
- [Architecture — Runner](./architecture-runner.md)

### API Contracts
- [API Contracts — Frontend](./api-contracts-frontend.md)
- [API Contracts — Backend](./api-contracts-backend.md)
- [API Contracts — Runner](./api-contracts-runner.md)

### Data Models
- [Data Models — Backend](./data-models-backend.md)
- [Data Models — Frontend](./data-models-frontend.md)
- [Data Models — Runner](./data-models-runner.md)

### Components & State
- [UI Component Inventory](./ui-component-inventory-frontend.md)
- [State Management](./state-management-frontend.md)

### Development & Operations
- [Development Guide](./development-guide.md)
- [Deployment Guide](./deployment-guide.md)

### Integration
- [Integration Architecture](./integration-architecture.md)

### Metadata
- [Project Parts](./project-parts.json)

---

## Existing Documentation

### Product & Domain
- [PRD](./PRD.md) — Full product requirements document
- [CONTEXT.md](../CONTEXT.md) — Domain glossary and data hierarchy
- [AGENTS.md](../AGENTS.md) — Agent quick reference (commands, architecture, conventions)

### Architectural Decision Records
- [ADR 0001 — Separate Test Runner](./adr/0001-separate-test-runner.md)
- [ADR 0002 — Runner Convex Subscriptions](./adr/0002-runner-convex-subscriptions.md)
- [ADR 0003 — Convex Agent Component](./adr/0003-convex-agent-component.md)
- [ADR 0004 — Stagehand Browser Interactions](./adr/0004-stagehand-browser-interactions.md)
- [ADR 0005 — Hybrid Test Format](./adr/0005-hybrid-test-format.md)
- [ADR 0006 — Convex Stagehand Lightweight Tasks](./adr/0006-convex-stagehand-lightweight-tasks.md)
- [ADR 0007 — Scheduled Monitoring Crons](./adr/0007-scheduled-monitoring-crons.md)

### Agent Documentation
- [Domain](./agents/domain.md) — Domain documentation guidelines
- [Issue Tracker](./agents/issue-tracker.md) — Issue tracking workflow
- [Triage Labels](./agents/triage-labels.md) — Default triage label vocabulary

### Issues (40+ files)
- [Issues Directory](./issues/) — Feature and bug tracking files (001–046)

---

## Getting Started

```bash
# Install dependencies
pnpm install

# Start all services (Convex + Next.js + Runner)
pnpm dev

# Run tests
pnpm test          # Frontend tests
pnpm test:convex   # Convex backend tests
pnpm test:all      # All tests

# Lint
pnpm lint
```

### Quick Architecture Overview

```
Frontend (Next.js) ←→ Convex Backend ←→ Runner (Playwright)
     useQuery/           source of           polls/claims/
     useMutation         truth (18 tables)   executes tests
```

See [Development Guide](./development-guide.md) for detailed setup and [Integration Architecture](./integration-architecture.md) for how the parts communicate.

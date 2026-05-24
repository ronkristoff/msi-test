# 006 — Environment Configuration

**Type**: AFK
**Blocked by**: 002, 003

## What to build

Named deployment targets per project. User can create, edit, and delete environments (e.g., staging, production, dev) each with a base URL. Environment selector appears when triggering a test run. Each run records which environment it executed against.

End-to-end: `/environments` page → CRUD for environments scoped to current project → environment selector on run triggers → run records store environment name and base URL → Convex queries/mutations.

## Acceptance criteria

- [ ] `/environments` page lists all environments for the current project
- [ ] User can create a new environment with a name (e.g., "staging") and base URL (e.g., "https://staging.myapp.com")
- [ ] User can edit environment name and base URL
- [ ] User can delete an environment
- [ ] `getEnvironments` query returns environments scoped to project
- [ ] `createEnvironment` and `updateEnvironment` mutations validate required fields (name, base_url)
- [ ] Environment selector dropdown is available when triggering a run (wired in later slice)

## Blocked by

- 002 — Convex Schema Foundation (environments table)
- 003 — Project CRUD (project context)

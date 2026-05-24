# 003 — Project CRUD & Creation Wizard

**Type**: AFK
**Blocked by**: 001, 002

## What to build

Full project lifecycle. User can create a project via a multi-step wizard (name, app URL, optional PRD as typed text or uploaded Markdown/PDF file). Projects appear in a project list. Project detail shows basic info. PRD files upload to Convex file storage.

End-to-end: `/projects/new` wizard → Convex mutations (`createProject`, `updateProject`) → Convex file storage for PRD uploads → project list page → project queries (`getProjects`) → all scoped to current workspace.

## Acceptance criteria

- [ ] `/projects/new` wizard collects: app name, app URL, optional PRD text description, optional PRD file upload (Markdown or PDF)
- [ ] PRD files upload to Convex file storage and store `prd_file_id` on the project
- [ ] PRD text is saved directly to `prd_text` field
- [ ] Project list page shows all projects in current workspace with name, app URL, and creation date
- [ ] `getProjects` query returns projects scoped to current workspace, ordered by creation date
- [ ] `createProject` mutation validates required fields (name, app_url)
- [ ] `updateProject` mutation allows editing name, app_url, prd_text
- [ ] Navigation from project list to project detail works

## Blocked by

- 001 — Auth & Onboarding Flow (workspace context, auth)
- 002 — Convex Schema Foundation (projects table)

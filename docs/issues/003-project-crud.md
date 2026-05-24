# 003 — Project CRUD & Creation Wizard

**Type**: AFK
**Blocked by**: 001, 002

## What to build

Full project lifecycle. User can create a project via a 2-step wizard — Step 1: project name (unique per workspace) and app URL (auto-prepend `https://` if missing). Step 2: optional PRD as typed text or uploaded file (.md, .pdf, .txt, max 10MB), mutually exclusive. Projects appear in a card grid list. Project detail shows an info card with name, app URL, PRD indicator, and creation date, plus a suites section (empty state initially). After creation, user lands on the project detail page. Project editing lives at `/projects/[id]/settings`. PRD files upload to Convex file storage; replacing a PRD deletes the old file from storage. Project deletion is out of scope.

End-to-end: `/projects/new` 2-step wizard → Convex mutations (`createProject`, `updateProject`) → Convex file storage for PRD uploads → project list page (`/projects`, card grid) → project detail (`/projects/[id]`, info card + suites) → project settings (`/projects/[id]/settings`, edit name/app_url/PRD) → all scoped to current workspace.

## Design decisions

1. **2-step wizard** — Step 1: name + app URL (required). Step 2: PRD text or file upload (optional, skippable). Splits required identity from optional enrichment.
2. **PRD text and file are mutually exclusive** — a project has at most one PRD. Switching modes clears the other. Replacing a file deletes the old one from Convex storage.
3. **Accepted file types: .md, .pdf, .txt, up to 10MB** — .txt handles plain-text PRDs. No .docx (avoids parsing dependency).
4. **App URL auto-prepends `https://`** — users commonly paste URLs without a scheme. Backend normalizes before storage.
5. **Unique project names per workspace** — `createProject` rejects duplicates via `by_workspace_id_and_name` index. `updateProject` checks for collisions on rename.
6. **Post-creation lands on project detail** — confirms creation, serves as project home base.
7. **Project deletion out of scope** — cascade logic (suites → tests → runs → steps → insights) deserves its own issue.
8. **Card grid for project list** — suits MVP scale (few projects per user). Empty state prompts "Create your first project."
9. **Edit at `/projects/[id]/settings`** — dedicated route mirrors the `/settings` workspace pattern. Keeps detail page read-only.
10. **Unlimited projects per workspace** — no cap for MVP. Can add limits later for billing.

## Routes

| Route | Purpose |
|-------|---------|
| `/projects` | Project list (card grid) |
| `/projects/new` | 2-step creation wizard |
| `/projects/[id]` | Project detail (info card + suites) |
| `/projects/[id]/settings` | Edit project (name, app_url, PRD) |

## Backend

- `convex/projects/queries.ts` — `getProjects` (list, scoped to workspace, ordered by creation time), `getProject` (single by ID)
- `convex/projects/mutations.ts` — `createProject` (validates name uniqueness, required fields, normalizes URL), `updateProject` (edit name/app_url/prd_text/prd_file_id, clears previous PRD on replace, deletes old file from storage)
- Schema change: add `by_workspace_id_and_name` index on `projects` table

## Nav

"Projects" added to the Testing section in sidebar, above Suites.

## Acceptance criteria

- [x] `/projects/new` 2-step wizard: Step 1 collects project name + app URL (required), Step 2 collects optional PRD (text OR file upload, mutually exclusive)
- [x] App URL auto-prepends `https://` if missing; validated as URL on frontend and backend
- [x] Project names are unique within a workspace (enforced by mutation + `by_workspace_id_and_name` index)
- [x] PRD files upload to Convex file storage (`.md`, `.pdf`, `.txt`, max 10MB) and store `prd_file_id` on the project
- [x] PRD text is saved to `prd_text`; setting one clears the other
- [x] Replacing a PRD file deletes the old file from Convex storage
- [x] Project list page (`/projects`) shows all projects in current workspace as a card grid with name, app URL, and creation date
- [x] `getProjects` query returns projects scoped to current workspace, ordered by creation time
- [x] `getProject` query returns a single project by ID
- [x] `createProject` mutation validates required fields (name, app_url), name uniqueness, and normalizes URL
- [x] `updateProject` mutation allows editing name, app_url, prd_text, prd_file_id with name collision check on rename
- [x] After creation, user lands on project detail page (`/projects/[id]`)
- [x] Project detail shows info card (name, app URL, PRD indicator, creation date) + suites section (empty state)
- [x] Project settings page (`/projects/[id]/settings`) allows editing name, app URL, and PRD
- [x] Navigation from project list to project detail works (cards are clickable)
- [x] "Projects" nav item appears in sidebar Testing section, above Suites
- [x] Empty state on project list prompts user to create their first project

## Blocked by

- 001 — Auth & Onboarding Flow (workspace context, auth)
- 002 — Convex Schema Foundation (projects table)

# 019 — Team Collaboration & Resource Locking

**Status**: needs-triage
**Type**: Feature
**Blocked by**: None

## Problem Statement

MSITest currently assumes a single user per workspace. Each user owns their workspace, and no one else can access it. When MSITest is deployed for a team of QAs, they need to share the same workspace and work on the same projects collaboratively. When multiple QAs work simultaneously, they need to be informed when a resource is already in use — a suite being run should not be triggered again by another member, and a test being edited by one member should be visible to others as locked.

## Solution

Two capabilities:

1. **Workspace membership** — Multiple users join a shared workspace via an invite code. All members see the same projects, suites, tests, runs, and environments. The workspace is the tenant boundary (one workspace = one company/team). Data isolation is between workspaces, not between users.

2. **Resource locking** — Resources are locked during active operations. A suite being run cannot be triggered again by another member. A test being edited shows as locked to others. Locks are activity-bound and release automatically when the operation completes. Members are informed when a resource is in use and by whom.

## User Stories

### Workspace Membership

1. As a workspace owner, I want to invite team members to my workspace via a simple invite code, so that my team can collaborate on the same projects
2. As a workspace owner, I want to see a list of all members in my workspace, so that I know who has access
3. As a workspace owner, I want to remove a member from my workspace, so that I can revoke access when someone leaves the team
4. As a new user, I want to join an existing workspace by entering an invite code during onboarding, so that I can start collaborating immediately
5. As a new user, I want to create a new workspace during onboarding (existing behavior), so that I can start a fresh workspace for my team
6. As a team member, I want to see all projects, suites, tests, and runs in my workspace, so that I have full visibility into the team's work
7. As a team member, I want to see who else is in my workspace, so that I know my collaborators
8. As a workspace owner, I want to regenerate the invite code, so that I can invalidate a shared code

### Resource Locking

9. As a QA engineer, I want to see a clear indicator when a suite is being run by another team member, so that I know not to trigger a duplicate run
10. As a QA engineer, I want the "Run Tests" button to be disabled with an explanation when a suite is already being run, so that I don't waste tokens on duplicate runs
11. As a QA engineer, I want to see a "View Run" link when a suite is locked for running, so that I can follow the active run's progress
12. As a team member, I want to see that a test is being edited by another member, so that I don't overwrite their changes
13. As a team member, I want the test editor to be read-only when another member is editing, so that I can view the code without accidentally modifying it
14. As a team member, I want to see who is editing a test and when they started, so that I can coordinate with them if needed
15. As a QA engineer, I want the suite lock to be released automatically when a run completes, so that I can trigger the next run without manual intervention
16. As a QA engineer, I want the test lock to be released when the editor closes, so that others can edit after I'm done
17. As a workspace owner, I want stale test locks (from browser crashes) to be cleaned up automatically, so that tests don't stay permanently locked

### Settings & Workspace Management

18. As a workspace owner, I want to see a "Members" section in settings, so that I can manage my team
19. As a workspace owner, I want to copy an invite link from settings, so that I can share it with new team members
20. As a team member, I want to see the member list in settings (read-only), so that I know who is on the team

## Implementation Decisions

### Data Model

- **Workspace membership** uses a new `workspace_members` table with fields: `workspace_id`, `user_id`, `role` (owner | member), `invited_at`. Indexed by `user_id` (to resolve the current user's workspace) and `workspace_id` (to list members).
- The existing `workspaces.owner_id` field is preserved for the owner reference. The `workspace_members` table is the source of truth for who can access a workspace.
- **Invite codes** are stored as an `invite_code` field (optional string) on the `workspaces` table. Generated on demand by the owner. Simple 8-character alphanumeric string.
- **Resource locking** adds fields to `suites`: `locked_by` (optional user_id), `locked_at` (optional number), `locked_reason` (optional string: "running" | "generating"). And to `tests`: `locked_by` (optional user_id), `locked_at` (optional number).
- **Run attribution** adds `triggered_by` (optional user_id string) to the `runs` table, so the lock UI can show who triggered the run.

### Authorization Model

- `getOwnedWorkspace` (current) resolves a workspace by `owner_id`. This is refactored to `getMemberWorkspace` which resolves by looking up `workspace_members` by `user_id`.
- A new `getOwnerWorkspace` (owner-only) is kept for administrative operations like managing members and regenerating invite codes.
- All existing entity access checks (`getOwnedEntity`, `getOptionalOwnedEntity`) remain unchanged — they already validate `workspace_id` ownership, which naturally enforces workspace membership.
- The auth routing layer in the client layout is updated: instead of checking `hasWorkspace` (which queries by owner_id), it resolves membership.

### Invite Flow

- The workspace owner can generate an invite code from Settings. The code is stored on the workspace document.
- New users see two options during onboarding: "Create new workspace" or "Join existing workspace". The join path accepts an invite code, looks up the matching workspace, and creates a `workspace_members` row.
- For MVP, invite codes do not expire and there is no email-based invitation.

### Resource Locking

- Locking is activity-bound, not time-bound. A suite lock is held for the duration of a run and released when the run completes. A test lock is held while a user has the editor open and released when they close it.
- The `triggerRun` mutation checks `suite.locked_by` before creating a run. If locked, it throws a `ConvexError` with the lock holder's name. The client displays this as a disabled button with a tooltip.
- The Runner's `runnerCompleteRun` and `runnerForceCompleteRun` actions clear the suite lock when the run finishes.
- Test editing locks are acquired via a `lockTest` mutation (checks if locked by someone else first) and released via `unlockTest` mutation. The test accordion component calls `lockTest` on expand and `unlockTest` on collapse.
- If a user's browser crashes while editing a test, a Convex cron job clears test locks older than 30 minutes. Suite locks are safe because runs always complete and clear the lock.
- Lock information includes the user's name (resolved by joining on `workspace_members`) so the UI can show "Alice is editing" rather than a user ID.

### Modules

1. **Membership Module** (deep) — Workspace member CRUD, invite code management, authorization helper refactor. Tested in isolation via `convex-test`.
2. **Locking Module** (deep) — Lock acquisition, release, staleness detection. Pure helper functions in `convex/lib/locking.ts` with thin mutations as adapters. Tested in isolation.
3. **Frontend Page Updates** (shallow) — Suite page (lock banner, disabled run button), test accordion (lock/unlock on expand/collapse), settings page (member list, invite UI), onboarding page (join option).

### API Surface

**New queries:**
- `getMembers` — lists all workspace members with names and roles
- `getCurrentMember` — returns the current user's membership and role

**New mutations:**
- `joinWorkspace` — creates a workspace_members row from invite code
- `removeMember` — removes a member (owner only)
- `regenerateInviteCode` — generates a new invite code (owner only)
- `lockTest` — acquires edit lock on a test
- `unlockTest` — releases edit lock on a test

**Modified mutations:**
- `triggerRun` — checks suite lock, sets `triggered_by`, acquires lock
- Runner complete/force-complete actions — clear suite lock

## Testing Decisions

### What makes a good test

Test external behavior, not implementation details. Assert on database state after mutations, query return values, and error conditions. Mock external dependencies. Tests must be deterministic.

### Modules to test

**Membership Module (unit + integration)**
- `joinWorkspace` with valid and invalid invite codes
- `removeMember` by owner and by non-owner (should fail)
- `getMemberWorkspace` resolves member's workspace correctly
- `getMembers` returns all members with roles
- Authorization: non-member cannot access workspace data
- Prior art: `convex/requireAuth.test.ts` for auth helper tests

**Locking Module (unit)**
- Lock acquisition succeeds when resource is unlocked
- Lock acquisition fails when resource is locked by another user
- Lock acquisition succeeds when re-locking own resource
- Lock release clears all lock fields
- Stale lock detection identifies locks older than threshold
- Prior art: `convex/lib/validation.ts` tests for pure helper functions

**Locking Integration (integration)**
- `triggerRun` fails when suite is already locked
- `triggerRun` acquires lock and sets triggered_by
- Run completion clears suite lock
- `lockTest` fails when test is locked by another user
- `lockTest` succeeds for same user (re-lock)
- `updateTestCode` fails when test is locked by another user
- Prior art: `convex/runs.test.ts`, `convex/tests.mutations.test.ts`

**Frontend Components (component tests)**
- Suite page shows lock banner with correct user name
- Suite page disables Run button when locked
- Test accordion shows "Alice is editing" badge when locked
- Test editor is read-only when locked by another user
- Prior art: `src/components/RunsList.test.tsx`, `src/app/(auth)/projects/[id]/explore/explore.test.tsx`

## Out of Scope

- Multi-workspace membership (user belonging to multiple workspaces with a workspace switcher)
- Role-based permissions beyond owner/member (e.g., viewer-only role, admin role)
- Email-based invitations
- Invite code expiration
- Real-time collaborative editing (multiple users editing the same test simultaneously with conflict resolution)
- Audit log of member actions
- SSO/SAML integration
- Billing and plan limits per workspace
- Task tray / background task visibility (separate PRD)

## Further Notes

- The `workspace_id` foreign key already exists on every table — the data model was designed for multi-tenancy from day one. This PRD activates that capability.
- The existing `owner_id` field on workspaces is preserved as the creator reference. The new `workspace_members` table is the source of truth for access.
- Locking is intentionally simple (pessimistic, activity-bound). The locking module can be extended to optimistic concurrency with conflict detection later without a schema migration.
- Context should be updated after implementation: `CONTEXT.md` glossary should add "Workspace Member", "Invite Code", "Resource Lock" entries. The "Single workspace per user for MVP" note should be updated to reflect multi-user workspaces.

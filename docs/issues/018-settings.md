# 018 — Settings Page

**Type**: AFK
**Blocked by**: 001

## What to build

Workspace and account settings. AI provider config editor (endpoint URL, API key, model name), account email and password update, workspace name management.

End-to-end: `/settings` page → tabbed sections for AI Config, Profile, Workspace → AI config form updates workspace's ai_config via `saveAIConfig` mutation → profile form updates email/password via Better Auth → workspace form updates workspace name.

## Acceptance criteria

- [x] `/settings` page renders with tabbed sections: AI Provider, Profile, Workspace, Members
- [x] AI Provider tab: form with endpoint URL, API key (masked), model name, preset dropdown, model dropdown — pre-filled from workspace config
- [x] `saveAIConfig` mutation updates workspace's ai_config fields
- [x] Profile tab: full name editor, email (disabled), password change (current + new) — delegates to Better Auth mutations
- [x] Workspace tab: workspace name editor + danger zone with delete workspace (disabled)
- [x] Members tab: invite via code, member list with roles
- [x] Changes save with auto-dismiss success/error feedback (3s timer)
- [x] Settings scoped to current workspace

## Blocked by

- 001 — Auth & Onboarding Flow (workspace context, auth session)

# 018 — Settings Page

**Type**: AFK
**Blocked by**: 001

## What to build

Workspace and account settings. AI provider config editor (endpoint URL, API key, model name), account email and password update, workspace name management.

End-to-end: `/settings` page → tabbed sections for AI Config, Profile, Workspace → AI config form updates workspace's ai_config via `saveAIConfig` mutation → profile form updates email/password via Better Auth → workspace form updates workspace name.

## Acceptance criteria

- [ ] `/settings` page renders with tabbed sections: AI Provider, Profile, Workspace
- [ ] AI Provider tab: form with endpoint URL, API key (masked), model name — pre-filled from workspace config
- [ ] `saveAIConfig` mutation updates workspace's ai_config fields
- [ ] Profile tab: email and password update forms (delegates to Better Auth)
- [ ] Workspace tab: workspace name editor
- [ ] Changes save immediately with success/error feedback
- [ ] Settings scoped to current workspace

## Blocked by

- 001 — Auth & Onboarding Flow (workspace context, auth session)

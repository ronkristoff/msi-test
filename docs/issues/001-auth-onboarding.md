# 001 — Auth & Onboarding Flow

**Type**: AFK
**Blocked by**: None — can start immediately

## What to build

Complete authentication and onboarding flow. User can sign up, sign in (email/password + Google OAuth), and is guided through workspace creation with a required AI provider config step (endpoint URL, API key, model name with pre-filled defaults). After onboarding, the user lands on the dashboard. Settings page allows updating AI config, profile info, and email/password.

End-to-end: Better Auth setup on Convex → login page (`/login`) → onboarding wizard (`/onboarding`) with workspace + AI config creation → settings page (`/settings`) for config/profile updates.

## Acceptance criteria

- [ ] Better Auth configured with email/password and Google OAuth providers
- [ ] `/login` page renders sign-in form (email/password) and Google OAuth button
- [ ] `/onboarding` wizard creates a workspace with required AI provider config (endpoint URL, API key, model name); defaults pre-filled to `https://api.openai.com/v1` and `gpt-4o`
- [ ] Cannot proceed past onboarding without entering an API key
- [ ] Convex `workspaces` table created with fields: name, owner_id, ai_config (endpoint_url, api_key, model_name), created_at
- [ ] `/settings` page allows updating AI provider config, profile name/email, and password
- [ ] Unauthenticated users are redirected to `/login`
- [ ] Auth session context available to all pages (current user, current workspace)

## Blocked by

None — can start immediately.

# 032 — Browser AI model override in settings

**Type**: AFK
**Status**: needs-triage
**Blocked by**: 022

## What to build

Update the workspace AI config to support a separate model for browser reasoning. The settings UI shows the existing primary AI config (for test generation, failure analysis) plus an optional "Browser AI" section with its own model selector. Defaults to a fast model matching the user's chosen provider. Power users can fine-tune both. The Runner reads both configs and uses the browser model for Stagehand initialization.

## Acceptance criteria

- [ ] `stagehand_model_name` field in workspace `ai_config` is editable via settings UI
- [ ] "Browser AI" section in workspace settings, collapsible, below primary AI config
- [ ] Model dropdown for browser AI populated from same provider presets as primary
- [ ] Defaults to a fast/cheap model matching the user's provider (e.g., GPT-4o-mini for OpenAI)
- [ ] If browser model not set, Runner falls back to primary model
- [ ] `AIConfigForm` component updated to support the browser AI section
- [ ] Workspace mutations handle both model fields
- [ ] Frontend zod schema updated for new field

## Blocked by

- 022 — Install Stagehand + wire BYOK config (adds the `stagehand_model_name` field)

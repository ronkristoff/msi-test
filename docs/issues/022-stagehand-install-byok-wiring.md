# 022 — Install Stagehand + wire BYOK config to Runner

**Type**: AFK
**Status**: completed
**Blocked by**: None — can start immediately

## What to build

Install the Stagehand SDK in the Runner and wire it to the user's BYOK AI config. Add a `stagehand_model_name` field to the workspace `ai_config` schema so users can configure a separate (typically faster/cheaper) model for browser reasoning. The Runner queries the workspace config when picking up a job and initializes a Stagehand instance with `env: "LOCAL"` using the user's endpoint, API key, and model. A smoke test proves the full wiring: Runner creates a Stagehand instance, opens a local Chromium browser, navigates to a URL, takes a screenshot, and closes.

## Acceptance criteria

- [x] `@browserbasehq/stagehand` added as a dependency in the Runner
- [x] `stagehand_model_name` field added to `ai_config` in workspaces schema (optional, defaults to a fast model)
- [x] Runner can query a workspace's AI config (both primary and Stagehand models + API key)
- [x] Runner initializes Stagehand with `env: "LOCAL"` using the workspace's BYOK endpoint/key/model
- [x] Smoke test: Runner creates Stagehand instance → opens browser → navigates to a URL → closes browser
- [x] Existing Runner functionality (legacy Playwright execution, exploration) unchanged

## Blocked by

None - can start immediately

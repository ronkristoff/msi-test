# 017 — CI & Slack Integrations

**Type**: AFK
**Blocked by**: 002

## What to build

GitHub webhook listener and Slack notification integration. GitHub webhook endpoint receives push/pull_request events and creates runs. Slack webhook sends test result notifications with configurable alert rules. Integration config pages for both.

End-to-end: `/integrations/ci` page configures GitHub webhook URL → webhook endpoint in `convex/http.ts` receives events → creates Run record with `trigger_type: "ci"` → `/integrations/slack` page configures webhook URL and alert rules → after run completes, `sendTestNotification` action sends Slack message → run list shows CI vs manual trigger type.

## Acceptance criteria

- [ ] `/integrations/ci` page shows GitHub webhook configuration instructions and endpoint URL
- [ ] GitHub webhook listener endpoint in `convex/http.ts` accepts POST requests
- [ ] Webhook handler creates a Run record with `trigger_type: "ci"` on push/pull_request events
- [ ] Run list and run detail display trigger type (manual, ci, scheduled, rerun)
- [ ] `/integrations/slack` page allows entering a Slack webhook URL
- [ ] User can define alert rules: trigger event (on failure, on flaky increase), optional threshold
- [ ] "Test Integration" button sends a sample Slack message via `sendTestNotification` action
- [ ] After a run completes matching an alert rule, Slack notification sent with: suite name, pass/fail counts, link to run detail
- [ ] `saveIntegration` and `saveAlertRule` mutations store config in integrations and alert_rules tables
- [ ] Integration status shown on config pages (active/inactive)

## Blocked by

- 002 — Convex Schema Foundation (integrations, alert_rules tables)

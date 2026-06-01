# 040 — Natural Language Chat Refinement

**Type**: AFK
**Status**: needs-triage
**Blocked by**: 005, 004

## What to build

Add a chat interface to the suite detail page where users describe test changes in plain English and the AI applies them. Instead of editing raw Playwright TypeScript, users say things like "add a wait for the modal before clicking submit" or "check that 5 items appear instead of 3". The AI receives the current test code, the user's message, conversation history, and project context — then returns modified test code with a diff summary for the user to accept or reject.

Chat threads are persisted via the existing `@convex-dev/agent` thread system, scoped per test (thread ID derived from test ID). This makes test refinement accessible to non-developers and reduces the friction of maintaining AI-generated test suites.

Works with both `playwright_code` tests (current) and hybrid `steps` tests (from issue 027).

## Acceptance criteria

### Backend

- [ ] New Convex action `refineTest` — takes `test_id`, `message`, `thread_id` (optional, created on first message). Calls the Test Generation Agent with: current test code/steps, user message, conversation history from thread, project context (app_url, PRD text if available, suite name). Returns modified test code/steps with a human-readable diff summary
- [ ] Thread management: thread ID derived as `refine:${testId}` — one persistent thread per test, conversation survives across sessions
- [ ] AI prompt instructs the model to: (1) understand the current test, (2) apply the requested change precisely, (3) return the full modified test with a summary of what changed, (4) never break existing test structure or imports
- [ ] For hybrid `steps` tests (issue 027): AI modifies individual step instructions and assertion code, returns updated `steps` array
- [ ] For `playwright_code` tests: AI returns modified TypeScript string
- [ ] Graceful fallback: if workspace has no AI config, return an error message directing user to Settings

### Frontend — Chat Panel

- [ ] New `<TestChat>` component — collapsible side panel on the suite detail page, toggled via a "Chat" button on each test card
- [ ] Chat panel layout: message history (scrollable), text input at bottom, send button
- [ ] User messages: right-aligned, blue accent bg
- [ ] AI response messages: left-aligned, show diff summary in a code-styled block, two action buttons: "Apply" (primary) and "Discard" (ghost)
- [ ] "Apply" saves the modified test code as `status: "draft"` (does not auto-approve), shows a success toast: "Test updated. Review and approve when ready."
- [ ] "Discard" removes the AI response from view (but keeps it in thread history for context)
- [ ] Loading state: typing indicator while AI processes (spinner + "Refining test...")
- [ ] Error state: red alert inline in chat if AI call fails, with retry button
- [ ] Chat panel persists open/closed state per test in local storage

### Frontend — Quick Actions

- [ ] Pre-built quick-action chips above the text input: "Fix this failure" (pre-fills with error message context), "Add a wait before this step", "Make assertions stricter"
- [ ] "Fix this failure" chip only appears when the test has a recent failure (checks run_results for last status)

### Integration

- [ ] Chat panel available on the suite detail page (`/projects/[id]/suites/[suiteId]`) — "Chat" button on each test row, alongside existing Edit/Delete buttons
- [ ] When chat applies a change, the code editor preview updates to reflect the new draft
- [ ] Works on mobile: chat panel becomes a bottom sheet instead of side panel on narrow screens

## Blocked by

- 005 — AI Provider Module (uses the Test Generation Agent and workspace AI config)
- 004 — Suite & Test CRUD (needs tests to exist and be editable)

# 010 — Run Aggregation & Failure Analysis

**Type**: AFK
**Blocked by**: 009

## What to build

Post-run computation and AI failure analysis. After a run completes, compute aggregate stats (pass/fail/flaky counts, total duration, per-step timing). For each failed test, call the Failure Analysis Agent with full context (test code, error message, screenshot at failure, console output). Store AI insights. Support re-runs as new Run records.

End-to-end: Run completes → aggregation computes counts/duration → for each failure, Failure Analysis Agent receives context → AI insight stored (root cause, suggested fix, confidence score) → re-run button creates new Run with `trigger_type: "rerun"` linked to original → original Run stays immutable.

## Acceptance criteria

- [ ] After run completes, `run_results` status is aggregated to compute Run-level status (failed if any failed, passed if all passed)
- [ ] Total duration computed as sum of all `run_results.duration_ms`
- [ ] Pass, fail, and skip counts stored or computable from run results
- [ ] For each failed test, Failure Analysis Agent is called with: test code, error message, screenshot at failure point, console output
- [ ] AI insight stored in `ai_insights` table with: type "root_cause", analysis_text, suggested_fix, confidence_score, linked to test_id and run_id
- [ ] Re-run button creates a new Run record with `trigger_type: "rerun"`, `rerun_of_run_id` set to original Run ID
- [ ] Original Run remains unchanged (immutable record)
- [ ] `rerunTest` mutation creates the new Run and its pending work item
- [ ] Unit tests verify aggregation math with fixture step results
- [ ] Unit tests verify AI insight storage with correct linkage to test and run

## Blocked by

- 009 — Runner Foundation & Test Execution (run results, step data)

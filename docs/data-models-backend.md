# Data Models — Backend (Convex)

## Overview

All data is stored in Convex tables defined in `convex/schema.ts`. There are **18 tables** organized into 7 domains. No migration directory exists — schema changes are applied directly by Convex deployment.

---

## Core Auth/Org

### workspaces
| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | Yes | Workspace display name |
| `owner_id` | string | Yes | Better Auth user ID of creator |
| `invite_code` | string | No | 8-char code for member invitations |
| `ai_config.endpoint_url` | string | Yes | LLM provider endpoint |
| `ai_config.api_key` | string | Yes | LLM provider API key |
| `ai_config.model_name` | string | Yes | Default model name |
| `ai_config.stagehand_model_name` | string | No | Stagehand-specific model |
| `heal_confidence_threshold` | number | No | Min confidence for auto-heal (0-1) |
| `stagehand_enabled` | boolean | No | Whether Stagehand is enabled |

**Indexes:** `by_owner_id`, `by_invite_code`

### workspace_members
| Field | Type | Required | Description |
|---|---|---|---|
| `workspace_id` | Id<"workspaces"> | Yes | Parent workspace |
| `user_id` | string | Yes | Better Auth user ID |
| `role` | "owner" \| "member" | Yes | Role |
| `invited_at` | number | Yes | Unix timestamp |
| `user_name` | string | Yes | Display name snapshot |

**Indexes:** `by_user_id`, `by_workspace_id`, `by_workspace_id_and_user_id`

### error_logs
| Field | Type | Required | Description |
|---|---|---|---|
| `message` | string | Yes | Error message (truncated) |
| `stack` | string | No | Stack trace (truncated) |
| `source` | string | Yes | Source identifier |
| `severity` | string | Yes | Error severity level |
| `url` | string | No | Page URL at time of error |
| `user_agent` | string | No | Browser user agent |
| `user_id` | string | No | Better Auth user ID |
| `context` | string | No | Additional context (truncated) |

**Indexes:** `by_time` (on severity)

---

## Project/Test Configuration

### projects
| Field | Type | Required | Description |
|---|---|---|---|
| `workspace_id` | Id<"workspaces"> | Yes | Parent workspace |
| `name` | string | Yes | Project name |
| `app_url` | string | Yes | Target application URL |
| `prd_text` | string | No | PRD text for test generation |
| `prd_file_id` | Id<"_storage"> | No | Uploaded PRD file |
| `explore_auth_mode` | "none" \| "form" \| "cookie" | No | Auth mode for exploration |
| `explore_login_url` | string | No | Login page URL |
| `explore_username` | string | No | Login username |
| `explore_password` | string | No | Login password |
| `explore_cookie_name` | string | No | Auth cookie name |
| `explore_cookie_value` | string | No | Auth cookie value |
| `test_data` | Record<string,string> | No | Test data key-value pairs |
| `status` | "active" \| "archived" | No | Project status |

**Indexes:** `by_workspace_id`, `by_workspace_id_and_name`

### suites
| Field | Type | Required | Description |
|---|---|---|---|
| `workspace_id` | Id<"workspaces"> | Yes | Parent workspace |
| `project_id` | Id<"projects"> | Yes | Parent project |
| `name` | string | Yes | Suite name |
| `description` | string | No | Description |
| `suite_type` | "functional" \| "regression" | No | Suite type |
| `auto_include_all` | boolean | No | Auto-include all functional tests |
| `source_type` | "url_exploration" \| "prd" \| "natural_language" \| "manual" | Yes | How tests were created |
| `status` | "generating" \| "ready" \| "failed" | No | Generation status |
| `generation_error` | string | No | Error during generation |
| `progress_message` | string | No | Progress status text |
| `triggered_by` | string | No | User who triggered generation |
| `locked_by` | string | No | Runner ID holding lock |
| `locked_at` | number | No | Lock timestamp |
| `locked_reason` | "running" \| "generating" | No | Lock reason |
| `exploration_id` | Id<"explorations"> | No | Source exploration |
| `area` | string | No | Test area label |
| `failed_scenarios` | string[] | No | Failed scenario names |

**Indexes:** `by_workspace_id`, `by_project_id`, `by_project_id_and_suite_type`, `by_workspace_id_and_status`, `by_exploration_id`

### tests
| Field | Type | Required | Description |
|---|---|---|---|
| `workspace_id` | Id<"workspaces"> | Yes | Parent workspace |
| `suite_id` | Id<"suites"> | Yes | Parent suite |
| `name` | string | Yes | Test name |
| `description` | string | No | Description |
| `playwright_code` | string | No | Generated Playwright code |
| `execution_type` | "playwright" \| "stagehand" | No | Execution engine |
| `steps` | TestStep[] | No | Test step array |
| `source_type` | "url_exploration" \| "prd" \| "natural_language" | Yes | How this test was created |
| `validated` | boolean | No | Passed validation |
| `status` | "draft" \| "approved" \| "healing" | Yes | Current status |
| `last_healed_at` | number | No | Last heal timestamp |
| `last_healed_diff` | string | No | Last heal code diff |
| `locked_by` | string | No | User who locked |
| `locked_at` | number | No | Lock timestamp |
| `healing_started_at` | number | No | Healing start timestamp |

**Indexes:** `by_workspace_id`, `by_workspace_id_and_status`, `by_status`, `by_suite_id`

### suite_members
| Field | Type | Required | Description |
|---|---|---|---|
| `workspace_id` | Id<"workspaces"> | Yes | Parent workspace |
| `regression_suite_id` | Id<"suites"> | Yes | Regression suite parent |
| `member_suite_id` | Id<"suites"> | No | Member suite (functional) |
| `member_test_id` | Id<"tests"> | No | Individual test member |

**Indexes:** `by_regression_suite_id`, `by_member_suite_id`, `by_member_test_id`

### test_lists
| Field | Type | Required | Description |
|---|---|---|---|
| `workspace_id` | Id<"workspaces"> | Yes | Parent workspace |
| `name` | string | Yes | List name |
| `description` | string | No | Description |
| `created_by` | string | Yes | Creator user ID |

**Indexes:** `by_workspace_id`

### test_list_members
| Field | Type | Required | Description |
|---|---|---|---|
| `workspace_id` | Id<"workspaces"> | Yes | Parent workspace |
| `test_list_id` | Id<"test_lists"> | Yes | Parent list |
| `test_id` | Id<"tests"> | Yes | Member test |
| `source_suite_id` | Id<"suites"> | Yes | Suite the test came from |
| `source_project_id` | Id<"projects"> | Yes | Project the test came from |
| `added_at` | number | Yes | Unix timestamp |

**Indexes:** `by_test_list_id`, `by_test_id`

---

## Execution/Results

### runs
| Field | Type | Required | Description |
|---|---|---|---|
| `workspace_id` | Id<"workspaces"> | Yes | Parent workspace |
| `suite_id` | Id<"suites"> | No | Suite being run |
| `test_id` | Id<"tests"> | No | Individual test being run |
| `test_list_id` | Id<"test_lists"> | No | Test list being run |
| `rerun_of_run_id` | Id<"runs"> | No | Parent run for reruns |
| `rerun_of_test_id` | Id<"tests"> | No | Specific test rerun |
| `project_id` | Id<"projects"> | Yes | Parent project |
| `environment_id` | Id<"environments"> | No | Target environment |
| `trigger_type` | "manual" \| "ci" \| "scheduled" \| "rerun" | Yes | How run was triggered |
| `triggered_by` | string | No | User who triggered |
| `schedule_id` | Id<"schedules"> | No | Source schedule |
| `branch` | string | No | Git branch |
| `commit` | string | No | Git commit hash |
| `status` | "running" \| "passed" \| "failed" \| "cancelled" \| "timed_out" | Yes | Run status |
| `runner_id` | string | No | Runner that claimed |
| `started_at` | number | No | Start timestamp |
| `finished_at` | number | No | End timestamp |
| `duration_ms` | number | No | Total duration |
| `pass_count` | number | No | Passed tests |
| `fail_count` | number | No | Failed tests |
| `skip_count` | number | No | Skipped tests |
| `healed_count` | number | No | Healed tests |
| `auto_heal_attempted` | boolean | No | Auto-heal was attempted |
| `error_message` | string | No | Top-level error |

**Indexes:** `by_workspace_id`, `by_workspace_id_and_status`, `by_project_id`, `by_project_id_and_status`, `by_suite_id`, `by_status`, `by_schedule_id`

### run_results
| Field | Type | Required | Description |
|---|---|---|---|
| `workspace_id` | Id<"workspaces"> | Yes | Parent workspace |
| `run_id` | Id<"runs"> | Yes | Parent run |
| `test_id` | Id<"tests"> | Yes | Test executed |
| `status` | "pending" \| "passed" \| "failed" \| "skipped" | Yes | Result |
| `duration_ms` | number | Yes | Test duration |
| `retries` | number | Yes | Retry count |
| `console_log_file_id` | Id<"_storage"> | No | Console output file |
| `trace_file_id` | Id<"_storage"> | No | Playwright trace |
| `video_file_id` | Id<"_storage"> | No | Video recording |
| `screenshot_file_ids` | Id<"_storage">[] | No | Screenshots |
| `error_message` | string | No | Error text |

**Indexes:** `by_run_id`, `by_test_id`

### steps
| Field | Type | Required | Description |
|---|---|---|---|
| `workspace_id` | Id<"workspaces"> | Yes | Parent workspace |
| `run_result_id` | Id<"run_results"> | Yes | Parent result |
| `step_number` | number | Yes | Step order |
| `command` | string | Yes | Step command text |
| `locator` | string | No | Target selector |
| `status` | "passed" \| "failed" \| "skipped" \| "healed" | Yes | Step result |
| `error_message` | string | No | Error text |
| `screenshot_file_id` | Id<"_storage"> | No | Screenshot |
| `duration_ms` | number | Yes | Step duration |
| `heal_reason` | string | No | Healing reason |
| `heal_confidence` | number | No | Healing confidence score |
| `before_screenshot_file_id` | Id<"_storage"> | No | Before-heal screenshot |

**Indexes:** `by_run_result_id`

### run_heartbeats
| Field | Type | Required | Description |
|---|---|---|---|
| `workspace_id` | Id<"workspaces"> | Yes | Parent workspace |
| `run_id` | Id<"runs"> | Yes | Run being tracked |
| `last_heartbeat_at` | number | Yes | Last heartbeat timestamp |

**Indexes:** `by_run_id`

---

## AI/Analysis

### ai_insights
| Field | Type | Required | Description |
|---|---|---|---|
| `workspace_id` | Id<"workspaces"> | Yes | Parent workspace |
| `test_id` | Id<"tests"> | Yes | Affected test |
| `run_id` | Id<"runs"> | Yes | Run that triggered analysis |
| `type` | "root_cause" \| "flakiness_cluster" | Yes | Analysis type |
| `analysis_text` | string | Yes | Analysis output |
| `suggested_fix` | string | No | AI-suggested fix |
| `confidence_score` | number | Yes | AI confidence |

**Indexes:** `by_workspace_id`, `by_test_id`

### healing_history
| Field | Type | Required | Description |
|---|---|---|---|
| `workspace_id` | Id<"workspaces"> | Yes | Parent workspace |
| `test_id` | Id<"tests"> | Yes | Healed test |
| `step_index` | number | Yes | Step that was healed |
| `original_instruction` | string | Yes | Original step instruction |
| `healed_selector` | string | Yes | New selector |
| `healed_description` | string | No | Description of heal |
| `confidence` | number | Yes | Confidence score |
| `reason` | string | No | Heal reason |
| `run_id` | Id<"runs"> | No | Run where healing occurred |

**Indexes:** `by_test_id`, `by_workspace_id`

---

## Environments & Integration

### environments
| Field | Type | Required | Description |
|---|---|---|---|
| `workspace_id` | Id<"workspaces"> | Yes | Parent workspace |
| `project_id` | Id<"projects"> | Yes | Parent project |
| `name` | string | Yes | Environment name |
| `base_url` | string | Yes | Base URL |

**Indexes:** `by_workspace_id`, `by_project_id`

### integrations
| Field | Type | Required | Description |
|---|---|---|---|
| `workspace_id` | Id<"workspaces"> | Yes | Parent workspace |
| `type` | "slack" \| "github" | Yes | Integration type |
| `config` | \{webhook_url: string\} \| \{repo, webhook_secret\} | Yes | Type-specific config |
| `status` | "active" \| "inactive" | Yes | Status |

**Indexes:** `by_workspace_id`

### alert_rules
| Field | Type | Required | Description |
|---|---|---|---|
| `workspace_id` | Id<"workspaces"> | Yes | Parent workspace |
| `integration_id` | Id<"integrations"> | Yes | Parent integration |
| `trigger_event` | string | Yes | Event to trigger on |
| `threshold` | number | No | Trigger threshold |
| `enabled` | boolean | Yes | Whether rule is active |

**Indexes:** `by_integration_id`

---

## Exploration

### explorations
| Field | Type | Required | Description |
|---|---|---|---|
| `workspace_id` | Id<"workspaces"> | Yes | Parent workspace |
| `project_id` | Id<"projects"> | Yes | Parent project |
| `url` | string | Yes | Starting URL |
| `goal` | string | No | Exploration goal |
| `additional_urls` | string[] | No | Extra URLs to explore |
| `status` | "pending"→"discovering"→"discovered"→"capturing"→"captured"→"analyzing"→"analyzed"→"completed"\|"failed" | Yes | State machine |
| `progress_message` | string | No | Progress text |
| `pages_captured` | number | No | Number of captured pages |
| `runner_id` | string | No | Assigned runner |
| `interactive` | boolean | No | Interactive mode |
| `exploration_mode` | "scripted" \| "autonomous" | No | Mode |
| `max_steps` | number | No | Step limit |
| `captured_pages` | CapturedPage[] | No | Page snapshots |
| `discovered_pages` | DiscoveredPage[] | No | Link crawl results |
| `selected_pages` | string[] | No | User-selected page URLs |
| `discovered_flows` | DiscoveredFlow[] | No | Multi-page flows |
| `prd_coverage` | PrdCoverageItem[] | No | PRD feature coverage |
| `proposed_scenarios` | Scenario[] | No | AI-proposed test scenarios |
| `generated_areas` | string[] | No | Completed generation areas |
| `error_message` | string | No | Error text |
| `auth_cookies` | AuthCookie[] | No | Captured auth cookies |
| `nav_menu` | NavMenuItem[] | No | Navigation menu items |

**Indexes:** `by_project_id`, `by_workspace_id`, `by_workspace_id_and_status`, `by_status`

---

## Schedules

### schedules
| Field | Type | Required | Description |
|---|---|---|---|
| `workspace_id` | Id<"workspaces"> | Yes | Parent workspace |
| `name` | string | Yes | Schedule name |
| `suite_id` | Id<"suites"> | Yes | Suite to run |
| `environment_id` | Id<"environments"> | Yes | Target environment |
| `cadence` | { seconds: number } | Yes | Run interval |
| `enabled` | boolean | Yes | Whether active |
| `last_run_at` | number | No | Last run timestamp |
| `next_run_at` | number | No | Next scheduled run |
| `created_by` | string | Yes | Creator user ID |

**Indexes:** `by_workspace_id`, `by_next_run_at`, `by_suite_id`

---

## Summary

- **18 tables** total across 7 domains
- **All tables** have `workspace_id` for multi-tenant isolation
- **No `by_creation_time` or `by_id` indexes** — these are Convex-reserved names
- **Auth fields** reference Better Auth user IDs (strings, not Convex IDs)
- **File references** use `Id<"_storage">` for Convex file storage
- **Timestamps** are Unix epoch numbers (milliseconds)

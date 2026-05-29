import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  workspaces: defineTable({
    name: v.string(),
    owner_id: v.string(),
    ai_config: v.object({
      endpoint_url: v.string(),
      api_key: v.string(),
      model_name: v.string(),
    }),
  }).index("by_owner_id", ["owner_id"]),

  error_logs: defineTable({
    message: v.string(),
    stack: v.optional(v.string()),
    source: v.string(),
    severity: v.string(),
    url: v.optional(v.string()),
    user_agent: v.optional(v.string()),
    user_id: v.optional(v.string()),
    context: v.optional(v.string()),
  }).index("by_time", ["severity"]),

  projects: defineTable({
    workspace_id: v.id("workspaces"),
    name: v.string(),
    app_url: v.string(),
    prd_text: v.optional(v.string()),
    prd_file_id: v.optional(v.id("_storage")),
  })
    .index("by_workspace_id", ["workspace_id"])
    .index("by_workspace_id_and_name", ["workspace_id", "name"]),

  suites: defineTable({
    workspace_id: v.id("workspaces"),
    project_id: v.id("projects"),
    name: v.string(),
    description: v.optional(v.string()),
    source_type: v.union(
      v.literal("url_exploration"),
      v.literal("prd"),
      v.literal("natural_language"),
      v.literal("manual"),
    ),
  })
    .index("by_workspace_id", ["workspace_id"])
    .index("by_project_id", ["project_id"]),

  tests: defineTable({
    workspace_id: v.id("workspaces"),
    suite_id: v.id("suites"),
    name: v.string(),
    description: v.optional(v.string()),
    playwright_code: v.string(),
    source_type: v.union(
      v.literal("url_exploration"),
      v.literal("prd"),
      v.literal("natural_language"),
    ),
    status: v.union(v.literal("draft"), v.literal("approved")),
  })
    .index("by_workspace_id", ["workspace_id"])
    .index("by_suite_id", ["suite_id"]),

  runs: defineTable({
    workspace_id: v.id("workspaces"),
    suite_id: v.optional(v.id("suites")),
    test_id: v.optional(v.id("tests")),
    rerun_of_run_id: v.optional(v.id("runs")),
    rerun_of_test_id: v.optional(v.id("tests")),
    project_id: v.id("projects"),
    environment_id: v.optional(v.id("environments")),
    trigger_type: v.union(
      v.literal("manual"),
      v.literal("ci"),
      v.literal("rerun"),
    ),
    branch: v.optional(v.string()),
    commit: v.optional(v.string()),
    status: v.union(
      v.literal("running"),
      v.literal("passed"),
      v.literal("failed"),
      v.literal("cancelled"),
      v.literal("timed_out"),
    ),
    runner_id: v.optional(v.string()),
    started_at: v.optional(v.number()),
    finished_at: v.optional(v.number()),
    duration_ms: v.optional(v.number()),
    pass_count: v.optional(v.number()),
    fail_count: v.optional(v.number()),
    skip_count: v.optional(v.number()),
  })
    .index("by_workspace_id", ["workspace_id"])
    .index("by_project_id", ["project_id"])
    .index("by_project_id_and_status", ["project_id", "status"])
    .index("by_suite_id", ["suite_id"])
    .index("by_status", ["status"]),

  run_results: defineTable({
    workspace_id: v.id("workspaces"),
    run_id: v.id("runs"),
    test_id: v.id("tests"),
    status: v.union(
      v.literal("passed"),
      v.literal("failed"),
      v.literal("skipped"),
    ),
    duration_ms: v.number(),
    retries: v.number(),
    console_log_file_id: v.optional(v.id("_storage")),
    trace_file_id: v.optional(v.id("_storage")),
    video_file_id: v.optional(v.id("_storage")),
    screenshot_file_ids: v.optional(v.array(v.id("_storage"))),
  })
    .index("by_run_id", ["run_id"])
    .index("by_test_id", ["test_id"]),

  steps: defineTable({
    workspace_id: v.id("workspaces"),
    run_result_id: v.id("run_results"),
    step_number: v.number(),
    command: v.string(),
    locator: v.optional(v.string()),
    status: v.union(
      v.literal("passed"),
      v.literal("failed"),
      v.literal("skipped"),
    ),
    error_message: v.optional(v.string()),
    screenshot_file_id: v.optional(v.id("_storage")),
    duration_ms: v.number(),
  }).index("by_run_result_id", ["run_result_id"]),

  ai_insights: defineTable({
    workspace_id: v.id("workspaces"),
    test_id: v.id("tests"),
    run_id: v.id("runs"),
    type: v.union(v.literal("root_cause"), v.literal("flakiness_cluster")),
    analysis_text: v.string(),
    suggested_fix: v.optional(v.string()),
    confidence_score: v.number(),
  })
    .index("by_workspace_id", ["workspace_id"])
    .index("by_test_id", ["test_id"]),

  environments: defineTable({
    workspace_id: v.id("workspaces"),
    project_id: v.id("projects"),
    name: v.string(),
    base_url: v.string(),
  })
    .index("by_workspace_id", ["workspace_id"])
    .index("by_project_id", ["project_id"]),

  integrations: defineTable({
    workspace_id: v.id("workspaces"),
    type: v.union(v.literal("slack"), v.literal("github")),
    config: v.union(
      v.object({ webhook_url: v.string() }),
      v.object({ repo: v.string(), webhook_secret: v.string() }),
    ),
    status: v.union(v.literal("active"), v.literal("inactive")),
  }).index("by_workspace_id", ["workspace_id"]),

  alert_rules: defineTable({
    workspace_id: v.id("workspaces"),
    integration_id: v.id("integrations"),
    trigger_event: v.string(),
    threshold: v.optional(v.number()),
    enabled: v.boolean(),
  }).index("by_integration_id", ["integration_id"]),

  run_heartbeats: defineTable({
    workspace_id: v.id("workspaces"),
    run_id: v.id("runs"),
    last_heartbeat_at: v.number(),
  }).index("by_run_id", ["run_id"]),

  explorations: defineTable({
    workspace_id: v.id("workspaces"),
    project_id: v.id("projects"),
    url: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("capturing"),
      v.literal("captured"),
      v.literal("analyzing"),
      v.literal("analyzed"),
      v.literal("completed"),
      v.literal("failed"),
    ),
    progress_message: v.optional(v.string()),
    pages_captured: v.optional(v.number()),
    runner_id: v.optional(v.string()),
    captured_pages: v.optional(
      v.array(
        v.object({
          url: v.string(),
          title: v.string(),
          structure_text: v.string(),
        }),
      ),
    ),
    proposed_scenarios: v.optional(
      v.array(
        v.object({
          name: v.string(),
          description: v.string(),
          flow_summary: v.string(),
        }),
      ),
    ),
    error_message: v.optional(v.string()),
  })
    .index("by_project_id", ["project_id"])
    .index("by_workspace_id", ["workspace_id"])
    .index("by_status", ["status"]),
});

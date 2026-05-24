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
});

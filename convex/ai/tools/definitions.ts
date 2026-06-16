import { createTool } from "@convex-dev/agent";
import { z } from "zod/v3";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { readPreviousExplorationsLogic, readRecentFailuresLogic } from "./logic";

function validateConvexId(value: string, label: string): string | null {
  if (/^[a-z0-9]{10,}$/i.test(value)) return null;
  return `Invalid ${label} '${value}'. You must pass the Convex document ID (a long alphanumeric string like 'jh7k2abc4def'), not a human-readable name. Use the ID provided in the context.`;
}

export function createToolDefinitions() {
  return {
    readExistingTests: createTool({
      description:
        "Read existing tests for a given suite. The suite_id must be the Convex document ID (a long alphanumeric string), NOT a human-readable suite name.",
      inputSchema: z.object({ suite_id: z.string() }),
      execute: async (ctx, input) => {
        const err = validateConvexId(input.suite_id, "suite_id");
        if (err) return { error: err };
        return ctx.runQuery(internal.ai.tools.queries.readExistingTestsQuery, {
          suite_id: input.suite_id as Id<"suites">,
        });
      },
    }),
    readProjectContext: createTool({
      description:
        "Read project context including name, URL, and PRD text. The project_id must be the Convex document ID (a long alphanumeric string), NOT a human-readable project name.",
      inputSchema: z.object({ project_id: z.string() }),
      execute: async (ctx, input) => {
        const err = validateConvexId(input.project_id, "project_id");
        if (err) return { error: err };
        return ctx.runQuery(internal.ai.tools.queries.readProjectContextQuery, {
          project_id: input.project_id as Id<"projects">,
        });
      },
    }),
    readKnowledgeBase: createTool({
      description:
        "Read the Knowledge Base for a project — architecture summary, tech stack, and detected modules with their API endpoints, data models, user flows, and cross-module dependencies. Returns null if no Knowledge Base exists or it is not ready. The project_id must be the Convex document ID (a long alphanumeric string), NOT a human-readable project name.",
      inputSchema: z.object({ project_id: z.string() }),
      execute: async (ctx, input) => {
        const err = validateConvexId(input.project_id, "project_id");
        if (err) return { error: err };
        return ctx.runQuery(internal.ai.tools.queries.readKnowledgeBaseQuery, {
          project_id: input.project_id as Id<"projects">,
        });
      },
    }),
    readTestCode: createTool({
      description:
        "Read the full test code for a specific test. The test_id must be the Convex document ID (a long alphanumeric string), NOT a human-readable test name.",
      inputSchema: z.object({ test_id: z.string() }),
      execute: async (ctx, input) => {
        const err = validateConvexId(input.test_id, "test_id");
        if (err) return { error: err };
        return ctx.runQuery(internal.ai.tools.queries.readTestCodeQuery, {
          test_id: input.test_id as Id<"tests">,
        });
      },
    }),
    readPreviousExplorations: createTool({
      description: "Read previous exploration analyses for a project (stub)",
      inputSchema: z.object({ project_id: z.string() }),
      execute: async () => readPreviousExplorationsLogic(),
    }),
    readRecentFailures: createTool({
      description: "Read recent test failure details for a project (stub)",
      inputSchema: z.object({ project_id: z.string() }),
      execute: async () => readRecentFailuresLogic(),
    }),
  };
}

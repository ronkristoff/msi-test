import { createTool } from "@convex-dev/agent";
import { z } from "zod/v3";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { readPreviousExplorationsLogic, readRecentFailuresLogic } from "./logic";

export function createToolDefinitions() {
  return {
    readExistingTests: createTool({
      description: "Read existing tests for a given suite",
      inputSchema: z.object({ suite_id: z.string() }),
      execute: async (ctx, input) => {
        return ctx.runQuery(internal.ai.tools.queries.readExistingTestsQuery, {
          suite_id: input.suite_id as Id<"suites">,
        });
      },
    }),
    readProjectContext: createTool({
      description: "Read project context including name, URL, and PRD text",
      inputSchema: z.object({ project_id: z.string() }),
      execute: async (ctx, input) => {
        return ctx.runQuery(internal.ai.tools.queries.readProjectContextQuery, {
          project_id: input.project_id as Id<"projects">,
        });
      },
    }),
    readTestCode: createTool({
      description: "Read the full test code for a specific test",
      inputSchema: z.object({ test_id: z.string() }),
      execute: async (ctx, input) => {
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

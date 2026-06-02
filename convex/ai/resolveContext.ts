import type { ActionCtx } from "../_generated/server";
import { ConvexError } from "convex/values";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { AiConfig } from "./model";
import type { Doc } from "../_generated/dataModel";

export type TestContext = {
  test: Doc<"tests">;
  suite: { _id: Id<"suites">; project_id: Id<"projects">; name: string; [k: string]: unknown };
  project: Doc<"projects"> & { workspace_id: Id<"workspaces"> };
  aiConfig: AiConfig;
};

export async function resolveTestContext(ctx: ActionCtx, testId: Id<"tests">): Promise<TestContext> {
  const test = await ctx.runQuery(internal.tests.queries.getTestInternal, {
    test_id: testId,
  });
  if (!test) throw new ConvexError("Test not found");

  const suite = await ctx.runQuery(api.suites.queries.getSuite, {
    suite_id: test.suite_id,
  });
  if (!suite) throw new ConvexError("Suite not found");

  const project = await ctx.runQuery(internal.projects.queries.getProjectForAi, {
    project_id: suite.project_id,
  });
  if (!project) throw new ConvexError("Project not found");

  const aiConfig = await ctx.runQuery(internal.ai.model.getWorkspaceAiConfigQuery, {
    workspace_id: project.workspace_id,
  });

  return { test, suite, project, aiConfig };
}

import type { ActionCtx } from "../_generated/server";
import { ConvexError } from "convex/values";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { AiConfig } from "./model";
import type { Doc } from "../_generated/dataModel";
import { formatCapturedPagesForPrompt } from "./formatPages";

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

export async function resolvePageContext(
  ctx: ActionCtx,
  projectId: Id<"projects">,
  testCode?: string,
): Promise<string> {
  const explorations = await ctx.runQuery(api.explorations.queries.getExplorationsByProject, {
    project_id: projectId,
  });
  if (explorations.length === 0) return "";

  const latest = explorations[0];
  if (latest.captured_pages && latest.captured_pages.length > 0) {
    const matchingPages = latest.captured_pages.filter((p: { url: string }) => {
      if (!testCode) return true;
      const testUrl = testCode.match(/page\.goto\(['"`]([^'"`]+)/)?.[1];
      if (!testUrl) return true;
      try {
        return p.url.includes(new URL(testUrl).pathname);
      } catch {
        return true;
      }
    });
    const pages = matchingPages.length > 0 ? matchingPages : latest.captured_pages.slice(0, 5);
    return formatCapturedPagesForPrompt(pages, 6000, "detailed");
  }

  if (latest.discovered_pages && latest.discovered_pages.length > 0) {
    return latest.discovered_pages
      .slice(0, 10)
      .map((p: { title: string; url: string }, i: number) => `--- Page ${i + 1}: ${p.title} (${p.url}) ---`)
      .join("\n");
  }

  return "";
}

import { v } from "convex/values";
import { components, internal } from "../_generated/api";
import { defineWorkflow, vWorkflowId } from "@convex-dev/workflow";
import { mutation } from "../_generated/server";
import { deriveTestName } from "./agents";
import { extractUrlsFromText } from "./snapshotFormatter";
import type { SnapshotData } from "./snapshotFormatter";
import { runVerifyLoop, cancelSuiteGeneration } from "./workflowShared";

export function resolveUrls(rawUrls: string[], appUrl: string): string[] {
  let origin: string;
  try {
    origin = new URL(appUrl).origin;
  } catch {
    return rawUrls.filter((u) => u.startsWith("http"));
  }

  const seen = new Set<string>();
  for (const raw of rawUrls) {
    const resolved = raw.startsWith("/") ? `${origin}${raw}` : raw.startsWith("http") ? raw : null;
    if (!resolved) continue;
    try {
      new URL(resolved);
      seen.add(resolved);
    } catch {
      // skip invalid URLs
    }
  }
  return [...seen];
}

export const prdTestGenerationWorkflow = defineWorkflow(components.workflow, {
  args: {
    project_id: v.id("projects"),
    suite_id: v.id("suites"),
    prd_text: v.optional(v.string()),
  },
}).handler(async (step, args) => {
  const project = await step.runQuery(internal.projects.queries.getProjectForAi, {
    project_id: args.project_id,
  });

  if (!project) {
    await step.runMutation(internal.suites.mutations.updateSuiteStatus, {
      suite_id: args.suite_id,
      status: "failed",
      generation_error: "Project not found",
    });
    return { success: false, error: "Project not found" };
  }

  let prdContent = args.prd_text ?? project.prd_text ?? "";

  if (!prdContent && project.prd_file_id) {
    const fileResult: string | null = await step.runAction(
      internal.ai.prdWorkflowActions.readPrdFile,
      { file_id: project.prd_file_id },
    );
    if (fileResult) {
      prdContent = fileResult;
    }
  }

  if (!prdContent.trim()) {
    await step.runMutation(internal.suites.mutations.updateSuiteStatus, {
      suite_id: args.suite_id,
      status: "failed",
      generation_error: "No PRD content found. Add PRD text or upload a file to the project.",
    });
    return { success: false, error: "No PRD content" };
  }

  await step.runMutation(internal.suites.mutations.updateSuiteStatus, {
    suite_id: args.suite_id,
    status: "generating",
    progress_message: "Extracting URLs and fetching page snapshots...",
  });

  const rawUrls = extractUrlsFromText(prdContent);
  const resolvedUrls = resolveUrls(rawUrls, project.app_url);

  const urlsToSnapshot: string[] = [project.app_url, ...resolvedUrls.filter((u) => u !== project.app_url)];

  const snapshots: { url: string; data: SnapshotData }[] = [];
  for (const url of urlsToSnapshot) {
    try {
      const snapshot: SnapshotData | null = await step.runAction(
        internal.ai.snapshotAction.getLiveSnapshot,
        { url, project_id: args.project_id, workspace_id: project.workspace_id },
      );
      if (snapshot) snapshots.push({ url, data: snapshot });
    } catch {
      // Individual snapshot failures are non-fatal
    }
  }

  let loginSnapshot: SnapshotData | null = null;
  if (project.explore_auth_mode === "form" && project.explore_login_url) {
    const existing = snapshots.find((s) => s.url === project.explore_login_url);
    if (existing) {
      loginSnapshot = existing.data;
    } else {
      try {
        const snapshot: SnapshotData | null = await step.runAction(
          internal.ai.snapshotAction.getLiveSnapshot,
          { url: project.explore_login_url, project_id: args.project_id, workspace_id: project.workspace_id },
        );
        if (snapshot) loginSnapshot = snapshot;
      } catch {
        // Login snapshot is optional
      }
    }
  }

  const hasSnapshots = snapshots.length > 0 || loginSnapshot !== null;

  await step.runMutation(internal.suites.mutations.updateSuiteStatus, {
    suite_id: args.suite_id,
    status: "generating",
    progress_message: hasSnapshots
      ? `Generating tests with live DOM context (${snapshots.length} page(s))...`
      : "Generating tests...",
  });

  const baseActionArgs = {
    project_id: args.project_id,
    workspace_id: project.workspace_id,
    prd_text: prdContent,
    snapshots: snapshots.map((s) => ({ url: s.url, data: s.data })),
    login_snapshot: loginSnapshot,
  };

  const generateResult: { testBlocks: string[] } = await step.runAction(
    internal.ai.prdWorkflowActions.generateTestsAction,
    baseActionArgs,
  );

  if (generateResult.testBlocks.length === 0) {
    await step.runMutation(internal.suites.mutations.updateSuiteStatus, {
      suite_id: args.suite_id,
      status: "failed",
      generation_error: "AI did not generate any valid Playwright tests.",
    });
    return { success: false, error: "No tests generated" };
  }

  const { testBlocks, validated } = await runVerifyLoop(step, {
    suite_id: args.suite_id,
    app_url: project.app_url,
    project_id: args.project_id,
    workspace_id: project.workspace_id,
    testBlocks: generateResult.testBlocks,
    hasSnapshots,
    retryActionRef: internal.ai.prdWorkflowActions.generateTestsAction,
    baseActionArgs,
  });

  const testIds: string[] = [];
  for (let i = 0; i < testBlocks.length; i++) {
    const testName = deriveTestName(testBlocks[i], i);
    const testId: string = await step.runMutation(
      internal.tests.mutations.createTestFromGeneration,
      {
        suite_id: args.suite_id,
        name: testName,
        playwright_code: testBlocks[i],
        source_type: "prd" as const,
        validated: hasSnapshots ? validated : undefined,
      },
    );
    testIds.push(testId);
  }

  await step.runMutation(internal.suites.mutations.updateSuiteStatus, {
    suite_id: args.suite_id,
    status: "ready",
  });

  return { success: true, suiteId: args.suite_id, testIds };
});

export const cancelPrdGeneration = mutation({
  args: {
    suite_id: v.id("suites"),
    workflow_id: vWorkflowId,
  },
  handler: async (ctx, args) => cancelSuiteGeneration(ctx, args.suite_id, args.workflow_id),
});

import { v } from "convex/values";
import { components, internal } from "../_generated/api";
import { defineWorkflow, vWorkflowId } from "@convex-dev/workflow";
import { mutation } from "../_generated/server";
import { deriveTestName } from "./agents";
import type { SnapshotData } from "./snapshotFormatter";
import { runVerifyLoop, cancelSuiteGeneration } from "./workflowShared";

export const nlTestGenerationWorkflow = defineWorkflow(components.workflow, {
  args: {
    project_id: v.id("projects"),
    prompt: v.string(),
    suite_id: v.id("suites"),
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

  await step.runMutation(internal.suites.mutations.updateSuiteStatus, {
    suite_id: args.suite_id,
    status: "generating",
    progress_message: "Fetching live page snapshot...",
  });

  let snapshot: SnapshotData | null = null;
  try {
    snapshot = await step.runAction(internal.ai.snapshotAction.getLiveSnapshot, {
      url: project.app_url,
      project_id: args.project_id,
      workspace_id: project.workspace_id,
    });
  } catch {
    snapshot = null;
  }

  let loginSnapshot: SnapshotData | null = null;
  if (project.explore_auth_mode === "form" && project.explore_login_url && snapshot) {
    try {
      loginSnapshot = await step.runAction(
        internal.ai.snapshotAction.getLiveSnapshot,
        {
          url: project.explore_login_url,
          project_id: args.project_id,
          workspace_id: project.workspace_id,
        },
      );
    } catch {
      // Login snapshot is optional
    }
  }

  const baseActionArgs = {
    project_id: args.project_id,
    prompt: args.prompt,
    snapshot,
    login_snapshot: loginSnapshot,
    workspace_id: project.workspace_id,
  };

  const hasSnapshots = snapshot !== null;

  await step.runMutation(internal.suites.mutations.updateSuiteStatus, {
    suite_id: args.suite_id,
    status: "generating",
    progress_message: hasSnapshots ? "Generating tests with live DOM context..." : "Generating tests...",
  });

  const generateResult: { testBlocks: string[] } = await step.runAction(
    internal.ai.nlWorkflowActions.generateTestsAction,
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
    retryActionRef: internal.ai.nlWorkflowActions.generateTestsAction,
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
        source_type: "natural_language" as const,
        description: args.prompt,
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

export const cancelGeneration = mutation({
  args: {
    suite_id: v.id("suites"),
    workflow_id: vWorkflowId,
  },
  handler: async (ctx, args) => cancelSuiteGeneration(ctx, args.suite_id, args.workflow_id),
});

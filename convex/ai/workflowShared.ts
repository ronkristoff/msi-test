import { components, internal } from "../_generated/api";
import { cancel, type WorkflowId } from "@convex-dev/workflow";
import type { MutationCtx } from "../_generated/server";
import type { FunctionReference } from "convex/server";
import { getOwnedEntity } from "../lib/requireAuth";
import { formatSnapshotForPrompt, type SnapshotData } from "./snapshotFormatter";
import type { Id } from "../_generated/dataModel";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type StepRunFn = (ref: any, args: Record<string, unknown>) => Promise<any>;

export function buildSnapshotContext(
  snapshots: SnapshotData[],
  loginSnapshot?: SnapshotData | null,
): string {
  let context = "";
  if (snapshots.length === 1) {
    context = `\n\nLIVE PAGE CONTEXT — use elements and locators from this context:\n${formatSnapshotForPrompt(snapshots[0])}`;
  } else if (snapshots.length > 1) {
    context = "\n\nLIVE PAGE CONTEXT — multiple pages detected. Use elements and locators from these contexts:\n";
    for (const s of snapshots) {
      context += `\n${formatSnapshotForPrompt(s)}\n`;
    }
  }
  if (loginSnapshot) {
    context += `\n\nLOGIN PAGE CONTEXT — use these elements for login steps:\n${formatSnapshotForPrompt(loginSnapshot)}`;
  }
  return context;
}

export function buildRetryContext(
  validationError?: string,
  failureSnapshot?: string,
  previousCode?: string,
): string {
  if (!validationError) return "";
  let context = `\n\nPREVIOUS ATTEMPT FAILED:\nError: ${validationError}`;
  if (failureSnapshot) context += `\nPage state at failure:\n${failureSnapshot}`;
  if (previousCode) context += `\nPrevious code that failed:\n\`\`\`typescript\n${previousCode}\n\`\`\``;
  context += "\n\nFix the issues above. Use the LIVE PAGE CONTEXT to find correct locators.";
  return context;
}

interface WorkflowStep {
  runMutation: StepRunFn;
  runAction: StepRunFn;
}

type ValidateResult = { passed: boolean; error_message?: string; snapshot_at_failure?: string } | null;

export async function runVerifyLoop(
  step: WorkflowStep,
  opts: {
    suite_id: Id<"suites">;
    app_url: string;
    project_id: Id<"projects">;
    workspace_id: Id<"workspaces">;
    testBlocks: string[];
    hasSnapshots: boolean;
    retryActionRef: FunctionReference<"action", "internal">;
    baseActionArgs: Record<string, unknown>;
  },
): Promise<{ testBlocks: string[]; validated: boolean }> {
  if (!opts.hasSnapshots) {
    return { testBlocks: opts.testBlocks, validated: false };
  }

  await step.runMutation(internal.suites.mutations.updateSuiteStatus, {
    suite_id: opts.suite_id,
    status: "generating",
    progress_message: "Validating generated tests...",
  });

  const firstBlock = opts.testBlocks[0];
  const validateResult = await step.runAction(
    internal.ai.snapshotAction.validateTest,
    {
      url: opts.app_url,
      project_id: opts.project_id,
      workspace_id: opts.workspace_id,
      playwright_code: firstBlock,
    },
  ) as ValidateResult;

  let testBlocks = opts.testBlocks;
  let validated = false;

  if (validateResult && !validateResult.passed) {
    await step.runMutation(internal.suites.mutations.updateSuiteStatus, {
      suite_id: opts.suite_id,
      status: "generating",
      progress_message: "Retrying test generation with error context...",
    });

    const retryResult = await step.runAction(
      opts.retryActionRef,
      {
        ...opts.baseActionArgs,
        validation_error: validateResult.error_message ?? undefined,
        failure_snapshot: validateResult.snapshot_at_failure ?? undefined,
        previous_code: firstBlock,
      },
    ) as { testBlocks: string[] };

    if (retryResult.testBlocks.length > 0) {
      testBlocks = retryResult.testBlocks;
    }
  }

  if (validateResult?.passed) {
    validated = true;
  }

  return { testBlocks, validated };
}

export async function cancelSuiteGeneration(
  ctx: MutationCtx,
  suiteId: Id<"suites">,
  workflowId: WorkflowId,
) {
  await getOwnedEntity(ctx, suiteId, "suites");
  await cancel(ctx, components.workflow, workflowId);
  await ctx.db.patch(suiteId, {
    status: "failed",
    generation_error: "Generation cancelled by user",
    locked_by: undefined,
    locked_at: undefined,
    locked_reason: undefined,
    progress_message: undefined,
  });
}

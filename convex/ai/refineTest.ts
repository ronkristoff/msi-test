"use node";

import { action } from "../_generated/server";
import type { ActionCtx } from "../_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { createRefineAgent, extractPlaywrightCode, hybridTestStepSchema } from "./agents";
import { classifyAiError } from "./errors";
import { buildAuthPromptContext } from "./authContext";
import { computeDiff } from "./diff";
import { resolveTestContext, resolvePageContext } from "./resolveContext";
import { extractJsonFromAiResponse } from "./parse";
import { z } from "zod/v3";

const CHANGES_RE = /---CHANGES---\n([\s\S]*?)---END CHANGES---/;

type Step = z.infer<typeof hybridTestStepSchema>;
type StepArray = Step[];

type RefineResult = {
  modified_code: string | null;
  modified_steps: StepArray | null;
  diff_summary: string;
  diff: string;
  thread_id: string;
};

function extractDiffSummary(responseText: string, fallback: string): string {
  const match = responseText.match(CHANGES_RE);
  return match ? match[1].trim() : fallback;
}

async function getOrCreateThread(ctx: ActionCtx, agent: ReturnType<typeof createRefineAgent>, existingThreadId: string | undefined, testName: string) {
  if (existingThreadId) {
    const { thread } = await agent.continueThread(ctx, { threadId: existingThreadId });
    return { threadId: existingThreadId, thread };
  }
  const { threadId, thread } = await agent.createThread(ctx, {
    title: `Refine — ${testName}`,
  });
  return { threadId, thread };
}

export const refineTest = action({
  args: {
    test_id: v.id("tests"),
    message: v.string(),
    thread_id: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<RefineResult> => {
    const { test, suite, project, aiConfig } = await resolveTestContext(ctx, args.test_id);

    const isStepsTest = test.steps && test.steps.length > 0 && test.execution_type === "stagehand";

    const agent = createRefineAgent(
      (await import("./model")).getWorkspaceModel(aiConfig),
    );

    const { threadId, thread } = await getOrCreateThread(ctx, agent, args.thread_id, test.name);

    let prdContext = "";
    if (project.prd_text) {
      prdContext = `\n\nProduct Requirements:\n${project.prd_text}`;
    }

    const pagesContext = await resolvePageContext(ctx, suite.project_id, test.playwright_code ?? undefined);

    const sharedPrompt = `Project: ${project.name}
URL: ${project.app_url}
Suite: ${suite.name}
${buildAuthPromptContext(project)}${prdContext}
${pagesContext ? `\nPage context (use actual locators and text values from here — never fabricate selectors):\n${pagesContext}` : ""}

Test name: ${test.name}

User's request:
${args.message}`;

    let responseText: string;
    try {
      const result = await thread.generateText({
        prompt: isStepsTest
          ? stepsPrompt(sharedPrompt, test.steps!)
          : codePrompt(sharedPrompt, test.playwright_code ?? ""),
      });
      responseText = result.text;
    } catch (err: unknown) {
      classifyAiError(err);
    }

    if (isStepsTest) {
      return parseStepsResponse(test, responseText, threadId);
    }
    return parseCodeResponse(test, responseText, threadId);
  },
});

function stepsPrompt(shared: string, steps: StepArray): string {
  return `Modify this test based on the user's request.

${shared}

Current test steps (JSON):
${JSON.stringify(steps, null, 2)}

Return ONLY a valid JSON array of step objects with this schema:
[{
  "instruction": "string — a clear natural language instruction",
  "assertion_code": "string | undefined — Playwright assertion for complex checks",
  "expected_outcome": "string | undefined — human-readable expected result"
}]
No markdown, no code fences, no explanation — just the JSON array.`;
}

function codePrompt(shared: string, code: string): string {
  return `Modify this test based on the user's request.

${shared}

Current test code:
\`\`\`typescript
${code}
\`\`\`

Return the full modified test code wrapped in a single markdown code fence with language "typescript", followed by a change summary.`;
}

function parseStepsResponse(
  test: { steps?: StepArray },
  responseText: string,
  threadId: string,
): RefineResult {
  const steps = extractJsonFromAiResponse(responseText, z.array(hybridTestStepSchema));
  if (!steps) {
    throw new ConvexError(
      `AI did not return valid steps JSON. First 500 chars: ${responseText.slice(0, 500)}`,
    );
  }

  return {
    modified_code: null,
    modified_steps: steps,
    diff_summary: extractDiffSummary(responseText, `Updated ${steps.length} steps based on your request.`),
    diff: computeDiff(JSON.stringify(test.steps, null, 2), JSON.stringify(steps, null, 2)),
    thread_id: threadId,
  };
}

function parseCodeResponse(
  test: { playwright_code?: string },
  responseText: string,
  threadId: string,
): RefineResult {
  const code = extractPlaywrightCode(responseText);

  if (!code) {
    throw new ConvexError(
      `AI did not generate valid Playwright code. First 500 chars: ${responseText.slice(0, 500)}`,
    );
  }

  return {
    modified_code: code,
    modified_steps: null,
    diff_summary: extractDiffSummary(responseText, "Test code updated based on your request."),
    diff: computeDiff(test.playwright_code ?? "", code),
    thread_id: threadId,
  };
}

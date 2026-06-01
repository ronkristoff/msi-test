"use node";

import { action } from "../_generated/server";
import type { ActionCtx } from "../_generated/server";
import { v } from "convex/values";
import { api, internal } from "../_generated/api";
import { createTestGenerationAgent, extractMultipleTests, deriveTestName } from "./agents";
import { createAiError, classifyAiError } from "./errors";
import { markSuiteFailed, markSuiteReady } from "./suiteStatus";
import { buildAuthPromptContext } from "./authContext";
import { ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { getLiveSnapshot, interactAndCapture, extractClickableRefs } from "./browserClient";

export const generateNlTests = action({
  args: {
    project_id: v.id("projects"),
    prompt: v.string(),
    suite_id: v.id("suites"),
  },
  handler: async (ctx, args) => {
    try {
      return await generateNlTestsInner(ctx, args);
    } finally {
      const suite = await ctx.runQuery(api.suites.queries.getSuite, {
        suite_id: args.suite_id,
      });
      if (suite?.status === "generating") {
        await markSuiteFailed(ctx, args.suite_id, "Generation interrupted unexpectedly");
      }
    }
  },
});

async function generateNlTestsInner(ctx: ActionCtx, args: { project_id: Id<"projects">; prompt: string; suite_id: Id<"suites"> }) {
    if (!args.prompt.trim()) {
      await markSuiteFailed(ctx, args.suite_id, "Prompt cannot be empty");
      throw new ConvexError("Prompt cannot be empty");
    }

    const project = await ctx.runQuery(internal.projects.queries.getProjectForAi, {
      project_id: args.project_id,
    });

    if (!project) {
      await markSuiteFailed(ctx, args.suite_id, "Project not found");
      throw new ConvexError("Project not found");
    }

    console.log(`[generateNlTests] project auth: mode=${(project as Record<string, unknown>).explore_auth_mode}, username=${(project as Record<string, unknown>).explore_username ?? "(none)"}`);

    const aiConfig = await ctx.runQuery(internal.ai.model.getWorkspaceAiConfigQuery, {
      workspace_id: project.workspace_id,
    });

    let prdContext = "";
    if (project.prd_text) {
      prdContext = `\n\nProduct Requirements:\n${project.prd_text}`;
    } else if (project.prd_file_id) {
      const blob = await ctx.storage.get(project.prd_file_id);
      if (blob) {
        prdContext = `\n\nProduct Requirements:\n${await blob.text()}`;
      }
    }

    const liveSnapshot = await getLiveSnapshot({
      projectId: args.project_id,
      url: project.app_url,
      authConfig: {
        auth_mode: (project as Record<string, unknown>).explore_auth_mode as string ?? "none",
        login_url: (project as Record<string, unknown>).explore_login_url as string | undefined,
        username: (project as Record<string, unknown>).explore_username as string | undefined,
        password: (project as Record<string, unknown>).explore_password as string | undefined,
        cookie_name: (project as Record<string, unknown>).explore_cookie_name as string | undefined,
        cookie_value: (project as Record<string, unknown>).explore_cookie_value as string | undefined,
        app_url: project.app_url,
      },
    });

    let discoveredSnapshots: string[] = [];
    if (liveSnapshot) {
      const clickTargets = extractClickableRefs(liveSnapshot.snapshot);
      if (clickTargets.length > 0) {
        const topTargets = clickTargets.slice(0, 5);
        const stepResults = await interactAndCapture({
          projectId: args.project_id,
          url: project.app_url,
          authConfig: {
            auth_mode: (project as Record<string, unknown>).explore_auth_mode as string ?? "none",
            login_url: (project as Record<string, unknown>).explore_login_url as string | undefined,
            username: (project as Record<string, unknown>).explore_username as string | undefined,
            password: (project as Record<string, unknown>).explore_password as string | undefined,
            cookie_name: (project as Record<string, unknown>).explore_cookie_name as string | undefined,
            cookie_value: (project as Record<string, unknown>).explore_cookie_value as string | undefined,
            app_url: project.app_url,
          },
          actions: topTargets.map((step) => ({ action: "click", role: step.role, name: step.name })),
        });
        if (stepResults && stepResults.length > 1) {
          discoveredSnapshots = stepResults
            .slice(1)
            .map((s, i) => `--- After clicking "${topTargets[i]?.name ?? ""}" ---\nURL: ${s.url}\nTitle: ${s.title}\n${s.snapshot}`);
        }
      }
    }

    let responseText: string;
    try {
      const agent = createTestGenerationAgent(
        (await import("./model")).getWorkspaceModel(aiConfig),
      );
      const { thread } = await agent.createThread(ctx, {
        title: `NL Generation — ${project.name}`,
      });
      const result = await thread.generateText({
        prompt: `Generate Playwright tests from the following test description.

Project: ${project.name}
URL: ${project.app_url}
${buildAuthPromptContext(project)}${prdContext}
${liveSnapshot ? `\nCurrent page state (use these real elements and values in your tests):\nURL: ${liveSnapshot.url}\nTitle: ${liveSnapshot.title}\n${liveSnapshot.snapshot}\n` : ""}
${discoveredSnapshots.length > 0 ? `\nDiscovered page states (elements found after clicking buttons/links):\n${discoveredSnapshots.join("\n\n")}\n` : ""}
Test Description:
${args.prompt}

Generate complete, runnable Playwright tests. Each test must be in its own markdown code fence with the "typescript" language tag. Each code fence must contain exactly ONE top-level test() call — do NOT use test.describe(), test.beforeEach(), or test.afterEach(). Each test should navigate to ${project.app_url} using page.goto() at the start.

Locator strategy (priority order):
1. Semantic locators first: getByRole, getByLabel, getByPlaceholder, getByText
2. getByTestId for data-test/data-testid attributes
3. NEVER use raw CSS selectors or XPath

Assertion rules:
- Use web-first assertions: await expect(locator).toBeVisible(), toHaveText(), toContainText(), toHaveURL()
- Never use waitForTimeout() or arbitrary sleeps

CRITICAL — Only use locators for elements that appear in the snapshots above. Do NOT invent or guess selectors for elements not shown in any snapshot.

Form submission resilience:
- When a test submits a form (clicks Create/Save/Submit), wrap the submission in a retry loop to handle intermittent backend timeouts.
- Pattern: click submit, check if dialog closes (success) or stays open (failure). If still open, retry up to 3 times.
- Example:
  for (let attempt = 0; attempt < 3; attempt++) {
    await submitBtn.click();
    const closed = await expect(dialog).toBeHidden({ timeout: 10000 }).then(() => true).catch(() => false);
    if (closed) break;
  }
  await expect(dialog).toBeHidden({ timeout: 5000 });`,
      });
      responseText = result.text;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "AI generation failed";
      await markSuiteFailed(ctx, args.suite_id, msg);
      classifyAiError(err);
      return;
    }

    const testBlocks = extractMultipleTests(responseText);

    if (testBlocks.length === 0) {
      await markSuiteFailed(ctx, args.suite_id, "AI did not generate any valid Playwright tests.");
      throw createAiError("malformed_response", "AI did not generate any valid Playwright tests.");
    }

    const testIds: string[] = [];
    for (let i = 0; i < testBlocks.length; i++) {
      const testName = deriveTestName(testBlocks[i], i);
      const testId: string = await ctx.runMutation(internal.tests.mutations.createTestFromGeneration, {
        suite_id: args.suite_id as Id<"suites">,
        name: testName,
        playwright_code: testBlocks[i],
        source_type: "natural_language",
        description: args.prompt,
      });
      testIds.push(testId);
    }

    await markSuiteReady(ctx, args.suite_id);

    return { suiteId: args.suite_id, testIds, testNameCount: testIds.length };
}

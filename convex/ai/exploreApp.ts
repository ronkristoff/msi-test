"use node";

import { action, internalAction } from "../_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { internal, api } from "../_generated/api";
import { createExplorationAnalysisAgent, createTestGenerationAgent, extractMultipleTests, deriveTestName, explorationScenarioSchema } from "./agents";
import { classifyAiError } from "./errors";
import type { Id } from "../_generated/dataModel";

export const analyzeExploration = internalAction({
  args: { exploration_id: v.id("explorations") },
  handler: async (ctx, args) => {
    const exploration = await ctx.runQuery(internal.explorations.internal.getExplorationForAnalysis, {
      exploration_id: args.exploration_id,
    });

    if (!exploration) {
      throw new ConvexError("Exploration not found");
    }

    if (exploration.captured_pages.length === 0) {
      await ctx.runMutation(internal.explorations.internal.updateExplorationStatus, {
        exploration_id: args.exploration_id,
        status: "failed",
        error_message: "No pages were captured during exploration.",
      });
      return;
    }

    await ctx.runMutation(internal.explorations.internal.updateExplorationStatus, {
      exploration_id: args.exploration_id,
      status: "analyzing",
      progress_message: "AI is analyzing captured pages...",
    });

    const aiConfig = await ctx.runQuery(internal.ai.model.getWorkspaceAiConfigQuery, {
      workspace_id: exploration.workspace_id,
    });

    let scenarios: { name: string; description: string; flow_summary: string; area: string }[];
    try {
      const agent = createExplorationAnalysisAgent(
        (await import("./model")).getWorkspaceModel(aiConfig),
      );
      const { thread } = await agent.createThread(ctx, {
        title: `Exploration Analysis — ${exploration.url}`,
      });

      const pagesDescription = exploration.captured_pages
        .map((page, i) => {
          const linksSummary = page.structure_text.slice(0, 2000);
          return `--- Page ${i + 1}: ${page.title} (${page.url}) ---\n${linksSummary}`;
        })
        .join("\n\n");

      const result = await thread.generateText({
        prompt: `Analyze the following web application pages captured from ${exploration.url}.

Identify the most testable user scenarios. For each scenario provide a name, description, step-by-step flow summary, and an area label.

Captured pages:
${pagesDescription}

${exploration.goal ? `User's testing goal: ${exploration.goal}\n\nPrioritize scenarios that align with this goal, but also include important general scenarios.\n` : ""}Propose 3-8 testable scenarios focused on critical user flows, form interactions, navigation, and error states.

IMPORTANT: Respond with ONLY a valid JSON array. No markdown, no code fences, no explanation — just the raw JSON array. Each element must have exactly these fields:
- "name": string — concise scenario name
- "description": string — what the scenario tests
- "flowSummary": string — step-by-step flow summary
- "area": string — app area category (e.g. "Authentication", "Dashboard", "Project Management", "Settings", "Navigation")`,
      });

      const text = result.text.trim();
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        throw new Error("AI response did not contain a JSON array");
      }
      const parsed = JSON.parse(jsonMatch[0]);
      const validated = explorationScenarioSchema.array().parse(parsed);
      scenarios = validated.map((s) => ({
        name: s.name,
        description: s.description,
        flow_summary: s.flowSummary,
        area: s.area,
      }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      await ctx.runMutation(internal.explorations.internal.updateExplorationStatus, {
        exploration_id: args.exploration_id,
        status: "failed",
        error_message: msg,
      });
      return;
    }

    await ctx.runMutation(internal.explorations.internal.storeProposedScenarios, {
      exploration_id: args.exploration_id,
      scenarios,
    });
  },
});

export const generateExplorationTests = action({
  args: {
    exploration_id: v.id("explorations"),
    selected_scenarios: v.array(
      v.object({
        name: v.string(),
        description: v.string(),
        flow_summary: v.string(),
        area: v.string(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const exploration = await ctx.runQuery(api.explorations.queries.getExploration, {
      exploration_id: args.exploration_id,
    });

    if (!exploration) {
      throw new ConvexError("Exploration not found");
    }

    if (args.selected_scenarios.length === 0) {
      throw new ConvexError("No scenarios selected");
    }

    const aiConfig = await ctx.runQuery(internal.ai.model.getWorkspaceAiConfigQuery, {
      workspace_id: exploration.workspace_id,
    });

    const pagesContext = (exploration.captured_pages ?? [])
      .map((page, i) => `Page ${i + 1}: ${page.title} (${page.url})\n${page.structure_text.slice(0, 3000)}`)
      .join("\n\n");

    const allTestBlocks: { name: string; code: string; area: string }[] = [];

    for (const scenario of args.selected_scenarios) {
      try {
        const agent = createTestGenerationAgent(
          (await import("./model")).getWorkspaceModel(aiConfig),
        );
        const { thread } = await agent.createThread(ctx, {
          title: `Test Generation — ${scenario.name}`,
        });

        const result = await thread.generateText({
          prompt: `Generate a single Playwright test for the following scenario.

Application URL: ${exploration.url}

Scenario: ${scenario.name}
Description: ${scenario.description}
Flow: ${scenario.flow_summary}

Page structure context:
${pagesContext}

Generate a single, self-contained Playwright test. Rules:
- Use a single test() call — do NOT use test.describe(), test.beforeEach(), or test.afterEach()
- Navigate to ${exploration.url} at the start using page.goto()
- Use semantic locators first (getByRole, getByLabel, getByPlaceholder, getByText), then getByTestId for data-test attributes shown in the page context
- NEVER use raw CSS selectors (page.locator('.class')) or guess selectors not shown in the context
- Use web-first assertions: await expect(locator).toBeVisible(), toHaveText(), toContainText(), toHaveURL()
- Never use waitForTimeout() or arbitrary sleeps
- Only interact with elements and assert on values explicitly shown in the page context — do NOT invent or guess selectors
- Wrap the test in a single markdown code fence with language "typescript"`,
        });

        const blocks = extractMultipleTests(result.text);
        for (let i = 0; i < blocks.length; i++) {
          allTestBlocks.push({
            name: deriveTestName(blocks[i], i),
            code: blocks[i],
            area: scenario.area,
          });
        }
      } catch (err: unknown) {
        classifyAiError(err);
      }
    }

    if (allTestBlocks.length === 0) {
      throw new ConvexError("AI did not generate any valid Playwright tests for the selected scenarios.");
    }

    const now = new Date();
    const month = now.toLocaleString("en-US", { month: "short" });
    const day = now.getDate();

    const areaGroups = new Map<string, { name: string; code: string; area: string }[]>();
    for (const block of allTestBlocks) {
      const existing = areaGroups.get(block.area) ?? [];
      existing.push(block);
      areaGroups.set(block.area, existing);
    }

    const suiteIds: string[] = [];
    const testIds: string[] = [];

    for (const [area, blocks] of areaGroups) {
      const suiteName = `Exploration — ${area} — ${month} ${day}`;
      const suiteId: string = await ctx.runMutation(api.suites.mutations.createSuite, {
        project_id: exploration.project_id,
        name: suiteName,
        description: `Generated from URL exploration of ${exploration.url} — ${area} flows`,
        source_type: "url_exploration",
      });
      suiteIds.push(suiteId);

      for (const block of blocks) {
        const testId: string = await ctx.runMutation(internal.tests.mutations.createTestFromGeneration, {
          suite_id: suiteId as Id<"suites">,
          name: block.name,
          playwright_code: block.code,
          source_type: "url_exploration",
        });
        testIds.push(testId);
      }
    }

    await ctx.runMutation(internal.explorations.internal.updateExplorationStatus, {
      exploration_id: args.exploration_id,
      status: "completed",
      progress_message: "Tests generated successfully.",
    });

    return { suiteIds, testIds, testNameCount: testIds.length };
  },
});

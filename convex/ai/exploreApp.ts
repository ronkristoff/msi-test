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

    let scenarios: { name: string; description: string; flow_summary: string }[];
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

      const result = await thread.generateObject({
        prompt: `Analyze the following web application pages captured from ${exploration.url}.

Identify the most testable user scenarios. For each scenario provide a name, description, and step-by-step flow summary.

Captured pages:
${pagesDescription}

Propose 3-8 testable scenarios focused on critical user flows, form interactions, navigation, and error states.`,
        schema: explorationScenarioSchema.array(),
      });

      scenarios = result.object.map((s) => ({
        name: s.name,
        description: s.description,
        flow_summary: s.flowSummary,
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
      .map((page, i) => `Page ${i + 1}: ${page.title} (${page.url})\n${page.structure_text.slice(0, 1000)}`)
      .join("\n\n");

    const allTestBlocks: { name: string; code: string }[] = [];

    for (const scenario of args.selected_scenarios) {
      try {
        const agent = createTestGenerationAgent(
          (await import("./model")).getWorkspaceModel(aiConfig),
        );
        const { thread } = await agent.createThread(ctx, {
          title: `Test Generation — ${scenario.name}`,
        });

        const result = await thread.generateText({
          prompt: `Generate Playwright tests for the following scenario.

Application URL: ${exploration.url}

Scenario: ${scenario.name}
Description: ${scenario.description}
Flow: ${scenario.flow_summary}

Page structure context:
${pagesContext}

Generate complete, runnable Playwright tests. Each test should be in its own markdown code fence with the "typescript" language tag.`,
        });

        const blocks = extractMultipleTests(result.text);
        for (let i = 0; i < blocks.length; i++) {
          allTestBlocks.push({
            name: deriveTestName(blocks[i], i),
            code: blocks[i],
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
    const suiteName = `Exploration — ${month} ${day}`;

    const suiteId: string = await ctx.runMutation(api.suites.mutations.createSuite, {
      project_id: exploration.project_id,
      name: suiteName,
      description: `Generated from URL exploration of ${exploration.url}`,
      source_type: "url_exploration",
    });

    const testIds: string[] = [];
    for (const block of allTestBlocks) {
      const testId: string = await ctx.runMutation(internal.tests.mutations.createTestFromGeneration, {
        suite_id: suiteId as Id<"suites">,
        name: block.name,
        playwright_code: block.code,
        source_type: "url_exploration",
      });
      testIds.push(testId);
    }

    await ctx.runMutation(internal.explorations.internal.updateExplorationStatus, {
      exploration_id: args.exploration_id,
      status: "completed",
      progress_message: "Tests generated successfully.",
    });

    return { suiteId, testIds, testNameCount: testIds.length };
  },
});

"use node";

import { action } from "../_generated/server";
import { api, internal } from "../_generated/api";
import { createFailureAnalysisAgent } from "../ai/agents";
import { getWorkspaceModel } from "../ai/model";
import type { AiConfig } from "../ai/model";
import { extractJsonFromAiResponse } from "../ai/parse";
import type { Id } from "../_generated/dataModel";
import { z } from "zod/v3";

type MapTest = {
  testId: string;
  testName: string;
  flakinessPct: number;
  results: Array<{ runId: string; status: string; createdAt: number }>;
};

type MapCluster = {
  clusterName: string;
  description: string;
  suggestedFix: string;
  confidenceScore: number;
  relatedTests: string[];
};

const clusterSchema = z.object({
  clusterName: z.string(),
  description: z.string(),
  suggestedFix: z.string(),
  confidenceScore: z.number().min(0).max(1),
  relatedTests: z.array(z.string()),
});

export const analyzeFlakinessClusters = action({
  args: {},
  handler: async (ctx) => {
    const mapData = await ctx.runQuery(api.flakiness.queries.getFlakinessMap);
    if (!mapData.workspaceId) return [];

    const flakyTests: MapTest[] = mapData.tests.filter(
      (t: MapTest) => t.flakinessPct > 0,
    );
    if (flakyTests.length === 0) return [];

    const config: AiConfig = await ctx.runQuery(
      internal.ai.model.getWorkspaceAiConfigQuery,
      { workspace_id: mapData.workspaceId as Id<"workspaces"> },
    );
    const model = getWorkspaceModel(config);
    const agent = createFailureAnalysisAgent(model);

    const testsSummary: string = flakyTests
      .map(
        (t: MapTest) =>
          `- "${t.testName}" (${t.flakinessPct}% flaky, recent: ${t.results.map((r: { status: string }) => r.status).join(", ")})`,
      )
      .join("\n");

    const prompt: string = `Analyze these flaky tests and identify root-cause clusters — groups of tests that likely fail for the same underlying reason.

Flaky tests:
${testsSummary}

For each cluster, respond with a JSON array of objects with:
- clusterName: short name for the cluster
- description: what shared root cause connects these tests
- suggestedFix: actionable fix
- confidenceScore: 0-1
- relatedTests: array of test names in this cluster

Respond with ONLY a JSON array, no markdown fences.`;

    try {
      const { thread } = await agent.createThread(ctx, {});
      const message = await thread.generateText({ prompt });
      const text: string = message.text ?? "";

      const clusters: MapCluster[] | null = extractJsonFromAiResponse(
        text,
        z.array(clusterSchema),
      );
      if (!clusters) return [];

      const lastRunId = (mapData.runs[mapData.runs.length - 1]?.runId ?? "") as Id<"runs">;

      for (const cluster of clusters) {
        const testIds = flakyTests
          .filter((t: MapTest) => cluster.relatedTests.includes(t.testName))
          .map((t: MapTest) => t.testId as Id<"tests">);

        if (testIds.length === 0) continue;

        const analysisText = `[${cluster.clusterName}] ${cluster.description}`;

        for (const test_id of testIds) {
          await ctx.runMutation(internal.runs.internal.storeAiInsight, {
            workspace_id: mapData.workspaceId as Id<"workspaces">,
            test_id,
            run_id: lastRunId,
            analysis_text: analysisText,
            suggested_fix: cluster.suggestedFix,
            confidence_score: cluster.confidenceScore,
            type: "flakiness_cluster",
          });
        }
      }

      return clusters;
    } catch (err) {
      console.error("[analyzeFlakinessClusters] Error:", err);
      return [];
    }
  },
});

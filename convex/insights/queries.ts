import { query } from "../_generated/server";
import { v } from "convex/values";
import { getOptionalOwnedWorkspace } from "../lib/requireAuth";

type InsightType = "root_cause" | "flakiness_cluster";
type RunStatus = "running" | "passed" | "failed" | "cancelled" | "timed_out";

type EnrichedInsight = {
  _id: string;
  _creationTime: number;
  test_id: string;
  run_id: string;
  type: InsightType;
  analysis_text: string;
  suggested_fix: string | null;
  confidence_score: number;
  test_name: string;
  run_status: RunStatus | "unknown";
  frequency: number;
};

export const getAIInsights = query({
  args: {
    type: v.optional(v.union(v.literal("root_cause"), v.literal("flakiness_cluster"))),
  },
  handler: async (ctx, args): Promise<EnrichedInsight[]> => {
    const result = await getOptionalOwnedWorkspace(ctx);
    if (!result) return [];

    const { workspace } = result;

    const allInsights = await ctx.db
      .query("ai_insights")
      .withIndex("by_workspace_id", (q) => q.eq("workspace_id", workspace._id))
      .order("desc")
      .collect();

    const testFrequency = new Map<string, number>();
    for (const insight of allInsights) {
      testFrequency.set(
        insight.test_id,
        (testFrequency.get(insight.test_id) ?? 0) + 1,
      );
    }

    const insights = args.type
      ? allInsights.filter((i) => i.type === args.type)
      : allInsights;

    const enriched = await Promise.all(
      insights.map(async (insight) => {
        const [test, run] = await Promise.all([
          ctx.db.get(insight.test_id),
          ctx.db.get(insight.run_id),
        ]);

        return {
          _id: insight._id,
          _creationTime: insight._creationTime,
          test_id: insight.test_id,
          run_id: insight.run_id,
          type: insight.type,
          analysis_text: insight.analysis_text,
          suggested_fix: insight.suggested_fix ?? null,
          confidence_score: insight.confidence_score,
          test_name: test?.name ?? "Unknown test",
          run_status: (run?.status ?? "unknown") as RunStatus | "unknown",
          frequency: testFrequency.get(insight.test_id)!,
        };
      }),
    );

    enriched.sort((a, b) => {
      const sevA = a.confidence_score * a.frequency;
      const sevB = b.confidence_score * b.frequency;
      if (sevB !== sevA) return sevB - sevA;
      return b._creationTime - a._creationTime;
    });

    return enriched;
  },
});

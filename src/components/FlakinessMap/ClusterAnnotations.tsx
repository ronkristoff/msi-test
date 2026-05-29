"use client";

import { Card } from "@/components/ui/Card";

type ClusterAnnotation = {
  _id: string;
  testId: string;
  runId: string;
  analysisText: string;
  suggestedFix: string | null;
  confidenceScore: number;
};

type ClusterAnnotationsProps = {
  clusters: ClusterAnnotation[];
};

export function ClusterAnnotations({ clusters }: ClusterAnnotationsProps) {
  if (clusters.length === 0) return null;

  const uniqueClusters = clusters.reduce(
    (acc, c) => {
      if (!acc.has(c.analysisText)) {
        acc.set(c.analysisText, c);
      }
      return acc;
    },
    new Map<string, ClusterAnnotation>(),
  );

  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold text-[var(--muted)] font-[var(--font-mono)] uppercase tracking-wider">
        AI Cluster Analysis
      </h3>
      {[...uniqueClusters.values()].map((cluster) => (
        <Card key={cluster._id} className="p-3">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-[var(--radius-sm)] bg-[rgba(139,92,246,0.12)] grid place-items-center shrink-0 mt-0.5">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="rgb(139,92,246)"
                strokeWidth="1.8"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M12 16v-4" />
                <path d="M12 8h.01" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-[var(--fg)] leading-relaxed mb-1">
                {cluster.analysisText}
              </p>
              {cluster.suggestedFix && (
                <p className="text-xs text-[var(--muted)] leading-relaxed">
                  <span className="font-semibold">Suggested fix:</span>{" "}
                  {cluster.suggestedFix}
                </p>
              )}
              <div className="mt-2 flex items-center gap-2">
                <span className="text-[10px] font-[var(--font-mono)] text-[var(--muted)]">
                  Confidence: {Math.round(cluster.confidenceScore * 100)}%
                </span>
                <span className="text-[10px] font-[var(--font-mono)] text-[var(--muted)]">
                  Tests affected:{" "}
                  {clusters.filter((c) => c.analysisText === cluster.analysisText).length}
                </span>
              </div>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

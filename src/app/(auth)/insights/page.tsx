"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import Link from "next/link";
import { api } from "@/lib/convex";
import { EmptyState } from "@/components/ui/EmptyState";
import { Card } from "@/components/ui/Card";
import { StatusPill } from "@/components/ui/StatusPill";
import { runStatusToVariant } from "@/lib/run-status";

type InsightType = "all" | "root_cause" | "flakiness_cluster";

const TABS: { value: InsightType; label: string }[] = [
  { value: "all", label: "All" },
  { value: "root_cause", label: "Root Cause" },
  { value: "flakiness_cluster", label: "Flakiness Cluster" },
];

const TYPE_LABEL: Record<string, string> = {
  root_cause: "Root Cause",
  flakiness_cluster: "Flakiness",
};

function confidenceVariant(score: number): "danger" | "warn" | "neutral" {
  if (score >= 0.8) return "danger";
  if (score >= 0.5) return "warn";
  return "neutral";
}

export default function InsightsPage() {
  const [activeTab, setActiveTab] = useState<InsightType>("all");

  const insights = useQuery(api.insights.queries.getAIInsights, {
    type: activeTab === "all" ? undefined : activeTab,
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setActiveTab(tab.value)}
            className={`px-3 py-1.5 text-sm font-semibold rounded-[var(--radius-sm)] transition-colors duration-[var(--motion-fast)] ${
              activeTab === tab.value
                ? "bg-[var(--accent)] text-[var(--accent-on)]"
                : "text-[var(--muted)] hover:text-[var(--fg)] hover:bg-[var(--border-soft)]"
            }`}
          >
            {tab.label}
          </button>
        ))}
        {insights && (
          <span className="ml-auto font-[var(--font-mono)] text-xs text-[var(--muted)]">
            {insights.length} insight{insights.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {insights === undefined ? (
        <div className="text-[var(--muted)] text-sm">Loading...</div>
      ) : insights.length === 0 ? (
        <EmptyState
          icon={
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" />
            </svg>
          }
          title="No AI insights yet"
          description="AI root cause analysis and flakiness clusters will appear here after test runs complete with failures."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {insights.map((insight) => (
            <Link key={insight._id} href={`/runs/${insight.run_id}`}>
              <Card className="hover:border-[var(--accent)] transition-colors duration-[var(--motion-fast)] cursor-pointer">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <StatusPill variant={confidenceVariant(insight.confidence_score)}>
                        {Math.round(insight.confidence_score * 100)}%
                      </StatusPill>
                      <StatusPill variant="neutral">
                        {TYPE_LABEL[insight.type] ?? insight.type}
                      </StatusPill>
                      <span className="font-[var(--font-mono)] text-[11px] text-[var(--muted)]">
                        {insight.frequency} occurrence{insight.frequency !== 1 ? "s" : ""}
                      </span>
                    </div>
                    <h3 className="text-sm font-semibold text-[var(--fg)] mb-1">
                      {insight.test_name}
                    </h3>
                    <p className="text-sm text-[var(--muted)] leading-relaxed line-clamp-2">
                      {insight.analysis_text}
                    </p>
                    {insight.suggested_fix && (
                      <p className="mt-2 text-xs text-[var(--accent)] leading-relaxed">
                        Fix: {insight.suggested_fix}
                      </p>
                    )}
                  </div>
                  <div className="shrink-0 flex flex-col items-end gap-1">
                    <StatusPill variant={runStatusToVariant(insight.run_status)}>
                      {insight.run_status}
                    </StatusPill>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-[var(--muted)]">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

"use client";

import Link from "next/link";
import { SectionPanel } from "./SectionHeader";
import type { DashboardStats } from "@/lib/dashboard-types";

function ConfidenceBadge({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color =
    pct >= 80
      ? "bg-green-100 text-green-800"
      : pct >= 50
        ? "bg-yellow-100 text-yellow-800"
        : "bg-red-100 text-red-800";

  return (
    <span className={`font-[var(--font-mono)] text-[11px] px-1.5 py-0.5 rounded-md ${color}`}>
      {pct}% confidence
    </span>
  );
}

export function RecentFailures({ failures }: { failures: DashboardStats["recentFailures"] }) {
  return (
    <SectionPanel title="Recent Failures">
      {failures.length === 0 ? (
        <div className="text-sm text-[var(--muted)]">
          No recent test failures. Nice work!
        </div>
      ) : (
        <div className="space-y-3">
          {failures.map((f) => (
            <Link
              key={`${f.runId}-${f.testId}`}
              href={`/runs/${f.runId}`}
              className="block bg-[var(--surface)] border border-[var(--border-soft)] rounded-[var(--radius-md)] p-4 hover:border-[var(--accent)] transition-colors duration-150"
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="font-medium text-[var(--fg)] text-sm">{f.testName}</div>
                {f.confidenceScore !== null && <ConfidenceBadge score={f.confidenceScore} />}
              </div>
              <div className="font-[var(--font-mono)] text-[12px] text-red-600 mb-2">
                {f.errorSummary}
              </div>
              {f.rootCause && (
                <div className="text-[12px] text-[var(--muted)] mb-1">
                  <span className="font-medium text-[var(--fg)]">Root cause: </span>
                  {f.rootCause}
                </div>
              )}
              {f.suggestedFix && (
                <div className="text-[12px] text-[var(--muted)]">
                  <span className="font-medium text-[var(--fg)]">Suggested fix: </span>
                  {f.suggestedFix}
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </SectionPanel>
  );
}

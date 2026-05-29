"use client";

import type { HeatmapTestRow, HeatmapRun } from "./HeatmapGrid";
import { SparklineChart } from "./SparklineChart";
import { StatusPill } from "@/components/ui/StatusPill";
import { getFlakinessLevel } from "@/lib/flakiness-colors";
import { runStatusToVariant } from "@/lib/run-status";

type TestDetailPanelProps = {
  test: HeatmapTestRow;
  runs: HeatmapRun[];
  onClose: () => void;
};

export function TestDetailPanel({ test, runs, onClose }: TestDetailPanelProps) {
  const trendData = test.results.map((r) => (r.status === "passed" ? 1 : r.status === "failed" ? 0 : 0.5));
  const { className } = getFlakinessLevel(test.flakinessPct);

  return (
    <div className="fixed right-0 top-0 h-full w-[380px] bg-[var(--surface)] border-l border-[var(--border)] shadow-[var(--elev-overlay)] z-50 overflow-y-auto">
      <div className="p-6">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="font-[var(--font-display)] text-lg font-bold text-[var(--fg)] mb-1">
              {test.testName}
            </h2>
            <span
              className={`inline-block px-2 py-0.5 rounded-[var(--radius-sm)] text-[11px] font-semibold font-[var(--font-mono)] ${className}`}
            >
              {test.flakinessPct}% flaky
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-[var(--muted)] hover:text-[var(--fg)] transition-colors cursor-pointer"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="mb-6">
          <h3 className="text-xs font-semibold text-[var(--muted)] font-[var(--font-mono)] uppercase tracking-wider mb-3">
            Flakiness Trend
          </h3>
          <SparklineChart data={trendData} width={332} height={48} />
        </div>

        <div>
          <h3 className="text-xs font-semibold text-[var(--muted)] font-[var(--font-mono)] uppercase tracking-wider mb-3">
            Recent Runs
          </h3>
          <div className="space-y-1.5">
            {test.results.map((result, i) => (
              <div
                key={result.runId}
                className="flex items-center justify-between py-1.5 px-3 rounded-[var(--radius-sm)] bg-[var(--border-soft)]"
              >
                <span className="text-xs font-[var(--font-mono)] text-[var(--muted)]">
                  {runs[i]?.label ?? `Run ${i + 1}`}
                </span>
                <StatusPill variant={runStatusToVariant(result.status)} showDot>
                  {result.status}
                </StatusPill>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

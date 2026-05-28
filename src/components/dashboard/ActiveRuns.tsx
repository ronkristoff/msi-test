"use client";

import { useState, useEffect } from "react";
import { SectionPanel } from "./SectionHeader";
import type { ActiveRun } from "@/lib/dashboard-types";

function ProgressBar({ completed, total }: { completed: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((completed / total) * 100);
  return (
    <div className="w-full h-2 bg-[var(--border-soft)] rounded-full overflow-hidden">
      <div
        className="h-full bg-[var(--accent)] rounded-full transition-all duration-500 ease-out"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${minutes}m ${remaining}s`;
}

function RunCard({ run, now }: { run: ActiveRun; now: number }) {
  const elapsed = run.startedAt !== null ? now - run.startedAt : 0;

  return (
    <div className="bg-[var(--surface)] border border-[var(--border-soft)] rounded-[var(--radius-md)] p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
          </span>
          <span className="text-sm font-medium text-[var(--fg)]">
            {run.suiteName ?? "Single test run"}
          </span>
        </div>
        <span className="font-[var(--font-mono)] text-[11px] text-[var(--muted)]">
          {run.projectName}
        </span>
      </div>
      <ProgressBar completed={run.completedTests} total={run.totalTests} />
      <div className="flex items-center justify-between mt-2">
        <span className="font-[var(--font-mono)] text-[11px] text-[var(--muted)]">
          {run.completedTests}/{run.totalTests} tests
        </span>
        {elapsed > 0 && (
          <span className="font-[var(--font-mono)] text-[11px] text-[var(--muted)]">
            Running for {formatDuration(elapsed)}
          </span>
        )}
      </div>
    </div>
  );
}

export function ActiveRuns({ runs }: { runs: ActiveRun[] }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (runs.length === 0) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [runs.length]);

  return (
    <SectionPanel title="Active Runs" className="mb-6">
      {runs.length === 0 ? (
        <div className="text-sm text-[var(--muted)]">
          No tests currently running.
        </div>
      ) : (
        <div className="space-y-3">
          {runs.map((run) => (
            <RunCard key={run.runId} run={run} now={now} />
          ))}
        </div>
      )}
    </SectionPanel>
  );
}

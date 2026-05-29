"use client";

import Link from "next/link";
import { StatusPill } from "@/components/ui/StatusPill";
import { EmptyState } from "@/components/ui/EmptyState";
import { runStatusToVariant } from "@/lib/run-status";

export type RunItem = {
  _id: string;
  _creationTime: number;
  status: string;
  trigger_type: string;
  duration_ms?: number;
  pass_count?: number;
  fail_count?: number;
  skip_count?: number;
  suite_name: string | null;
  environment_name: string | null;
  project_name: string | null;
  branch?: string;
  started_at?: number;
};

export type StatusTab = "all" | "running" | "passed" | "failed" | "cancelled";

const STATUS_TABS: { key: StatusTab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "running", label: "Running" },
  { key: "passed", label: "Passed" },
  { key: "failed", label: "Failed" },
  { key: "cancelled", label: "Cancelled" },
];

const SELECT_CLASS =
  "font-[var(--font-mono)] text-sm bg-[var(--bg)] text-[var(--fg)] border border-[var(--border)] rounded-[var(--radius-sm)] px-3 py-[6px] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]";

function formatDuration(ms: number | undefined): string {
  if (ms == null || ms === 0) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;

  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function StatusTabs({
  active,
  onChange,
  counts,
}: {
  active: StatusTab;
  onChange: (tab: StatusTab) => void;
  counts: Record<string, number>;
}) {
  return (
    <div className="flex gap-1 border-b border-[var(--border)] mb-4">
      {STATUS_TABS.map((tab) => {
        const isActive = active === tab.key;
        const count = counts[tab.key] ?? 0;
        return (
          <button
            key={tab.key}
            onClick={() => onChange(tab.key)}
            className={`px-3 py-2 text-sm font-medium transition-colors duration-[var(--motion-fast)] border-b-2 -mb-[var(--border)] ${
              isActive
                ? "border-[var(--accent)] text-[var(--fg)]"
                : "border-transparent text-[var(--muted)] hover:text-[var(--fg)]"
            }`}
          >
            {tab.label}
            {count > 0 && (
              <span className="ml-1.5 font-[var(--font-mono)] text-[11px] text-[var(--muted)]">
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function FilterBar({
  branches,
  environments,
  selectedBranch,
  selectedEnvironment,
  onBranchChange,
  onEnvironmentChange,
}: {
  branches: string[];
  environments: { _id: string; name: string }[];
  selectedBranch: string;
  selectedEnvironment: string;
  onBranchChange: (val: string) => void;
  onEnvironmentChange: (val: string) => void;
}) {
  if (branches.length === 0 && environments.length === 0) return null;

  return (
    <div className="flex gap-3 mb-4">
      {branches.length > 0 && (
        <select
          value={selectedBranch}
          onChange={(e) => onBranchChange(e.target.value)}
          className={SELECT_CLASS}
        >
          <option value="">All branches</option>
          {branches.map((b) => (
            <option key={b} value={b}>{b}</option>
          ))}
        </select>
      )}
      {environments.length > 0 && (
        <select
          value={selectedEnvironment}
          onChange={(e) => onEnvironmentChange(e.target.value)}
          className={SELECT_CLASS}
        >
          <option value="">All environments</option>
          {environments.map((env) => (
            <option key={env._id} value={env._id}>{env.name}</option>
          ))}
        </select>
      )}
    </div>
  );
}

const GRID_COLS = "grid-cols-[1fr_90px_80px_100px_80px_80px_90px]";

function RunRowItem({ run }: { run: RunItem }) {
  return (
    <Link
      href={`/runs/${run._id}`}
      className={`grid ${GRID_COLS} items-center gap-2 px-4 py-3 border-b border-[var(--border-soft)] hover:bg-[var(--border-soft)] transition-colors duration-[var(--motion-fast)] text-sm group`}
    >
      <div className="min-w-0">
        <span className="text-[var(--fg)] font-medium truncate block group-hover:underline">
          {run.suite_name ?? "Single test run"}
        </span>
        {run.project_name && (
          <span className="text-[var(--muted)] text-xs">{run.project_name}</span>
        )}
      </div>
      <StatusPill variant={runStatusToVariant(run.status)} showDot={run.status === "running"}>
        {run.status}
      </StatusPill>
      <span className="font-[var(--font-mono)] text-[11px] uppercase tracking-[0.04em] text-[var(--muted)]">
        {run.trigger_type}
      </span>
      <span className="text-[var(--muted)] text-xs truncate">
        {run.environment_name ?? "—"}
      </span>
      <span className="font-[var(--font-mono)] text-xs text-[var(--muted)]">
        {formatDuration(run.duration_ms)}
      </span>
      <span className="font-[var(--font-mono)] text-xs text-[var(--muted)]">
        {run.pass_count != null && run.fail_count != null
          ? `${run.pass_count}✓ ${run.fail_count}✗`
          : "—"}
      </span>
      <span className="text-xs text-[var(--muted)]">
        {formatTime(run._creationTime)}
      </span>
    </Link>
  );
}

function TableHeader() {
  return (
    <div className={`grid ${GRID_COLS} items-center gap-2 px-4 py-2 border-b border-[var(--border)] font-[var(--font-mono)] text-[11px] uppercase tracking-[0.05em] text-[var(--muted)]`}>
      <span>Suite</span>
      <span>Status</span>
      <span>Trigger</span>
      <span>Environment</span>
      <span>Duration</span>
      <span>Results</span>
      <span>Time</span>
    </div>
  );
}

export function RunsList({
  runs,
  statusCounts,
  activeTab,
  onTabChange,
  branches,
  environments,
  selectedBranch,
  selectedEnvironment,
  onBranchChange,
  onEnvironmentChange,
}: {
  runs: RunItem[];
  statusCounts: Record<string, number>;
  activeTab: StatusTab;
  onTabChange: (tab: StatusTab) => void;
  branches: string[];
  environments: { _id: string; name: string }[];
  selectedBranch: string;
  selectedEnvironment: string;
  onBranchChange: (val: string) => void;
  onEnvironmentChange: (val: string) => void;
}) {
  return (
    <div>
      <StatusTabs active={activeTab} onChange={onTabChange} counts={statusCounts} />

      <FilterBar
        branches={branches}
        environments={environments}
        selectedBranch={selectedBranch}
        selectedEnvironment={selectedEnvironment}
        onBranchChange={onBranchChange}
        onEnvironmentChange={onEnvironmentChange}
      />

      {runs.length === 0 ? (
        <EmptyState
          icon={
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
          }
          title="No runs yet"
          description="Test run history will appear here once you trigger your first suite execution."
        />
      ) : (
        <div className="border border-[var(--border)] rounded-[var(--radius-md)] overflow-hidden">
          <TableHeader />
          {runs.map((run) => (
            <RunRowItem key={run._id} run={run} />
          ))}
        </div>
      )}
    </div>
  );
}

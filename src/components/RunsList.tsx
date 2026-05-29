"use client";

import { useState } from "react";
import Link from "next/link";
import { StatusPill } from "@/components/ui/StatusPill";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { runStatusToVariant } from "@/lib/run-status";
import { formatDuration, formatRelativeTime } from "@/lib/format";

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

export type StatusTab = "all" | "running" | "passed" | "failed" | "flaky" | "cancelled";

export type SortField = "recency" | "duration" | "fail_count" | "flakiness";
export type SortOrder = "asc" | "desc";

const STATUS_TABS: { key: StatusTab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "failed", label: "Failed" },
  { key: "flaky", label: "Flaky" },
  { key: "running", label: "Running" },
  { key: "passed", label: "Passed" },
  { key: "cancelled", label: "Cancelled" },
];

const INPUT_BASE =
  "font-[var(--font-mono)] text-sm bg-[var(--bg)] text-[var(--fg)] border border-[var(--border)] rounded-[var(--radius-sm)] px-3 py-[6px] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]";

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

function SortIcon({ field, currentSort, currentOrder }: { field: SortField; currentSort: SortField; currentOrder: SortOrder }) {
  if (currentSort !== field) {
    return (
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="inline ml-1 opacity-30">
        <path d="M5 1L8 4H2L5 1Z" fill="currentColor" />
        <path d="M5 9L2 6H8L5 9Z" fill="currentColor" />
      </svg>
    );
  }
  return currentOrder === "desc" ? (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="inline ml-1 text-[var(--accent)]">
      <path d="M5 1L8 4H2L5 1Z" fill="currentColor" />
    </svg>
  ) : (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="inline ml-1 text-[var(--accent)]">
      <path d="M5 9L2 6H8L5 9Z" fill="currentColor" />
    </svg>
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
        {formatRelativeTime(run._creationTime)}
      </span>
    </Link>
  );
}

function TableHeader({
  sortField,
  sortOrder,
  onSort,
}: {
  sortField: SortField;
  sortOrder: SortOrder;
  onSort: (field: SortField) => void;
}) {
  const headerBase = "cursor-pointer select-none hover:text-[var(--fg)] transition-colors";
  return (
    <div className={`grid ${GRID_COLS} items-center gap-2 px-4 py-2 border-b border-[var(--border)] font-[var(--font-mono)] text-[11px] uppercase tracking-[0.05em] text-[var(--muted)]`}>
      <span className={headerBase} onClick={() => onSort("recency")}>
        Suite <SortIcon field="recency" currentSort={sortField} currentOrder={sortOrder} />
      </span>
      <span>Status</span>
      <span>Trigger</span>
      <span>Environment</span>
      <span className={headerBase} onClick={() => onSort("duration")}>
        Duration <SortIcon field="duration" currentSort={sortField} currentOrder={sortOrder} />
      </span>
      <span className={headerBase} onClick={() => onSort("fail_count")}>
        Results <SortIcon field="fail_count" currentSort={sortField} currentOrder={sortOrder} />
      </span>
      <span className={headerBase} onClick={() => onSort("recency")}>
        Time <SortIcon field="recency" currentSort={sortField} currentOrder={sortOrder} />
      </span>
    </div>
  );
}

const PAGE_SIZE = 20;

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
  searchTerm,
  onSearchChange,
  sortField,
  sortOrder,
  onSort,
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
  searchTerm: string;
  onSearchChange: (val: string) => void;
  sortField: SortField;
  sortOrder: SortOrder;
  onSort: (field: SortField) => void;
}) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const visibleRuns = runs.slice(0, visibleCount);
  const hasMore = visibleCount < runs.length;

  return (
    <div>
      <StatusTabs active={activeTab} onChange={onTabChange} counts={statusCounts} />

      <div className="flex gap-3 mb-4 items-center flex-wrap">
        <input
          type="text"
          placeholder="Search by name, ID..."
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          className={`${INPUT_BASE} w-full max-w-[280px]`}
        />

        {(branches.length > 0 || environments.length > 0) && (
          <>
            {branches.length > 0 && (
              <select
                value={selectedBranch}
                onChange={(e) => onBranchChange(e.target.value)}
                className={INPUT_BASE}
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
                className={INPUT_BASE}
              >
                <option value="">All environments</option>
                {environments.map((env) => (
                  <option key={env._id} value={env._id}>{env.name}</option>
                ))}
              </select>
            )}
          </>
        )}
      </div>

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
        <>
          <div className="border border-[var(--border)] rounded-[var(--radius-md)] overflow-hidden">
            <TableHeader sortField={sortField} sortOrder={sortOrder} onSort={onSort} />
            {visibleRuns.map((run) => (
              <RunRowItem key={run._id} run={run} />
            ))}
          </div>

          {hasMore && (
            <div className="flex justify-center mt-4">
              <Button
                variant="secondary"
                onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
              >
                Load more
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

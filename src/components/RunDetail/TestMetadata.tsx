"use client";

import type { RunResultItem, RunEnvironment } from "@/lib/run-detail-types";

type RunLike = {
  environment: RunEnvironment;
  trigger_type?: string | null;
  branch?: string | null;
  commit?: string | null;
};

type TestMetadataProps = {
  result: RunResultItem;
  run: RunLike;
};

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function TestMetadata({ result, run }: TestMetadataProps) {
  const items: { label: string; value: string }[] = [
    { label: "Duration", value: formatDuration(result.duration_ms) },
    { label: "Retries", value: String(result.retries) },
  ];

  if (run.environment) {
    items.push({
      label: "Environment",
      value: `${run.environment.name} — ${run.environment.base_url}`,
    });
  }

  if (run.trigger_type) {
    items.push({ label: "Trigger", value: run.trigger_type.toUpperCase() });
  }

  if (run.branch) {
    items.push({ label: "Branch", value: run.branch });
  }

  if (run.commit) {
    items.push({ label: "Commit", value: run.commit.length > 8 ? run.commit.slice(0, 8) : run.commit });
  }

  return (
    <div>
      <span className="text-xs font-semibold text-[var(--fg)]">Metadata</span>
      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5">
        {items.map((item) => (
          <div key={item.label} className="flex flex-col">
            <span className="text-[11px] text-[var(--muted)]">{item.label}</span>
            <span className="text-xs font-[var(--font-mono)] text-[var(--fg)] truncate">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

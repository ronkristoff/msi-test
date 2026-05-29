"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { api, asId } from "@/lib/convex";
import { StatusPill } from "@/components/ui/StatusPill";
import { runStatusToVariant } from "@/lib/run-status";

type SameFailureHistoryProps = {
  testId: string;
  currentRunId: string;
};

export function SameFailureHistory({ testId, currentRunId }: SameFailureHistoryProps) {
  const history = useQuery(
    api.runs.queries.getSameFailureHistory,
    {
      test_id: asId(testId, "tests"),
      exclude_run_id: asId(currentRunId, "runs"),
    },
  );

  if (history === undefined) {
    return <span className="text-[var(--muted)] text-xs">Loading failure history...</span>;
  }

  if (history.length === 0) {
    return null;
  }

  return (
    <div>
      <span className="text-xs font-semibold text-[var(--fg)]">
        Same failure across runs ({history.length})
      </span>
      <div className="mt-2 flex flex-col gap-1">
        {history.map((item) => (
          <Link
            key={String(item.run_id)}
            href={`/runs/${item.run_id}`}
            className="flex items-center gap-2 px-3 py-1.5 rounded-[var(--radius-sm)] border border-[var(--border)] hover:bg-[var(--border-soft)] transition-colors duration-[var(--motion-fast)] text-xs"
          >
            <StatusPill variant={item.run_status ? runStatusToVariant(item.run_status) : "neutral"} showDot={true}>
              {item.run_status ?? "unknown"}
            </StatusPill>
            <span className="font-[var(--font-mono)] text-[var(--muted)] truncate">
              {String(item.run_id).slice(0, 12)}...
            </span>
            <span className="ml-auto text-[var(--muted)] shrink-0">
              {item.duration_ms}ms
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

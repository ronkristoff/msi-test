"use client";

import { useQuery } from "convex/react";
import { api, asId } from "@/lib/convex";

type HealingHistoryTimelineProps = {
  testId: string;
};

export function HealingHistoryTimeline({ testId }: HealingHistoryTimelineProps) {
  const history = useQuery(api.runs.queries.getHealingHistory, {
    test_id: asId(testId, "tests"),
  });

  if (history === undefined) {
    return <span className="text-[var(--muted)] text-xs">Loading healing history...</span>;
  }

  if (history.length === 0) {
    return null;
  }

  return (
    <div>
      <span className="text-xs font-semibold text-[var(--fg)]">
        Healing History ({history.length})
      </span>
      <div className="mt-2 flex flex-col gap-2">
        {history.map((item) => (
          <div
            key={String(item._id)}
            className="px-3 py-2 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)]"
          >
            <div className="flex items-center gap-2 text-xs mb-1">
              <span className="font-[var(--font-mono)] text-[var(--accent)]">
                Step {item.step_index + 1}
              </span>
              <span className="text-[var(--muted)]">
                {new Date(item._creationTime).toLocaleString()}
              </span>
              <span className="ml-auto font-[var(--font-mono)] text-[var(--muted)]">
                {(item.confidence * 100).toFixed(0)}%
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-[var(--muted)] line-through font-[var(--font-mono)]">
                {item.original_instruction}
              </span>
            </div>
            <div className="flex items-center gap-1 text-xs mt-1">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2">
                <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
              </svg>
              <span className="font-[var(--font-mono)] text-[var(--fg)]">
                {item.healed_selector}
              </span>
              {item.healed_description && (
                <span className="text-[var(--muted)]">— {item.healed_description}</span>
              )}
            </div>
            {item.reason && (
              <p className="text-xs text-[var(--muted)] mt-1">{item.reason}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

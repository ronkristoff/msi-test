"use client";

import { StatusPill } from "@/components/ui/StatusPill";
import { runStatusToVariant } from "@/lib/run-status";
import type { RunResultItem } from "@/lib/run-detail-types";

type TestListProps = {
  tests: RunResultItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
};

const STATUS_ORDER: Record<string, number> = {
  failed: 0,
  skipped: 1,
  passed: 2,
};

function sortedTests(tests: RunResultItem[]): RunResultItem[] {
  return [...tests].sort((a, b) => {
    const ao = STATUS_ORDER[a.status] ?? 3;
    const bo = STATUS_ORDER[b.status] ?? 3;
    if (ao !== bo) return ao - bo;
    return 0;
  });
}

export function TestList({ tests, selectedId, onSelect }: TestListProps) {
  const ordered = sortedTests(tests);

  return (
    <div className="flex flex-col gap-0.5 overflow-y-auto">
      {ordered.map((test) => {
        const isSelected = test._id === selectedId;
        return (
          <button
            key={test._id}
            onClick={() => onSelect(test._id)}
            className={`flex items-center gap-2 px-3 py-2.5 rounded-[var(--radius-sm)] text-left cursor-pointer transition-colors duration-[var(--motion-fast)] w-full ${
              isSelected
                ? "bg-[var(--border-soft)] border border-[var(--border)]"
                : "border border-transparent hover:bg-[var(--border-soft)]"
            }`}
          >
            <StatusPill variant={runStatusToVariant(test.status)} showDot={true}>
              {test.status}
            </StatusPill>
            <span className="text-sm text-[var(--fg)] truncate flex-1">{test.test_name}</span>
            <span className="text-[11px] text-[var(--muted)] font-[var(--font-mono)] shrink-0">
              {test.duration_ms}ms
            </span>
          </button>
        );
      })}
    </div>
  );
}

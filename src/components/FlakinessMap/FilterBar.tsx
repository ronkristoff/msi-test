"use client";

import { Button } from "@/components/ui/Button";

export type FilterMode = "all" | "flaky" | "stable";

type FilterBarProps = {
  activeFilter: FilterMode;
  onFilterChange: (filter: FilterMode) => void;
  onAnalyzeClusters: () => void;
  onExportCsv: () => void;
  isAnalyzing: boolean;
  flakyCount: number;
  stableCount: number;
  totalCount: number;
};

const filters: Array<{ key: FilterMode; label: string }> = [
  { key: "all", label: "All" },
  { key: "flaky", label: "Flaky" },
  { key: "stable", label: "Stable" },
];

export function FilterBar({
  activeFilter,
  onFilterChange,
  onAnalyzeClusters,
  onExportCsv,
  isAnalyzing,
  flakyCount,
  stableCount,
  totalCount,
}: FilterBarProps) {
  const counts: Record<FilterMode, number> = {
    all: totalCount,
    flaky: flakyCount,
    stable: stableCount,
  };

  return (
    <div className="flex items-center justify-between gap-4 flex-wrap">
      <div className="flex items-center gap-1 bg-[var(--border-soft)] rounded-[var(--radius-sm)] p-1">
        {filters.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => onFilterChange(key)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-[var(--radius-sm)] transition-all duration-[var(--motion-fast)] cursor-pointer ${
              activeFilter === key
                ? "bg-[var(--surface)] text-[var(--fg)] shadow-[var(--elev-raised)]"
                : "text-[var(--muted)] hover:text-[var(--fg)]"
            }`}
          >
            {label}
            <span className="ml-1.5 text-[var(--muted)] font-[var(--font-mono)]">
              {counts[key]}
            </span>
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={onAnalyzeClusters}
          disabled={isAnalyzing || totalCount === 0}
        >
          {isAnalyzing ? "Analyzing..." : "AI Cluster Analysis"}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={onExportCsv}
          disabled={totalCount === 0}
        >
          Export CSV
        </Button>
      </div>
    </div>
  );
}

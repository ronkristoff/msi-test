"use client";

import type { DiscoveredPage } from "./types";

interface PageChecklistProps {
  pages: DiscoveredPage[];
  selectedIndices: Set<number>;
  onToggle: (index: number) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
}

export function PageChecklist({
  pages,
  selectedIndices,
  onToggle,
  onSelectAll,
  onDeselectAll,
}: PageChecklistProps) {
  const allSelected = selectedIndices.size === pages.length && pages.length > 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-mono uppercase tracking-wide text-[var(--muted)]">
          Discovered Pages ({pages.length})
        </span>
        <button
          type="button"
          onClick={allSelected ? onDeselectAll : onSelectAll}
          className="text-[10px] font-mono text-[var(--accent)] hover:underline cursor-pointer"
        >
          {allSelected ? "Deselect all" : "Select all"}
        </button>
      </div>
      <div className="space-y-1.5 max-h-[400px] overflow-y-auto pr-1">
        {pages.map((page, i) => (
          <label
            key={i}
            className={`flex items-center gap-3 px-3 py-2 rounded-md border cursor-pointer transition-colors ${
              selectedIndices.has(i)
                ? "border-[var(--accent)] bg-[var(--accent)]/5"
                : "border-[var(--border)] hover:border-[var(--border-strong)]"
            }`}
          >
            <input
              type="checkbox"
              checked={selectedIndices.has(i)}
              onChange={() => onToggle(i)}
              className="accent-[var(--accent)] shrink-0"
            />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-[var(--fg)] truncate">
                {page.title || page.url}
              </div>
              <div className="text-xs text-[var(--muted)] truncate font-mono">
                {page.url}
              </div>
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}

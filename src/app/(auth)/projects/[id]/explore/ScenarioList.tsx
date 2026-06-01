"use client";

import type { Scenario } from "./types";

interface ScenarioListProps {
  scenarios: Scenario[];
  selectedIndices: Set<number>;
  onToggle: (index: number) => void;
  onSelectAll: () => void;
  totalScenarios: number;
}

export function ScenarioList({
  scenarios,
  selectedIndices,
  onToggle,
  onSelectAll,
  totalScenarios,
}: ScenarioListProps) {
  const allSelected = selectedIndices.size === totalScenarios && totalScenarios > 0;

  return (
    <>
      <div className="flex items-center justify-end mb-2">
        <button
          type="button"
          onClick={onSelectAll}
          className="text-[10px] font-[var(--font-mono)] text-[var(--accent)] hover:underline"
        >
          {allSelected ? "Deselect all" : "Select all"}
        </button>
      </div>
      <div className="space-y-3 mb-4">
        {scenarios.map((scenario, i) => (
          <ScenarioItem
            key={i}
            scenario={scenario}
            selected={selectedIndices.has(i)}
            onToggle={() => onToggle(i)}
          />
        ))}
      </div>
    </>
  );
}

function ScenarioItem({
  scenario,
  selected,
  onToggle,
}: {
  scenario: Scenario;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <label
      className={`flex items-start gap-3 p-3 rounded-[var(--radius-sm)] border cursor-pointer transition-colors duration-[var(--motion-fast)] ${
        selected
          ? "border-[var(--accent)] bg-[var(--accent)]/5"
          : "border-[var(--border)] hover:border-[var(--border-strong)]"
      }`}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggle}
        className="mt-0.5 accent-[var(--accent)]"
      />
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <div className="text-sm font-medium text-[var(--fg)]">{scenario.name}</div>
          <span className="inline-flex items-center rounded-full bg-[var(--accent)]/10 px-2 py-0.5 text-[10px] font-[var(--font-mono)] font-medium text-[var(--accent)]">
            {scenario.area}
          </span>
        </div>
        <div className="text-xs text-[var(--muted)] mt-1">{scenario.description}</div>
        <div className="text-xs text-[var(--muted)] mt-1 font-[var(--font-mono)] whitespace-pre-wrap">
          {scenario.flow_summary}
        </div>
      </div>
    </label>
  );
}

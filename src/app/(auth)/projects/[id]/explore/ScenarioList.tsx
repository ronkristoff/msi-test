"use client";

import type { Scenario } from "./types";

interface ScenarioListProps {
  scenarios: Scenario[];
  selectedIndices: Set<number>;
  onToggle: (index: number) => void;
  onSelectAll: () => void;
  totalScenarios: number;
  generatedAreas?: Set<string>;
}

export function ScenarioList({
  scenarios,
  selectedIndices,
  onToggle,
  onSelectAll,
  totalScenarios,
  generatedAreas = new Set(),
}: ScenarioListProps) {
  const selectableScenarios = scenarios.filter((s) => !generatedAreas.has(s.area));
  const allSelected = selectableScenarios.length > 0 && selectableScenarios.every((s) => selectedIndices.has(scenarios.indexOf(s)));

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
        {scenarios.map((scenario, i) => {
          const isGenerated = generatedAreas.has(scenario.area);
          return (
            <ScenarioItem
              key={i}
              scenario={scenario}
              selected={selectedIndices.has(i)}
              onToggle={() => onToggle(i)}
              generated={isGenerated}
            />
          );
        })}
      </div>
    </>
  );
}

function ScenarioItem({
  scenario,
  selected,
  onToggle,
  generated,
}: {
  scenario: Scenario;
  selected: boolean;
  onToggle: () => void;
  generated: boolean;
}) {
  return (
    <label
      className={`flex items-start gap-3 p-3 rounded-[var(--radius-sm)] border transition-colors duration-[var(--motion-fast)] ${
        generated
          ? "border-[var(--border-soft)] bg-[var(--border-soft)] cursor-default opacity-60"
          : selected
            ? "border-[var(--accent)] bg-[var(--accent)]/5 cursor-pointer"
            : "border-[var(--border)] hover:border-[var(--border-strong)] cursor-pointer"
      }`}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggle}
        disabled={generated}
        className="mt-0.5 accent-[var(--accent)]"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <div className="text-sm font-medium text-[var(--fg)]">{scenario.name}</div>
          <span className="inline-flex items-center rounded-full bg-[var(--accent)]/10 px-2 py-0.5 text-[10px] font-[var(--font-mono)] font-medium text-[var(--accent)]">
            {scenario.area}
          </span>
          {scenario.kb_module && (
            <span className="inline-flex items-center rounded-full bg-[var(--border-soft)] px-2 py-0.5 text-[10px] font-[var(--font-mono)] font-medium text-[var(--muted)]">
              KB: {scenario.kb_module}
            </span>
          )}
          {generated && (
            <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-[var(--font-mono)] font-semibold text-green-700">
              Generated
            </span>
          )}
        </div>
        <div className="text-xs text-[var(--muted)] mt-1">{scenario.description}</div>
        <div className="text-xs text-[var(--muted)] mt-1 font-[var(--font-mono)] whitespace-pre-wrap">
          {scenario.flow_summary}
        </div>
      </div>
    </label>
  );
}

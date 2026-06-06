import { useMemo } from "react";
import type { Scenario } from "./types";

interface FeatureMapGraphProps {
  scenarios: Scenario[];
  emptyAreas: string[];
  selectedIndices: Set<number>;
  onToggleScenario: (index: number) => void;
  onToggleArea: (area: string) => void;
  generatedAreas?: Set<string>;
}

interface AreaGroup {
  name: string;
  indices: number[];
  isEmpty: boolean;
}

export function FeatureMapGraph({
  scenarios,
  emptyAreas,
  selectedIndices,
  onToggleScenario,
  onToggleArea,
  generatedAreas = new Set(),
}: FeatureMapGraphProps) {
  const groups = useMemo(() => {
    const map = new Map<string, number[]>();
    scenarios.forEach((s, i) => {
      const list = map.get(s.area) ?? [];
      list.push(i);
      map.set(s.area, list);
    });
    for (const area of emptyAreas) {
      if (!map.has(area)) map.set(area, []);
    }
    const result: AreaGroup[] = [];
    for (const [name, indices] of map) {
      result.push({ name, indices, isEmpty: indices.length === 0 });
    }
    result.sort((a, b) => a.name.localeCompare(b.name));
    return result;
  }, [scenarios, emptyAreas]);

  return (
    <div className="space-y-2 mb-4">
      {groups.map((area) => {
        const totalCount = area.indices.length;
        const selectedCount = area.isEmpty
          ? 0
          : area.indices.filter((i) => selectedIndices.has(i)).length;
        const fullyCovered = totalCount > 0 && selectedCount === totalCount;
        const isGenerated = generatedAreas.has(area.name);

        return (
          <div
            key={area.name}
            data-testid="area-section"
            data-area-name={area.name}
          >
            <div
              data-area-node
              onClick={() => onToggleArea(area.name)}
              className={`flex items-center gap-2 px-3 py-2 rounded-t-[var(--radius-sm)] border transition-colors duration-[var(--motion-fast)] ${
                isGenerated
                  ? "border-green-400 bg-green-50/5 cursor-default"
                  : fullyCovered
                    ? "border-green-500 bg-green-50/10 cursor-pointer"
                    : "border-[var(--border)] bg-[var(--surface-elevated)] hover:border-[var(--border-strong)] cursor-pointer"
              }`}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="shrink-0">
                <rect
                  x="1"
                  y="1"
                  width="10"
                  height="10"
                  rx="2"
                  fill={area.isEmpty ? "var(--muted)" : isGenerated ? "#22c55e" : fullyCovered ? "#22c55e" : "var(--accent)"}
                  opacity={area.isEmpty ? 0.3 : 0.8}
                />
              </svg>
              <span className={`text-sm font-semibold ${isGenerated ? "text-[var(--muted)]" : "text-[var(--fg)]"}`}>{area.name}</span>
              {isGenerated && (
                <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-[9px] font-[var(--font-mono)] font-semibold text-green-700">
                  Generated
                </span>
              )}
              {!area.isEmpty && !isGenerated && (
                <span className="ml-auto font-[var(--font-mono)] text-[10px] text-[var(--muted)]">
                  {selectedCount}/{totalCount}
                </span>
              )}
            </div>
            <div className="ml-4 border-l border-[var(--border)] pl-2">
              {area.isEmpty && (
                <div className="py-2 px-3 text-xs text-[var(--muted)] italic">
                  No scenarios found
                </div>
              )}
              {area.indices.map((idx) => {
                const scenario = scenarios[idx];
                const selected = selectedIndices.has(idx);
                const scenarioGenerated = isGenerated;
                return (
                  <div
                    key={idx}
                    data-scenario-node
                    onClick={() => { if (!scenarioGenerated) onToggleScenario(idx); }}
                    className={`flex items-start gap-2 px-3 py-2 border-b border-[var(--border-soft)] last:border-b-0 transition-colors duration-[var(--motion-fast)] ${
                      scenarioGenerated
                        ? "cursor-default opacity-50"
                        : selected
                          ? "border-l-2 border-l-[var(--accent)] bg-[var(--accent)]/5 cursor-pointer"
                          : "border-l-2 border-l-[var(--border)] hover:bg-[var(--surface-elevated)] cursor-pointer"
                    }`}
                  >
                    <span
                      className={`mt-0.5 w-3 h-3 rounded-sm border shrink-0 flex items-center justify-center ${
                        scenarioGenerated
                          ? "bg-green-500 border-green-500"
                          : selected
                            ? "bg-[var(--accent)] border-[var(--accent)]"
                            : "border-[var(--border)]"
                      }`}
                    >
                      {scenarioGenerated ? (
                        <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                          <path d="M1 4L3 6L7 2" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      ) : selected ? (
                        <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                          <path d="M1 4L3 6L7 2" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      ) : null}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className={`text-sm font-medium ${scenarioGenerated ? "text-[var(--muted)]" : "text-[var(--fg)]"}`}>{scenario.name}</div>
                      <div className="text-xs text-[var(--muted)] mt-0.5 line-clamp-2">{scenario.description}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

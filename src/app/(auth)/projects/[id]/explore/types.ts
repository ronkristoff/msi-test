export interface PrdCoverageItem {
  feature: string;
  found: boolean;
  evidence?: string;
}

export interface DiscoveredPage {
  url: string;
  title: string;
}

export interface Scenario {
  name: string;
  description: string;
  flow_summary: string;
  area: string;
  related_flows?: string[];
}

export interface CapturedPageWithUrl {
  url: string;
  title: string;
  structure_text: string;
  screenshot_storage_id?: string;
  screenshot_url: string | null;
  semantic_description?: string;
  interactive_elements?: Array<{
    selector: string;
    description: string;
    element_type: string;
  }>;
}

export interface DiscoveredFlow {
  name: string;
  description?: string;
  steps: string[];
  pages_involved: number[];
  complexity: "low" | "medium" | "high";
}

export type SelectionMode = "flows" | "scenarios";

export function flowDescription(flow: DiscoveredFlow): string {
  if (flow.description) return flow.description;
  if (flow.steps.length <= 1) return `Single-page flow on ${flow.steps[0] ?? "unknown page"}`;
  return `Navigation from ${flow.steps[0]} through ${flow.steps.length - 1} page${flow.steps.length - 1 !== 1 ? "s" : ""} to ${flow.steps[flow.steps.length - 1]}`;
}

export function complexityColor(complexity: "low" | "medium" | "high") {
  if (complexity === "high") return "bg-red-100 text-red-700";
  if (complexity === "medium") return "bg-yellow-100 text-yellow-700";
  return "bg-green-100 text-green-700";
}

export function makeToggleHandler(
  setter: React.Dispatch<React.SetStateAction<Set<number>>>,
) {
  return (index: number) =>
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
}

export function toggleAll(
  setter: React.Dispatch<React.SetStateAction<Set<number>>>,
  current: Set<number>,
  total: number,
) {
  if (current.size === total) {
    setter(new Set());
  } else {
    setter(new Set(Array.from({ length: total }, (_, i) => i)));
  }
}

export function matchScenariosToFlows(
  selectedFlowNames: string[],
  scenarios: Scenario[],
): Scenario[] {
  if (selectedFlowNames.length === 0) return scenarios;

  const flowNameSet = new Set(selectedFlowNames);
  const matched = scenarios.filter((s) =>
    s.related_flows?.some((rf) => flowNameSet.has(rf)),
  );

  return matched.length > 0 ? matched : scenarios;
}

export function indicesForArea(scenarios: Scenario[], area: string): number[] {
  return scenarios
    .map((s, i) => (s.area === area ? i : -1))
    .filter((i) => i >= 0);
}

export function toggleArea(
  setter: React.Dispatch<React.SetStateAction<Set<number>>>,
  scenarios: Scenario[],
  area: string,
) {
  const indices = indicesForArea(scenarios, area);
  setter((prev) => {
    const allSelected = indices.length > 0 && indices.every((i) => prev.has(i));
    const next = new Set(prev);
    if (allSelected) {
      indices.forEach((i) => next.delete(i));
    } else {
      indices.forEach((i) => next.add(i));
    }
    return next;
  });
}

export function areasWithoutScenarios(
  scenarios: Scenario[],
  prdGaps: string[],
): string[] {
  const scenarioAreas = new Set(scenarios.map((s) => s.area));
  return prdGaps.filter((g) => !scenarioAreas.has(g));
}

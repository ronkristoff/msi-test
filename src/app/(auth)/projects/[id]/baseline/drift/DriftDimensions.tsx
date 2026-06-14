import type { Doc } from "@/lib/convex";

export type DriftItem = Doc<"drift_reports">["items"][number];
export type DriftDimension = DriftItem["dimension"];

export const DIMENSION_LABELS: Record<DriftDimension, string> = {
  "old-rd-vs-code": "Old RD vs Code",
  "bmad-prd-vs-code": "BMAD PRD vs Code",
  "bmad-conventions-vs-code": "Conventions vs Code",
  "adr-drift": "Architecture Decision Drift",
};

export const SEVERITY_LABELS: Record<DriftItem["severity"], string> = {
  breaking: "Breaking",
  significant: "Significant",
  incremental: "Incremental",
};

export const CATEGORY_LABELS: Record<DriftItem["category"], string> = {
  added: "Added",
  removed: "Removed",
  changed: "Changed",
};

export const DIMENSION_ORDER: DriftDimension[] = [
  "old-rd-vs-code",
  "bmad-prd-vs-code",
  "bmad-conventions-vs-code",
  "adr-drift",
];

export const RD_SECTION_LABELS: Record<string, string> = {
  overview: "Overview",
  "tech-stack": "Tech Stack",
  modules: "Modules",
  "api-surface": "API Surface",
  "data-model": "Data Model",
  "user-flows": "User Flows",
  "decision-log": "Decision Log",
};

export type SeverityVariant = "danger" | "warn" | "neutral";

export function severityVariant(severity: DriftItem["severity"]): SeverityVariant {
  if (severity === "breaking") return "danger";
  if (severity === "significant") return "warn";
  return "neutral";
}

export function groupByDimension(
  items: DriftItem[],
): { dimension: DriftDimension; items: DriftItem[] }[] {
  const groups = new Map<DriftDimension, DriftItem[]>();
  for (const item of items) {
    const existing = groups.get(item.dimension) ?? [];
    existing.push(item);
    groups.set(item.dimension, existing);
  }
  return DIMENSION_ORDER.filter((d) => groups.has(d)).map((dimension) => ({
    dimension,
    items: groups.get(dimension)!,
  }));
}

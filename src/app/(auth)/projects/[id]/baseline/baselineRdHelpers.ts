import type { Doc } from "@/lib/convex";

export type ConfidenceStatusVariant = "success" | "warn" | "danger";

export function confidenceVariant(confidence: number): ConfidenceStatusVariant {
  if (confidence >= 0.8) return "success";
  if (confidence >= 0.5) return "warn";
  return "danger";
}

export function confidenceLabel(confidence: number): string {
  if (confidence >= 0.8) return "High";
  if (confidence >= 0.5) return "Medium";
  return "Low";
}

export type RdSection = Doc<"baseline_rds">["sections"][number];

const ALIGNMENT_LABELS: Record<"agree" | "diverge" | "partial", string> = {
  agree: "Agree",
  diverge: "Diverge",
  partial: "Partial",
};

export function alignmentLabel(agreement: "agree" | "diverge" | "partial"): string {
  return ALIGNMENT_LABELS[agreement];
}

type FlakinessLevel = "Stable" | "Low" | "Moderate" | "High" | "Critical";

const FLAKINESS_SCALE: Array<{ threshold: number; label: FlakinessLevel; className: string }> = [
  { threshold: 10, label: "Stable", className: "bg-[rgba(0,140,0,0.20)] text-[var(--success-text)]" },
  { threshold: 25, label: "Low", className: "bg-[rgba(132,204,22,0.20)] text-[#4d7c0f]" },
  { threshold: 50, label: "Moderate", className: "bg-[rgba(234,179,8,0.20)] text-[var(--warn-text)]" },
  { threshold: 75, label: "High", className: "bg-[rgba(249,115,22,0.20)] text-[#c2410c]" },
  { threshold: 100, label: "Critical", className: "bg-[rgba(220,38,38,0.20)] text-[var(--danger-text)]" },
];

export function getFlakinessLevel(pct: number): { label: FlakinessLevel; className: string } {
  return FLAKINESS_SCALE.find((s) => pct <= s.threshold) ?? FLAKINESS_SCALE[FLAKINESS_SCALE.length - 1];
}

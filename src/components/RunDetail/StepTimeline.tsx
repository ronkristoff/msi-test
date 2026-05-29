"use client";

import { StatusPill } from "@/components/ui/StatusPill";
import { runStatusToVariant } from "@/lib/run-status";
import type { StepItem } from "@/lib/run-detail-types";

type StepTimelineProps = {
  steps: StepItem[];
  selectedIndex: number | null;
  onSelect: (index: number) => void;
};

export function StepTimeline({ steps, selectedIndex, onSelect }: StepTimelineProps) {
  if (steps.length === 0) {
    return <span className="text-[var(--muted)] text-xs">No step data</span>;
  }

  return (
    <div className="flex flex-col gap-0.5">
      {steps.map((step, i) => {
        const isSelected = i === selectedIndex;
        const variant = runStatusToVariant(step.status);
        return (
          <button
            key={step.step_number}
            onClick={() => onSelect(i)}
            className={`flex items-start gap-2 px-3 py-2 rounded-[var(--radius-sm)] text-left cursor-pointer transition-colors duration-[var(--motion-fast)] w-full ${
              isSelected
                ? "bg-[var(--border-soft)] border border-[var(--border)]"
                : "border border-transparent hover:bg-[var(--border-soft)]"
            }`}
          >
            <span className="font-[var(--font-mono)] text-[var(--muted)] w-6 text-right shrink-0 pt-0.5 text-xs">
              {step.step_number}
            </span>
            <StatusPill variant={variant} showDot={true}>
              {step.status}
            </StatusPill>
            <div className="flex-1 min-w-0">
              <span className="text-xs text-[var(--fg)] truncate block">{step.command}</span>
              {step.locator && (
                <span className="text-[11px] text-[var(--muted)] font-[var(--font-mono)] truncate block">
                  {step.locator}
                </span>
              )}
            </div>
            <span className="text-[11px] text-[var(--muted)] font-[var(--font-mono)] shrink-0 pt-0.5">
              {step.duration_ms}ms
            </span>
          </button>
        );
      })}
    </div>
  );
}

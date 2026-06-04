"use client";

type Phase = {
  label: string;
  status: "completed" | "current" | "upcoming";
};

type PhaseIndicatorProps = {
  phases: Phase[];
};

export function PhaseIndicator({ phases }: PhaseIndicatorProps) {
  return (
    <div className="flex items-center gap-1 mb-6">
      {phases.map((phase, i) => (
        <div key={phase.label} className="flex items-center gap-1">
          <div className="flex items-center gap-2">
            <span
              className={`w-6 h-6 rounded-full text-[11px] font-bold grid place-items-center transition-colors duration-[var(--motion-fast)] ${
                phase.status === "completed"
                  ? "bg-[var(--accent)] text-[var(--accent-on)]"
                  : phase.status === "current"
                    ? "bg-[var(--accent)] text-[var(--accent-on)] ring-2 ring-[var(--accent)]/30"
                    : "bg-[var(--border-soft)] text-[var(--muted)]"
              }`}
            >
              {phase.status === "completed" ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                i + 1
              )}
            </span>
            <span
              className={`text-xs font-medium whitespace-nowrap ${
                phase.status === "current"
                  ? "text-[var(--fg)]"
                  : phase.status === "completed"
                    ? "text-[var(--muted)]"
                    : "text-[var(--muted)]"
              }`}
            >
              {phase.label}
            </span>
          </div>
          {i < phases.length - 1 && (
            <div
              className={`w-6 h-px mx-1 ${
                phase.status === "completed" ? "bg-[var(--accent)]" : "bg-[var(--border)]"
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );
}

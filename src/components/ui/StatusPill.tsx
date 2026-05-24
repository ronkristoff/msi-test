"use client";

import type { ReactNode } from "react";

type StatusVariant = "success" | "danger" | "warn" | "neutral" | "running";

type StatusPillProps = {
  variant: StatusVariant;
  showDot?: boolean;
  children: ReactNode;
  className?: string;
};

const variantClasses: Record<StatusVariant, string> = {
  success: "bg-[rgba(0,100,0,0.12)] text-[var(--success-text)]",
  danger: "bg-[rgba(220,38,38,0.10)] text-[var(--danger-text)]",
  warn: "bg-[rgba(234,179,8,0.12)] text-[var(--warn-text)]",
  neutral: "bg-[var(--border-soft)] text-[var(--muted)] border border-[var(--border)]",
  running: "bg-[rgba(27,97,201,0.10)] text-[var(--accent)]",
};

const dotClasses: Record<StatusVariant, string> = {
  success: "bg-[var(--success)]",
  danger: "bg-[var(--danger)]",
  warn: "bg-[var(--warn)]",
  neutral: "",
  running: "bg-[var(--accent)] animate-pulse",
};

export function StatusPill({ variant, showDot = true, children, className = "" }: StatusPillProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-[3px] rounded-[var(--radius-pill)] font-[var(--font-mono)] text-[11px] font-semibold tracking-[0.02em] leading-none ${variantClasses[variant]} ${className}`}
    >
      {showDot && variant !== "neutral" && (
        <span className={`w-1.5 h-1.5 rounded-full ${dotClasses[variant]}`} />
      )}
      {children}
    </span>
  );
}

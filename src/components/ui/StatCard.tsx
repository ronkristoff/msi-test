"use client";

import type { ReactNode } from "react";

type StatCardProps = {
  label: string;
  value: string | number;
  trend?: ReactNode;
};

export function StatCard({ label, value, trend }: StatCardProps) {
  return (
    <div className="bg-[var(--surface)] border border-[var(--border-soft)] rounded-[var(--radius-md)] p-4">
      <div className="font-[var(--font-mono)] text-[12px] uppercase tracking-[0.04em] text-[var(--muted)] mb-2">
        {label}
      </div>
      <div className="font-[var(--font-mono)] text-[32px] font-bold tracking-[-0.02em] text-[var(--fg)] leading-none">
        {value}
      </div>
      {trend && <div className="mt-2 font-[var(--font-mono)] text-[12px]">{trend}</div>}
    </div>
  );
}

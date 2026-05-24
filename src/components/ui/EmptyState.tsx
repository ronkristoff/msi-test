"use client";

import type { ReactNode } from "react";

type EmptyStateProps = {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
};

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="w-12 h-12 rounded-[var(--radius-md)] bg-[var(--border-soft)] grid place-items-center text-[var(--muted)] mb-4">
        {icon}
      </div>
      <h3 className="font-[var(--font-display)] text-lg font-bold text-[var(--fg)] mb-1">{title}</h3>
      <p className="text-sm text-[var(--muted)] max-w-[400px] leading-relaxed mb-6">{description}</p>
      {action}
    </div>
  );
}

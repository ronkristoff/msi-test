"use client";

import type { ReactNode } from "react";

type SectionHeaderProps = {
  title: string;
};

export function SectionHeader({ title }: SectionHeaderProps) {
  return (
    <h3 className="font-[var(--font-mono)] text-[12px] uppercase tracking-[0.06em] text-[var(--muted)] mb-4">
      {title}
    </h3>
  );
}

type SectionPanelProps = {
  title: string;
  children: ReactNode;
  className?: string;
};

export function SectionPanel({ title, children, className = "mb-6" }: SectionPanelProps) {
  return (
    <div className={className}>
      <SectionHeader title={title} />
      {children}
    </div>
  );
}

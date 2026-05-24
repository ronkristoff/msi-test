"use client";

import type { ReactNode } from "react";

type TopbarProps = {
  title: string;
  subtitle?: string;
  backHref?: string;
  actions?: ReactNode;
};

export function Topbar({ title, subtitle, backHref, actions }: TopbarProps) {
  return (
    <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)] sticky top-0 bg-[var(--surface)]/96 backdrop-blur-[8px] z-10">
      <div className="flex items-center gap-3">
        {backHref && (
          <a
            href={backHref}
            className="inline-flex items-center gap-1 text-[var(--muted)] hover:text-[var(--fg)] transition-colors duration-[var(--motion-fast)]"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
          </a>
        )}
        <div>
          <h1 className="font-[var(--font-display)] text-xl font-bold text-[var(--fg)]">{title}</h1>
          {subtitle && (
            <p className="font-[var(--font-mono)] text-xs text-[var(--muted)] tracking-wider mt-0.5">{subtitle}</p>
          )}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

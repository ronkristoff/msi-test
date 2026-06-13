"use client";

import { useId, useState, type ReactNode } from "react";

type ModuleSectionProps<T> = {
  title: string;
  items: T[];
  renderItem: (item: T, index: number) => ReactNode;
  emptyMessage: string;
};

export function ModuleSection<T>({ title, items, renderItem, emptyMessage }: ModuleSectionProps<T>) {
  const hasItems = items.length > 0;
  const [open, setOpen] = useState(hasItems);
  const rawId = useId();
  const sectionId = `section-${rawId.replace(/:/g, "")}`;

  if (!hasItems) {
    return (
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] shadow-[var(--elev-raised)]">
        <div className="px-5 py-4">
          <h3 className="font-[var(--font-display)] text-lg font-bold text-[var(--fg)]">
            {title}
          </h3>
        </div>
        <div className="px-5 pb-5 border-t border-[var(--border-soft)]">
          <p className="pt-3 text-sm text-[var(--muted)]">{emptyMessage}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] shadow-[var(--elev-raised)]">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-controls={sectionId}
        className="flex items-center justify-between w-full px-5 py-4 text-left cursor-pointer transition-colors duration-[var(--motion-fast)] hover:bg-[var(--border-soft)] rounded-[var(--radius-md)]"
      >
        <span className="flex items-center gap-2">
          <h3 className="font-[var(--font-display)] text-lg font-bold text-[var(--fg)]">
            {title}
          </h3>
          <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-[var(--radius-pill)] bg-[var(--accent)]/10 text-[var(--accent)] font-[var(--font-mono)] text-xs font-semibold">
            {items.length}
          </span>
        </span>
        <svg
          aria-hidden="true"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`text-[var(--muted)] transition-transform duration-[var(--motion-fast)] ${open ? "rotate-180" : ""}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      <div
        id={sectionId}
        role="region"
        className={open ? "px-5 pb-5 border-t border-[var(--border-soft)]" : ""}
      >
        {open && (
          <div className="pt-3 flex flex-col gap-3">
            {items.map((item, idx) => renderItem(item, idx))}
          </div>
        )}
      </div>
    </div>
  );
}

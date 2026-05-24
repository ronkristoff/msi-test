"use client";

import Link from "next/link";
import type { BreadcrumbItem } from "@/lib/use-breadcrumbs";

type BreadcrumbsProps = {
  items: BreadcrumbItem[];
};

export function Breadcrumbs({ items }: BreadcrumbsProps) {
  if (items.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex items-center gap-1 text-[13px] leading-none min-w-0">
        {items.map((item, i) => {
          const isLast = i === items.length - 1;
          return (
            <li key={i} className="flex items-center gap-1 min-w-0">
              {i > 0 && (
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  className="text-[var(--border)] shrink-0"
                  aria-hidden
                >
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              )}
              {item.href && !isLast ? (
                <Link
                  href={item.href}
                  className="text-[var(--muted)] hover:text-[var(--fg)] transition-colors duration-[var(--motion-fast)] truncate max-w-[26ch] overflow-hidden focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[color-mix(in_oklab,var(--accent),transparent_70%)] focus-visible:rounded-[2px]"
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  className="text-[var(--fg)] font-semibold truncate max-w-[40ch] overflow-hidden"
                  aria-current={isLast ? "page" : undefined}
                >
                  {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

"use client";

import Link from "next/link";
import type { Id } from "@/lib/convex";

type ModuleItem = {
  _id: Id<"kb_modules">;
  name: string;
  description: string | null;
  file_count: number;
  dependencies: string[];
};

type KnowledgeModuleListProps = {
  modules: ModuleItem[];
  projectId: string;
};

export function KnowledgeModuleList({ modules, projectId }: KnowledgeModuleListProps) {
  if (modules.length === 0) {
    return (
      <div className="px-5 py-6 text-center text-sm text-[var(--muted)]">
        No modules detected.
      </div>
    );
  }

  return (
    <div className="px-3 pb-3">
      {modules.map((mod) => (
        <Link
          key={mod._id}
          href={`/projects/${projectId}/knowledge/modules/${mod._id}`}
          className="flex items-center justify-between py-2.5 px-2 -mx-0.5 rounded-[var(--radius-sm)] hover:bg-[var(--border-soft)] transition-colors duration-[var(--motion-fast)] group"
        >
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-[var(--fg)] group-hover:text-[var(--accent)]">
              {mod.name}
            </div>
            {mod.description && (
              <div className="text-xs text-[var(--muted)] mt-0.5 truncate">
                {mod.description}
              </div>
            )}
            {mod.dependencies.length > 0 && (
              <div className="text-xs text-[var(--muted)] mt-0.5">
                Depends on: {mod.dependencies.join(", ")}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-[var(--muted)]">
              {mod.file_count} {mod.file_count === 1 ? "file" : "files"}
            </span>
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[var(--muted)] group-hover:text-[var(--fg)]">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </div>
        </Link>
      ))}
    </div>
  );
}

export type { ModuleItem };

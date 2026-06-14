"use client";

import Link from "next/link";
import { StatCard } from "@/components/ui/StatCard";
import { Button } from "@/components/ui/Button";
import { formatBytes, formatTime } from "@/lib/format";
import type { Doc } from "@/lib/convex";
import { KnowledgeModuleList, type ModuleItem } from "./KnowledgeModuleList";

type KnowledgeReadyProps = {
  kb: Doc<"knowledge_bases">;
  modules: ModuleItem[];
  projectId: string;
  onResync: () => Promise<void>;
  isResyncing: boolean;
  hasOldRd?: boolean;
};

export function KnowledgeReady({ kb, modules, projectId, onResync, isResyncing, hasOldRd }: KnowledgeReadyProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end gap-2">
        {hasOldRd && (
          <Link href={`/projects/${projectId}/baseline/drift`}>
            <Button variant="secondary" size="sm">
              View Drift Report
            </Button>
          </Link>
        )}
        <Button onClick={onResync} disabled={isResyncing} variant="secondary" size="sm">
          {isResyncing ? (
            <>
              <svg aria-hidden="true" className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Syncing...
            </>
          ) : (
            <>
              <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 4v6h-6" /><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10" />
              </svg>
              Re-sync
            </>
          )}
        </Button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total Files" value={kb.total_files ?? 0} />
        <StatCard label="Total Size" value={formatBytes(kb.total_size_bytes)} />
        <StatCard
          label="Architecture"
          value={kb.architecture_type ?? "—"}
        />
        <StatCard
          label="Last Synced"
          value={kb.last_synced_at ? formatTime(kb.last_synced_at) : "—"}
        />
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] p-5 shadow-[var(--elev-raised)]">
        <h3 className="font-[var(--font-display)] text-lg font-bold text-[var(--fg)] mb-3">
          Architecture Summary
        </h3>
        {kb.tech_stack && kb.tech_stack.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {kb.tech_stack.map((tech, idx) => (
              <span
                key={`${tech}-${idx}`}
                className="inline-flex items-center px-2.5 py-1 rounded-[var(--radius-pill)] bg-[var(--accent)]/10 text-[var(--accent)] font-[var(--font-mono)] text-xs font-medium"
              >
                {tech}
              </span>
            ))}
          </div>
        )}
        {kb.architecture_summary && (
          <p className="text-sm text-[var(--fg)] leading-relaxed mb-4">
            {kb.architecture_summary}
          </p>
        )}
        {kb.folder_structure && (
          <div>
            <div className="font-[var(--font-mono)] text-[11px] uppercase tracking-[0.05em] text-[var(--muted)] mb-2">
              Folder Structure
            </div>
            <pre className="bg-[var(--border-soft)] rounded-[var(--radius-sm)] p-4 text-xs font-[var(--font-mono)] text-[var(--fg)] overflow-x-auto whitespace-pre">
              {kb.folder_structure}
            </pre>
          </div>
        )}
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] shadow-[var(--elev-raised)]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-soft)]">
          <h3 className="font-[var(--font-display)] text-lg font-bold text-[var(--fg)]">
            Modules ({modules.length})
          </h3>
        </div>
        <KnowledgeModuleList modules={modules} projectId={projectId} />
      </div>
    </div>
  );
}

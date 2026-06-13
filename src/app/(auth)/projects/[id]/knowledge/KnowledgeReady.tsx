"use client";

import { StatCard } from "@/components/ui/StatCard";
import { formatBytes, formatTime } from "@/lib/format";
import type { Doc } from "@/lib/convex";
import { KnowledgeModuleList, type ModuleItem } from "./KnowledgeModuleList";

type KnowledgeReadyProps = {
  kb: Doc<"knowledge_bases">;
  modules: ModuleItem[];
  projectId: string;
};

export function KnowledgeReady({ kb, modules, projectId }: KnowledgeReadyProps) {
  return (
    <div className="flex flex-col gap-4">
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

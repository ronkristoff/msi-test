"use client";

import { useState } from "react";

type BmadEntry = {
  _id: string;
  key: string;
  content: string;
  source_path: string;
  metadata?: Record<string, unknown>;
};

type DeclaredIntentProps = {
  metadata: {
    prd_sections: BmadEntry[];
    adrs: BmadEntry[];
    conventions: BmadEntry[];
    domain_terms: BmadEntry[];
  };
};

export function DeclaredIntent({ metadata }: DeclaredIntentProps) {
  const [expanded, setExpanded] = useState(false);

  const { prd_sections, adrs, conventions, domain_terms } = metadata;

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] shadow-[var(--elev-raised)]">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-5 py-4"
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-3">
          <h3 className="font-[var(--font-display)] text-lg font-bold text-[var(--fg)]">
            Declared Intent
          </h3>
          <span className="font-[var(--font-mono)] text-xs text-[var(--muted)]">
            {prd_sections.length} PRD sections · {adrs.length} ADRs · {conventions.length} conventions · {domain_terms.length} domain terms
          </span>
        </div>
        <svg
          aria-hidden="true"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`text-[var(--muted)] transition-transform ${expanded ? "rotate-180" : ""}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {expanded && (
        <div className="px-5 pb-5 border-t border-[var(--border-soft)] space-y-4 pt-4">
          {prd_sections.length > 0 && (
            <div>
              <div className="font-[var(--font-mono)] text-[11px] uppercase tracking-[0.05em] text-[var(--muted)] mb-2">
                PRD Outline
              </div>
              <ul className="space-y-1">
                {prd_sections.map((section) => (
                  <li key={section._id} className="text-sm text-[var(--fg)]">
                    {section.key}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {adrs.length > 0 && (
            <div>
              <div className="font-[var(--font-mono)] text-[11px] uppercase tracking-[0.05em] text-[var(--muted)] mb-2">
                Architectural Decisions ({adrs.length})
              </div>
              <ul className="space-y-2">
                {adrs.map((adr) => {
                  const meta = adr.metadata as { title?: string; status?: string } | undefined;
                  return (
                    <li key={adr._id} className="text-sm">
                      <span className="font-[var(--font-mono)] text-[var(--accent)]">{adr.key}</span>
                      <span className="text-[var(--fg)] ml-2">{meta?.title ?? adr.key}</span>
                      {meta?.status && (
                        <span className="ml-2 text-xs text-[var(--muted)]">({meta.status})</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {conventions.length > 0 && (
            <div>
              <div className="font-[var(--font-mono)] text-[11px] uppercase tracking-[0.05em] text-[var(--muted)] mb-2">
                Conventions ({conventions.length})
              </div>
              <ul className="space-y-1">
                {conventions.map((conv) => (
                  <li key={conv._id} className="text-sm text-[var(--fg)]">
                    {conv.key}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {domain_terms.length > 0 && (
            <div>
              <div className="font-[var(--font-mono)] text-[11px] uppercase tracking-[0.05em] text-[var(--muted)] mb-2">
                Domain Terms ({domain_terms.length})
              </div>
              <div className="flex flex-wrap gap-2">
                {domain_terms.map((term) => (
                  <span
                    key={term._id}
                    title={term.content.length > 200 ? term.content.slice(0, 200) + "…" : term.content}
                    className="inline-flex items-center px-2.5 py-1 rounded-[var(--radius-pill)] bg-[var(--accent)]/10 text-[var(--accent)] font-[var(--font-mono)] text-xs font-medium"
                  >
                    {term.key}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

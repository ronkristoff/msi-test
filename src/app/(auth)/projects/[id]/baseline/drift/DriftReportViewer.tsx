"use client";

import { StatusPill } from "@/components/ui/StatusPill";
import type { Doc } from "@/lib/convex";
import {
  CATEGORY_LABELS,
  DIMENSION_LABELS,
  RD_SECTION_LABELS,
  SEVERITY_LABELS,
  groupByDimension,
  severityVariant,
  type DriftItem,
} from "./DriftDimensions";

type DriftReportViewerProps = {
  report: Doc<"drift_reports">;
};

function DriftItemRow({ item }: { item: DriftItem }) {
  return (
    <div className="py-3 border-b border-[var(--border-soft)] last:border-b-0">
      <div className="flex flex-wrap items-center gap-2 mb-1">
        <StatusPill variant={severityVariant(item.severity)}>
          {SEVERITY_LABELS[item.severity]}
        </StatusPill>
        <span className="inline-flex items-center px-2 py-[3px] rounded-[var(--radius-pill)] font-[var(--font-mono)] text-[11px] font-semibold tracking-[0.02em] leading-none bg-[var(--border-soft)] text-[var(--muted)] border border-[var(--border)]">
          {CATEGORY_LABELS[item.category]}
        </span>
        {item.rd_section_id && (
          <span className="text-[11px] text-[var(--muted)] font-[var(--font-mono)]">
            RD: {RD_SECTION_LABELS[item.rd_section_id] ?? item.rd_section_id}
          </span>
        )}
      </div>
      <h4 className="font-[var(--font-display)] text-sm font-bold text-[var(--fg)] mb-1">
        {item.title}
      </h4>
      <p className="text-sm text-[var(--muted)] leading-relaxed">
        {item.description}
      </p>
      {item.evidence && (
        <pre className="mt-2 bg-[var(--border-soft)] rounded-[var(--radius-sm)] p-2 text-xs font-[var(--font-mono)] text-[var(--fg)] overflow-x-auto whitespace-pre-wrap">
          {item.evidence}
        </pre>
      )}
      {item.old_rd_reference && (
        <p className="mt-2 text-xs text-[var(--muted)] italic">
          Old RD: {item.old_rd_reference}
        </p>
      )}
    </div>
  );
}

export function DriftReportViewer({ report }: DriftReportViewerProps) {
  const grouped = groupByDimension(report.items);
  const mainGroups = grouped.filter((g) => g.dimension !== "adr-drift");
  const adrGroup = grouped.find((g) => g.dimension === "adr-drift");

  const totalNonAdr = mainGroups.reduce((sum, g) => sum + g.items.length, 0);

  return (
    <div className="flex flex-col gap-4">
      {report.items.length === 0 && (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] p-5 shadow-[var(--elev-raised)]">
          <p className="text-sm text-[var(--muted)]">
            No drift detected — the current code matches the Old Requirements Document.
          </p>
        </div>
      )}

      {mainGroups.map((group) => (
        <div
          key={group.dimension}
          className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] shadow-[var(--elev-raised)]"
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-soft)]">
            <h3 className="font-[var(--font-display)] text-lg font-bold text-[var(--fg)]">
              {DIMENSION_LABELS[group.dimension]}
            </h3>
            <span className="text-xs text-[var(--muted)] font-[var(--font-mono)]">
              {group.items.length} item{group.items.length === 1 ? "" : "s"}
            </span>
          </div>
          <div className="px-5">
            {group.items.map((item, idx) => (
              <DriftItemRow key={`${group.dimension}-${idx}`} item={item} />
            ))}
          </div>
        </div>
      ))}

      {adrGroup && (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] shadow-[var(--elev-raised)]">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-soft)]">
            <h3 className="font-[var(--font-display)] text-lg font-bold text-[var(--fg)]">
              Architecture Decision Drifts
            </h3>
            <span className="text-xs text-[var(--muted)] font-[var(--font-mono)]">
              {adrGroup.items.length} item{adrGroup.items.length === 1 ? "" : "s"}
            </span>
          </div>
          <div className="px-5">
            {adrGroup.items.map((item, idx) => (
              <DriftItemRow key={`adr-${idx}`} item={item} />
            ))}
          </div>
        </div>
      )}

      <div className="text-xs text-[var(--muted)] text-right">
        {totalNonAdr} drift item{totalNonAdr === 1 ? "" : "s"}
        {adrGroup ? ` + ${adrGroup.items.length} ADR drift${adrGroup.items.length === 1 ? "" : "s"}` : ""}
        {" · "}version {report.version}
        {" · "}generated {new Date(report.generated_at).toLocaleString()}
      </div>
    </div>
  );
}

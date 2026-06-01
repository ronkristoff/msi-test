"use client";

import type { CapturedPageWithUrl, DiscoveredFlow, SelectionMode } from "./types";
import { flowDescription, complexityColor } from "./types";

interface FlowCardProps {
  flow: DiscoveredFlow;
  index: number;
  selected: boolean;
  mode: SelectionMode;
  capturedPages: CapturedPageWithUrl[];
  onToggle: (index: number) => void;
}

export function FlowCard({ flow, index, selected, mode, capturedPages, onToggle }: FlowCardProps) {
  const flowPages = flow.pages_involved
    .map((pi) => capturedPages[pi])
    .filter(Boolean) as CapturedPageWithUrl[];
  const thumbnails = flowPages.filter((p) => p.screenshot_url);

  return (
    <label
      className={`block p-3 rounded-[var(--radius-sm)] border cursor-pointer transition-colors duration-[var(--motion-fast)] ${
        mode === "flows" && selected
          ? "border-[var(--accent)] bg-[var(--accent)]/5"
          : "border-[var(--border)] hover:border-[var(--border-strong)]"
      }`}
    >
      <div className="flex items-start gap-3">
        {mode === "flows" && (
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggle(index)}
            onClick={(e) => e.stopPropagation()}
            className="mt-0.5 accent-[var(--accent)] shrink-0"
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-medium text-[var(--fg)]">{flow.name}</span>
            <span
              className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-[var(--font-mono)] font-medium ${complexityColor(flow.complexity)}`}
            >
              {flow.complexity}
            </span>
            <span className="inline-flex items-center rounded-full bg-[var(--bg)] px-1.5 py-0.5 text-[9px] font-[var(--font-mono)] text-[var(--muted)]">
              {flow.steps.length} step{flow.steps.length !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="text-[11px] text-[var(--muted)] mb-1.5">
            {flowDescription(flow)}
          </div>
          <div className="text-[10px] text-[var(--muted)] font-[var(--font-mono)] mb-2">
            {flow.steps.join(" → ")}
          </div>
          {thumbnails.length > 0 && (
            <FlowThumbnails thumbnails={thumbnails} overflow={flowPages.length > 4 ? flowPages.length - 4 : 0} />
          )}
          {thumbnails.length === 0 && flowPages.length > 0 && (
            <FlowPageLabels pages={flowPages.slice(0, 4)} />
          )}
        </div>
      </div>
    </label>
  );
}

function FlowThumbnails({ thumbnails, overflow }: { thumbnails: CapturedPageWithUrl[]; overflow: number }) {
  return (
    <div className="flex gap-1.5">
      {thumbnails.slice(0, 4).map((page, j) => (
        <div
          key={j}
          className="w-14 h-10 rounded-[var(--radius-sm)] border border-[var(--border)] overflow-hidden"
        >
          <img
            src={page.screenshot_url!}
            alt={page.title}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        </div>
      ))}
      {overflow > 0 && (
        <div className="w-14 h-10 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-elevated)] flex items-center justify-center">
          <span className="text-[9px] text-[var(--muted)]">+{overflow}</span>
        </div>
      )}
    </div>
  );
}

function FlowPageLabels({ pages }: { pages: CapturedPageWithUrl[] }) {
  return (
    <div className="flex gap-1.5">
      {pages.map((page, j) => (
        <div
          key={j}
          className="flex items-center justify-center h-6 px-2 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-elevated)]"
        >
          <span className="text-[9px] text-[var(--muted)] truncate max-w-[80px]">{page.title}</span>
        </div>
      ))}
    </div>
  );
}

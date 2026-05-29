"use client";

import { useState, useEffect } from "react";
import { useQuery } from "convex/react";
import { api, asId } from "@/lib/convex";

type ConsoleOutputProps = {
  runResultId: string;
};

type ParsedLine = {
  text: string;
  level: "info" | "warn" | "error" | "unknown";
};

const LEVEL_COLORS: Record<string, string> = {
  info: "text-[var(--accent)]",
  warn: "text-[var(--warn-text)]",
  error: "text-[var(--danger-text)]",
  unknown: "text-[var(--fg)]",
};

const LEVEL_BG: Record<string, string> = {
  info: "bg-[rgba(27,97,201,0.06)]",
  warn: "bg-[rgba(234,179,8,0.06)]",
  error: "bg-[rgba(220,38,38,0.06)]",
  unknown: "",
};

function parseLogLevel(line: string): ParsedLine["level"] {
  const upper = line.toUpperCase();
  if (/\b(INFO|LOG|DEBUG)\b/.test(upper)) return "info";
  if (/\b(WARN|WARNING)\b/.test(upper)) return "warn";
  if (/\b(ERROR|ERR|FATAL)\b/.test(upper)) return "error";
  return "unknown";
}

function parseConsoleText(text: string): ParsedLine[] {
  return text
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .map((line) => ({ text: line, level: parseLogLevel(line) }));
}

export function ConsoleOutput({ runResultId }: ConsoleOutputProps) {
  const url = useQuery(
    api.runs.queries.getConsoleLogUrl,
    { run_result_id: asId(runResultId, "run_results") },
  );
  const [lines, setLines] = useState<ParsedLine[] | null>(null);
  const [fetchError, setFetchError] = useState(false);
  const [loadedForUrl, setLoadedForUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!url) return;
    if (url === loadedForUrl) return;

    let cancelled = false;

    fetch(url)
      .then((res) => res.text())
      .then((text) => {
        if (cancelled) return;
        setLines(parseConsoleText(text));
        setLoadedForUrl(url);
        setFetchError(false);
      })
      .catch(() => {
        if (!cancelled) {
          setFetchError(true);
          setLoadedForUrl(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [url, loadedForUrl]);

  const header = (
    <span className="text-xs font-semibold text-[var(--fg)]">Console Output</span>
  );

  if (url === null) {
    return (
      <div>
        {header}
        <div className="mt-2 text-[var(--muted)] text-xs">No console log available</div>
      </div>
    );
  }

  if (url === undefined) {
    return (
      <div>
        {header}
        <div className="mt-2 text-[var(--muted)] text-xs">Loading...</div>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div>
        {header}
        <div className="mt-2 text-[var(--muted)] text-xs">Failed to load console log</div>
      </div>
    );
  }

  if (lines === null || loadedForUrl !== url) {
    return (
      <div>
        {header}
        <div className="mt-2 text-[var(--muted)] text-xs">Fetching log...</div>
      </div>
    );
  }

  if (lines.length === 0) {
    return (
      <div>
        {header}
        <div className="mt-2 text-[var(--muted)] text-xs">Console log is empty</div>
      </div>
    );
  }

  return (
    <div>
      {header}
      <div className="mt-2 bg-[var(--border-soft)] border border-[var(--border)] rounded-[var(--radius-md)] overflow-auto max-h-[240px] font-[var(--font-mono)] text-[11px]">
        {lines.map((line, i) => (
          <div
            key={i}
            className={`px-3 py-1 border-b border-[var(--border)] last:border-b-0 ${LEVEL_BG[line.level]}`}
          >
            <span className={LEVEL_COLORS[line.level]}>{line.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

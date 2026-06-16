"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { useQuery } from "convex/react";
import { api } from "@/lib/convex";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { useErrorLogger } from "@/lib/error-logger";
import { downloadFile } from "./downloadFile";
import {
  buildStoriesMarkdown,
  buildBmadStoryMarkdown,
  slugifyStoryTitle,
  type StoryExport,
} from "./exportFormatters";

type PendingFormat = "markdown" | "bmad" | null;

type ExportStoriesProps = {
  selectedIds: Set<string>;
  projectId: string;
  bmadDetected: boolean;
  projectName: string;
};

function yyyymmdd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

export function ExportStories({
  selectedIds,
  projectId,
  bmadDetected,
  projectName,
}: ExportStoriesProps) {
  const [open, setOpen] = useState(false);
  const [pendingFormat, setPendingFormat] = useState<PendingFormat>(null);
  const [emptyResultError, setEmptyResultError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const { logError } = useErrorLogger();

  const ids = Array.from(selectedIds);
  const stories = useQuery(
    api.stories.queries.getStoriesByIds,
    pendingFormat !== null ? { ids } : "skip",
  );

  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const handleMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    const firstItem = menuRef.current?.querySelector<HTMLButtonElement>(
      '[role="menuitem"]:not([disabled])',
    );
    firstItem?.focus();
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, close]);

  useEffect(() => {
    if (pendingFormat === null || stories === undefined) return;
    try {
      if (stories.length === 0) {
        setEmptyResultError(
          "No stories could be exported. The selection may have been removed.",
        );
        return;
      }
      if (pendingFormat === "markdown") {
        downloadFile(
          buildStoriesMarkdown(stories as StoryExport[]),
          `stories-export-${yyyymmdd(new Date())}.md`,
          "text/markdown;charset=utf-8;",
        );
      } else {
        const list = stories as StoryExport[];
        const built = list.map((story) => ({
          content: buildBmadStoryMarkdown(story, projectName),
          slug: slugifyStoryTitle(story.title, story._id),
          id: story._id,
        }));
        const slugCounts = new Map<string, number>();
        for (const f of built) {
          slugCounts.set(f.slug, (slugCounts.get(f.slug) ?? 0) + 1);
        }
        built.forEach((f) => {
          const disambiguated = (slugCounts.get(f.slug) ?? 0) > 1;
          const filename = disambiguated
            ? `story-${f.slug}-${f.id.slice(0, 8)}.md`
            : `story-${f.slug}.md`;
          downloadFile(f.content, filename, "text/markdown;charset=utf-8;");
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to export stories.";
      logError(msg, {
        severity: "error",
        context: {
          source: "ExportStories.download",
          projectId,
          format: pendingFormat,
        },
      });
    } finally {
      setPendingFormat(null);
    }
  }, [stories, pendingFormat, projectName, projectId, logError]);

  const handleMenuKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const items = menuRef.current?.querySelectorAll<HTMLButtonElement>(
      '[role="menuitem"]:not([disabled])',
    );
    if (!items || items.length === 0) return;
    const list = Array.from(items);
    const currentIndex = list.findIndex((item) => item === document.activeElement);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % list.length;
      list[nextIndex].focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const prevIndex = currentIndex <= 0 ? list.length - 1 : currentIndex - 1;
      list[prevIndex].focus();
    }
  };

  const handleMarkdown = () => {
    setEmptyResultError(null);
    setPendingFormat("markdown");
    setOpen(false);
  };

  const handleBmad = () => {
    setEmptyResultError(null);
    setPendingFormat("bmad");
    setOpen(false);
  };

  const exporting = pendingFormat !== null;
  const triggerDisabled = selectedIds.size === 0 || exporting;

  return (
    <div ref={containerRef} className="relative">
      <Button
        ref={triggerRef}
        variant="secondary"
        size="sm"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        disabled={triggerDisabled}
      >
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
        >
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        {exporting ? "Exporting…" : "Export"}
      </Button>
      {open && (
        <div
          ref={menuRef}
          role="menu"
          onKeyDown={handleMenuKeyDown}
          className="absolute right-0 top-full mt-1 min-w-[180px] z-10 bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-sm)] shadow-[var(--elev-raised)] py-1"
        >
          <button
            type="button"
            role="menuitem"
            onClick={handleMarkdown}
            disabled={exporting}
            className="block w-full text-left px-3 py-1.5 text-sm text-[var(--fg)] hover:bg-[var(--border-soft)] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Markdown
          </button>
          {bmadDetected && (
            <button
              type="button"
              role="menuitem"
              onClick={handleBmad}
              disabled={exporting}
              className="block w-full text-left px-3 py-1.5 text-sm text-[var(--fg)] hover:bg-[var(--border-soft)] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              BMAD Story Files
            </button>
          )}
        </div>
      )}
      {emptyResultError && <Alert variant="error">{emptyResultError}</Alert>}
    </div>
  );
}

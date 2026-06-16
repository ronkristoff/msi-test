"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import type { Doc } from "@/lib/convex";
import { Button } from "@/components/ui/Button";
import { useErrorLogger } from "@/lib/error-logger";
import { downloadFile } from "../downloadFile";
import {
  buildStoryMarkdown,
  buildBmadStoryMarkdown,
  slugifyStoryTitle,
} from "../exportFormatters";

type ExportSingleStoryProps = {
  story: Doc<"user_stories">;
  bmadDetected: boolean;
  projectName: string;
};

export function ExportSingleStory({
  story,
  bmadDetected,
  projectName,
}: ExportSingleStoryProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const { logError } = useErrorLogger();

  const showBmad = bmadDetected || !!story.technical_context;

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
    try {
      downloadFile(
        buildStoryMarkdown(story),
        `story-${slugifyStoryTitle(story.title, story._id)}.md`,
        "text/markdown;charset=utf-8;",
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to export Markdown.";
      logError(msg, {
        severity: "error",
        context: { source: "ExportSingleStory.handleMarkdown", storyId: story._id },
      });
    }
    close();
  };

  const handleBmad = () => {
    try {
      downloadFile(
        buildBmadStoryMarkdown(story, projectName),
        `story-${slugifyStoryTitle(story.title, story._id)}.md`,
        "text/markdown;charset=utf-8;",
      );
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to export BMAD story file.";
      logError(msg, {
        severity: "error",
        context: { source: "ExportSingleStory.handleBmad", storyId: story._id },
      });
    }
    close();
  };

  return (
    <div ref={containerRef} className="relative">
      <Button
        ref={triggerRef}
        variant="secondary"
        size="sm"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
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
        Export
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
            className="block w-full text-left px-3 py-1.5 text-sm text-[var(--fg)] hover:bg-[var(--border-soft)] cursor-pointer"
          >
            Markdown
          </button>
          {showBmad && (
            <button
              type="button"
              role="menuitem"
              onClick={handleBmad}
              className="block w-full text-left px-3 py-1.5 text-sm text-[var(--fg)] hover:bg-[var(--border-soft)] cursor-pointer"
            >
              BMAD Story File
            </button>
          )}
        </div>
      )}
    </div>
  );
}

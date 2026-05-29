"use client";

import { useQuery } from "convex/react";
import Image from "next/image";
import { api, asId } from "@/lib/convex";
import { Button } from "@/components/ui/Button";

type ScreenshotViewerProps = {
  storageId: string | null;
  runResultId: string;
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
};

export function ScreenshotViewer({ storageId, runResultId, hasPrev, hasNext, onPrev, onNext }: ScreenshotViewerProps) {
  const url = useQuery(
    api.runs.queries.getStepScreenshotUrl,
    storageId
      ? { storage_id: asId(storageId, "_storage"), run_result_id: asId(runResultId, "run_results") }
      : "skip",
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-[var(--fg)]">Screenshot</span>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={onPrev} disabled={!hasPrev}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Prev
          </Button>
          <Button variant="ghost" size="sm" onClick={onNext} disabled={!hasNext}>
            Next
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </Button>
        </div>
      </div>
      <div className="bg-[var(--border-soft)] border border-[var(--border)] rounded-[var(--radius-md)] overflow-hidden min-h-[200px] flex items-center justify-center">
        {!storageId ? (
          <span className="text-[var(--muted)] text-xs">No screenshot for this step</span>
        ) : url === undefined ? (
          <span className="text-[var(--muted)] text-xs">Loading...</span>
        ) : url === null ? (
          <span className="text-[var(--muted)] text-xs">Screenshot not available</span>
        ) : (
          <Image
            src={url}
            alt="Step screenshot"
            width={800}
            height={600}
            unoptimized
            className="w-full h-auto"
          />
        )}
      </div>
    </div>
  );
}

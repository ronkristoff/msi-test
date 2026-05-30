"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import Image from "next/image";
import { api, asId } from "@/lib/convex";

type ArtifactViewerProps = {
  runResultId: string;
  screenshotFileIds: string[] | null;
  videoFileId: string | null;
  traceFileId: string | null;
};

export function ArtifactViewer({ runResultId, screenshotFileIds, videoFileId, traceFileId }: ArtifactViewerProps) {
  const [selectedScreenshot, setSelectedScreenshot] = useState(0);

  const urls = useQuery(
    api.runs.queries.getResultArtifactUrls,
    { run_result_id: asId(runResultId, "run_results") },
  );

  const hasScreenshots = screenshotFileIds && screenshotFileIds.length > 0;
  const hasVideo = videoFileId !== null;
  const hasTrace = traceFileId !== null;
  const hasAny = hasScreenshots || hasVideo || hasTrace;

  if (!hasAny) return null;

  return (
    <div className="flex flex-col gap-3">
      <span className="text-xs font-semibold text-[var(--fg)]">Artifacts</span>

      {hasScreenshots && (
        <div>
          <span className="text-[11px] text-[var(--muted)] mb-1.5 block">
            Screenshots ({screenshotFileIds!.length})
          </span>
          <div className="bg-[var(--border-soft)] border border-[var(--border)] rounded-[var(--radius-md)] overflow-hidden">
            {urls === undefined ? (
              <div className="min-h-[160px] flex items-center justify-center">
                <span className="text-[var(--muted)] text-xs">Loading screenshots...</span>
              </div>
            ) : urls.screenshots.length === 0 ? (
              <div className="min-h-[160px] flex items-center justify-center">
                <span className="text-[var(--muted)] text-xs">No screenshots available</span>
              </div>
            ) : (
              <>
                <div className="relative min-h-[160px]">
                  {urls.screenshots[selectedScreenshot] ? (
                    <Image
                      src={urls.screenshots[selectedScreenshot]!}
                      alt={`Screenshot ${selectedScreenshot + 1}`}
                      width={800}
                      height={600}
                      unoptimized
                      className="w-full h-auto"
                    />
                  ) : (
                    <div className="min-h-[160px] flex items-center justify-center">
                      <span className="text-[var(--muted)] text-xs">Screenshot not available</span>
                    </div>
                  )}
                </div>
                {screenshotFileIds!.length > 1 && (
                  <div className="flex gap-1 p-2 border-t border-[var(--border)] overflow-x-auto">
                    {screenshotFileIds!.map((_, i) => (
                      <button
                        key={i}
                        onClick={() => setSelectedScreenshot(i)}
                        className={`shrink-0 w-12 h-9 rounded-[var(--radius-sm)] border text-[10px] font-[var(--font-mono)] transition-colors ${
                          i === selectedScreenshot
                            ? "border-[var(--accent)] bg-[var(--accent-subtle)] text-[var(--accent)]"
                            : "border-[var(--border)] bg-[var(--bg)] text-[var(--muted)] hover:border-[var(--fg-muted)]"
                        }`}
                      >
                        {i + 1}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {hasVideo && (
        <div>
          <span className="text-[11px] text-[var(--muted)] mb-1.5 block">Video</span>
          <div className="bg-[var(--border-soft)] border border-[var(--border)] rounded-[var(--radius-md)] overflow-hidden">
            {urls === undefined ? (
              <div className="min-h-[80px] flex items-center justify-center">
                <span className="text-[var(--muted)] text-xs">Loading video...</span>
              </div>
            ) : urls.video ? (
              <video
                src={urls.video}
                controls
                className="w-full max-h-[400px]"
                preload="metadata"
              />
            ) : (
              <div className="min-h-[80px] flex items-center justify-center">
                <span className="text-[var(--muted)] text-xs">Video not available</span>
              </div>
            )}
          </div>
        </div>
      )}

      {hasTrace && (
        <div>
          <span className="text-[11px] text-[var(--muted)] mb-1.5 block">Trace</span>
          <div className="bg-[var(--border-soft)] border border-[var(--border)] rounded-[var(--radius-md)] p-3">
            {urls === undefined ? (
              <span className="text-[var(--muted)] text-xs">Loading...</span>
            ) : urls.trace ? (
              <a
                href={urls.trace}
                download
                className="inline-flex items-center gap-1.5 text-xs text-[var(--accent)] hover:underline"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Download trace (open with{" "}
                <code className="text-[10px] bg-[var(--bg)] px-1 py-0.5 rounded-[var(--radius-sm)]">
                  npx playwright show-trace
                </code>
                )
              </a>
            ) : (
              <span className="text-[var(--muted)] text-xs">Trace not available</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

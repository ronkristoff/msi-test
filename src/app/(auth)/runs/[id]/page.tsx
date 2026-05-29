"use client";

import { useState, useCallback } from "react";
import { useQuery } from "convex/react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api, asId } from "@/lib/convex";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { StatusPill } from "@/components/ui/StatusPill";
import { Card } from "@/components/ui/Card";
import { runStatusToVariant } from "@/lib/run-status";
import { TestList } from "@/components/RunDetail/TestList";
import { StepTimeline } from "@/components/RunDetail/StepTimeline";
import { ScreenshotViewer } from "@/components/RunDetail/ScreenshotViewer";
import { ConsoleOutput } from "@/components/RunDetail/ConsoleOutput";
import { SameFailureHistory } from "@/components/RunDetail/SameFailureHistory";
import { TestMetadata } from "@/components/RunDetail/TestMetadata";

export default function RunDetailPage() {
  const params = useParams<{ id: string }>();
  const runId = asId(params.id, "runs");
  const runDetail = useQuery(api.runs.queries.getRunDetail, { run_id: runId });

  const [selectedResultId, setSelectedResultId] = useState<string | null>(null);
  const [selectedStepIndex, setSelectedStepIndex] = useState<number | null>(null);

  const handleSelectTest = useCallback((id: string) => {
    setSelectedResultId(id);
    setSelectedStepIndex(null);
  }, []);

  if (runDetail === undefined) {
    return <div className="text-[var(--muted)] text-sm">Loading...</div>;
  }

  if (runDetail === null) {
    return (
      <EmptyState
        icon={
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" />
          </svg>
        }
        title="Run not found"
        description="This run may have been deleted or you don't have access."
        action={
          <Link href="/runs">
            <Button variant="secondary">Back to Runs</Button>
          </Link>
        }
      />
    );
  }

  const isRunning = runDetail.status === "running";
  const results = runDetail.results;

  const selectedResult = results.find((r) => r._id === selectedResultId) ?? null;
  const selectedStep = selectedResult && selectedStepIndex !== null
    ? selectedResult.steps[selectedStepIndex] ?? null
    : null;

  function handleDownloadLog() {
    const logText = results
      .map((r) => {
        const header = `=== ${r.test_name} (${r.status}, ${r.duration_ms}ms) ===`;
        const steps = r.steps
          .map((s) => `  [${s.step_number}] ${s.status.toUpperCase()} ${s.command}${s.locator ? ` (${s.locator})` : ""}${s.error_message ? `\n       ERROR: ${s.error_message}` : ""} (${s.duration_ms}ms)`)
          .join("\n");
        return `${header}\n${steps}`;
      })
      .join("\n\n");

    const blob = new Blob([logText], { type: "text/plain" });
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = `run-${String(runId).slice(0, 12)}-logs.txt`;
    a.click();
    URL.revokeObjectURL(blobUrl);
  }

  return (
    <div className="flex flex-col gap-4 h-[calc(100vh-140px)]">
      <Card className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="font-[var(--font-display)] text-lg font-bold text-[var(--fg)] mb-1">
              Run Detail
            </h2>
            <div className="flex items-center gap-3 text-sm text-[var(--muted)]">
              <StatusPill variant={runStatusToVariant(runDetail.status)} showDot={isRunning}>
                {runDetail.status}
              </StatusPill>
              {runDetail.environment && (
                <span>{runDetail.environment.name} — {runDetail.environment.base_url}</span>
              )}
              {runDetail.trigger_type && (
                <span className="uppercase text-[10px] tracking-[0.05em]">
                  {runDetail.trigger_type}
                </span>
              )}
              {runDetail.duration_ms != null && runDetail.duration_ms > 0 && (
                <span>{(runDetail.duration_ms / 1000).toFixed(1)}s</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={handleDownloadLog} disabled={results.length === 0}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Download Logs
            </Button>
            {isRunning && (
              <svg className="animate-spin h-5 w-5 text-[var(--accent)]" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
          </div>
        </div>
      </Card>

      {results.length === 0 ? (
        <EmptyState
          icon={
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
          }
          title="No results yet"
          description={isRunning ? "Tests are executing..." : "No test results available for this run."}
        />
      ) : (
        <div className="flex gap-4 flex-1 min-h-0">
          <div className="w-[320px] shrink-0 flex flex-col">
            <div className="px-4 pt-3 pb-2 border-b border-[var(--border)]">
              <span className="text-xs font-semibold text-[var(--fg)]">
                Tests ({results.length})
              </span>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              <TestList
                tests={results}
                selectedId={selectedResultId}
                onSelect={handleSelectTest}
              />
            </div>
          </div>

          <div className="flex-1 min-w-0 overflow-y-auto">
            {!selectedResult ? (
              <div className="h-full flex items-center justify-center">
                <span className="text-[var(--muted)] text-sm">Select a test to view details</span>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <Card>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-[var(--fg)]">{selectedResult.test_name}</h3>
                    <div className="flex items-center gap-2">
                      <StatusPill variant={runStatusToVariant(selectedResult.status)} showDot={true}>
                        {selectedResult.status}
                      </StatusPill>
                      <span className="text-xs text-[var(--muted)] font-[var(--font-mono)]">
                        {selectedResult.duration_ms}ms
                      </span>
                    </div>
                  </div>
                  <StepTimeline
                    steps={selectedResult.steps}
                    selectedIndex={selectedStepIndex}
                    onSelect={setSelectedStepIndex}
                  />
                </Card>

                {selectedStep && (
                  <Card>
                    <ScreenshotViewer
                      storageId={selectedStep.screenshot_file_id ?? null}
                      runResultId={selectedResult._id}
                      hasPrev={selectedStepIndex !== null && selectedStepIndex > 0}
                      hasNext={
                        selectedStepIndex !== null &&
                        selectedStepIndex < selectedResult.steps.length - 1
                      }
                      onPrev={() =>
                        setSelectedStepIndex((i) => (i !== null && i > 0 ? i - 1 : i))
                      }
                      onNext={() =>
                        setSelectedStepIndex((i) =>
                          i !== null && i < selectedResult.steps.length - 1 ? i + 1 : i,
                        )
                      }
                    />
                    {selectedStep.error_message && (
                      <div className="mt-3 px-3 py-2 bg-[rgba(220,38,38,0.06)] border border-[rgba(220,38,38,0.2)] rounded-[var(--radius-sm)]">
                        <span className="text-xs font-[var(--font-mono)] text-[var(--danger-text)]">
                          {selectedStep.error_message}
                        </span>
                      </div>
                    )}
                  </Card>
                )}

                <Card>
                  <ConsoleOutput runResultId={selectedResult._id} />
                </Card>

                <div className="grid grid-cols-2 gap-4">
                  <Card>
                    <TestMetadata result={selectedResult} run={runDetail} />
                  </Card>
                  <Card>
                    <SameFailureHistory
                      testId={selectedResult.test_id}
                      currentRunId={String(runId)}
                    />
                  </Card>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

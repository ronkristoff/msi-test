"use client";

import { useState, useCallback } from "react";
import { useQuery, useAction } from "convex/react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api, asId } from "@/lib/convex";
import type { Id } from "@/lib/convex";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { StatusPill } from "@/components/ui/StatusPill";
import { Card } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";
import { runStatusToVariant } from "@/lib/run-status";
import { TestList } from "@/components/RunDetail/TestList";
import { StepTimeline } from "@/components/RunDetail/StepTimeline";
import { ScreenshotViewer } from "@/components/RunDetail/ScreenshotViewer";
import { ArtifactViewer } from "@/components/RunDetail/ArtifactViewer";
import { ConsoleOutput } from "@/components/RunDetail/ConsoleOutput";
import { SameFailureHistory } from "@/components/RunDetail/SameFailureHistory";
import { HealingHistoryTimeline } from "@/components/RunDetail/HealingHistoryTimeline";
import { TestMetadata } from "@/components/RunDetail/TestMetadata";
import { hasAiConfig } from "@/lib/ai-presets";
import { useErrorLogger } from "@/lib/error-logger";
import { RunDetailSkeleton } from "@/components/ui/Skeleton";

export default function RunDetailPage() {
  const params = useParams<{ id: string }>();
  const { logError } = useErrorLogger();
  const runId = asId(params.id, "runs");
  const runDetail = useQuery(api.runs.queries.getRunDetail, { run_id: runId });
  const workspace = useQuery(api.workspaces.queries.getWorkspaceForUser);

  const [selectedResultId, setSelectedResultId] = useState<string | null>(null);
  const [selectedStepIndex, setSelectedStepIndex] = useState<number | null>(null);
  const [healingTestId, setHealingTestId] = useState<string | null>(null);
  const [healSuccessId, setHealSuccessId] = useState<string | null>(null);
  const [healAllRunning, setHealAllRunning] = useState(false);
  const [healAllError, setHealAllError] = useState<string | null>(null);
  const [healAllResults, setHealAllResults] = useState<string | null>(null);
  const [healHint, setHealHint] = useState("");

  const healTestAction = useAction(api.ai.healTest.healTest);
  const healAllFailedAction = useAction(api.ai.healTest.healAllFailed);

  const aiConfigReady = hasAiConfig(workspace);
  const failedCount = runDetail?.results?.filter((r) => r.status === "failed").length ?? 0;

  const handleSelectTest = useCallback((id: string) => {
    setSelectedResultId(id);
    setSelectedStepIndex(null);
  }, []);

  const handleHealTest = async (testId: string, errorMessage: string) => {
    setHealingTestId(testId);
    setHealSuccessId(null);
    try {
      await healTestAction({
        test_id: testId as Id<"tests">,
        error_message: errorMessage,
        user_hint: healHint.trim() || undefined,
      });
      setHealSuccessId(testId);
      setHealHint("");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Healing failed";
      logError(msg, { severity: "error", context: { source: "RunDetailPage.handleHealTest" } });
    } finally {
      setHealingTestId(null);
    }
  };

  const handleHealAll = async () => {
    setHealAllRunning(true);
    setHealAllError(null);
    setHealAllResults(null);
    try {
      const results = await healAllFailedAction({ run_id: runId as Id<"runs"> });
      const succeeded = results.filter((r: { success: boolean }) => r.success).length;
      const failed = results.filter((r: { success: boolean }) => !r.success).length;
      setHealAllResults(`${succeeded} of ${results.length} test${results.length > 1 ? "s" : ""} healed. Each is saved as draft for review before re-running.${failed > 0 ? ` ${failed} failed to heal.` : ""}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Heal all failed";
      setHealAllError(msg);
      logError(msg, { severity: "error", context: { source: "RunDetailPage.handleHealAll" } });
    } finally {
      setHealAllRunning(false);
    }
  };

  if (runDetail === undefined) {
    return <RunDetailSkeleton />;
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
    const parts: string[] = [];

    if (runDetail.error_message) {
      parts.push(`=== RUNNER ERROR ===`);
      parts.push(runDetail.error_message);
      parts.push("");
    }

    const logText = results
      .map((r) => {
        const header = `=== ${r.test_name} (${r.status}, ${r.duration_ms}ms) ===`;
        const errSection = r.error_message ? `  ERROR: ${r.error_message}` : "";
        const steps = r.steps
          .map((s) => `  [${s.step_number}] ${s.status.toUpperCase()} ${s.command}${s.locator ? ` (${s.locator})` : ""}${s.error_message ? `\n       ERROR: ${s.error_message}` : ""} (${s.duration_ms}ms)`)
          .join("\n");
        return [header, errSection, steps].filter(Boolean).join("\n");
      })
      .join("\n\n");

    parts.push(logText);

    const blob = new Blob([parts.join("\n\n")], { type: "text/plain" });
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = `run-${String(runId).slice(0, 12)}-logs.txt`;
    a.click();
    URL.revokeObjectURL(blobUrl);
  }

  return (
    <div className="flex flex-col gap-4 h-[calc(100vh-140px)] max-md:h-auto">
      <Card className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              {runDetail.project && (
                <Link
                  href={`/projects/${runDetail.project._id}`}
                  className="text-sm text-[var(--muted)] hover:text-[var(--accent)] transition-colors"
                >
                  {runDetail.project.name}
                </Link>
              )}
              {runDetail.project && runDetail.suite && (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[var(--muted)]">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              )}
              {runDetail.suite && (
                <Link
                  href={`/projects/${runDetail.project_id}/suites/${runDetail.suite._id}`}
                  className="text-sm text-[var(--muted)] hover:text-[var(--accent)] transition-colors"
                >
                  {runDetail.suite.name}
                </Link>
              )}
            </div>
            <h2 className="font-[var(--font-display)] text-lg font-bold text-[var(--fg)]">
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
            {aiConfigReady && failedCount > 0 && runDetail.status !== "running" && (
              <Button
                variant="secondary"
                size="sm"
                onClick={handleHealAll}
                disabled={healAllRunning}
              >
                {healAllRunning ? (
                  <>
                    <svg className="animate-spin h-3 w-3 mr-1" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Healing...
                  </>
                ) : `Heal All Failed (${failedCount})`}
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={handleDownloadLog} disabled={results.length === 0 && !runDetail.error_message}>
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

      {runDetail.error_message && (
        <Card className="p-4">
          <div className="flex items-start gap-3">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--danger-text)" strokeWidth="2" className="shrink-0 mt-0.5">
              <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
            </svg>
            <div>
              <h4 className="text-sm font-semibold text-[var(--danger-text)] mb-1">Runner Error</h4>
              <p className="text-sm text-[var(--fg)] font-[var(--font-mono)] break-all">{runDetail.error_message}</p>
            </div>
          </div>
        </Card>
      )}

      {healAllError && (
        <Card className="p-4">
          <Alert variant="error">{healAllError}</Alert>
        </Card>
      )}

      {healAllResults && (
        <Card className="p-4">
          <div className="flex items-center justify-between gap-3">
            <Alert variant="success" className="flex-1">{healAllResults}</Alert>
            {runDetail.suite && (
              <Link href={`/projects/${runDetail.project_id}/suites/${runDetail.suite._id}`}>
                <Button variant="secondary" size="sm">View in Suite</Button>
              </Link>
            )}
          </div>
        </Card>
      )}

      {results.length === 0 ? (
        <EmptyState
          icon={
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
          }
          title="No results yet"
          description={isRunning ? "Tests are executing. Results will appear as they complete." : "No test results available for this run."}
        />
      ) : (
        <div className="flex gap-4 flex-1 min-h-0 max-md:flex-col max-md:flex-auto">
          <div className="w-[320px] shrink-0 flex flex-col max-md:w-full">
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
                <span className="text-[var(--muted)] text-sm">Select a test to inspect steps, screenshots, and logs.</span>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <Card>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <h3 className="text-sm font-semibold text-[var(--fg)] truncate">{selectedResult.test_name}</h3>
                      {selectedResult.suite_id && (
                        <Link
                          href={`/projects/${runDetail.project_id}/suites/${selectedResult.suite_id}`}
                          className="text-[11px] font-[var(--font-mono)] text-[var(--link)] hover:underline shrink-0"
                        >
                          View in Suite
                        </Link>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
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
                  {selectedResult.error_message && (
                    <div className="mt-3">
                      <div className="px-3 py-2 bg-[rgba(220,38,38,0.06)] border border-[rgba(220,38,38,0.2)] rounded-[var(--radius-sm)]">
                        <span className="text-xs font-[var(--font-mono)] text-[var(--danger-text)] whitespace-pre-wrap break-all">
                          {selectedResult.error_message}
                        </span>
                      </div>
                      {aiConfigReady && selectedResult.status === "failed" && (
                        <div className="mt-2 space-y-2">
                          <input
                            type="text"
                            value={healHint}
                            onChange={(e) => setHealHint(e.target.value)}
                            placeholder="Describe what's wrong..."
                            disabled={healingTestId === selectedResult.test_id}
                            className="w-full max-w-[400px] text-sm bg-[var(--surface)] text-[var(--fg)] border border-[var(--border)] rounded-[var(--radius-sm)] px-2.5 py-1.5 placeholder:text-[var(--muted)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)] disabled:opacity-50"
                          />
                          <div className="flex items-center gap-2">
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => handleHealTest(selectedResult.test_id, selectedResult.error_message ?? "")}
                              disabled={healingTestId === selectedResult.test_id}
                            >
                              {healingTestId === selectedResult.test_id ? (
                                <>
                                  <svg className="animate-spin h-3 w-3 mr-1" viewBox="0 0 24 24" fill="none">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                  </svg>
                                  Healing...
                                </>
                              ) : "AI Heal"}
                            </Button>
                          {healSuccessId === selectedResult.test_id && (
                            <span className="text-xs text-[var(--success-text)]">
                              Healed and saved as draft.
                              {selectedResult.suite_id && (
                                <Link
                                  href={`/projects/${runDetail.project_id}/suites/${selectedResult.suite_id}`}
                                  className="text-[var(--link)] hover:underline ml-1"
                                >
                                  Review in suite
                                </Link>
                              )}
                            </span>
                          )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
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

                <Card className="p-4">
                  <ArtifactViewer
                    runResultId={selectedResult._id}
                    screenshotFileIds={selectedResult.screenshot_file_ids ?? null}
                    videoFileId={selectedResult.video_file_id ?? null}
                    traceFileId={selectedResult.trace_file_id ?? null}
                  />
                </Card>

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

                <Card>
                  <HealingHistoryTimeline testId={selectedResult.test_id} />
                </Card>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

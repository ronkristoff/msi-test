"use client";

import { useState } from "react";
import { useQuery, useAction } from "convex/react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api, asId } from "@/lib/convex";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { PageSkeleton } from "@/components/ui/Skeleton";
import { useErrorLogger } from "@/lib/error-logger";
import { DriftReportViewer } from "./DriftReportViewer";
import { ExportDriftReport } from "./ExportDriftReport";

export default function DriftReportPage() {
  const params = useParams<{ id: string }>();
  const { logError } = useErrorLogger();
  const projectId = asId(params.id, "projects");

  const driftReport = useQuery(api.knowledge.queries.getDriftReport, {
    project_id: projectId,
  });
  const oldRd = useQuery(api.knowledge.queries.getOldRd, {
    project_id: projectId,
  });
  const kb = useQuery(api.knowledge.queries.getKnowledgeBase, {
    project_id: projectId,
  });
  const baselineRd = useQuery(api.knowledge.queries.getBaselineRd, {
    project_id: projectId,
  });
  const triggerDriftReport = useAction(
    api.knowledge.triggerIngestion.triggerDriftReport,
  );

  const [isRegenerating, setIsRegenerating] = useState(false);
  const [regenerateError, setRegenerateError] = useState<string | null>(null);

  const hasOldRd = oldRd?.has_old_rd === true;
  const kbReady = kb?.status === "ready";

  const handleRegenerate = async () => {
    setRegenerateError(null);
    setIsRegenerating(true);
    try {
      const result = await triggerDriftReport({ project_id: projectId });
      if (result && result.driftReportId === null && "error" in result && result.error) {
        setRegenerateError(result.error);
      }
    } catch (err) {
      const msg = err instanceof Error
        ? err.message.replace(/^Uncaught ConvexError:\s*/, "")
        : "Failed to regenerate Drift Report";
      setRegenerateError(msg);
      logError(msg, {
        severity: "error",
        context: { source: "DriftReportPage.handleRegenerate" },
      });
    } finally {
      setIsRegenerating(false);
    }
  };

  if (driftReport === undefined || oldRd === undefined || kb === undefined || baselineRd === undefined) {
    return <PageSkeleton />;
  }

  const isFailedReport = driftReport !== null && driftReport.status === "failed";
  const isStale =
    hasOldRd &&
    driftReport !== null &&
    !isFailedReport &&
    baselineRd !== null &&
    driftReport.baseline_rd_id !== baselineRd._id;

  return (
    <div className="max-w-[1080px]">
      <div className="mb-6">
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="font-[var(--font-display)] text-2xl font-bold text-[var(--fg)]">
            Drift Report
          </h2>
          <Link href={`/projects/${params.id}/knowledge`} className="ml-auto">
            <Button variant="secondary" size="sm">
              <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
              </svg>
              Back to Knowledge Base
            </Button>
          </Link>
        </div>
      </div>

      {!hasOldRd && (
        <EmptyState
          icon={
            <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" />
            </svg>
          }
          title="No Old Requirements Document"
          description="A Drift Report compares an uploaded Old Requirements Document against the current codebase. Upload an Old RD in project settings to enable drift detection."
          action={
            <Link href={`/projects/${params.id}/settings`}>
              <Button variant="secondary">Project Settings</Button>
            </Link>
          }
        />
      )}

      {hasOldRd && driftReport === null && (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] p-6 shadow-[var(--elev-raised)]">
          <div className="flex items-center gap-3 mb-2">
            <svg aria-hidden="true" className="animate-spin h-5 w-5 text-[var(--accent)]" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <h3 className="font-[var(--font-display)] text-lg font-bold text-[var(--fg)]">
              Generating Drift Report
            </h3>
          </div>
          <p className="text-sm text-[var(--muted)] mb-4">
            {kbReady
              ? "The Drift Report is being generated. This typically takes a minute."
              : "The Knowledge Base must be ready before a Drift Report can be generated."}
          </p>
          <Button onClick={handleRegenerate} disabled={isRegenerating || !kbReady} variant="secondary">
            {isRegenerating ? "Generating..." : "Regenerate"}
          </Button>
        </div>
      )}

      {hasOldRd && isFailedReport && (
        <div className="flex flex-col gap-4">
          {regenerateError && (
            <Alert variant="error">
              {regenerateError}
            </Alert>
          )}
          <Alert variant="error">
            <div className="flex flex-col gap-3">
              <div>
                <strong>Drift Report generation failed.</strong>
                <p className="mt-1 text-sm opacity-90">
                  {driftReport.generation_error ?? "An unexpected error occurred during generation."}
                </p>
              </div>
              <div>
                <Button onClick={handleRegenerate} disabled={isRegenerating || !kbReady} variant="secondary" size="sm">
                  {isRegenerating ? "Regenerating..." : "Regenerate"}
                </Button>
              </div>
            </div>
          </Alert>
        </div>
      )}

      {regenerateError && !isFailedReport && (
        <Alert variant="error" className="mb-4">
          {regenerateError}
        </Alert>
      )}

      {hasOldRd && driftReport !== null && !isFailedReport && (
        <>
          {isStale && (
            <div
              role="alert"
              className="p-3 rounded-[var(--radius-sm)] border text-sm bg-[rgba(234,179,8,0.06)] border-[rgba(234,179,8,0.2)] text-[var(--warn-text)] mb-4"
            >
              This Drift Report is based on an older version of the Baseline RD (v{driftReport.version}).
              Regenerate to compare against the current RD (v{baselineRd?.version}).
            </div>
          )}
          <div className="flex justify-end mb-4 gap-2">
            <ExportDriftReport report={driftReport} baselineRdVersion={baselineRd?.version} />
            <Button onClick={handleRegenerate} disabled={isRegenerating || !kbReady} variant="secondary" size="sm">
              {isRegenerating ? (
                <>
                  <svg aria-hidden="true" className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Regenerating...
                </>
              ) : (
                <>
                  <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M23 4v6h-6" /><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10" />
                  </svg>
                  Regenerate
                </>
              )}
            </Button>
          </div>
          <DriftReportViewer report={driftReport} />
        </>
      )}
    </div>
  );
}

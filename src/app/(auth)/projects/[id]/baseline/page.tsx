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
import { BaselineRdViewer } from "./BaselineRdViewer";

export default function BaselineRdPage() {
  const params = useParams<{ id: string }>();
  const { logError } = useErrorLogger();
  const projectId = asId(params.id, "projects");

  const baselineRd = useQuery(api.knowledge.queries.getBaselineRd, { project_id: projectId });
  const kb = useQuery(api.knowledge.queries.getKnowledgeBase, { project_id: projectId });
  const triggerBaselineRd = useAction(api.knowledge.triggerIngestion.triggerBaselineRd);

  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  const kbReady = kb?.status === "ready";

  const handleGenerate = async () => {
    setGenerateError(null);
    setIsGenerating(true);
    try {
      const result = await triggerBaselineRd({ project_id: projectId });
      if (
        result &&
        result.baselineRdId === null &&
        "error" in result &&
        result.error
      ) {
        setGenerateError(result.error);
      }
    } catch (err) {
      const msg = err instanceof Error
        ? err.message.replace(/^Uncaught ConvexError:\s*/, "")
        : "Failed to generate Baseline RD.";
      setGenerateError(msg);
      logError(msg, {
        severity: "error",
        context: { source: "BaselineRdPage.handleGenerate" },
      });
    } finally {
      setIsGenerating(false);
    }
  };

  if (baselineRd === undefined || kb === undefined) {
    return <PageSkeleton />;
  }

  if (kb === null || kb.status !== "ready") {
    return (
      <div className="max-w-[1080px]">
        <EmptyState
          icon={
            <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
          }
          title="Knowledge Base required"
          description="The Knowledge Base must be built before a Baseline Requirements Document can be generated or viewed."
          action={
            <Link href={`/projects/${params.id}/knowledge`}>
              <Button variant="secondary">Go to Knowledge Base</Button>
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="max-w-[1080px]">
      <div className="mb-6">
        <div className="flex items-center gap-3 flex-wrap">
          <Link href={`/projects/${params.id}/knowledge`} className="ml-auto">
            <Button variant="secondary" size="sm">
              <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="19" y1="12" x2="5" y2="12" />
                <polyline points="12 19 5 12 12 5" />
              </svg>
              Back to Knowledge Base
            </Button>
          </Link>
        </div>
      </div>

      {baselineRd === null && (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] p-6 shadow-[var(--elev-raised)]">
          <div className="flex items-center gap-3 mb-2">
            <h3 className="font-[var(--font-display)] text-lg font-bold text-[var(--fg)]">
              No Baseline Requirements Document
            </h3>
          </div>
          <p className="text-sm text-[var(--muted)] mb-4">
            Generate a Baseline RD from the current Knowledge Base. This typically takes a minute.
          </p>
          {generateError && (
            <Alert variant="error" className="mb-4">
              {generateError}
            </Alert>
          )}
          <Button onClick={handleGenerate} disabled={isGenerating || !kbReady}>
            {isGenerating ? (
              <>
                <svg aria-hidden="true" className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Generating...
              </>
            ) : (
              "Generate Baseline RD"
            )}
          </Button>
        </div>
      )}

      {baselineRd !== null && <BaselineRdViewer rd={baselineRd} bmadDetected={kb?.bmad_detected === true} />}
    </div>
  );
}

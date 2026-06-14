"use client";

import { useState } from "react";
import { useQuery, useAction } from "convex/react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api, asId } from "@/lib/convex";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { StatusPill } from "@/components/ui/StatusPill";
import { Alert } from "@/components/ui/Alert";
import { PageSkeleton } from "@/components/ui/Skeleton";
import { useErrorLogger } from "@/lib/error-logger";
import { KnowledgeBuilding } from "./KnowledgeBuilding";
import { KnowledgeReady } from "./KnowledgeReady";
import { KnowledgeError } from "./KnowledgeError";
import { DeclaredIntent } from "./DeclaredIntent";
import type { ModuleItem } from "./KnowledgeModuleList";

export default function KnowledgePage() {
  const params = useParams<{ id: string }>();
  const { logError } = useErrorLogger();
  const projectId = asId(params.id, "projects");

  const kb = useQuery(api.knowledge.queries.getKnowledgeBase, {
    project_id: projectId,
  });
  const modules = useQuery(
    api.knowledge.queries.getModules,
    kb && kb.status === "ready" ? { knowledge_base_id: kb._id } : "skip",
  );
  const bmadDetected = kb?.bmad_detected;
  const bmadMetadata = useQuery(
    api.knowledge.queries.getBmadMetadata,
    bmadDetected && kb && kb.status === "ready"
      ? { knowledge_base_id: kb._id }
      : "skip",
  );
  const triggerIngestion = useAction(
    api.knowledge.triggerIngestion.triggerIngestion,
  );
  const resyncKnowledgeBase = useAction(
    api.knowledge.triggerIngestion.resyncKnowledgeBase,
  );
  const [isResyncing, setIsResyncing] = useState(false);
  const [resyncError, setResyncError] = useState<string | null>(null);

  const handleRetry = async () => {
    try {
      await triggerIngestion({ project_id: projectId });
    } catch (err) {
      const msg = err instanceof Error
        ? err.message.replace(/^Uncaught ConvexError:\s*/, "")
        : "Failed to retry analysis";
      logError(msg, {
        severity: "error",
        context: { source: "KnowledgePage.handleRetry" },
      });
      throw err;
    }
  };

  const handleResync = async () => {
    const confirmed = window.confirm(
      "Re-syncing will replace all current Knowledge Base data. Continue?",
    );
    if (!confirmed) return;

    setResyncError(null);
    setIsResyncing(true);
    try {
      await resyncKnowledgeBase({ project_id: projectId });
    } catch (err) {
      const msg = err instanceof Error
        ? err.message.replace(/^Uncaught ConvexError:\s*/, "")
        : "Failed to start re-sync";
      setResyncError(msg);
      logError(msg, {
        severity: "error",
        context: { source: "KnowledgePage.handleResync" },
      });
    } finally {
      setIsResyncing(false);
    }
  };

  if (kb === undefined) {
    return <PageSkeleton />;
  }

  if (kb === null) {
    return (
      <div className="max-w-[1080px]">
        <EmptyState
          icon={
            <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z" /><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z" />
            </svg>
          }
          title="Not Analyzed"
          description="Connect a repository and trigger analysis to build a knowledge base for this project."
          action={
            <Link href={`/projects/${params.id}/settings`}>
              <Button variant="secondary">Project Settings</Button>
            </Link>
          }
        />
      </div>
    );
  }

  const statusPillMap = {
    building: { variant: "running" as const, label: "Building" },
    ready: { variant: "success" as const, label: "Ready" },
    error: { variant: "danger" as const, label: "Error" },
  };
  const pill = statusPillMap[kb.status] ?? { variant: "neutral" as const, label: "Unknown" };

  return (
    <div className="max-w-[1080px]">
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <h2 className="font-[var(--font-display)] text-2xl font-bold text-[var(--fg)]">
            Knowledge Base
          </h2>
          <StatusPill variant={pill.variant}>{pill.label}</StatusPill>
          {bmadDetected && (
            <span className="inline-flex items-center px-2.5 py-1 rounded-[var(--radius-pill)] bg-[var(--accent)]/10 text-[var(--accent)] font-[var(--font-mono)] text-xs font-semibold">
              BMAD Detected
            </span>
          )}
          <Link href={`/projects/${params.id}`} className="ml-auto">
            <Button variant="secondary" size="sm">
              <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
              </svg>
              Back to Project
            </Button>
          </Link>
        </div>
      </div>

      {kb.status === "building" && (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] shadow-[var(--elev-raised)]">
          <KnowledgeBuilding progressMessage={kb.progress_message ?? null} />
        </div>
      )}

      {kb.status === "ready" && Array.isArray(modules) && (
        <>
          {resyncError && (
            <Alert variant="error" className="mb-4">
              {resyncError}
            </Alert>
          )}
          {bmadDetected && bmadMetadata && (
            <div className="mb-4">
              <DeclaredIntent metadata={bmadMetadata} />
            </div>
          )}
          <KnowledgeReady
            kb={kb}
            modules={modules as ModuleItem[]}
            projectId={params.id}
            onResync={handleResync}
            isResyncing={isResyncing}
          />
        </>
      )}

      {kb.status === "ready" && !Array.isArray(modules) && <PageSkeleton />}

      {kb.status === "error" && (
        <KnowledgeError
          errorMessage={kb.error_message ?? null}
          projectId={params.id}
          onRetry={handleRetry}
        />
      )}
    </div>
  );
}

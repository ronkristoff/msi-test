"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/lib/convex";
import type { Doc } from "@/lib/convex";
import { Button } from "@/components/ui/Button";
import { StatusPill } from "@/components/ui/StatusPill";
import { useErrorLogger } from "@/lib/error-logger";
import { BaselineRdSection } from "./BaselineRdSection";
import { ExportBaselineRd } from "./ExportBaselineRd";

type BaselineRdViewerProps = {
  rd: Doc<"baseline_rds">;
  bmadDetected: boolean;
};

function formatTime(ms: number): string {
  return new Date(ms).toLocaleString();
}

export function BaselineRdViewer({ rd, bmadDetected }: BaselineRdViewerProps) {
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [editingDirty, setEditingDirty] = useState(false);
  const [transitionError, setTransitionError] = useState<string | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const updateBaselineRd = useMutation(api.knowledge.baselineRdMutations.updateBaselineRd);
  const { logError } = useErrorLogger();

  const handleEnterEdit = (sectionId: string) => {
    if (editingSectionId !== null && editingSectionId !== sectionId && editingDirty) {
      const confirmed = typeof window !== "undefined" &&
        window.confirm("Discard unsaved changes in the current section?");
      if (!confirmed) return;
    }
    setEditingSectionId(sectionId);
    setEditingDirty(false);
  };

  const handleExitEdit = () => {
    setEditingSectionId(null);
    setEditingDirty(false);
  };

  const runStatusTransition = async (status: "draft" | "approved") => {
    setTransitionError(null);
    setIsTransitioning(true);
    try {
      await updateBaselineRd({ rd_id: rd._id, status });
    } catch (err) {
      const msg = err instanceof Error
        ? err.message.replace(/^Uncaught ConvexError:\s*/, "")
        : "Failed to update Baseline RD status.";
      setTransitionError(msg);
      logError(msg, {
        severity: "error",
        context: { source: "BaselineRdViewer.runStatusTransition", targetStatus: status },
      });
    } finally {
      setIsTransitioning(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] shadow-[var(--elev-raised)] px-5 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-[var(--font-display)] text-2xl font-bold text-[var(--fg)]">
            Baseline RD
          </h2>
          <span className="font-[var(--font-mono)] text-xs text-[var(--muted)]">
            v{rd.version}
          </span>
          <StatusPill variant={rd.status === "approved" ? "success" : "neutral"}>
            {rd.status === "approved" ? "Approved" : "Draft"}
          </StatusPill>
          <div className="ml-auto flex items-center gap-2">
            <ExportBaselineRd rd={rd} bmadDetected={bmadDetected} />
            {rd.status === "draft" && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => runStatusTransition("approved")}
                disabled={isTransitioning}
              >
                Approve
              </Button>
            )}
            {rd.status === "approved" && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => runStatusTransition("draft")}
                disabled={isTransitioning}
              >
                Mark as Draft
              </Button>
            )}
          </div>
        </div>
        <div className="mt-2 text-xs text-[var(--muted)] font-[var(--font-mono)]">
          <span>Generated {formatTime(rd.generated_at)}</span>
          {rd.updated_at !== undefined && (
            <span className="ml-3">Edited {formatTime(rd.updated_at)}</span>
          )}
        </div>
        {transitionError && (
          <div role="alert" className="mt-3 p-2 rounded-[var(--radius-sm)] border border-[rgba(220,38,38,0.2)] bg-[rgba(220,38,38,0.06)] text-[var(--danger)] text-sm">
            {transitionError}
          </div>
        )}
      </div>

      {rd.sections.map((section) => (
        <BaselineRdSection
          key={section.id}
          section={section}
          rdId={rd._id}
          isEditing={editingSectionId === section.id}
          onEnterEdit={() => handleEnterEdit(section.id)}
          onExitEdit={handleExitEdit}
          onDirtyChange={setEditingDirty}
        />
      ))}
    </div>
  );
}

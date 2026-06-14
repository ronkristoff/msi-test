"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/lib/convex";
import type { Id } from "@/lib/convex";
import { Button } from "@/components/ui/Button";
import { StatusPill } from "@/components/ui/StatusPill";
import { Alert } from "@/components/ui/Alert";
import { useErrorLogger } from "@/lib/error-logger";
import {
  confidenceVariant,
  confidenceLabel,
  alignmentLabel,
  type RdSection,
} from "./baselineRdHelpers";

type BaselineRdSectionProps = {
  section: RdSection;
  rdId?: Id<"baseline_rds">;
  isEditing: boolean;
  onEnterEdit: () => void;
  onExitEdit: () => void;
  onDirtyChange?: (dirty: boolean) => void;
};

const textareaBaseClass =
  "w-full px-3 py-[9px] border rounded-[var(--radius-sm)] text-sm bg-[var(--surface)] text-[var(--fg)] outline-none focus:border-[var(--accent)] focus:shadow-[var(--focus-ring)] transition-all duration-[var(--motion-fast)] placeholder:text-[var(--muted)] resize-y min-h-[240px] font-[var(--font-mono)] border-[var(--border)]";

export function BaselineRdSection({
  section,
  rdId,
  isEditing,
  onEnterEdit,
  onExitEdit,
  onDirtyChange,
}: BaselineRdSectionProps) {
  const [localContent, setLocalContent] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const updateBaselineRd = useMutation(api.knowledge.baselineRdMutations.updateBaselineRd);
  const { logError } = useErrorLogger();

  const isDirty = localContent !== null && localContent !== section.content;
  const displayContent = localContent ?? section.content;

  const handleEnterEdit = () => {
    setLocalContent(section.content);
    setSaveError(null);
    onDirtyChange?.(false);
    onEnterEdit();
  };

  const handleDiscard = () => {
    setLocalContent(null);
    setSaveError(null);
    onDirtyChange?.(false);
    onExitEdit();
  };

  const handleSave = async () => {
    if (!rdId || localContent === null) return;
    setSaveError(null);
    setIsSaving(true);
    try {
      await updateBaselineRd({
        rd_id: rdId,
        section_updates: [{ id: section.id, content: localContent }],
      });
      setLocalContent(null);
      onDirtyChange?.(false);
      onExitEdit();
    } catch (err) {
      const msg = err instanceof Error
        ? err.message.replace(/^Uncaught ConvexError:\s*/, "")
        : "Failed to save section.";
      setSaveError(msg);
      logError(msg, {
        severity: "error",
        context: { source: "BaselineRdSection.handleSave", sectionId: section.id },
      });
    } finally {
      setIsSaving(false);
    }
  };

  const variant = confidenceVariant(section.confidence);

  if (isEditing) {
    return (
      <div
        className="bg-[var(--surface)] border border-[var(--accent)] rounded-[var(--radius-md)] shadow-[var(--elev-raised)]"
        data-section-id={section.id}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-soft)]">
          <h3 className="font-[var(--font-display)] text-lg font-bold text-[var(--fg)]">
            {section.title}
          </h3>
          <StatusPill variant={variant}>{confidenceLabel(section.confidence)}</StatusPill>
        </div>
        <div className="px-5 py-4">
          <textarea
            className={textareaBaseClass}
            value={displayContent}
            onChange={(e) => {
              const next = e.target.value;
              setLocalContent(next);
              onDirtyChange?.(next !== section.content);
            }}
            spellCheck={false}
            aria-label={`Edit ${section.title}`}
          />
          {saveError && (
            <Alert variant="error" className="mt-3">
              {saveError}
            </Alert>
          )}
          <div className="flex items-center gap-2 mt-3">
            <Button
              variant="primary"
              size="sm"
              onClick={handleSave}
              disabled={!isDirty || isSaving}
            >
              Save
            </Button>
            <Button variant="ghost" size="sm" onClick={handleDiscard}>
              Discard
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] shadow-[var(--elev-raised)]"
      data-section-id={section.id}
    >
      <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-soft)]">
        <h3 className="font-[var(--font-display)] text-lg font-bold text-[var(--fg)]">
          {section.title}
        </h3>
        <div className="flex items-center gap-2">
          {section.bmad_alignment && (
            <span className="inline-flex items-center px-2 py-[3px] rounded-[var(--radius-pill)] font-[var(--font-mono)] text-[11px] font-semibold tracking-[0.02em] leading-none bg-[var(--border-soft)] text-[var(--muted)] border border-[var(--border)]">
              {alignmentLabel(section.bmad_alignment.agreement)}
            </span>
          )}
          <StatusPill variant={variant}>{confidenceLabel(section.confidence)}</StatusPill>
        </div>
      </div>
      <div className="px-5 py-4">
        <div className="text-sm text-[var(--fg)] leading-relaxed whitespace-pre-wrap font-[var(--font-mono)] text-[13px]">
          {section.content}
        </div>
        {section.divergence_note && (
          <p className="mt-3 text-xs text-[var(--muted)] italic">
            {section.divergence_note}
          </p>
        )}
        <div className="flex justify-end mt-4">
          <Button variant="secondary" size="sm" onClick={handleEnterEdit}>
            Edit
          </Button>
        </div>
      </div>
    </div>
  );
}

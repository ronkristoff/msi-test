"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api, asId } from "@/lib/convex";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { StatusPill } from "@/components/ui/StatusPill";
import { PageSkeleton } from "@/components/ui/Skeleton";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { formatDate, formatRelativeTime } from "@/lib/format";
import { useErrorLogger } from "@/lib/error-logger";
import { STATUS_VARIANT, type StoryStatus } from "@/components/stories/StoryCard";
import { ExportSingleStory } from "./ExportSingleStory";
import { CopyStoryButton } from "./CopyStoryButton";

function ChipList({
  label,
  values,
  emptyLabel,
}: {
  label: string;
  values: string[];
  emptyLabel: string;
}) {
  return (
    <section aria-label={label}>
      <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)] mb-1">
        {label}
      </h4>
      {values.length === 0 ? (
        <p className="text-sm italic text-[var(--muted)]">{emptyLabel}</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {values.map((v, i) => (
            <li
              key={`${v}-${i}`}
              className="inline-block text-xs font-mono px-2 py-0.5 rounded-full bg-[var(--accent-bg, rgba(99,102,241,0.1))] text-[var(--accent, #6366f1)]"
            >
              {v}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function errorMessage(err: unknown): string {
  if (err instanceof Error && err.message) {
    return err.message.replace(
      /^(?:Uncaught\s+)?\w*Error:\s*/i,
      "",
    );
  }
  if (typeof err === "string") return err;
  return "An unexpected error occurred.";
}

export default function StoryDetailPage() {
  const params = useParams<{ id: string; storyId: string }>();
  const router = useRouter();
  const { logError } = useErrorLogger();
  const storyId = asId(params.storyId, "user_stories");

  const story = useQuery(api.stories.queries.getStory, { story_id: storyId });
  const updateStoryStatus = useMutation(api.stories.mutations.updateStoryStatus);
  const deleteStory = useMutation(api.stories.mutations.deleteStory);
  const kb = useQuery(api.knowledge.queries.getKnowledgeBase, {
    project_id: asId(params.id, "projects"),
  });
  const project = useQuery(api.projects.queries.getProject, {
    project_id: asId(params.id, "projects"),
  });

  const bmadDetected = kb?.bmad_detected === true;
  const projectName = project?.name ?? "";

  const [isTransitioning, setIsTransitioning] = useState(false);
  const [transitionError, setTransitionError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleTransition = async (target: StoryStatus) => {
    setTransitionError(null);
    setIsTransitioning(true);
    try {
      await updateStoryStatus({ story_id: storyId, status: target });
    } catch (err) {
      const msg = errorMessage(err);
      setTransitionError(msg);
      logError(msg, {
        severity: "error",
        context: { source: "StoryDetailPage.handleTransition", target },
      });
    } finally {
      setIsTransitioning(false);
    }
  };

  const handleDelete = async () => {
    if (isDeleting) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await deleteStory({ story_id: storyId });
      router.replace(`/projects/${params.id}/stories`);
    } catch (err) {
      const msg = errorMessage(err);
      setDeleteError(msg);
      logError(msg, {
        severity: "error",
        context: { source: "StoryDetailPage.handleDelete" },
      });
      setShowDeleteConfirm(false);
    } finally {
      setIsDeleting(false);
    }
  };

  if (story === undefined) {
    return <PageSkeleton />;
  }

  if (story === null) {
    return (
      <div className="max-w-[1080px]">
        <EmptyState
          icon={
            <svg
              aria-hidden="true"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4" />
              <path d="M12 8h.01" />
            </svg>
          }
          title="Story not found"
          description="This story may have been removed or you don't have access to it."
          action={
            <Link href={`/projects/${params.id}/stories`}>
              <Button variant="secondary">Back to Stories</Button>
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="max-w-[1080px]">
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <Link href={`/projects/${params.id}/stories`}>
            <Button variant="secondary" size="sm">
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
                <line x1="19" y1="12" x2="5" y2="12" />
                <polyline points="12 19 5 12 12 5" />
              </svg>
              Back to Stories
            </Button>
          </Link>
        </div>
      </div>

      <article className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] p-6 shadow-[var(--elev-raised)] space-y-5">
        <header className="space-y-2">
          <div className="flex items-start justify-between gap-4">
            <h2 className="font-[var(--font-display)] text-2xl font-bold text-[var(--fg)]">
              {story.title}
            </h2>
            <span aria-label={`Status: ${story.status}`}>
              <span aria-hidden="true">
                <StatusPill variant={STATUS_VARIANT[story.status]}>
                  {story.status}
                </StatusPill>
              </span>
            </span>
          </div>
          <div className="flex items-center gap-4 text-xs text-[var(--muted)]">
            <span>Generated {formatDate(story.generated_at)}</span>
            {story.updated_at && (
              <span>Updated {formatRelativeTime(story.updated_at)}</span>
            )}
          </div>
        </header>

        <div className="flex items-center gap-2">
          <ExportSingleStory
            story={story}
            bmadDetected={bmadDetected}
            projectName={projectName}
          />
          <CopyStoryButton story={story} />
        </div>

        <dl className="space-y-1 text-sm">
          <div className="flex gap-1.5">
            <dt className="font-medium text-[var(--muted)]">As a</dt>
            <dd className="text-[var(--fg)]">{story.user_story.as_a}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="font-medium text-[var(--muted)]">I want</dt>
            <dd className="text-[var(--fg)]">{story.user_story.i_want}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="font-medium text-[var(--muted)]">So that</dt>
            <dd className="text-[var(--fg)]">{story.user_story.so_that}</dd>
          </div>
        </dl>

        <section aria-label="Acceptance criteria">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)] mb-1">
            Acceptance Criteria
          </h4>
          {story.acceptance_criteria.filter(Boolean).length === 0 ? (
            <p className="text-sm italic text-[var(--muted)]">No acceptance criteria.</p>
          ) : (
            <ol className="list-decimal list-inside space-y-1 text-sm text-[var(--fg)]">
              {story.acceptance_criteria.filter(Boolean).map((c: string, i: number) => (
                <li key={`ac-${i}`}>{c}</li>
              ))}
            </ol>
          )}
        </section>

        <div className="space-y-3">
          <ChipList
            label="Affected Modules"
            values={story.affected_components.modules}
            emptyLabel="No affected modules identified."
          />
          <ChipList
            label="Affected APIs"
            values={story.affected_components.apis}
            emptyLabel="No affected APIs identified."
          />
          <ChipList
            label="Affected Data Models"
            values={story.affected_components.data_models}
            emptyLabel="No affected data models identified."
          />
        </div>

        {story.technical_context && (
          <section
            aria-label="Technical context"
            className="text-xs p-3 rounded-[var(--radius-sm)] bg-[var(--info-bg, rgba(59,130,246,0.1))] text-[var(--info, #3b82f6)] border border-[var(--info, #3b82f6)]"
          >
            {story.technical_context}
          </section>
        )}

        <div className="pt-2 border-t border-[var(--border-soft)]">
          <Link
            href={`/projects/${params.id}/chat/${encodeURIComponent(story.thread_id)}`}
            className="text-sm text-[var(--accent)] hover:underline"
          >
            View originating thread →
          </Link>
        </div>

        {transitionError && story.status !== "exported" && (
          <Alert variant="error">{transitionError}</Alert>
        )}

        <section aria-label="Status actions" className="pt-2">
          {story.status === "draft" && (
            <Button
              onClick={() => handleTransition("approved")}
              disabled={isTransitioning}
            >
              {isTransitioning ? "Approving…" : "Approve"}
            </Button>
          )}
          {story.status === "approved" && (
            <Button
              onClick={() => handleTransition("exported")}
              disabled={isTransitioning}
            >
              {isTransitioning ? "Marking…" : "Mark as Exported"}
            </Button>
          )}
          {story.status === "exported" && (
            <p className="text-sm italic text-[var(--muted)]">
              Exported — no further transitions available.
            </p>
          )}
        </section>

        {deleteError && <Alert variant="error">{deleteError}</Alert>}

        <section
          aria-label="Danger zone"
          className="pt-4 border-t border-[var(--border-soft)]"
        >
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowDeleteConfirm(true)}
            className="text-[var(--danger)] border-[var(--danger)] hover:bg-[var(--danger)]/10"
          >
            Delete Story
          </Button>
        </section>
      </article>

      {showDeleteConfirm && (
        <ConfirmDialog
          title="Delete story?"
          message="This will permanently delete the story. This action cannot be undone."
          confirmDisabled={isDeleting}
          cancelDisabled={isDeleting}
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
    </div>
  );
}

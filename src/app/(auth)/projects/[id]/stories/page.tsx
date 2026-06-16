"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api, asId } from "@/lib/convex";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { PageSkeleton } from "@/components/ui/Skeleton";
import { StoryCard, type StoryListItem } from "@/components/stories/StoryCard";
import { ExportStories } from "./ExportStories";

type StatusFilter = "all" | "draft" | "approved" | "exported";

export default function StoriesPage() {
  const params = useParams<{ id: string }>();
  const projectId = asId(params.id, "projects");

  const [filter, setFilter] = useState<StatusFilter>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const stories = useQuery(api.stories.queries.listStories, {
    project_id: projectId,
    ...(filter === "all" ? {} : { status: filter }),
  });
  const kb = useQuery(api.knowledge.queries.getKnowledgeBase, {
    project_id: projectId,
  });
  const project = useQuery(api.projects.queries.getProject, {
    project_id: projectId,
  });

  const bmadDetected = kb?.bmad_detected === true;
  const projectName = project?.name ?? "";

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  if (stories === undefined) {
    return <PageSkeleton />;
  }

  if (stories === null) {
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
              <path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z" />
              <path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z" />
            </svg>
          }
          title="Project not found"
          description="This project may have been removed or you don't have access to it."
          action={
            <Link href="/projects">
              <Button variant="secondary">Back to Projects</Button>
            </Link>
          }
        />
      </div>
    );
  }

  const allSelected =
    stories.length > 0 && stories.every((s: StoryListItem) => selectedIds.has(s._id));
  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(stories.map((s: StoryListItem) => s._id)));
    }
  };

  return (
    <div className="max-w-[1080px]">
      <div className="mb-6">
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="font-[var(--font-display)] text-2xl font-bold text-[var(--fg)]">
            Stories
          </h2>
          <Link href={`/projects/${params.id}`} className="ml-auto">
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
              Back to Project
            </Button>
          </Link>
          <label className="flex items-center gap-2 text-xs text-[var(--muted)]">
            <span className="sr-only">Filter stories by status</span>
            <select
              aria-label="Filter stories by status"
              value={filter}
              onChange={(e) => {
                setFilter(e.target.value as StatusFilter);
                setSelectedIds(new Set());
              }}
              className="px-2 py-1 border border-[var(--border)] rounded-[var(--radius-sm)] text-sm bg-[var(--surface)] text-[var(--fg)] outline-none focus:border-[var(--accent)]"
            >
              <option value="all">All</option>
              <option value="draft">Draft</option>
              <option value="approved">Approved</option>
              <option value="exported">Exported</option>
            </select>
          </label>
          {stories.length > 0 && (
            <input
              type="checkbox"
              aria-label="Select all visible stories"
              checked={allSelected}
              onChange={toggleSelectAll}
              className="cursor-pointer"
            />
          )}
          <ExportStories
            selectedIds={selectedIds}
            projectId={params.id}
            bmadDetected={bmadDetected}
            projectName={projectName}
          />
        </div>
      </div>

      {stories.length === 0 ? (
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
              <path d="M9 11l3 3L22 4" />
              <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
            </svg>
          }
          title="No stories yet"
          description="Generate user stories from a chat thread to see them here."
        />
      ) : (
        <div className="flex flex-col gap-2">
          {stories.map((story: StoryListItem) => (
            <StoryCard
              key={story._id}
              story={story}
              projectId={params.id}
              selected={selectedIds.has(story._id)}
              onToggleSelect={toggleSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

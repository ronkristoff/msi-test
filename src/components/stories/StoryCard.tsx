"use client";

import Link from "next/link";
import { StatusPill } from "@/components/ui/StatusPill";
import { formatRelativeTime } from "@/lib/format";

export type StoryStatus = "draft" | "approved" | "exported";

export type StoryListItem = {
  _id: string;
  title: string;
  status: StoryStatus;
  generated_at: number;
  updated_at: number | undefined;
  acceptance_criteria_count: number;
  affected_components: {
    modules: string[];
    apis: string[];
    data_models: string[];
  };
};

export const STATUS_VARIANT: Record<StoryStatus, "neutral" | "success" | "running"> = {
  draft: "neutral",
  approved: "success",
  exported: "running",
};

export function StoryCard({
  story,
  projectId,
  selected,
  onToggleSelect,
}: {
  story: StoryListItem;
  projectId: string;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
}) {
  const { modules, apis, data_models } = story.affected_components;
  const totalAffected = modules.length + apis.length + data_models.length;
  const timestamp = story.updated_at ?? story.generated_at;

  return (
    <div className="flex items-start gap-2">
      {onToggleSelect && (
        <input
          type="checkbox"
          checked={selected ?? false}
          onChange={() => onToggleSelect(story._id)}
          aria-label={`Select story: ${story.title}`}
          className="mt-4 shrink-0 cursor-pointer"
        />
      )}
      <Link
        href={`/projects/${projectId}/stories/${story._id}`}
        className="flex-1 block p-4 border border-[var(--border)] rounded-[var(--radius-md)] hover:border-[var(--accent)] hover:bg-[var(--border-soft)] transition-colors duration-[var(--motion-fast)]"
      >
        <article aria-label={`Story: ${story.title}`}>
          <div className="flex items-start justify-between gap-3 mb-2">
            <h3 className="text-sm font-semibold text-[var(--fg)] truncate flex-1">
              {story.title}
            </h3>
            <span aria-label={`Status: ${story.status}`}>
              <span aria-hidden="true">
                <StatusPill variant={STATUS_VARIANT[story.status]}>
                  {story.status}
                </StatusPill>
              </span>
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs text-[var(--muted)]">
            <span>
              {story.acceptance_criteria_count}{" "}
              {story.acceptance_criteria_count === 1 ? "AC" : "ACs"}
            </span>
            <span aria-hidden="true">·</span>
            <span>
              {totalAffected === 0 ? (
                "No affected components"
              ) : (
                <>
                  {modules.length}{" "}
                  {modules.length === 1 ? "module" : "modules"} · {apis.length}{" "}
                  API{apis.length === 1 ? "" : "s"} · {data_models.length} data{" "}
                  {data_models.length === 1 ? "model" : "models"}
                </>
              )}
            </span>
            <span aria-hidden="true">·</span>
            <span>{formatRelativeTime(timestamp)}</span>
          </div>
        </article>
      </Link>
    </div>
  );
}

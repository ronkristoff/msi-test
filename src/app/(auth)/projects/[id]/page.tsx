"use client";

import { useQuery } from "convex/react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/convex";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { formatDate } from "@/lib/format";

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const project = useQuery(api.projects.queries.getProject, {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    project_id: params.id as any,
  });

  if (project === undefined) {
    return <div className="text-[var(--muted)] text-sm">Loading...</div>;
  }

  if (!project) {
    return (
      <EmptyState
        icon={
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" />
          </svg>
        }
        title="Project not found"
        description="This project may have been deleted or you don't have access."
        action={
          <Link href="/projects">
            <Button variant="secondary">Back to Projects</Button>
          </Link>
        }
      />
    );
  }

  const hasPrd = !!(project.prd_text || project.prd_file_id);

  return (
    <div className="max-w-[720px]">
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] p-5 shadow-[var(--elev-raised)] mb-5">
        <div className="flex items-start justify-between mb-4 pb-4 border-b border-[var(--border-soft)]">
          <div>
            <h2 className="font-[var(--font-display)] text-xl font-bold text-[var(--fg)]">
              {project.name}
            </h2>
            <a
              href={project.app_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-[var(--accent)] hover:underline"
            >
              {project.app_url}
            </a>
          </div>
          <Link href={`/projects/${project._id}/settings`}>
            <Button variant="secondary" size="sm">Edit</Button>
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-4 max-[600px]:grid-cols-1">
          <div>
            <div className="font-[var(--font-mono)] text-[11px] uppercase tracking-[0.05em] text-[var(--muted)] mb-1">
              Created
            </div>
            <div className="text-sm text-[var(--fg)]">{formatDate(project._creationTime)}</div>
          </div>
          <div>
            <div className="font-[var(--font-mono)] text-[11px] uppercase tracking-[0.05em] text-[var(--muted)] mb-1">
              PRD
            </div>
            <div className="text-sm text-[var(--fg)]">
              {hasPrd ? (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[var(--radius-sm)] bg-[var(--border-soft)] text-[var(--fg)]">
                  {project.prd_file_id ? "File uploaded" : "Text provided"}
                </span>
              ) : (
                <span className="text-[var(--muted)]">None</span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] p-5 shadow-[var(--elev-raised)]">
        <h3 className="font-[var(--font-display)] text-lg font-bold text-[var(--fg)] mb-4 pb-3 border-b border-[var(--border-soft)]">
          Suites
        </h3>
        <EmptyState
          icon={
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
          }
          title="No suites yet"
          description="Test suites will appear here once they are created for this project."
        />
      </div>
    </div>
  );
}

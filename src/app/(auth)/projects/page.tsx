"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { api } from "@/lib/convex";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { formatDate } from "@/lib/format";

export default function ProjectsPage() {
  const workspace = useQuery(api.workspaces.queries.getWorkspaceForUser);
  const projects = useQuery(
    api.projects.queries.getProjects,
    workspace ? { workspace_id: workspace._id } : "skip",
  );

  if (workspace === undefined || projects === undefined) {
    return <div className="text-[var(--muted)] text-sm">Loading...</div>;
  }

  if (projects.length === 0) {
    return (
      <EmptyState
        icon={
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
        }
        title="No projects yet"
        description="Create your first project to start organizing test suites and runs."
        action={
          <Link href="/projects/new">
            <Button>Create your first project</Button>
          </Link>
        }
      />
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div />
        <Link href="/projects/new">
          <Button size="sm">New Project</Button>
        </Link>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {projects.map((project) => (
          <Link
            key={project._id}
            href={`/projects/${project._id}`}
            className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] p-5 shadow-[var(--elev-raised)] hover:border-[var(--accent)] transition-colors duration-[var(--motion-fast)] block"
          >
            <div className="font-[var(--font-display)] text-base font-bold text-[var(--fg)] mb-1 truncate">
              {project.name}
            </div>
            <div className="text-sm text-[var(--muted)] truncate mb-3">
              {project.app_url}
            </div>
            <div className="flex items-center gap-3 text-xs text-[var(--muted)]">
              <span>{formatDate(project._creationTime)}</span>
              {project.prd_text && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[var(--radius-sm)] bg-[var(--border-soft)]">
                  PRD
                </span>
              )}
              {project.prd_file_id && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[var(--radius-sm)] bg-[var(--border-soft)]">
                  PRD file
                </span>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

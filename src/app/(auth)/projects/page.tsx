"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import Link from "next/link";
import { api } from "@/lib/convex";
import type { Id } from "@/lib/convex";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { formatDate } from "@/lib/format";

type Tab = "active" | "archived";

const TABS: { key: Tab; label: string }[] = [
  { key: "active", label: "Active" },
  { key: "archived", label: "Archived" },
];

function TabButton({ label, count, active, onClick }: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 text-sm font-semibold rounded-[var(--radius-sm)] transition-colors duration-[var(--motion-fast)] ${
        active
          ? "bg-[var(--accent)] text-[var(--accent-on)]"
          : "text-[var(--muted)] hover:text-[var(--fg)] hover:bg-[var(--border-soft)]"
      }`}
    >
      {label}{count > 0 ? ` (${count})` : ""}
    </button>
  );
}

export default function ProjectsPage() {
  const [tab, setTab] = useState<Tab>("active");
  const [confirmTarget, setConfirmTarget] = useState<{
    id: Id<"projects">;
    name: string;
    action: "archive" | "unarchive";
  } | null>(null);

  const workspace = useQuery(api.workspaces.queries.getWorkspaceForUser);
  const activeProjects = useQuery(
    api.projects.queries.getProjects,
    workspace ? { workspace_id: workspace._id } : "skip",
  );
  const archivedProjects = useQuery(
    api.projects.queries.getProjects,
    workspace ? { workspace_id: workspace._id, status: "archived" as const } : "skip",
  );

  const archiveProject = useMutation(api.projects.mutations.archiveProject);
  const unarchiveProject = useMutation(api.projects.mutations.unarchiveProject);

  if (workspace === undefined || activeProjects === undefined || archivedProjects === undefined) {
    return <div className="text-[var(--muted)] text-sm">Loading...</div>;
  }

  const currentList = tab === "active" ? activeProjects : archivedProjects;

  const handleConfirm = async () => {
    if (!confirmTarget) return;
    const args = { project_id: confirmTarget.id };
    if (confirmTarget.action === "archive") {
      await archiveProject(args);
    } else {
      await unarchiveProject(args);
    }
    setConfirmTarget(null);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex gap-1">
          {TABS.map((t) => (
            <TabButton
              key={t.key}
              label={t.label}
              count={t.key === "active" ? activeProjects.length : archivedProjects.length}
              active={tab === t.key}
              onClick={() => setTab(t.key)}
            />
          ))}
        </div>
        <Link href="/projects/new">
          <Button size="sm">New Project</Button>
        </Link>
      </div>

      {currentList.length === 0 ? (
        <EmptyState
          icon={
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
          }
          title={tab === "active" ? "No projects yet" : "No archived projects"}
          description={
            tab === "active"
              ? "Create your first project to start organizing test suites and runs."
              : "Archived projects will appear here."
          }
          action={
            tab === "active" ? (
              <Link href="/projects/new">
                <Button>Create your first project</Button>
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {currentList.map((project) => (
            <div
              key={project._id}
              className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] p-5 shadow-[var(--elev-raised)] hover:border-[var(--accent)] transition-colors duration-[var(--motion-fast)] relative group"
            >
              <Link href={`/projects/${project._id}`} className="block">
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
              <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity duration-[var(--motion-fast)]">
                {tab === "active" ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setConfirmTarget({ id: project._id, name: project.name, action: "archive" });
                    }}
                    title="Archive project"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 8v13H3V8" />
                      <path d="M1 3h22v5H1z" />
                      <path d="M10 12h4" />
                    </svg>
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setConfirmTarget({ id: project._id, name: project.name, action: "unarchive" });
                    }}
                    title="Restore project"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                      <path d="M3 3v5h5" />
                    </svg>
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {confirmTarget && (
        <ConfirmDialog
          title={confirmTarget.action === "archive" ? "Archive project?" : "Restore project?"}
          message={
            confirmTarget.action === "archive"
              ? `Archive "${confirmTarget.name}"? All suites and runs will be preserved but hidden.`
              : `Restore "${confirmTarget.name}" back to active projects?`
          }
          confirmLabel={confirmTarget.action === "archive" ? "Archive" : "Restore"}
          variant={confirmTarget.action === "archive" ? "danger" : "primary"}
          onConfirm={handleConfirm}
          onCancel={() => setConfirmTarget(null)}
        />
      )}
    </div>
  );
}

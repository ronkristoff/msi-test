"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation } from "convex/react";
import Link from "next/link";
import { api } from "@/lib/convex";
import type { Id } from "@/lib/convex";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { formatRelativeTime } from "@/lib/format";

type Tab = "active" | "archived";

export default function ProjectsPage() {
  const [tab, setTab] = useState<Tab>("active");
  const [search, setSearch] = useState("");
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

  const rawList = tab === "active" ? activeProjects : archivedProjects;

  const filteredProjects = useMemo(() => {
    if (!rawList) return [];
    if (!search.trim()) return rawList;
    const q = search.toLowerCase();
    return rawList.filter(
      (p) => p.name.toLowerCase().includes(q) || p.app_url.toLowerCase().includes(q),
    );
  }, [rawList, search]);

  if (workspace === undefined || activeProjects === undefined || archivedProjects === undefined) {
    return <div className="text-[var(--muted)] text-sm">Loading...</div>;
  }

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
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="flex rounded-[var(--radius-pill)] bg-[var(--border-soft)] p-0.5">
            <button
              onClick={() => setTab("active")}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-[var(--radius-pill)] transition-colors duration-[var(--motion-fast)] ${
                tab === "active"
                  ? "bg-[var(--surface)] text-[var(--fg)] shadow-[var(--elev-raised)]"
                  : "text-[var(--muted)] hover:text-[var(--fg)]"
              }`}
            >
              Active{activeProjects.length > 0 ? ` (${activeProjects.length})` : ""}
            </button>
            <button
              onClick={() => setTab("archived")}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-[var(--radius-pill)] transition-colors duration-[var(--motion-fast)] ${
                tab === "archived"
                  ? "bg-[var(--surface)] text-[var(--fg)] shadow-[var(--elev-raised)]"
                  : "text-[var(--muted)] hover:text-[var(--fg)]"
              }`}
            >
              Archived{archivedProjects.length > 0 ? ` (${archivedProjects.length})` : ""}
            </button>
          </div>
          <div className="relative">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)] pointer-events-none"
            >
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search projects..."
              className="pl-8 pr-3 py-1.5 text-sm bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-pill)] text-[var(--fg)] placeholder:text-[var(--muted)] outline-none focus:border-[var(--accent)] focus:shadow-[var(--focus-ring)] transition-all duration-[var(--motion-fast)] w-[220px]"
            />
          </div>
        </div>
        <Link href="/projects/new">
          <Button size="sm">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            New Project
          </Button>
        </Link>
      </div>

      {filteredProjects.length === 0 ? (
        <EmptyState
          icon={
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
          }
          title={tab === "active" ? (search ? "No matching projects" : "No projects yet") : "No archived projects"}
          description={
            tab === "active"
              ? search
                ? `No projects match "${search}".`
                : "Create your first project to start organizing test suites and runs."
              : "Archived projects will appear here."
          }
          action={
            tab === "active" && !search ? (
              <Link href="/projects/new">
                <Button>Create your first project</Button>
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className="border border-[var(--border)] rounded-[var(--radius-md)] overflow-hidden shadow-[var(--elev-raised)]">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--border-soft)]">
                <th className="text-left px-4 py-2.5 text-[11px] font-[var(--font-mono)] font-semibold uppercase tracking-[0.05em] text-[var(--muted)]">
                  Project
                </th>
                <th className="text-left px-4 py-2.5 text-[11px] font-[var(--font-mono)] font-semibold uppercase tracking-[0.05em] text-[var(--muted)] hidden sm:table-cell">
                  URL
                </th>
                <th className="text-left px-4 py-2.5 text-[11px] font-[var(--font-mono)] font-semibold uppercase tracking-[0.05em] text-[var(--muted)] hidden md:table-cell">
                  PRD
                </th>
                <th className="text-right px-4 py-2.5 text-[11px] font-[var(--font-mono)] font-semibold uppercase tracking-[0.05em] text-[var(--muted)]">
                  Created
                </th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {filteredProjects.map((project) => (
                <tr
                  key={project._id}
                  className="border-b border-[var(--border-soft)] last:border-b-0 hover:bg-[var(--border-soft)]/50 transition-colors duration-[var(--motion-fast)] group"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/projects/${project._id}`}
                      className="text-sm font-semibold text-[var(--fg)] hover:text-[var(--accent)] transition-colors duration-[var(--motion-fast)]"
                    >
                      {project.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <span className="text-sm text-[var(--muted)] truncate block max-w-[280px]">
                      {project.app_url}
                    </span>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    {(project.prd_text || project.prd_file_id) ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-[var(--radius-pill)] bg-[var(--accent)]/10 text-[11px] font-medium text-[var(--accent)]">
                        {project.prd_file_id ? "File" : "Text"}
                      </span>
                    ) : (
                      <span className="text-xs text-[var(--muted)]">None</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-xs text-[var(--muted)]">
                      {formatRelativeTime(project._creationTime)}
                    </span>
                  </td>
                  <td className="px-2 py-3">
                    <div className="flex items-center justify-end opacity-0 group-hover:opacity-100 transition-opacity duration-[var(--motion-fast)]">
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
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 8v13H3V8" /><path d="M1 3h22v5H1z" /><path d="M10 12h4" />
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
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" />
                          </svg>
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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

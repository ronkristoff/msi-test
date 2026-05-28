"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api, asId } from "@/lib/convex";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { StatusPill } from "@/components/ui/StatusPill";
import { QueryResult } from "@/components/ui/QueryResult";
import { formatDate } from "@/lib/format";
import { useErrorLogger } from "@/lib/error-logger";
import { SOURCE_TYPE_LABELS } from "@/lib/source-types";

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { logError } = useErrorLogger();
  const [creating, setCreating] = useState(false);
  const projectId = asId(params.id, "projects");
  const project = useQuery(api.projects.queries.getProject, {
    project_id: projectId,
  });
  const suites = useQuery(api.suites.queries.getSuites, {
    project_id: projectId,
  });

  const createSuite = useMutation(api.suites.mutations.createSuite);

  const handleCreateSuite = async () => {
    try {
      setCreating(true);
      const suiteId = await createSuite({ project_id: projectId });
      router.push(`/projects/${params.id}/suites/${suiteId}`);
    } catch (err) {
      logError(err instanceof Error ? err.message : "Failed to create suite", {
          severity: "error",
          context: { source: "ProjectDetailPage.handleCreateSuite" },
        });
    } finally {
      setCreating(false);
    }
  };

  if (project === undefined || suites === undefined) {
    return <div className="text-[var(--muted)] text-sm">Loading...</div>;
  }

  return (
    <QueryResult
      data={project}
      notFound={
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
      }
    >
      {(project) => {
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
          <div className="flex items-center gap-2">
            <Link href={`/projects/${project._id}/environments`}>
              <Button variant="secondary" size="sm">Environments</Button>
            </Link>
            <Link href={`/projects/${project._id}/settings`}>
              <Button variant="secondary" size="sm">Edit</Button>
            </Link>
          </div>
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
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-[var(--border-soft)]">
          <h3 className="font-[var(--font-display)] text-lg font-bold text-[var(--fg)]">
            Suites
          </h3>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleCreateSuite}
            disabled={creating}
            icon={
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            }
          >
            Create Suite
          </Button>
        </div>

        {suites.length === 0 ? (
          <EmptyState
            icon={
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
            }
            title="No suites yet"
            description="Create a suite to start organizing your tests."
          />
        ) : (
          <div className="divide-y divide-[var(--border-soft)]">
            {suites.map((suite) => (
              <Link
                key={suite._id}
                href={`/projects/${params.id}/suites/${suite._id}`}
                className="flex items-center justify-between py-3 px-1 -mx-1 rounded-[var(--radius-sm)] hover:bg-[var(--border-soft)] transition-colors duration-[var(--motion-fast)] group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-[var(--fg)] group-hover:text-[var(--accent)] truncate">
                      {suite.name}
                    </div>
                    <div className="text-xs text-[var(--muted)] mt-0.5">
                      {formatDate(suite._creationTime)}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs text-[var(--muted)]">
                    {suite.testCount} {suite.testCount === 1 ? "test" : "tests"}
                  </span>
                  <StatusPill variant="neutral" showDot={false}>
                    {SOURCE_TYPE_LABELS[suite.source_type] ?? suite.source_type}
                  </StatusPill>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[var(--muted)] group-hover:text-[var(--fg)]">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
        );
      }}
    </QueryResult>
  );
}

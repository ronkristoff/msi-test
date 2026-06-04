"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useAction } from "convex/react";
import { api, asId } from "@/lib/convex";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { useErrorLogger } from "@/lib/error-logger";
import Link from "next/link";

export default function GeneratePrdTestsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { logError } = useErrorLogger();
  const projectId = asId(params.id, "projects");
  const project = useQuery(api.projects.queries.getProject, { project_id: projectId });
  const user = useQuery(api.workspaces.queries.getCurrentUser);
  const createSuite = useMutation(api.suites.mutations.createSuite);
  const generatePrdTests = useAction(api.ai.generatePrdTests.generatePrdTests);

  const hasPrd = !!(project?.prd_text || project?.prd_file_id);

  const handleGenerate = async () => {
    if (!user) return;
    try {
      const suiteId = await createSuite({
        project_id: projectId,
        name: undefined,
        source_type: "prd",
        status: "generating",
        triggered_by: user._id,
      });
      router.push(`/projects/${params.id}/suites/${suiteId}`);
      generatePrdTests({ project_id: projectId, suite_id: asId(suiteId, "suites") }).catch((err) => {
        logError(err instanceof Error ? err.message : "PRD generation failed", {
          severity: "error",
          context: { source: "GeneratePrdTestsPage" },
        });
      });
    } catch (err) {
      logError(err instanceof Error ? err.message : "Failed to create suite", {
        severity: "error",
        context: { source: "GeneratePrdTestsPage" },
      });
    }
  };

  if (project === undefined || user === undefined) {
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

  return (
    <div className="max-w-[720px]">
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] p-6 shadow-[var(--elev-raised)]">
        <h2 className="font-[var(--font-display)] text-xl font-bold text-[var(--fg)] mb-1">
          Generate Tests from PRD
        </h2>
        <p className="text-sm text-[var(--muted)] mb-6">
          AI will generate Playwright tests from your product requirements document.
        </p>

        <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-3 mb-6 p-4 rounded-[var(--radius-sm)] bg-[var(--border-soft)]">
          <span className="text-[11px] font-[var(--font-mono)] uppercase tracking-[0.05em] text-[var(--muted)] self-center">Project</span>
          <div>
            <div className="text-sm font-medium text-[var(--fg)]">{project.name}</div>
            <a href={project.app_url} target="_blank" rel="noopener noreferrer" className="text-xs text-[var(--accent)] hover:underline">
              {project.app_url}
            </a>
          </div>

          <span className="text-[11px] font-[var(--font-mono)] uppercase tracking-[0.05em] text-[var(--muted)] self-center">PRD</span>
          <div>
            {!hasPrd ? (
              <div className="flex items-center gap-3">
                <span className="text-sm text-[var(--muted)]">No PRD found</span>
                <Link href={`/projects/${params.id}/settings`}>
                  <Button variant="secondary" size="sm">Add PRD</Button>
                </Link>
              </div>
            ) : (
              <span className="inline-flex items-center px-2 py-0.5 rounded-[var(--radius-pill)] bg-[var(--accent)]/10 text-[11px] font-medium text-[var(--accent)]">
                {project.prd_text ? `Text PRD (${project.prd_text.length} chars)` : "File uploaded"}
              </span>
            )}
          </div>
        </div>

        {hasPrd && project.prd_text && (
          <div className="mb-6 p-3 rounded-[var(--radius-sm)] border border-[var(--border)] text-xs text-[var(--muted)] max-h-[200px] overflow-y-auto whitespace-pre-wrap font-[var(--font-mono)]">
            {project.prd_text.slice(0, 500)}
            {project.prd_text.length > 500 && "..."}
          </div>
        )}

        <div className="flex gap-3">
          <Button onClick={handleGenerate} disabled={!hasPrd}>
            Generate Tests
          </Button>
          <Link href={`/projects/${params.id}`}>
            <Button variant="secondary">Cancel</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

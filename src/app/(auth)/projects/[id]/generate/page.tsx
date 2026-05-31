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
  const project = useQuery(api.projects.queries.getProject, {
    project_id: projectId,
  });
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
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] p-5 shadow-[var(--elev-raised)]">
        <div className="mb-5 pb-4 border-b border-[var(--border-soft)]">
          <h2 className="font-[var(--font-display)] text-xl font-bold text-[var(--fg)]">
            Generate Tests from PRD
          </h2>
          <p className="text-sm text-[var(--muted)] mt-1">
            AI will generate Playwright tests from your product requirements document.
          </p>
        </div>

        <div className="mb-5">
          <div className="font-[var(--font-mono)] text-[11px] uppercase tracking-[0.05em] text-[var(--muted)] mb-2">
            Project
          </div>
          <div className="text-sm font-medium text-[var(--fg)]">{project.name}</div>
          <a
            href={project.app_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-[var(--accent)] hover:underline"
          >
            {project.app_url}
          </a>
        </div>

        <div className="mb-5">
          <div className="font-[var(--font-mono)] text-[11px] uppercase tracking-[0.05em] text-[var(--muted)] mb-2">
            PRD Source
          </div>
          {!hasPrd ? (
            <div className="flex items-center gap-3">
              <span className="text-sm text-[var(--muted)]">No PRD found</span>
              <Link href={`/projects/${params.id}/settings`}>
                <Button variant="secondary" size="sm">Add PRD</Button>
              </Link>
            </div>
          ) : (
            <div className="text-sm text-[var(--fg)]">
              {project.prd_text ? (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[var(--radius-sm)] bg-[var(--border-soft)] text-[var(--fg)]">
                  Text PRD ({project.prd_text.length} chars)
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[var(--radius-sm)] bg-[var(--border-soft)] text-[var(--fg)]">
                  File uploaded
                </span>
              )}
            </div>
          )}
          {hasPrd && project.prd_text && (
            <div className="mt-3 p-3 rounded-[var(--radius-sm)] bg-[var(--border-soft)] text-xs text-[var(--muted)] max-h-[200px] overflow-y-auto whitespace-pre-wrap font-[var(--font-mono)]">
              {project.prd_text.slice(0, 500)}
              {project.prd_text.length > 500 && "..."}
            </div>
          )}
        </div>

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

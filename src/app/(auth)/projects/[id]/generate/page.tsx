"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useAction } from "convex/react";
import { api, asId } from "@/lib/convex";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
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
  const generatePrdTests = useAction(api.ai.generatePrdTests.generatePrdTests);

  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasPrd = !!(project?.prd_text || project?.prd_file_id);

  const handleGenerate = async () => {
    setError(null);
    setGenerating(true);
    try {
      const result = await generatePrdTests({ project_id: projectId });
      router.push(`/projects/${params.id}/suites/${result.suiteId}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Generation failed";
      setError(msg);
      logError(msg, { severity: "error", context: { source: "GeneratePrdTestsPage" } });
    } finally {
      setGenerating(false);
    }
  };

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

        {error && <Alert variant="error" className="mb-5">{error}</Alert>}

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
          <Button onClick={handleGenerate} disabled={generating || !hasPrd}>
            {generating ? "Generating..." : "Generate Tests"}
          </Button>
          <Link href={`/projects/${params.id}`}>
            <Button variant="secondary">Cancel</Button>
          </Link>
        </div>

        {generating && (
          <div className="mt-4 flex items-center gap-2 text-sm text-[var(--muted)]">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            AI is analyzing your PRD and generating Playwright tests...
          </div>
        )}
      </div>
    </div>
  );
}

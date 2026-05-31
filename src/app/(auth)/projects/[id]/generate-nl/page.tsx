"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useAction } from "convex/react";
import { api, asId } from "@/lib/convex";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { useErrorLogger } from "@/lib/error-logger";
import { hasAiConfig } from "@/lib/ai-presets";
import Link from "next/link";

export default function GenerateNlTestsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { logError } = useErrorLogger();
  const projectId = asId(params.id, "projects");
  const project = useQuery(api.projects.queries.getProject, {
    project_id: projectId,
  });
  const workspace = useQuery(api.workspaces.queries.getWorkspaceForUser);
  const user = useQuery(api.workspaces.queries.getCurrentUser);
  const createSuite = useMutation(api.suites.mutations.createSuite);
  const generateNlTests = useAction(api.ai.generateNlTests.generateNlTests);

  const [prompt, setPrompt] = useState("");

  const aiConfigReady = hasAiConfig(workspace);

  const handleGenerate = async () => {
    if (!prompt.trim() || !user) return;
    try {
      const suiteId = await createSuite({
        project_id: projectId,
        source_type: "natural_language",
        status: "generating",
        triggered_by: user._id,
      });
      router.push(`/projects/${params.id}/suites/${suiteId}`);
      generateNlTests({
        project_id: projectId,
        prompt: prompt.trim(),
        suite_id: asId(suiteId, "suites"),
      }).catch((err) => {
        logError(err instanceof Error ? err.message : "NL generation failed", {
          severity: "error",
          context: { source: "GenerateNlTestsPage" },
        });
      });
    } catch (err) {
      logError(err instanceof Error ? err.message : "Failed to create suite", {
        severity: "error",
        context: { source: "GenerateNlTestsPage" },
      });
    }
  };

  if (project === undefined || workspace === undefined || user === undefined) {
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
            Generate Tests from Description
          </h2>
          <p className="text-sm text-[var(--muted)] mt-1">
            Describe test scenarios in plain English and AI will generate Playwright tests.
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

        {!aiConfigReady ? (
          <div className="mb-5">
            <Alert variant="error">
              AI provider not configured.{" "}
              <Link href="/settings" className="underline font-medium">
                Configure AI settings
              </Link>{" "}
              to generate tests.
            </Alert>
          </div>
        ) : (
          <>
            <div className="mb-5">
              <label className="font-[var(--font-mono)] text-[11px] uppercase tracking-[0.05em] text-[var(--muted)] mb-2 block">
                Test Description
              </label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={"e.g., Test that login works with valid credentials\nTest that the shopping cart updates when adding items"}
                className="w-full min-h-[160px] font-[var(--font-mono)] text-sm bg-[var(--bg)] text-[var(--fg)] border border-[var(--border)] rounded-[var(--radius-sm)] p-3 resize-y focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
              />
            </div>

            <div className="flex gap-3">
              <Button onClick={handleGenerate} disabled={!prompt.trim()}>
                Generate Tests
              </Button>
              <Link href={`/projects/${params.id}`}>
                <Button variant="secondary">Cancel</Button>
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

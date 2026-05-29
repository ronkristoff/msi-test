"use client";

import { useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useAction } from "convex/react";
import { api, asId } from "@/lib/convex";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { useErrorLogger } from "@/lib/error-logger";
import Link from "next/link";

interface Scenario {
  name: string;
  description: string;
  flow_summary: string;
}

export default function ExplorePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { logError } = useErrorLogger();
  const projectId = asId(params.id, "projects");
  const project = useQuery(api.projects.queries.getProject, {
    project_id: projectId,
  });

  const [error, setError] = useState<string | null>(null);
  const [explorationId, setExplorationId] = useState<string | null>(null);
  const [selectedScenarios, setSelectedScenarios] = useState<Set<number>>(new Set());
  const [generating, setGenerating] = useState(false);

  const url = project?.app_url ?? "";

  const createExploration = useMutation(api.explorations.mutations.createExploration);
  const generateTests = useAction(api.ai.exploreApp.generateExplorationTests);

  const exploration = useQuery(
    api.explorations.queries.getExploration,
    explorationId ? { exploration_id: asId(explorationId, "explorations") } : "skip",
  );

  const handleStartExploration = useCallback(async () => {
    setError(null);
    setSelectedScenarios(new Set());
    setExplorationId(null);
    try {
      const id = await createExploration({
        project_id: projectId,
      });
      setExplorationId(id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to start exploration";
      setError(msg);
      logError(msg, { severity: "error", context: { source: "ExplorePage" } });
    }
  }, [createExploration, projectId, logError]);

  const handleToggleScenario = useCallback((index: number) => {
    setSelectedScenarios((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }, []);

  const handleGenerateTests = useCallback(async () => {
    if (!exploration?.proposed_scenarios) return;
    const selected = exploration.proposed_scenarios.filter((_: Scenario, i: number) =>
      selectedScenarios.has(i),
    );
    if (selected.length === 0) return;

    setGenerating(true);
    setError(null);
    try {
      const result = await generateTests({
        exploration_id: asId(explorationId!, "explorations"),
        selected_scenarios: selected,
      });
      router.push(`/projects/${params.id}/suites/${result.suiteId}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Test generation failed";
      setError(msg);
      logError(msg, { severity: "error", context: { source: "ExplorePage.handleGenerateTests" } });
    } finally {
      setGenerating(false);
    }
  }, [exploration, selectedScenarios, generateTests, explorationId, router, params.id, logError]);

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

  const isInProgress =
    exploration?.status === "pending" ||
    exploration?.status === "capturing" ||
    exploration?.status === "captured" ||
    exploration?.status === "analyzing";

  const showScenarios = exploration?.status === "analyzed" && exploration.proposed_scenarios;

  return (
    <div className="max-w-[720px]">
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] p-5 shadow-[var(--elev-raised)]">
        <div className="mb-5 pb-4 border-b border-[var(--border-soft)]">
          <h2 className="font-[var(--font-display)] text-xl font-bold text-[var(--fg)]">
            Explore App URL
          </h2>
          <p className="text-sm text-[var(--muted)] mt-1">
            Runner will render pages, capture structure, and AI will propose testable scenarios.
          </p>
        </div>

        {error && <Alert variant="error" className="mb-5">{error}</Alert>}

        <div className="mb-5">
          <div className="font-[var(--font-mono)] text-[11px] uppercase tracking-[0.05em] text-[var(--muted)] mb-2">
            Project
          </div>
          <div className="text-sm font-medium text-[var(--fg)]">{project.name}</div>
        </div>

        {!explorationId && (
          <div className="mb-5">
            <div className="font-[var(--font-mono)] text-[11px] uppercase tracking-[0.05em] text-[var(--muted)] mb-2">
              URL to Explore
            </div>
            <div className="text-sm text-[var(--fg)] mb-4">{url || project.app_url}</div>
            <div className="flex gap-3">
              <Button onClick={handleStartExploration} disabled={!url}>
                Start Exploration
              </Button>
              <Link href={`/projects/${params.id}`}>
                <Button variant="secondary">Cancel</Button>
              </Link>
            </div>
          </div>
        )}

        {isInProgress && (
          <div className="mb-5">
            <div className="flex items-center gap-2 text-sm text-[var(--muted)] mb-3">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              {exploration?.status === "pending" && "Waiting for Runner..."}
              {exploration?.status === "capturing" && (exploration.progress_message || "Capturing pages...")}
              {exploration?.status === "captured" && "Capture complete, starting AI analysis..."}
              {exploration?.status === "analyzing" && "AI is analyzing captured pages..."}
            </div>
            {exploration?.pages_captured != null && exploration.pages_captured > 0 && (
              <div className="text-xs text-[var(--muted)]">
                {exploration.pages_captured} page{exploration.pages_captured !== 1 ? "s" : ""} captured
              </div>
            )}
          </div>
        )}

        {exploration?.status === "failed" && (
          <div className="mb-5">
            <Alert variant="error">
              Exploration failed: {exploration.error_message || "Unknown error"}
            </Alert>
            <div className="flex gap-3 mt-4">
              <Button onClick={() => { setExplorationId(null); setError(null); }}>
                Try Again
              </Button>
              <Link href={`/projects/${params.id}`}>
                <Button variant="secondary">Back</Button>
              </Link>
            </div>
          </div>
        )}

        {showScenarios && (
          <div className="mb-5">
            <div className="font-[var(--font-mono)] text-[11px] uppercase tracking-[0.05em] text-[var(--muted)] mb-3">
              Proposed Scenarios ({exploration.proposed_scenarios!.length})
            </div>
            <div className="space-y-3 mb-4">
              {exploration.proposed_scenarios!.map((scenario: Scenario, i: number) => (
                <label
                  key={i}
                  className={`flex items-start gap-3 p-3 rounded-[var(--radius-sm)] border cursor-pointer transition-colors duration-[var(--motion-fast)] ${
                    selectedScenarios.has(i)
                      ? "border-[var(--accent)] bg-[var(--accent)]/5"
                      : "border-[var(--border)] hover:border-[var(--border-strong)]"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedScenarios.has(i)}
                    onChange={() => handleToggleScenario(i)}
                    className="mt-0.5 accent-[var(--accent)]"
                  />
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-[var(--fg)]">{scenario.name}</div>
                    <div className="text-xs text-[var(--muted)] mt-1">{scenario.description}</div>
                    <div className="text-xs text-[var(--muted)] mt-1 font-[var(--font-mono)] whitespace-pre-wrap">
                      {scenario.flow_summary}
                    </div>
                  </div>
                </label>
              ))}
            </div>
            <div className="flex gap-3">
              <Button
                onClick={handleGenerateTests}
                disabled={selectedScenarios.size === 0 || generating}
              >
                {generating
                  ? "Generating..."
                  : `Generate Tests from Selected (${selectedScenarios.size})`}
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setExplorationId(null);
                  setSelectedScenarios(new Set());
                }}
              >
                New Exploration
              </Button>
            </div>
          </div>
        )}

        {exploration?.status === "completed" && !showScenarios && (
          <div className="mb-5">
            <Alert variant="success">Tests generated successfully!</Alert>
            <div className="flex gap-3 mt-4">
              <Link href={`/projects/${params.id}`}>
                <Button>Back to Project</Button>
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

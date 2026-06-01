"use client";

import { useState, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useAction } from "convex/react";
import { api, asId } from "@/lib/convex";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { useErrorLogger } from "@/lib/error-logger";
import { PageSkeleton } from "@/components/ui/Skeleton";
import Link from "next/link";

interface Scenario {
  name: string;
  description: string;
  flow_summary: string;
  area: string;
}

interface CapturedPageWithUrl {
  url: string;
  title: string;
  structure_text: string;
  screenshot_storage_id?: string;
  screenshot_url: string | null;
  semantic_description?: string;
  interactive_elements?: Array<{
    selector: string;
    description: string;
    element_type: string;
  }>;
}

interface DiscoveredFlow {
  name: string;
  steps: string[];
  pages_involved: number[];
  complexity: "low" | "medium" | "high";
}

interface ExplorationWithFlows {
  discovered_flows?: DiscoveredFlow[];
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
  const [userDismissed, setUserDismissed] = useState(false);

  const [goal, setGoal] = useState("");
  const [additionalUrlInput, setAdditionalUrlInput] = useState("");

  const url = project?.app_url ?? "";

  const createExploration = useMutation(api.explorations.mutations.createExploration);
  const createSuitesForExploration = useMutation(api.suites.mutations.createSuitesForExploration);
  const generateTests = useAction(api.ai.exploreApp.generateExplorationTests);
  const user = useQuery(api.workspaces.queries.getCurrentUser);

  const latestActive = useQuery(
    api.explorations.queries.getLatestActiveExploration,
    !explorationId ? { project_id: projectId } : "skip",
  );

  const effectiveExplorationId = useMemo(
    () => explorationId ?? ((latestActive && !userDismissed) ? latestActive._id : null),
    [explorationId, latestActive, userDismissed],
  );

  const exploration = useQuery(
    api.explorations.queries.getExploration,
    effectiveExplorationId ? { exploration_id: asId(effectiveExplorationId, "explorations") } : "skip",
  );

  const handleStartExploration = useCallback(async () => {
    setError(null);
    setSelectedScenarios(new Set());
    setExplorationId(null);
    setUserDismissed(false);
    try {
      const additionalUrls = additionalUrlInput
        .split("\n")
        .map((u) => u.trim())
        .filter((u) => u.length > 0);
      const id = await createExploration({
        project_id: projectId,
        goal: goal.trim() || undefined,
        additional_urls: additionalUrls.length > 0 ? additionalUrls : undefined,
      });
      setExplorationId(id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to start exploration";
      setError(msg);
      logError(msg, { severity: "error", context: { source: "ExplorePage" } });
    }
  }, [createExploration, projectId, goal, additionalUrlInput, logError]);

  const handleToggleScenario = useCallback((index: number) => {
    setSelectedScenarios((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }, []);

  const handleGenerateTests = useCallback(async () => {
    if (!exploration?.proposed_scenarios || !user) return;
    const selected = exploration.proposed_scenarios.filter((_: Scenario, i: number) =>
      selectedScenarios.has(i),
    );
    if (selected.length === 0) return;

    setGenerating(true);
    setError(null);
    try {
      const areas = [...new Set(selected.map((s: Scenario) => s.area))];
      const suiteResults = await createSuitesForExploration({
        project_id: projectId,
        areas,
        source_type: "url_exploration",
        triggered_by: user._id,
      });

      router.push(`/projects/${params.id}/suites/${suiteResults[0].suite_id}`);

      generateTests({
        exploration_id: asId(effectiveExplorationId!, "explorations"),
        selected_scenarios: selected,
        suite_ids: suiteResults,
      }).catch((err) => {
        logError(err instanceof Error ? err.message : "Test generation failed", {
          severity: "error",
          context: { source: "ExplorePage.handleGenerateTests" },
        });
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to create suites";
      setError(msg);
      logError(msg, { severity: "error", context: { source: "ExplorePage.handleGenerateTests" } });
    } finally {
      setGenerating(false);
    }
  }, [exploration, selectedScenarios, createSuitesForExploration, generateTests, effectiveExplorationId, router, params.id, logError, user, projectId]);

  if (project === undefined) {
    return <PageSkeleton />;
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
            Explore & Generate Tests
          </h2>
          <p className="text-sm text-[var(--muted)] mt-1">
            Crawl the site, identify testable scenarios, and generate Playwright tests from your selections.
          </p>
        </div>

        {error && <Alert variant="error" className="mb-5">{error}</Alert>}

        <div className="mb-5">
          <div className="font-[var(--font-mono)] text-[11px] uppercase tracking-[0.05em] text-[var(--muted)] mb-2">
            Project
          </div>
          <div className="text-sm font-medium text-[var(--fg)]">{project.name}</div>
        </div>

        {!effectiveExplorationId && (
          <div className="mb-5">
            <div className="font-[var(--font-mono)] text-[11px] uppercase tracking-[0.05em] text-[var(--muted)] mb-2">
              URL to Explore
            </div>
            <div className="text-sm text-[var(--fg)] mb-4">{url || project.app_url}</div>

            <div className="mb-4">
              <div className="font-[var(--font-mono)] text-[11px] uppercase tracking-[0.05em] text-[var(--muted)] mb-2">
                Goal / Focus (optional)
              </div>
              <textarea
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder={"e.g., Focus on checkout and payment flows"}
                className="w-full min-h-[60px] max-h-[120px] font-[var(--font-mono)] text-sm bg-[var(--bg)] text-[var(--fg)] border border-[var(--border)] rounded-[var(--radius-sm)] p-3 resize-y focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
              />
            </div>

            <div className="mb-4">
              <div className="font-[var(--font-mono)] text-[11px] uppercase tracking-[0.05em] text-[var(--muted)] mb-2">
                Additional URLs (optional)
              </div>
              <textarea
                value={additionalUrlInput}
                onChange={(e) => setAdditionalUrlInput(e.target.value)}
                placeholder={"One URL per line — pages the crawler might miss\nhttps://example.com/cart\nhttps://example.com/checkout"}
                className="w-full min-h-[60px] max-h-[120px] font-[var(--font-mono)] text-sm bg-[var(--bg)] text-[var(--fg)] border border-[var(--border)] rounded-[var(--radius-sm)] p-3 resize-y focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
              />
            </div>

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
              {exploration?.status === "pending" && "Queuing exploration..."}
              {exploration?.status === "capturing" && (exploration.progress_message || "Crawling pages...")}
              {exploration?.status === "captured" && "Crawl complete. Preparing analysis..."}
              {exploration?.status === "analyzing" && "Analyzing pages and identifying scenarios..."}
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
                Exploration failed: {exploration.error_message || "Unknown error. Try again or check your AI configuration."}
              </Alert>
            <div className="flex gap-3 mt-4">
              <Button onClick={() => { setExplorationId(null); setError(null); setUserDismissed(true); }}>
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
            {exploration.captured_pages && exploration.captured_pages.length > 0 && (
              <div className="mb-4">
                <div className="font-[var(--font-mono)] text-[11px] uppercase tracking-[0.05em] text-[var(--muted)] mb-2">
                  Captured Pages ({exploration.captured_pages.length})
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {(exploration.captured_pages as CapturedPageWithUrl[]).map((page, i) =>
                    page.screenshot_url ? (
                      <a
                        key={i}
                        href={page.screenshot_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block rounded-[var(--radius-sm)] border border-[var(--border)] overflow-hidden hover:border-[var(--border-strong)] transition-colors"
                      >
                        <img
                          src={page.screenshot_url}
                          alt={page.title}
                          className="w-full h-auto"
                          loading="lazy"
                        />
                        <div className="px-2 py-1 text-[10px] text-[var(--muted)] truncate">
                          {page.title}
                          {page.interactive_elements && page.interactive_elements.length > 0 && (
                            <span className="ml-1 text-[var(--accent)]">
                              ({page.interactive_elements.length} elements)
                            </span>
                          )}
                        </div>
                      </a>
                    ) : (
                      <div
                        key={i}
                        className="flex items-center justify-center h-20 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-elevated)]"
                      >
                        <span className="text-[10px] text-[var(--muted)] truncate px-2">{page.title}</span>
                      </div>
                    ),
                  )}
                </div>
              </div>
            )}

            {(exploration as ExplorationWithFlows).discovered_flows &&
             (exploration as ExplorationWithFlows).discovered_flows!.length > 0 && (
              <div className="mb-4">
                <div className="font-[var(--font-mono)] text-[11px] uppercase tracking-[0.05em] text-[var(--muted)] mb-2">
                  Discovered Flows
                </div>
                <div className="space-y-2">
                  {(exploration as ExplorationWithFlows).discovered_flows!.map(
                    (flow, i) => (
                      <div
                        key={i}
                        className="p-2 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-elevated)]"
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-medium text-[var(--fg)]">{flow.name}</span>
                          <span
                            className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-[var(--font-mono)] font-medium ${
                              flow.complexity === "high"
                                ? "bg-red-100 text-red-700"
                                : flow.complexity === "medium"
                                  ? "bg-yellow-100 text-yellow-700"
                                  : "bg-green-100 text-green-700"
                            }`}
                          >
                            {flow.complexity}
                          </span>
                        </div>
                        <div className="text-[10px] text-[var(--muted)] font-[var(--font-mono)]">
                          {flow.steps.join(" → ")}
                        </div>
                      </div>
                    ),
                  )}
                </div>
              </div>
            )}

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
                    <div className="flex items-center gap-2">
                      <div className="text-sm font-medium text-[var(--fg)]">{scenario.name}</div>
                      <span className="inline-flex items-center rounded-full bg-[var(--accent)]/10 px-2 py-0.5 text-[10px] font-[var(--font-mono)] font-medium text-[var(--accent)]">
                        {scenario.area}
                      </span>
                    </div>
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
                  setGoal("");
                  setAdditionalUrlInput("");
                  setUserDismissed(true);
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

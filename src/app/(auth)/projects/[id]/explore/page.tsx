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
import { FlowCard } from "./FlowCard";
import { ScenarioList } from "./ScenarioList";
import {
  type Scenario,
  type CapturedPageWithUrl,
  type DiscoveredFlow,
  type PrdCoverageItem,
  type SelectionMode,
  makeToggleHandler,
  toggleAll,
  matchScenariosToFlows,
} from "./types";

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
  const [selectedFlows, setSelectedFlows] = useState<Set<number>>(new Set());
  const [selectionMode, setSelectionMode] = useState<SelectionMode>("flows");
  const [generating, setGenerating] = useState(false);
  const [userDismissed, setUserDismissed] = useState(false);

  const [goal, setGoal] = useState("");
  const [additionalUrlInput, setAdditionalUrlInput] = useState("");
  const [explorationMode, setExplorationMode] = useState<"scripted" | "autonomous">("scripted");
  const [maxSteps, setMaxSteps] = useState(25);

  const url = project?.app_url ?? "";

  const createExploration = useMutation(api.explorations.mutations.createExploration);
  const cancelExploration = useMutation(api.explorations.mutations.cancelExploration);
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

  const discoveredFlows = useMemo<DiscoveredFlow[]>(
    () => (exploration as { discovered_flows?: DiscoveredFlow[] } | null)?.discovered_flows ?? [],
    [exploration],
  );

  const prdCoverage = useMemo<PrdCoverageItem[]>(
    () => (exploration as { prd_coverage?: PrdCoverageItem[] } | null)?.prd_coverage ?? [],
    [exploration],
  );

  const prdGaps = useMemo(
    () => prdCoverage.filter((c) => !c.found),
    [prdCoverage],
  );

  const capturedPages = useMemo<CapturedPageWithUrl[]>(
    () => (exploration?.captured_pages as CapturedPageWithUrl[] | undefined) ?? [],
    [exploration],
  );

  const scenarios = useMemo<Scenario[]>(
    () => (exploration?.proposed_scenarios as Scenario[] | undefined) ?? [],
    [exploration],
  );

  const hasFlows = discoveredFlows.length > 0;

  const toggleFlow = useMemo(() => makeToggleHandler(setSelectedFlows), []);
  const toggleScenario = useMemo(() => makeToggleHandler(setSelectedScenarios), []);

  const handleStartExploration = useCallback(async () => {
    setError(null);
    setSelectedScenarios(new Set());
    setSelectedFlows(new Set());
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
        exploration_mode: explorationMode,
        ...(explorationMode === "autonomous" ? { max_steps: maxSteps } : {}),
      });
      setExplorationId(id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to start exploration";
      setError(msg);
      logError(msg, { severity: "error", context: { source: "ExplorePage" } });
    }
  }, [createExploration, projectId, goal, additionalUrlInput, explorationMode, maxSteps, logError]);

  const matchedScenarios = useMemo(() => {
    if (selectionMode !== "flows" || selectedFlows.size === 0) return [];
    const selectedFlowNames = discoveredFlows
      .filter((_: DiscoveredFlow, i: number) => selectedFlows.has(i))
      .map((f) => f.name);
    return matchScenariosToFlows(selectedFlowNames, scenarios);
  }, [selectionMode, selectedFlows, discoveredFlows, scenarios]);

  const handleCancel = useCallback(async () => {
    if (!effectiveExplorationId) return;
    try {
      await cancelExploration({ exploration_id: asId(effectiveExplorationId, "explorations") });
      setExplorationId(null);
      setUserDismissed(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to cancel";
      setError(msg);
      logError(msg, { severity: "error", context: { source: "ExplorePage.handleCancel" } });
    }
  }, [cancelExploration, effectiveExplorationId, logError]);

  const totalSelected = selectionMode === "flows" ? matchedScenarios.length : selectedScenarios.size;

  const handleGenerateTests = useCallback(async () => {
    if (!user) return;

    let selected: Scenario[];
    let flowContext: string | undefined;

    if (selectionMode === "flows" && selectedFlows.size > 0) {
      selected = matchedScenarios.length > 0 ? matchedScenarios : scenarios;
      const selectedFlowData = discoveredFlows.filter((_: DiscoveredFlow, i: number) =>
        selectedFlows.has(i),
      );
      flowContext = selectedFlowData
        .map(
          (f) =>
            `Flow: ${f.name}\nComplexity: ${f.complexity}\nSteps: ${f.steps.join(" → ")}\nPages: ${f.pages_involved.map((pi) => capturedPages[pi]?.title ?? `Page ${pi}`).join(", ")}`,
        )
        .join("\n\n");
    } else {
      selected = scenarios.filter((_: Scenario, i: number) =>
        selectedScenarios.has(i),
      );
    }

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
        flow_context: flowContext,
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
  }, [selectionMode, selectedFlows, selectedScenarios, matchedScenarios, scenarios, discoveredFlows, capturedPages, createSuitesForExploration, generateTests, effectiveExplorationId, router, params.id, logError, user, projectId]);

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

  const showScenarios = exploration?.status === "analyzed" && scenarios.length > 0;

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
                Explorer Mode
              </div>
              <div className="flex rounded-[var(--radius-sm)] border border-[var(--border)] overflow-hidden">
                <button
                  type="button"
                  onClick={() => setExplorationMode("scripted")}
                  className={`px-4 py-2 text-sm font-medium transition-colors ${
                    explorationMode === "scripted"
                      ? "bg-[var(--accent)] text-white"
                      : "bg-[var(--bg)] text-[var(--muted)] hover:text-[var(--fg)]"
                  }`}
                >
                  Smart Explorer
                </button>
                <button
                  type="button"
                  onClick={() => setExplorationMode("autonomous")}
                  className={`px-4 py-2 text-sm font-medium transition-colors ${
                    explorationMode === "autonomous"
                      ? "bg-[var(--accent)] text-white"
                      : "bg-[var(--bg)] text-[var(--muted)] hover:text-[var(--fg)]"
                  }`}
                >
                  Agent Explorer
                </button>
              </div>
              {explorationMode === "scripted" && (
                <p className="text-xs text-[var(--muted)] mt-1">
                  BFS crawl that visits pages, extracts structure, and discovers navigation flows.
                </p>
              )}
              {explorationMode === "autonomous" && (
                <p className="text-xs text-[var(--muted)] mt-1">
                  AI agent autonomously explores the app, discovering hidden flows, error states, and dynamic interactions.
                </p>
              )}
            </div>

            {explorationMode === "autonomous" && (
              <div className="mb-4">
                <div className="font-[var(--font-mono)] text-[11px] uppercase tracking-[0.05em] text-[var(--muted)] mb-2">
                  Max Steps
                </div>
                <input
                  type="number"
                  min={5}
                  max={100}
                  value={maxSteps}
                  onChange={(e) => setMaxSteps(Number(e.target.value))}
                  className="w-24 font-[var(--font-mono)] text-sm bg-[var(--bg)] text-[var(--fg)] border border-[var(--border)] rounded-[var(--radius-sm)] p-2 focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                />
                <p className="text-xs text-[var(--muted)] mt-1">
                  Maximum agent steps (5–100). More steps = deeper exploration but longer runtime.
                </p>
              </div>
            )}

            <div className="mb-4">
              <div className="font-[var(--font-mono)] text-[11px] uppercase tracking-[0.05em] text-[var(--muted)] mb-2">
                {explorationMode === "autonomous" ? "Goal / Instruction" : "Goal / Focus"} (optional)
              </div>
              <textarea
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder={
                  explorationMode === "autonomous"
                    ? "e.g., Explore the checkout process end-to-end, including cart, payment, and order confirmation"
                    : "e.g., Focus on checkout and payment flows"
                }
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
            <div className="mt-3">
              <Button variant="secondary" onClick={handleCancel}>
                Cancel Exploration
              </Button>
            </div>
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
            {capturedPages.length > 0 && (
              <div className="mb-4">
                <div className="font-[var(--font-mono)] text-[11px] uppercase tracking-[0.05em] text-[var(--muted)] mb-2">
                  Captured Pages ({capturedPages.length})
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {capturedPages.map((page, i) =>
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

            {hasFlows && (
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="font-[var(--font-mono)] text-[11px] uppercase tracking-[0.05em] text-[var(--muted)]">
                    Discovered Flows ({discoveredFlows.length})
                  </div>
                  {selectionMode === "flows" && (
                    <button
                      type="button"
                      onClick={() => toggleAll(setSelectedFlows, selectedFlows, discoveredFlows.length)}
                      className="text-[10px] font-[var(--font-mono)] text-[var(--accent)] hover:underline"
                    >
                      {selectedFlows.size === discoveredFlows.length ? "Deselect all" : "Select all"}
                    </button>
                  )}
                </div>
                <div className="space-y-2">
                  {discoveredFlows.map((flow, i) => (
                    <FlowCard
                      key={i}
                      flow={flow}
                      index={i}
                      selected={selectedFlows.has(i)}
                      mode={selectionMode}
                      capturedPages={capturedPages}
                      onToggle={toggleFlow}
                    />
                  ))}
                </div>
              </div>
            )}

            {prdCoverage.length > 0 && (
              <div className="mb-4">
                <div className="font-[var(--font-mono)] text-[11px] uppercase tracking-[0.05em] text-[var(--muted)] mb-2">
                  PRD Coverage ({prdCoverage.filter((c) => c.found).length}/{prdCoverage.length} features found)
                </div>
                <div className="space-y-1">
                  {prdCoverage.map((item, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 text-xs px-2 py-1 rounded-[var(--radius-sm)] bg-[var(--surface-elevated)]"
                    >
                      <span className={`inline-block w-2 h-2 rounded-full ${item.found ? "bg-green-500" : "bg-red-400"}`} />
                      <span className={item.found ? "text-[var(--fg)]" : "text-[var(--fg)] font-medium"}>
                        {item.feature}
                      </span>
                      {!item.found && (
                        <span className="text-[var(--muted)] ml-auto">Not found during exploration</span>
                      )}
                    </div>
                  ))}
                </div>
                {prdGaps.length > 0 && (
                  <div className="mt-2 p-2 rounded-[var(--radius-sm)] border border-amber-300/30 bg-amber-50/10">
                    <p className="text-xs text-amber-600">
                      {prdGaps.length} PRD feature{prdGaps.length !== 1 ? "s" : ""} not found during exploration.
                      The AI will still propose scenarios for these gaps.
                    </p>
                  </div>
                )}
              </div>
            )}

            <div className="mb-3">
              <div className="flex items-center gap-2 mb-3">
                {hasFlows && (
                  <div className="flex rounded-[var(--radius-sm)] border border-[var(--border)] overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setSelectionMode("flows")}
                      className={`px-3 py-1 text-[11px] font-[var(--font-mono)] transition-colors ${
                        selectionMode === "flows"
                          ? "bg-[var(--accent)] text-white"
                          : "bg-[var(--bg)] text-[var(--muted)] hover:text-[var(--fg)]"
                      }`}
                    >
                      Select Flows
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectionMode("scenarios")}
                      className={`px-3 py-1 text-[11px] font-[var(--font-mono)] transition-colors ${
                        selectionMode === "scenarios"
                          ? "bg-[var(--accent)] text-white"
                          : "bg-[var(--bg)] text-[var(--muted)] hover:text-[var(--fg)]"
                      }`}
                    >
                      Select Scenarios
                    </button>
                  </div>
                )}
                {!hasFlows && (
                  <div className="font-[var(--font-mono)] text-[11px] uppercase tracking-[0.05em] text-[var(--muted)]">
                    Proposed Scenarios ({scenarios.length})
                  </div>
                )}
              </div>
            </div>

            {(selectionMode === "scenarios" || !hasFlows) && (
              <ScenarioList
                scenarios={scenarios}
                selectedIndices={selectedScenarios}
                onToggle={toggleScenario}
                onSelectAll={() => toggleAll(setSelectedScenarios, selectedScenarios, scenarios.length)}
                totalScenarios={scenarios.length}
              />
            )}

            {selectionMode === "flows" && selectedFlows.size > 0 && (
              <div className="mb-4 p-3 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-elevated)]">
                <div className="text-xs text-[var(--muted)]">
                  {selectedFlows.size} flow{selectedFlows.size !== 1 ? "s" : ""} selected
                  {matchedScenarios.length > 0
                    ? ` — ${matchedScenarios.length} matching scenario${matchedScenarios.length !== 1 ? "s" : ""} will be generated.`
                    : " — all scenarios will be generated (no specific matches found)."}
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <Button
                onClick={handleGenerateTests}
                disabled={totalSelected === 0 || generating}
              >
                {generating
                  ? "Generating..."
                  : `Generate Tests from Selected (${totalSelected})`}
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setExplorationId(null);
                  setSelectedScenarios(new Set());
                  setSelectedFlows(new Set());
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

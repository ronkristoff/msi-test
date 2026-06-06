"use client";

import { useState, useCallback, useMemo } from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation, useAction } from "convex/react";
import { api, asId } from "@/lib/convex";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { useErrorLogger } from "@/lib/error-logger";
import { PageSkeleton } from "@/components/ui/Skeleton";
import { PhaseIndicator } from "@/components/PhaseIndicator";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import Link from "next/link";
import { FlowCard } from "./FlowCard";
import { ScenarioList } from "./ScenarioList";
import { FeatureMapGraph } from "./FeatureMapGraph";
import {
  type Scenario,
  type CapturedPageWithUrl,
  type DiscoveredFlow,
  type DiscoveredPage,
  type PrdCoverageItem,
  type SelectionMode,
  makeToggleHandler,
  toggleAll,
  toggleArea,
  areasWithoutScenarios,
} from "./types";
import { PageChecklist } from "./PageChecklist";

export default function ExplorePage() {
  const params = useParams<{ id: string }>();
  const { logError } = useErrorLogger();
  const projectId = asId(params.id, "projects");
  const project = useQuery(api.projects.queries.getProject, { project_id: projectId });

  const [error, setError] = useState<string | null>(null);
  const [explorationId, setExplorationId] = useState<string | null>(null);
  const [selectedScenarios, setSelectedScenarios] = useState<Set<number>>(new Set());
  const [selectedFlows, setSelectedFlows] = useState<Set<number>>(new Set());
  const [selectedDiscoveredPages, setSelectedDiscoveredPages] = useState<Set<number>>(new Set());
  const [pageAuthFlags, setPageAuthFlags] = useState<Map<number, boolean>>(new Map());
  const [selectionMode, setSelectionMode] = useState<SelectionMode>("flows");
  const [generating, setGenerating] = useState(false);
  const [userDismissed, setUserDismissed] = useState(false);
  const [showListView, setShowListView] = useState(false);
  const [showNewExplorationConfirm, setShowNewExplorationConfirm] = useState(false);

  const [goal, setGoal] = useState("");
  const [additionalUrlInput, setAdditionalUrlInput] = useState("");
  const [manualUrlInput, setManualUrlInput] = useState("");

  const url = project?.app_url ?? "";

  const createExploration = useMutation(api.explorations.mutations.createExploration);
  const cancelExploration = useMutation(api.explorations.mutations.cancelExploration);
  const startDeepExploration = useMutation(api.explorations.mutations.startDeepExploration);
  const updateDiscoveredPages = useMutation(api.explorations.mutations.updateDiscoveredPages);
  const createSuitesForExploration = useMutation(api.suites.mutations.createSuitesForExploration);
  const generateTestsForArea = useAction(api.ai.exploreApp.generateExplorationTestsForArea);
  const markGeneratedAreas = useMutation(api.explorations.mutations.markGeneratedAreas);
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

  const explorationSuites = useQuery(
    api.explorations.queries.getSuitesForExploration,
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

  const discoveredPagesList = useMemo<DiscoveredPage[]>(
    () => (exploration as { discovered_pages?: DiscoveredPage[] } | null)?.discovered_pages ?? [],
    [exploration],
  );

  const generatedAreas = useMemo<Set<string>>(
    () => new Set((exploration as { generated_areas?: string[] } | null)?.generated_areas ?? []),
    [exploration],
  );

  const emptyAreas = useMemo(
    () => areasWithoutScenarios(scenarios, prdGaps.map((g) => g.feature)),
    [scenarios, prdGaps],
  );

  const hasFlows = discoveredFlows.length > 0;
  const showScenarioSelection = selectionMode === "scenarios" || !hasFlows;

  const toggleFlow = useMemo(() => makeToggleHandler(setSelectedFlows), []);
  const toggleScenario = useMemo(() => makeToggleHandler(setSelectedScenarios), []);

  const handleToggleArea = useCallback(
    (area: string) => toggleArea(setSelectedScenarios, scenarios, area),
    [scenarios],
  );

  const handleDiscoverPages = useCallback(async () => {
    setError(null);
    setSelectedScenarios(new Set());
    setSelectedFlows(new Set());
    setSelectedDiscoveredPages(new Set());
    setPageAuthFlags(new Map());
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
      const msg = err instanceof Error ? err.message : "Failed to start discovery";
      setError(msg);
      logError(msg, { severity: "error", context: { source: "ExplorePage" } });
    }
  }, [createExploration, projectId, goal, additionalUrlInput, logError]);

  const handleAuthToggle = useCallback((index: number) => {
    setPageAuthFlags((prev) => {
      const next = new Map(prev);
      const current = next.get(index) ?? true;
      next.set(index, !current);
      return next;
    });
  }, []);

  const handleExploreSelected = useCallback(async () => {
    if (!effectiveExplorationId) return;
    setError(null);
    try {
      const selectedPages = discoveredPagesList
        .filter((_: DiscoveredPage, i: number) => selectedDiscoveredPages.has(i));

      if (selectedPages.length === 0) return;

      const pageAuthFlagsArg = discoveredPagesList
        .map((p: DiscoveredPage, i: number) => ({
          url: p.url,
          auth_required: pageAuthFlags.get(i) ?? true,
        }));

      await startDeepExploration({
        exploration_id: asId(effectiveExplorationId, "explorations"),
        selected_pages: selectedPages.map((p: DiscoveredPage) => p.url),
        page_auth_flags: pageAuthFlagsArg,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to start deep exploration";
      setError(msg);
      logError(msg, { severity: "error", context: { source: "ExplorePage" } });
    }
  }, [effectiveExplorationId, discoveredPagesList, selectedDiscoveredPages, pageAuthFlags, startDeepExploration, logError]);

  const handleAddManualUrls = useCallback(async () => {
    if (!effectiveExplorationId || !manualUrlInput.trim()) return;
    try {
      const urls = manualUrlInput
        .split("\n")
        .map((u) => u.trim())
        .filter((u) => u.length > 0);
      await updateDiscoveredPages({
        exploration_id: asId(effectiveExplorationId, "explorations"),
        additional_urls: urls,
      });
      setManualUrlInput("");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to add URLs";
      setError(msg);
      logError(msg, { severity: "error", context: { source: "ExplorePage" } });
    }
  }, [effectiveExplorationId, manualUrlInput, updateDiscoveredPages, logError]);

  const matchedScenarios = useMemo(() => {
    if (selectionMode !== "flows" || selectedFlows.size === 0) return [];
    const selectedFlowNames = discoveredFlows
      .filter((_: DiscoveredFlow, i: number) => selectedFlows.has(i))
      .map((f) => f.name);
    const flowNameSet = new Set(selectedFlowNames);
    return scenarios.filter((s) =>
      s.related_flows?.some((rf) => flowNameSet.has(rf)),
    );
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

  const selectableCount = selectionMode === "flows"
    ? matchedScenarios.filter((s) => !generatedAreas.has(s.area)).length
    : [...selectedScenarios].filter((i) => scenarios[i] && !generatedAreas.has(scenarios[i].area)).length;

  const handleGenerateTests = useCallback(async () => {
    if (!user) return;

    let selected: Scenario[];
    let flowContext: string | undefined;

    if (selectionMode === "flows" && selectedFlows.size > 0) {
      selected = matchedScenarios.filter((s) => !generatedAreas.has(s.area));
      if (selected.length === 0) return;
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
        selectedScenarios.has(i) && !generatedAreas.has(scenarios[i].area),
      );
    }

    if (selected.length === 0) return;

    setGenerating(true);
    setError(null);
    try {
      const areas = [...new Set(selected.map((s: Scenario) => s.area))];
      const resolvedExplorationId = asId(effectiveExplorationId!, "explorations");
      const suiteResults = await createSuitesForExploration({
        project_id: projectId,
        areas,
        source_type: "url_exploration",
        triggered_by: user._id,
        exploration_id: resolvedExplorationId,
      });

      for (const { area, suite_id } of suiteResults) {
        const areaScenarios = selected.filter((s: Scenario) => s.area === area);
        generateTestsForArea({
          exploration_id: resolvedExplorationId,
          scenarios: areaScenarios,
          suite_id,
          area,
          flow_context: flowContext,
        }).catch((err) => {
          logError(err instanceof Error ? err.message : `Test generation failed for ${area}`, {
            severity: "error",
            context: { source: "ExplorePage.handleGenerateTests", area },
          });
        });
      }

      await markGeneratedAreas({
        exploration_id: resolvedExplorationId,
        areas,
      });

      setSelectedScenarios(new Set());
      setSelectedFlows(new Set());
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to create suites";
      setError(msg);
      logError(msg, { severity: "error", context: { source: "ExplorePage.handleGenerateTests" } });
    } finally {
      setGenerating(false);
    }
  }, [selectionMode, selectedFlows, selectedScenarios, matchedScenarios, scenarios, discoveredFlows, capturedPages, createSuitesForExploration, generateTestsForArea, markGeneratedAreas, effectiveExplorationId, logError, user, projectId, generatedAreas]);

  const handleNewExploration = useCallback(() => {
    setExplorationId(null);
    setSelectedScenarios(new Set());
    setSelectedFlows(new Set());
    setSelectedDiscoveredPages(new Set());
    setPageAuthFlags(new Map());
    setGoal("");
    setAdditionalUrlInput("");
    setUserDismissed(true);
    setShowNewExplorationConfirm(false);
  }, []);

  const isInProgress =
    exploration?.status === "discovering" ||
    exploration?.status === "capturing" ||
    exploration?.status === "captured" ||
    exploration?.status === "analyzing";

  const showScenarios = (exploration?.status === "analyzed" || exploration?.status === "completed") && scenarios.length > 0;

  const phases = useMemo(() => {
    if (!effectiveExplorationId) {
      return [
        { label: "Configure", status: "current" as const },
        { label: "Discover", status: "upcoming" as const },
        { label: "Deep Explore", status: "upcoming" as const },
        { label: "Select", status: "upcoming" as const },
        { label: "Generate", status: "upcoming" as const },
      ];
    }
    if (exploration?.status === "discovered") {
      return [
        { label: "Configure", status: "completed" as const },
        { label: "Discover", status: "completed" as const },
        { label: "Deep Explore", status: "current" as const },
        { label: "Select", status: "upcoming" as const },
        { label: "Generate", status: "upcoming" as const },
      ];
    }
    if (isInProgress) {
      const currentIdx = exploration?.status === "discovering" ? 1 : exploration?.status === "capturing" ? 2 : 2;
      return [
        { label: "Configure", status: "completed" as const },
        { label: "Discover", status: (currentIdx >= 1 ? "completed" : "current") as "completed" | "current" },
        { label: "Deep Explore", status: (currentIdx >= 2 ? "completed" : "current") as "completed" | "current" },
        { label: "Select", status: "upcoming" as const },
        { label: "Generate", status: "upcoming" as const },
      ];
    }
    if (showScenarios && exploration?.status !== "completed") {
      return [
        { label: "Configure", status: "completed" as const },
        { label: "Discover", status: "completed" as const },
        { label: "Deep Explore", status: "completed" as const },
        { label: "Select", status: "current" as const },
        { label: "Generate", status: "upcoming" as const },
      ];
    }
    if (exploration?.status === "completed") {
      return [
        { label: "Configure", status: "completed" as const },
        { label: "Discover", status: "completed" as const },
        { label: "Deep Explore", status: "completed" as const },
        { label: "Select", status: "completed" as const },
        { label: "Generate", status: "completed" as const },
      ];
    }
    return [
      { label: "Configure", status: "current" as const },
      { label: "Discover", status: "upcoming" as const },
      { label: "Deep Explore", status: "upcoming" as const },
      { label: "Select", status: "upcoming" as const },
      { label: "Generate", status: "upcoming" as const },
    ];
  }, [effectiveExplorationId, exploration?.status, isInProgress, showScenarios]);

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

  return (
    <div className="max-w-[1080px]">
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] p-6 shadow-[var(--elev-raised)]">
        <div className="mb-5">
          <h2 className="font-[var(--font-display)] text-xl font-bold text-[var(--fg)] mb-1">
            Explore & Generate Tests
          </h2>
          <p className="text-sm text-[var(--muted)]">
            Crawl the site, identify testable scenarios, and generate Playwright tests.
          </p>
        </div>

        <PhaseIndicator phases={phases} />

        {error && <Alert variant="error" className="mb-5">{error}</Alert>}

        {/* Phase: Configure */}
        {!effectiveExplorationId && (
          <div className="space-y-5">
            <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 p-4 rounded-[var(--radius-sm)] bg-[var(--border-soft)]">
              <span className="text-[11px] font-[var(--font-mono)] uppercase tracking-[0.05em] text-[var(--muted)] self-center">Project</span>
              <div className="text-sm font-medium text-[var(--fg)]">{project.name}</div>
              <span className="text-[11px] font-[var(--font-mono)] uppercase tracking-[0.05em] text-[var(--muted)] self-center">URL</span>
              <div className="text-sm text-[var(--fg)]">{url || project.app_url}</div>
            </div>

            <div>
              <label className="block font-[var(--font-mono)] text-[11px] uppercase tracking-[0.05em] text-[var(--muted)] mb-2">
                Goal / Focus (optional)
              </label>
              <textarea
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder={"e.g., Focus on checkout and payment flows"}
                className="w-full min-h-[60px] max-h-[120px] px-3 py-[9px] border border-[var(--border)] rounded-[var(--radius-sm)] text-sm bg-[var(--surface)] text-[var(--fg)] outline-none focus:border-[var(--accent)] focus:shadow-[var(--focus-ring)] transition-all duration-[var(--motion-fast)] placeholder:text-[var(--muted)] resize-y"
              />
            </div>

            <div>
              <label className="block font-[var(--font-mono)] text-[11px] uppercase tracking-[0.05em] text-[var(--muted)] mb-2">
                Additional URLs (optional)
              </label>
              <textarea
                value={additionalUrlInput}
                onChange={(e) => setAdditionalUrlInput(e.target.value)}
                placeholder={"One URL per line — pages the crawler might miss\nhttps://example.com/cart\nhttps://example.com/checkout"}
                className="w-full min-h-[60px] max-h-[120px] px-3 py-[9px] border border-[var(--border)] rounded-[var(--radius-sm)] text-sm bg-[var(--surface)] text-[var(--fg)] outline-none focus:border-[var(--accent)] focus:shadow-[var(--focus-ring)] transition-all duration-[var(--motion-fast)] placeholder:text-[var(--muted)] resize-y"
              />
            </div>

            <div className="flex gap-3">
              <Button onClick={handleDiscoverPages} disabled={!url}>
                Discover Pages
              </Button>
              <Link href={`/projects/${params.id}`}>
                <Button variant="secondary">Cancel</Button>
              </Link>
            </div>
          </div>
        )}

        {/* Phase: In progress */}
        {isInProgress && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-[var(--muted)]">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              {exploration?.status === "discovering" && (exploration.progress_message || "Discovering pages...")}
              {exploration?.status === "capturing" && (exploration.progress_message || "Deep exploring pages...")}
              {exploration?.status === "captured" && "Capture complete. Preparing analysis..."}
              {exploration?.status === "analyzing" && "Analyzing pages and identifying scenarios..."}
            </div>
            {exploration?.pages_captured != null && exploration.pages_captured > 0 && (
              <div className="text-xs text-[var(--muted)]">
                {exploration.pages_captured} page{exploration.pages_captured !== 1 ? "s" : ""} captured
              </div>
            )}
            <div className="text-xs text-[var(--muted)]">
              This usually takes 30-60 seconds depending on the number of pages.
            </div>
            <Button variant="secondary" size="sm" onClick={handleCancel}>
              Cancel
            </Button>
          </div>
        )}

        {/* Phase: Select discovered pages */}
        {exploration?.status === "discovered" && (
          <div className="space-y-5">
            <PageChecklist
              pages={discoveredPagesList}
              selectedIndices={selectedDiscoveredPages}
              onToggle={makeToggleHandler(setSelectedDiscoveredPages)}
              onSelectAll={() => setSelectedDiscoveredPages(new Set(Array.from({ length: discoveredPagesList.length }, (_, i) => i)))}
              onDeselectAll={() => setSelectedDiscoveredPages(new Set())}
              authFlags={pageAuthFlags}
              onAuthToggle={handleAuthToggle}
            />

            <div>
              <label className="block font-[var(--font-mono)] text-[11px] uppercase tracking-[0.05em] text-[var(--muted)] mb-2">
                Add More URLs (optional)
              </label>
              <div className="flex gap-2">
                <textarea
                  value={manualUrlInput}
                  onChange={(e) => setManualUrlInput(e.target.value)}
                  placeholder={"https://example.com/extra-page"}
                  className="flex-1 min-h-[36px] max-h-[60px] px-3 py-2 border border-[var(--border)] rounded-[var(--radius-sm)] text-sm bg-[var(--surface)] text-[var(--fg)] outline-none focus:border-[var(--accent)] focus:shadow-[var(--focus-ring)] transition-all duration-[var(--motion-fast)] placeholder:text-[var(--muted)] resize-y"
                />
                <Button variant="secondary" onClick={handleAddManualUrls} disabled={!manualUrlInput.trim()}>
                  Add URLs
                </Button>
              </div>
            </div>

            <div className="flex gap-3">
              <Button onClick={handleExploreSelected} disabled={selectedDiscoveredPages.size === 0}>
                Deep Explore Selected ({selectedDiscoveredPages.size})
              </Button>
              <Button
                variant="secondary"
                onClick={() => { setExplorationId(null); setError(null); setUserDismissed(true); setSelectedDiscoveredPages(new Set()); setPageAuthFlags(new Map()); }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Phase: Failed */}
        {exploration?.status === "failed" && (
          <div className="space-y-4">
            <Alert variant="error">
              Exploration failed: {exploration.error_message || "Unknown error. Try again or check your AI configuration."}
            </Alert>
            <div className="flex gap-3">
              <Button onClick={() => { setExplorationId(null); setError(null); setUserDismissed(true); }}>
                Try Again
              </Button>
              <Link href={`/projects/${params.id}`}>
                <Button variant="secondary">Back</Button>
              </Link>
            </div>
          </div>
        )}

        {/* Phase: Select scenarios (analyzed or partially completed) */}
        {showScenarios && (
          <div className="space-y-5">
            {generatedAreas.size > 0 && (
              <Alert variant="success">
                {generatedAreas.size} area{generatedAreas.size !== 1 ? "s" : ""} already generated. Select more scenarios below, or view your suites.
              </Alert>
            )}

            {capturedPages.length > 0 && (
              <div>
                <div className="text-[11px] font-[var(--font-mono)] font-semibold uppercase tracking-[0.05em] text-[var(--muted)] mb-2">
                  Captured Pages ({capturedPages.length})
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-2">
                  {capturedPages.map((page, i) =>
                    page.screenshot_url ? (
                      <a
                        key={i}
                        href={page.screenshot_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block rounded-[var(--radius-sm)] border border-[var(--border)] overflow-hidden hover:border-[var(--accent)] transition-colors"
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
                        className="flex items-center justify-center h-20 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--border-soft)]"
                      >
                        <span className="text-[10px] text-[var(--muted)] truncate px-2">{page.title}</span>
                      </div>
                    ),
                  )}
                </div>
              </div>
            )}

            {hasFlows && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-[var(--font-mono)] font-semibold uppercase tracking-[0.05em] text-[var(--muted)]">
                    Discovered Flows ({discoveredFlows.length})
                  </span>
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
              <div>
                <div className="text-[11px] font-[var(--font-mono)] font-semibold uppercase tracking-[0.05em] text-[var(--muted)] mb-2">
                  PRD Coverage ({prdCoverage.filter((c) => c.found).length}/{prdCoverage.length} features found)
                </div>
                <div className="space-y-1">
                  {prdCoverage.map((item, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 text-xs px-2 py-1 rounded-[var(--radius-sm)] bg-[var(--border-soft)]"
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

            <div>
              <div className="flex items-center gap-2 mb-1">
                {hasFlows && (
                  <div className="flex rounded-[var(--radius-sm)] border border-[var(--border)] overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setSelectionMode("flows")}
                      className={`px-3 py-1 text-[11px] font-[var(--font-mono)] transition-colors ${
                        selectionMode === "flows"
                          ? "bg-[var(--accent)] text-white"
                          : "bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--fg)]"
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
                          : "bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--fg)]"
                      }`}
                    >
                      Select Scenarios
                    </button>
                  </div>
                )}
                {!hasFlows && (
                  <span className="text-[11px] font-[var(--font-mono)] font-semibold uppercase tracking-[0.05em] text-[var(--muted)]">
                    Proposed Scenarios ({scenarios.length})
                  </span>
                )}
                {showScenarioSelection && (
                  <button
                    type="button"
                    onClick={() => setShowListView((v) => !v)}
                    className="ml-auto text-[10px] font-[var(--font-mono)] text-[var(--accent)] hover:underline"
                  >
                    {showListView ? "Map View" : "List View"}
                  </button>
                )}
              </div>
              {hasFlows && (
                <p className="text-xs text-[var(--muted)] mb-3">
                  Select flows to auto-match related scenarios, or pick individual scenarios.
                </p>
              )}
            </div>

            {showScenarioSelection && !showListView && (
              <FeatureMapGraph
                scenarios={scenarios}
                emptyAreas={emptyAreas}
                selectedIndices={selectedScenarios}
                onToggleScenario={toggleScenario}
                onToggleArea={handleToggleArea}
                generatedAreas={generatedAreas}
              />
            )}

            {showScenarioSelection && showListView && (
              <ScenarioList
                scenarios={scenarios}
                selectedIndices={selectedScenarios}
                onToggle={toggleScenario}
                onSelectAll={() => toggleAll(setSelectedScenarios, selectedScenarios, scenarios.length)}
                totalScenarios={scenarios.length}
                generatedAreas={generatedAreas}
              />
            )}

            {selectionMode === "flows" && selectedFlows.size > 0 && (
              <div className="p-3 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--border-soft)]">
                <div className="text-xs text-[var(--muted)]">
                  {matchedScenarios.length > 0
                    ? `${matchedScenarios.length} matching scenario${matchedScenarios.length !== 1 ? "s" : ""} will be generated.`
                    : "No scenarios match the selected flows. Switch to scenario selection to choose manually."}
                </div>
              </div>
            )}

            <div className="flex gap-3 pt-4 border-t border-[var(--border-soft)]">
              <Button
                onClick={handleGenerateTests}
                disabled={selectableCount === 0 || generating}
              >
                {generating
                  ? "Generating..."
                  : scenarios.every((s) => generatedAreas.has(s.area))
                    ? "All scenarios generated"
                    : `Generate Tests from Selected (${selectableCount})`}
              </Button>
              <Button
                variant="secondary"
                onClick={() => setShowNewExplorationConfirm(true)}
              >
                New Exploration
              </Button>
              {explorationSuites && explorationSuites.length > 0 && (
                <Link href={`/projects/${params.id}`} className="ml-auto self-center">
                  <Button variant="secondary" size="sm">
                    View Suites ({explorationSuites.length})
                  </Button>
                </Link>
              )}
            </div>
          </div>
        )}

        {/* Phase: Completed */}
        {exploration?.status === "completed" && !showScenarios && (
          <div className="space-y-4">
            <Alert variant="success">All test scenarios generated.</Alert>
            {explorationSuites && explorationSuites.length > 0 && (
              <div>
                <div className="text-[11px] font-[var(--font-mono)] font-semibold uppercase tracking-[0.05em] text-[var(--muted)] mb-2">
                  Created Suites ({explorationSuites.length})
                </div>
                <div className="space-y-1.5">
                  {explorationSuites.map((suite) => (
                    <Link
                      key={suite._id}
                      href={`/projects/${params.id}/suites/${suite._id}`}
                      className="flex items-center justify-between px-3 py-2 rounded-[var(--radius-sm)] border border-[var(--border)] hover:border-[var(--accent)] transition-colors"
                    >
                      <span className="text-sm font-medium text-[var(--fg)]">{suite.name}</span>
                      <span className="text-[10px] font-[var(--font-mono)] text-[var(--muted)]">{suite.area}</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
            <div className="flex gap-3">
              <Link href={`/projects/${params.id}`}>
                <Button>Back to Project</Button>
              </Link>
            </div>
          </div>
        )}
      </div>

      {showNewExplorationConfirm && (
        <ConfirmDialog
          title="Start new exploration?"
          message="This will discard the current exploration and all discovered pages. This cannot be undone."
          confirmLabel="Start New"
          variant="primary"
          onConfirm={handleNewExploration}
          onCancel={() => setShowNewExplorationConfirm(false)}
        />
      )}
    </div>
  );
}

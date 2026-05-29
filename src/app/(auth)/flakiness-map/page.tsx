"use client";

import { useState, useCallback, useMemo } from "react";
import { useQuery, useAction } from "convex/react";
import { api } from "@/lib/convex";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  FilterBar,
  HeatmapGrid,
  TestDetailPanel,
  ClusterAnnotations,
  buildCsvContent,
  downloadCsv,
} from "@/components/FlakinessMap";
import type { FilterMode } from "@/components/FlakinessMap";

export default function FlakinessMapPage() {
  const [activeFilter, setActiveFilter] = useState<FilterMode>("all");
  const [selectedTestId, setSelectedTestId] = useState<string | null>(null);

  const mapData = useQuery(api.flakiness.queries.getFlakinessMap);
  const analyzeClusters = useAction(api.flakiness.actions.analyzeFlakinessClusters);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const filteredTests = useMemo(() => {
    if (!mapData) return [];
    const tests = mapData.tests;
    switch (activeFilter) {
      case "flaky":
        return tests.filter((t) => t.flakinessPct > 0);
      case "stable":
        return tests.filter((t) => t.flakinessPct === 0);
      default:
        return tests;
    }
  }, [mapData, activeFilter]);

  const flakyCount = useMemo(
    () => (mapData?.tests.filter((t) => t.flakinessPct > 0).length ?? 0),
    [mapData],
  );
  const stableCount = useMemo(
    () => (mapData?.tests.filter((t) => t.flakinessPct === 0).length ?? 0),
    [mapData],
  );

  const handleAnalyzeClusters = useCallback(async () => {
    setIsAnalyzing(true);
    try {
      await analyzeClusters({});
    } finally {
      setIsAnalyzing(false);
    }
  }, [analyzeClusters]);

  const handleExportCsv = useCallback(() => {
    if (!mapData) return;
    const content = buildCsvContent(mapData.tests, mapData.runs);
    downloadCsv(content, `flakiness-map-${new Date().toISOString().split("T")[0]}.csv`);
  }, [mapData]);

  const handleSelectTest = useCallback((testId: string) => {
    setSelectedTestId((prev) => (prev === testId ? null : testId));
  }, []);

  if (mapData === undefined) {
    return <div className="text-[var(--muted)] text-sm">Loading...</div>;
  }

  if (!mapData || mapData.runs.length === 0) {
    return (
      <EmptyState
        icon={
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <line x1="3" y1="9" x2="21" y2="9" />
            <line x1="3" y1="15" x2="21" y2="15" />
            <line x1="9" y1="3" x2="9" y2="21" />
            <line x1="15" y1="3" x2="15" y2="21" />
          </svg>
        }
        title="Flakiness data unavailable"
        description="Run some tests to populate the flakiness heatmap. The map shows test stability across recent runs."
      />
    );
  }

  const selectedTest = selectedTestId
    ? mapData.tests.find((t) => t.testId === selectedTestId) ?? null
    : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-[var(--font-display)] text-2xl font-bold text-[var(--fg)]">
          Flakiness Map
        </h1>
        <p className="text-sm text-[var(--muted)] mt-1">
          Test stability across the last {mapData.runs.length} runs
        </p>
      </div>

      <FilterBar
        activeFilter={activeFilter}
        onFilterChange={setActiveFilter}
        onAnalyzeClusters={handleAnalyzeClusters}
        onExportCsv={handleExportCsv}
        isAnalyzing={isAnalyzing}
        flakyCount={flakyCount}
        stableCount={stableCount}
        totalCount={mapData.tests.length}
      />

      {mapData.clusters.length > 0 && (
        <ClusterAnnotations clusters={mapData.clusters} />
      )}

      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] p-4 shadow-[var(--elev-raised)]">
        <HeatmapGrid
          tests={filteredTests}
          runs={mapData.runs}
          selectedTestId={selectedTestId}
          onSelectTest={handleSelectTest}
        />
      </div>

      {selectedTest && (
        <TestDetailPanel
          test={selectedTest}
          runs={mapData.runs}
          onClose={() => setSelectedTestId(null)}
        />
      )}
    </div>
  );
}

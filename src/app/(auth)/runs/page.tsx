"use client";

import { useState, useCallback } from "react";
import { useQuery } from "convex/react";
import { api, asId } from "@/lib/convex";
import { RunsList, type StatusTab, type SortField, type SortOrder } from "@/components/RunsList";

const TAB_CONFIG: Record<
  StatusTab,
  {
    status: "running" | "passed" | "failed" | "cancelled" | "timed_out" | undefined;
    flaky_only: boolean;
  }
> = {
  all: { status: undefined, flaky_only: false },
  failed: { status: "failed", flaky_only: false },
  flaky: { status: undefined, flaky_only: true },
  running: { status: "running", flaky_only: false },
  passed: { status: "passed", flaky_only: false },
  cancelled: { status: "cancelled", flaky_only: false },
};

export default function RunsPage() {
  const [activeTab, setActiveTab] = useState<StatusTab>("all");
  const [selectedBranch, setSelectedBranch] = useState("");
  const [selectedEnvironment, setSelectedEnvironment] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [sortField, setSortField] = useState<SortField>("recency");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  const tabConfig = TAB_CONFIG[activeTab];

  const filterOpts = useQuery(api.runs.queries.getRunFilterOptions);
  const runs = useQuery(api.runs.queries.getWorkspaceRuns, {
    status: tabConfig.status,
    branch: selectedBranch || undefined,
    environment_id: selectedEnvironment
      ? asId(selectedEnvironment, "environments")
      : undefined,
    search: searchTerm || undefined,
    sort_by: sortField,
    sort_order: sortOrder,
    flaky_only: tabConfig.flaky_only,
  });

  const handleSort = useCallback(
    (field: SortField) => {
      if (sortField === field) {
        setSortOrder((o) => (o === "desc" ? "asc" : "desc"));
      } else {
        setSortField(field);
        setSortOrder("desc");
      }
    },
    [sortField],
  );

  if (runs === undefined || filterOpts === undefined) {
    return <div className="text-[var(--muted)] text-sm">Loading...</div>;
  }

  return (
    <RunsList
      runs={runs}
      statusCounts={filterOpts.statusCounts}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      branches={filterOpts.branches}
      environments={filterOpts.environments}
      selectedBranch={selectedBranch}
      selectedEnvironment={selectedEnvironment}
      onBranchChange={setSelectedBranch}
      onEnvironmentChange={setSelectedEnvironment}
      searchTerm={searchTerm}
      onSearchChange={setSearchTerm}
      sortField={sortField}
      sortOrder={sortOrder}
      onSort={handleSort}
    />
  );
}

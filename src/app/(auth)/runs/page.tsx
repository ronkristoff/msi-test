"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api, asId } from "@/lib/convex";
import { RunsList, type StatusTab } from "@/components/RunsList";

const TAB_TO_STATUS: Record<StatusTab, "running" | "passed" | "failed" | "cancelled" | "timed_out" | undefined> = {
  all: undefined,
  running: "running",
  passed: "passed",
  failed: "failed",
  cancelled: "cancelled",
};

export default function RunsPage() {
  const [activeTab, setActiveTab] = useState<StatusTab>("all");
  const [selectedBranch, setSelectedBranch] = useState("");
  const [selectedEnvironment, setSelectedEnvironment] = useState("");

  const filterOpts = useQuery(api.runs.queries.getRunFilterOptions);
  const runs = useQuery(api.runs.queries.getWorkspaceRuns, {
    status: TAB_TO_STATUS[activeTab],
    branch: selectedBranch || undefined,
    environment_id: selectedEnvironment ? asId(selectedEnvironment, "environments") : undefined,
  });

  if (runs === undefined || filterOpts === undefined) {
    return <div className="text-[var(--muted)] text-sm">Loading...</div>;
  }

  return (
    <RunsList
      runs={runs}
      statusCounts={{}}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      branches={filterOpts.branches}
      environments={filterOpts.environments}
      selectedBranch={selectedBranch}
      selectedEnvironment={selectedEnvironment}
      onBranchChange={setSelectedBranch}
      onEnvironmentChange={setSelectedEnvironment}
    />
  );
}

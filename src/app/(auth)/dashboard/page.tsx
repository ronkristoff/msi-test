"use client";

import { useQuery } from "convex/react";
import { api } from "@/lib/convex";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { StatsGrid } from "@/components/dashboard/StatsGrid";
import { PassRateChart } from "@/components/dashboard/PassRateChart";
import { RecentFailures } from "@/components/dashboard/RecentFailures";
import { ActiveRuns } from "@/components/dashboard/ActiveRuns";

export default function DashboardPage() {
  const workspace = useQuery(api.workspaces.queries.getWorkspaceForUser);
  const stats = useQuery(api.dashboard.queries.getDashboardStats);
  const activeRuns = useQuery(api.dashboard.queries.getActiveRuns);

  if (workspace === undefined || stats === undefined || activeRuns === undefined) {
    return <div className="text-[var(--muted)] text-sm">Loading...</div>;
  }

  const hasCompletedRuns = stats.trendData.length > 0;

  if (!hasCompletedRuns && activeRuns.length === 0) {
    return (
      <EmptyState
        icon={
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M9 9l13-13M9 9H3l6-6M9 9v6l-6 6" />
            <path d="M22 15c0 3.866-3.582 7-8 7s-8-3.134-8-7" />
          </svg>
        }
        title="No test runs yet"
        description="Create a project and generate your first test suite. MSITest will use your AI provider to generate Playwright tests from your app or PRD."
        action={
          <Button disabled>
            Create project
          </Button>
        }
      />
    );
  }

  return (
    <div>
      <StatsGrid {...stats} />

      <PassRateChart data={stats.trendData} />

      <ActiveRuns runs={activeRuns} />

      <RecentFailures failures={stats.recentFailures} />
    </div>
  );
}

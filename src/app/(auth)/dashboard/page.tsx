"use client";

import { useQuery } from "convex/react";
import { api } from "@/lib/convex";
import { StatCard } from "@/components/ui/StatCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";

export default function DashboardPage() {
  const workspace = useQuery(api.workspaces.queries.getWorkspaceForUser);

  const hasData = false;

  if (workspace === undefined) {
    return <div className="text-[var(--muted)] text-sm">Loading...</div>;
  }

  if (!hasData) {
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
      <div className="grid grid-cols-4 gap-4 mb-6 max-[900px]:grid-cols-2">
        <StatCard label="Pass Rate" value="—" />
        <StatCard label="Failed" value="0" />
        <StatCard label="Flaky" value="0" />
        <StatCard label="Total Tests" value="0" />
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border-soft)] rounded-[var(--radius-md)] p-6 mb-6">
        <h3 className="font-[var(--font-mono)] text-[12px] uppercase tracking-[0.06em] text-[var(--muted)] mb-4">
          Pass Rate Trend
        </h3>
        <div className="h-48 flex items-center justify-center text-sm text-[var(--muted)]">
          Trend chart appears after 2+ runs
        </div>
      </div>

      <div className="mb-6">
        <h3 className="font-[var(--font-mono)] text-[12px] uppercase tracking-[0.06em] text-[var(--muted)] mb-4">
          Recent Failures
        </h3>
        <div className="text-sm text-[var(--muted)]">
          Failed tests with AI root cause analysis will appear here.
        </div>
      </div>

      <div>
        <h3 className="font-[var(--font-mono)] text-[12px] uppercase tracking-[0.06em] text-[var(--muted)] mb-4">
          Active Runs
        </h3>
        <div className="text-sm text-[var(--muted)]">
          Currently running tests will appear here with live progress.
        </div>
      </div>
    </div>
  );
}

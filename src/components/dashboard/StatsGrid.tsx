"use client";

import { StatCard } from "@/components/ui/StatCard";
import type { DashboardStats } from "@/lib/dashboard-types";

function TrendArrow({ delta, invert }: { delta: number; invert?: boolean }) {
  if (delta === 0) return null;

  const up = delta > 0;
  const good = invert ? !up : up;

  return (
    <span className={`${good ? "text-green-600" : "text-red-500"} font-[var(--font-mono)]`}>
      {up ? "↑" : "↓"} {up ? "+" : ""}
      {delta}
    </span>
  );
}

export function StatsGrid({
  passRate,
  passRateTrend,
  failedCount,
  failedTrend,
  flakyCount,
  testsRun,
}: DashboardStats) {
  return (
    <div className="grid grid-cols-4 gap-4 mb-6 max-[900px]:grid-cols-2">
      <StatCard
        label="Pass Rate"
        value={`${passRate}%`}
        trend={<TrendArrow delta={passRateTrend} />}
      />
      <StatCard
        label="Failed"
        value={failedCount}
        trend={<TrendArrow delta={failedTrend} invert />}
      />
      <StatCard label="Flaky" value={flakyCount} />
      <StatCard label="Total Tests" value={testsRun} />
    </div>
  );
}

"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { SectionPanel } from "./SectionHeader";
import type { DashboardStats } from "@/lib/dashboard-types";

type TooltipPayload = {
  payload: DashboardStats["trendData"][number];
};

function CustomTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayload[] }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="bg-[var(--surface)] border border-[var(--border-soft)] rounded-[var(--radius-md)] px-3 py-2 text-sm shadow-sm">
      <div className="font-[var(--font-mono)] text-[11px] text-[var(--muted)] mb-1">
        {point.label}
      </div>
      <div className="font-[var(--font-mono)] font-bold text-[var(--fg)]">
        {point.passRate}%
      </div>
    </div>
  );
}

export function PassRateChart({ data }: { data: DashboardStats["trendData"] }) {
  return (
    <div className="bg-[var(--surface)] border border-[var(--border-soft)] rounded-[var(--radius-md)] p-6 mb-6">
      <SectionPanel title="Pass Rate Trend">
        {data.length < 2 ? (
          <div className="h-48 flex items-center justify-center text-sm text-[var(--muted)]">
            Trend chart appears after 2+ runs
          </div>
        ) : (
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-soft)" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fontFamily: "var(--font-mono)" }}
                  stroke="var(--muted)"
                  tickLine={false}
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fontSize: 11, fontFamily: "var(--font-mono)" }}
                  stroke="var(--muted)"
                  tickLine={false}
                  tickFormatter={(v: number) => `${v}%`}
                  width={40}
                />
                <Tooltip content={<CustomTooltip />} />
                <Line
                  type="monotone"
                  dataKey="passRate"
                  stroke="var(--accent)"
                  strokeWidth={2}
                  dot={{ r: 3, fill: "var(--accent)" }}
                  activeDot={{ r: 5, fill: "var(--accent)" }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </SectionPanel>
    </div>
  );
}

"use client";

import { getFlakinessLevel } from "@/lib/flakiness-colors";

type StatusColor = "passed" | "failed" | "skipped";

const statusColors: Record<StatusColor, string> = {
  passed: "bg-[rgba(0,140,0,0.20)]",
  failed: "bg-[rgba(220,38,38,0.20)]",
  skipped: "bg-[var(--border-soft)]",
};

export type HeatmapTestRow = {
  testId: string;
  testName: string;
  flakinessPct: number;
  results: Array<{
    runId: string;
    status: string;
    createdAt: number;
  }>;
};

export type HeatmapRun = {
  runId: string;
  createdAt: number;
  label: string;
};

type HeatmapGridProps = {
  tests: HeatmapTestRow[];
  runs: HeatmapRun[];
  selectedTestId: string | null;
  onSelectTest: (testId: string) => void;
};

export function HeatmapGrid({ tests, runs, selectedTestId, onSelectTest }: HeatmapGridProps) {
  if (tests.length === 0) {
    return (
      <div className="text-center py-12 text-[var(--muted)] text-sm">
        No test data available. Run some tests to populate the flakiness map.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className="text-left text-xs font-semibold text-[var(--muted)] font-[var(--font-mono)] pb-3 pr-4 sticky left-0 bg-[var(--surface)] z-10 min-w-[200px]">
              Test
            </th>
            <th className="text-right text-xs font-semibold text-[var(--muted)] font-[var(--font-mono)] pb-3 pr-4 min-w-[80px]">
              Flakiness
            </th>
            {runs.map((run) => (
              <th
                key={run.runId}
                className="text-center text-[10px] font-[var(--font-mono)] text-[var(--muted)] pb-2 px-0.5 min-w-[32px]"
                title={new Date(run.createdAt).toLocaleDateString()}
              >
                {run.label.replace("Run ", "R")}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tests.map((test) => {
            const isSelected = selectedTestId === test.testId;
            const { className } = getFlakinessLevel(test.flakinessPct);
            return (
              <tr
                key={test.testId}
                onClick={() => onSelectTest(test.testId)}
                className={`cursor-pointer transition-colors duration-[var(--motion-fast)] border-b border-[var(--border)] ${
                  isSelected
                    ? "bg-[var(--border-soft)]"
                    : "hover:bg-[var(--border-soft)]"
                }`}
              >
                <td className="py-2 pr-4 sticky left-0 bg-inherit z-10">
                  <span className="text-sm text-[var(--fg)] font-medium truncate block max-w-[200px]">
                    {test.testName}
                  </span>
                </td>
                <td className="py-2 pr-4 text-right">
                  <span
                    className={`inline-block px-2 py-0.5 rounded-[var(--radius-sm)] text-[11px] font-semibold font-[var(--font-mono)] ${className}`}
                  >
                    {test.flakinessPct}%
                  </span>
                </td>
                {runs.map((run) => {
                  const result = test.results.find((r) => r.runId === run.runId);
                  const status = (result?.status ?? "skipped") as StatusColor;
                  return (
                    <td key={run.runId} className="py-2 px-0.5 text-center">
                      <div
                        className={`w-6 h-6 rounded-[3px] ${statusColors[status]} transition-transform duration-[var(--motion-fast)] hover:scale-125`}
                        title={`${test.testName} — ${run.label}: ${status}`}
                      />
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export { getFlakinessLevel };

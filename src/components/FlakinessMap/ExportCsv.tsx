"use client";

import type { HeatmapTestRow, HeatmapRun } from "./HeatmapGrid";

export function buildCsvContent(tests: HeatmapTestRow[], runs: HeatmapRun[]): string {
  const headers = ["Test Name", "Flakiness %", ...runs.map((r) => r.label)];
  const rows = tests.map((test) => {
    const statuses = runs.map((run) => {
      const result = test.results.find((r) => r.runId === run.runId);
      return result?.status ?? "skipped";
    });
    return [test.testName, String(test.flakinessPct), ...statuses];
  });

  const csvRows = [headers, ...rows];
  return csvRows.map((row) => row.map(escapeCsvField).join(",")).join("\n");
}

function escapeCsvField(field: string): string {
  if (field.includes(",") || field.includes('"') || field.includes("\n")) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

export function downloadCsv(content: string, filename: string): void {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

"use client";

import type { Doc } from "@/lib/convex";
import { Button } from "@/components/ui/Button";
import { useErrorLogger } from "@/lib/error-logger";
import { downloadFile } from "../downloadFile";
import { buildDriftReportMarkdown } from "../exportFormatters";

type ExportDriftReportProps = {
  report: Doc<"drift_reports">;
  baselineRdVersion?: number;
};

export function ExportDriftReport({ report, baselineRdVersion }: ExportDriftReportProps) {
  const { logError } = useErrorLogger();

  const handleExport = () => {
    try {
      downloadFile(
        buildDriftReportMarkdown({ ...report, baseline_rd_version: baselineRdVersion }),
        `drift-report-v${report.version}.md`,
        "text/markdown;charset=utf-8;",
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to export Drift Report.";
      logError(msg, {
        severity: "error",
        context: { source: "ExportDriftReport.handleExport", reportId: report._id },
      });
    }
  };

  return (
    <Button variant="secondary" size="sm" onClick={handleExport}>
      <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
      </svg>
      Export Drift Report
    </Button>
  );
}

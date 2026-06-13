"use client";

import { useMutation, useAction } from "convex/react";
import { api, type Id } from "@/lib/convex";
import { Button } from "@/components/ui/Button";
import { useErrorLogger } from "@/lib/error-logger";

type SuiteBannerData = {
  _id: string;
  status?: string;
  generation_error?: string;
  progress_message?: string;
  locked_by?: string;
  locked_reason?: string;
  source_type: string;
  project_id: string;
  testCount: number;
  failed_scenarios?: string[];
};

type SuiteStatusBannersProps = {
  suite: SuiteBannerData;
  activeRun: { _id: string } | null | undefined;
};

export function SuiteStatusBanners({ suite, activeRun }: SuiteStatusBannersProps) {
  const { logError } = useErrorLogger();

  const retrySuiteGeneration = useMutation(api.suites.mutations.retrySuiteGeneration);
  const generatePrdTests = useAction(api.ai.generatePrdTests.generatePrdTests);
  const generateNlTests = useAction(api.ai.generateNlTests.generateNlTests);
  const retryExploration = useAction(api.ai.exploreApp.retryExplorationGeneration);
  const retryFailed = useAction(api.ai.exploreApp.retryFailedScenarios);

  const handleRetry = async () => {
    try {
      const result = await retrySuiteGeneration({ suite_id: suite._id as Id<"suites"> });

      if (result.source_type === "url_exploration") {
        if (result.exploration_id) {
          retryExploration({ suite_id: suite._id as Id<"suites"> }).catch((err) => {
            logError(err instanceof Error ? err.message : "Retry exploration generation failed", {
              severity: "error",
              context: { source: "SuiteStatusBanners.retry" },
            });
          });
        }
        return;
      }

      const action = result.source_type === "prd"
        ? generatePrdTests
        : result.source_type === "natural_language"
          ? generateNlTests
          : null;

      if (!action) return;

      action({
        project_id: result.project_id,
        suite_id: suite._id as Id<"suites">,
        ...(result.source_type === "natural_language" ? { prompt: "Regenerate tests" } : {}),
      }).catch((err) => {
        logError(err instanceof Error ? err.message : "Retry generation failed", {
          severity: "error",
          context: { source: "SuiteStatusBanners.retry" },
        });
      });
    } catch (err) {
      logError(err instanceof Error ? err.message : "Retry generation failed", {
        severity: "error",
        context: { source: "SuiteStatusBanners.retry" },
      });
    }
  };

  if (suite.status === "generating" && !activeRun) {
    return (
      <div className="bg-[var(--surface)] border border-[var(--accent)]/40 rounded-[var(--radius-md)] p-4 shadow-[var(--elev-raised)] mb-5">
        <div className="flex items-center gap-3">
          <svg className="animate-spin h-4 w-4 text-[var(--accent)]" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="text-sm text-[var(--fg)]">
            {suite.progress_message || "Generating tests..."} {suite.testCount > 0 && `(${suite.testCount} created so far)`}
          </span>
        </div>
      </div>
    );
  }

  if (suite.status === "ready" && suite.failed_scenarios && suite.failed_scenarios.length > 0) {
    return (
      <div className="bg-[var(--surface)] border border-[var(--warning)]/40 rounded-[var(--radius-md)] p-4 shadow-[var(--elev-raised)] mb-5">
        <div className="flex items-center gap-3 mb-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--warning)" strokeWidth="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <span className="text-sm font-medium text-[var(--fg)]">
            {suite.failed_scenarios.length} scenario(s) failed to generate
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5 mb-3">
          {suite.failed_scenarios.map((name) => (
            <span key={name} className="text-xs bg-[var(--warning)]/15 text-[var(--warning)] px-2 py-0.5 rounded-full">
              {name}
            </span>
          ))}
        </div>
        <Button size="sm" onClick={() => {
          retryFailed({ suite_id: suite._id as Id<"suites"> }).catch((err) => {
            logError(err instanceof Error ? err.message : "Retry failed scenarios failed", {
              severity: "error",
              context: { source: "SuiteStatusBanners.retryFailed" },
            });
          });
        }}>
          Retry Failed Scenarios
        </Button>
      </div>
    );
  }

  if (suite.status === "failed" && suite.generation_error) {
    return (
      <div className="bg-[var(--surface)] border border-[var(--danger)]/40 rounded-[var(--radius-md)] p-4 shadow-[var(--elev-raised)] mb-5">
        <div className="flex items-center gap-3 mb-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" strokeWidth="2">
            <circle cx="12" cy="12" r="10" /><path d="M15 9l-6 6" /><path d="M9 9l6 6" />
          </svg>
          <span className="text-sm font-medium text-[var(--fg)]">Generation failed</span>
        </div>
        <p className="text-sm text-[var(--muted)] mb-3">{suite.generation_error}</p>
        <Button size="sm" onClick={handleRetry}>
          Retry Generation
        </Button>
      </div>
    );
  }

  if (!activeRun && suite.locked_by && suite.status !== "generating") {
    return (
      <div className="bg-[var(--surface)] border border-[var(--warning)]/40 rounded-[var(--radius-md)] p-4 shadow-[var(--elev-raised)] mb-5">
        <div className="flex items-center gap-3">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--warning)" strokeWidth="2">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          <span className="text-sm text-[var(--fg)]">
            Suite is locked — {suite.locked_reason === "running" ? "a run is in progress" : "tests are being generated"}
          </span>
        </div>
      </div>
    );
  }

  return null;
}

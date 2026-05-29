"use client";

import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api, asId } from "@/lib/convex";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { StatusPill } from "@/components/ui/StatusPill";
import { runStatusToVariant } from "@/lib/run-status";

type RunDetail = NonNullable<FunctionReturnType<typeof api.runs.queries.getRunDetail>>;
type RunResult = RunDetail["results"][number];
type Step = RunResult["steps"][number];

function statusToVariant(status: string) {
  return runStatusToVariant(status);
}

function StepTimeline({ steps }: { steps: Step[] }) {
  if (steps.length === 0) {
    return <span className="text-[var(--muted)] text-xs">No step data</span>;
  }

  return (
    <div className="flex flex-col gap-1 mt-2">
      {steps.map((step) => (
        <div key={step.step_number} className="flex items-center gap-2 text-xs">
          <span className="font-[var(--font-mono)] text-[var(--muted)] w-6 text-right">{step.step_number}</span>
          <StatusPill variant={statusToVariant(step.status)} showDot={true}>
            {step.status}
          </StatusPill>
          <span className="text-[var(--fg)] truncate flex-1">{step.command}</span>
          <span className="text-[var(--muted)] shrink-0">{step.duration_ms}ms</span>
        </div>
      ))}
    </div>
  );
}

export default function RunDetailPage() {
  const params = useParams<{ id: string }>();
  const runId = asId(params.id, "runs");
  const runDetail = useQuery(api.runs.queries.getRunDetail, { run_id: runId });

  if (runDetail === undefined) {
    return <div className="text-[var(--muted)] text-sm">Loading...</div>;
  }

  if (runDetail === null) {
    return (
      <EmptyState
        icon={
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" />
          </svg>
        }
        title="Run not found"
        description="This run may have been deleted or you don't have access."
        action={
          <Link href="/runs">
            <Button variant="secondary">Back to Runs</Button>
          </Link>
        }
      />
    );
  }

  const isRunning = runDetail.status === "running";

  return (
    <div className="max-w-[960px]">
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] p-5 shadow-[var(--elev-raised)] mb-5">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="font-[var(--font-display)] text-xl font-bold text-[var(--fg)] mb-1">
              Run Detail
            </h2>
            <div className="flex items-center gap-3 text-sm text-[var(--muted)]">
              <StatusPill variant={statusToVariant(runDetail.status)} showDot={isRunning}>
                {runDetail.status}
              </StatusPill>
              {runDetail.environment && (
                <span>{runDetail.environment.name} — {runDetail.environment.base_url}</span>
              )}
              {runDetail.trigger_type && (
                <span className="uppercase text-[10px] tracking-[0.05em]">
                  {runDetail.trigger_type}
                </span>
              )}
              {runDetail.duration_ms != null && runDetail.duration_ms > 0 && (
                <span>{(runDetail.duration_ms / 1000).toFixed(1)}s</span>
              )}
            </div>
          </div>
          {isRunning && (
            <svg className="animate-spin h-5 w-5 text-[var(--accent)]" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          )}
        </div>
      </div>

      <h3 className="font-[var(--font-display)] text-lg font-bold text-[var(--fg)] mb-4">
        Test Results ({runDetail.results.length})
      </h3>

      {runDetail.results.length === 0 ? (
        <EmptyState
          icon={
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
          }
          title="No results yet"
          description={isRunning ? "Tests are executing..." : "No test results available for this run."}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {runDetail.results.map((result) => (
            <div
              key={result._id}
              className="border border-[var(--border)] rounded-[var(--radius-md)] p-4 bg-[var(--surface)]"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-[var(--fg)]">{result.test_name}</span>
                <div className="flex items-center gap-2">
                  <StatusPill variant={statusToVariant(result.status)} showDot={true}>
                    {result.status}
                  </StatusPill>
                  <span className="text-xs text-[var(--muted)]">{result.duration_ms}ms</span>
                </div>
              </div>
              {result.steps.length > 0 && <StepTimeline steps={result.steps} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

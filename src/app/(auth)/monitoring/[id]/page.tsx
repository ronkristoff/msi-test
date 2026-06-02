"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { useParams, useRouter } from "next/navigation";
import { api, type Id } from "@/lib/convex";
import { statusVariant, formatTime, formatDuration } from "@/lib/format";
import { Button, Toggle, StatusPill } from "@/components/ui";
import { ScheduleModal } from "@/components/ScheduleModal";
import Link from "next/link";

type ScheduleDetail = {
  _id: string;
  name: string;
  suite_id: string;
  suite_name: string | null;
  environment_id: string;
  environment_name: string | null;
  cadence: { seconds: number };
  cadence_label: string;
  enabled: boolean;
  last_run_at: number | null;
  next_run_at: number | null;
  last_run_status: string | null;
};

type RunRow = {
  _id: string;
  status: string;
  started_at: number | null;
  duration_ms: number | null;
  pass_count: number | null;
  fail_count: number | null;
};

type DiffItem = {
  test_id: string;
  test_name: string;
  change: "new_pass" | "new_fail";
};

export default function MonitoringDetailPage() {
  const params = useParams();
  const router = useRouter();
  const scheduleId = params.id as string;
  const [showEdit, setShowEdit] = useState(false);

  const schedule = useQuery(api.schedules.queries.getSchedule, {
    schedule_id: scheduleId as Id<"schedules">,
  });
  const runs = useQuery(api.schedules.queries.getScheduleRuns, {
    schedule_id: scheduleId as Id<"schedules">,
    paginationOpts: { numItems: 20, cursor: null },
  });

  const toggleEnabled = useMutation(api.schedules.mutations.updateSchedule);
  const deleteSchedule = useMutation(api.schedules.mutations.deleteSchedule);

  if (schedule === undefined || runs === undefined) {
    return (
      <div className="space-y-4">
        <div className="animate-pulse h-8 bg-[var(--border-soft)] rounded w-48" />
        <div className="animate-pulse h-40 bg-[var(--border-soft)] rounded-lg" />
      </div>
    );
  }

  if (!schedule) {
    return (
      <div className="text-center py-12 text-[var(--muted)]">
        Schedule not found
      </div>
    );
  }

  const s = schedule as ScheduleDetail;
  const runPage = runs?.page ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <button
            onClick={() => router.push("/monitoring")}
            className="text-sm text-[var(--muted)] hover:text-[var(--fg)] mb-2 flex items-center gap-1"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Back to Monitoring
          </button>
          <h1 className="text-xl font-semibold">{s.name}</h1>
          <p className="text-sm text-[var(--muted)] mt-1">
            Suite: {s.suite_name ?? s.suite_id}
            {" · "}{s.environment_name ?? "Unknown env"}
            {" · "}{s.cadence_label}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Toggle
            checked={s.enabled}
            onChange={(enabled) =>
              toggleEnabled({
                schedule_id: scheduleId as Id<"schedules">,
                enabled,
              })
            }
            size="md"
          />
          <Button variant="secondary" onClick={() => setShowEdit(true)}>
            Edit
          </Button>
          <Button
            variant="danger"
            onClick={async () => {
              if (confirm("Delete this schedule? Past runs will not be affected.")) {
                await deleteSchedule({ schedule_id: scheduleId as Id<"schedules"> });
                router.push("/monitoring");
              }
            }}
          >
            Delete
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <div className="border border-[var(--border)] rounded-lg p-4">
          <div className="text-xs text-[var(--muted)] mb-1">Status</div>
          <div className="font-medium">{s.enabled ? "Active" : "Paused"}</div>
        </div>
        <div className="border border-[var(--border)] rounded-lg p-4">
          <div className="text-xs text-[var(--muted)] mb-1">Next Run</div>
          <div className="font-medium">{formatTime(s.next_run_at ?? null)}</div>
        </div>
        <div className="border border-[var(--border)] rounded-lg p-4">
          <div className="text-xs text-[var(--muted)] mb-1">Last Run</div>
          <div className="font-medium">{formatTime(s.last_run_at ?? null)}</div>
        </div>
        <div className="border border-[var(--border)] rounded-lg p-4">
          <div className="text-xs text-[var(--muted)] mb-1">Last Result</div>
          <div>
            <StatusPill variant={statusVariant(s.last_run_status)}>
              {s.last_run_status ?? "—"}
            </StatusPill>
          </div>
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-3">Run History</h2>
        {runPage.length === 0 ? (
          <div className="text-center py-8 text-[var(--muted)]">
            No runs yet for this schedule
          </div>
        ) : (
          <div className="border border-[var(--border)] rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[var(--border-soft)] text-left">
                  <th className="px-4 py-3 font-medium text-[var(--muted)]">Run</th>
                  <th className="px-4 py-3 font-medium text-[var(--muted)]">Status</th>
                  <th className="px-4 py-3 font-medium text-[var(--muted)]">Started</th>
                  <th className="px-4 py-3 font-medium text-[var(--muted)]">Duration</th>
                  <th className="px-4 py-3 font-medium text-[var(--muted)]">Results</th>
                  <th className="px-4 py-3 font-medium text-[var(--muted)]">Diff</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {runPage.map((run: RunRow, idx: number) => {
                  const prevRun = runPage[idx + 1] as RunRow | undefined;
                  return (
                    <tr
                      key={run._id}
                      className="hover:bg-[var(--border-soft)] transition-colors"
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={`/runs/${run._id}`}
                          className="font-[var(--font-mono)] text-xs text-[var(--accent)] hover:underline"
                        >
                          {run._id.slice(-8)}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <StatusPill variant={statusVariant(run.status)}>
                          {run.status}
                        </StatusPill>
                      </td>
                      <td className="px-4 py-3 text-[var(--muted)]">
                        {formatTime(run.started_at ?? null)}
                      </td>
                      <td className="px-4 py-3 text-[var(--muted)]">
                        {formatDuration(run.duration_ms ?? null)}
                      </td>
                      <td className="px-4 py-3 text-[var(--muted)]">
                        <span className="text-[var(--success-text)]">{run.pass_count ?? 0}</span>
                        {" / "}
                        <span className="text-[var(--danger-text)]">{run.fail_count ?? 0}</span>
                      </td>
                      <td className="px-4 py-3">
                        {prevRun ? (
                          <DiffChip
                            currentRunId={run._id}
                            previousRunId={prevRun._id}
                          />
                        ) : (
                          <span className="text-[var(--muted)] text-xs">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showEdit && (
        <ScheduleModal
          schedule={{
            _id: s._id,
            name: s.name,
            suite_id: s.suite_id,
            environment_id: s.environment_id,
            cadence: s.cadence,
          }}
          onClose={() => setShowEdit(false)}
        />
      )}
    </div>
  );
}

function DiffChip({
  currentRunId,
  previousRunId,
}: {
  currentRunId: string;
  previousRunId: string;
}) {
  const diff = useQuery(api.schedules.queries.getScheduleRunDiff, {
    current_run_id: currentRunId as Id<"runs">,
    previous_run_id: previousRunId as Id<"runs">,
  });

  if (diff === undefined) {
    return <span className="text-[var(--muted)] text-xs">Loading...</span>;
  }

  if (diff.length === 0) {
    return <span className="text-[var(--muted)] text-xs">No changes</span>;
  }

  const newFails = diff.filter((d: DiffItem) => d.change === "new_fail");
  const newPasses = diff.filter((d: DiffItem) => d.change === "new_pass");

  return (
    <div className="flex flex-wrap gap-1">
      {newFails.map((d: DiffItem) => (
        <span
          key={d.test_id}
          className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[rgba(220,38,38,0.10)] text-[var(--danger-text)]"
        >
          {d.test_name}
        </span>
      ))}
      {newPasses.map((d: DiffItem) => (
        <span
          key={d.test_id}
          className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[rgba(0,100,0,0.12)] text-[var(--success-text)]"
        >
          {d.test_name}
        </span>
      ))}
    </div>
  );
}

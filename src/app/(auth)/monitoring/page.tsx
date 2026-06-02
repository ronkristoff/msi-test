"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api, type Id } from "@/lib/convex";
import { statusVariant, formatTime } from "@/lib/format";
import { Button, Toggle, EmptyState, StatusPill } from "@/components/ui";
import { ScheduleModal } from "@/components/ScheduleModal";
import Link from "next/link";

type Schedule = {
  _id: string;
  name: string;
  suite_name: string | null;
  environment_name: string | null;
  cadence_label: string;
  enabled: boolean;
  last_run_status: string | null;
  next_run_at: number | null;
};

export default function MonitoringPage() {
  const [showCreate, setShowCreate] = useState(false);
  const schedules = useQuery(api.schedules.queries.getSchedules);

  const toggleEnabled = useMutation(api.schedules.mutations.updateSchedule);
  const deleteSchedule = useMutation(api.schedules.mutations.deleteSchedule);

  if (schedules === undefined) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Monitoring</h1>
        </div>
        <div className="animate-pulse space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 bg-[var(--border-soft)] rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Monitoring</h1>
        <Button onClick={() => setShowCreate(true)}>Create Schedule</Button>
      </div>

      {schedules.length === 0 ? (
        <EmptyState
          title="No schedules yet"
          description="Create a schedule to run tests automatically on a recurring basis."
          action={
            <Button onClick={() => setShowCreate(true)}>Create Schedule</Button>
          }
        />
      ) : (
        <div className="border border-[var(--border)] rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[var(--border-soft)] text-left">
                <th className="px-4 py-3 font-medium text-[var(--muted)]">Name</th>
                <th className="px-4 py-3 font-medium text-[var(--muted)]">Suite</th>
                <th className="px-4 py-3 font-medium text-[var(--muted)]">Environment</th>
                <th className="px-4 py-3 font-medium text-[var(--muted)]">Cadence</th>
                <th className="px-4 py-3 font-medium text-[var(--muted)]">Next Run</th>
                <th className="px-4 py-3 font-medium text-[var(--muted)]">Last Result</th>
                <th className="px-4 py-3 font-medium text-[var(--muted)]">Enabled</th>
                <th className="px-4 py-3 font-medium text-[var(--muted)]"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {schedules.map((s: Schedule) => (
                <tr
                  key={s._id}
                  className="hover:bg-[var(--border-soft)] transition-colors"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/monitoring/${s._id}`}
                      className="font-medium text-[var(--accent)] hover:underline"
                    >
                      {s.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-[var(--muted)]">
                    {s.suite_name ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-[var(--muted)]">
                    {s.environment_name ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-[var(--muted)] capitalize">
                    {s.cadence_label}
                  </td>
                  <td className="px-4 py-3 text-[var(--muted)]">
                    {formatTime(s.next_run_at)}
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill variant={statusVariant(s.last_run_status)}>
                      {s.last_run_status ?? "—"}
                    </StatusPill>
                  </td>
                  <td className="px-4 py-3">
                    <Toggle
                      checked={s.enabled}
                      onChange={(enabled) =>
                        toggleEnabled({
                          schedule_id: s._id as Id<"schedules">,
                          enabled,
                        })
                      }
                    />
                  </td>
                  <td className="px-4 py-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={async () => {
                        if (confirm("Delete this schedule?")) {
                          await deleteSchedule({ schedule_id: s._id as Id<"schedules"> });
                        }
                      }}
                    >
                      Delete
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <ScheduleModal onClose={() => setShowCreate(false)} />
      )}
    </div>
  );
}

export function statusVariant(status: string | null) {
  if (!status || status === "cancelled" || status === "timed_out") return "neutral" as const;
  if (status === "passed") return "success" as const;
  if (status === "running") return "running" as const;
  return "danger" as const;
}

export function formatTime(ms: number | null) {
  if (!ms) return "—";
  return new Date(ms).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDuration(ms: number | null) {
  if (!ms) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

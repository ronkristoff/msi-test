type StatusVariant = "success" | "danger" | "warn" | "neutral" | "running";

const RUN_STATUS_VARIANT: Record<string, StatusVariant> = {
  passed: "success",
  failed: "danger",
  running: "running",
  cancelled: "neutral",
  timed_out: "danger",
};

export function runStatusToVariant(status: string): StatusVariant {
  return RUN_STATUS_VARIANT[status] ?? "neutral";
}

export type { StatusVariant };

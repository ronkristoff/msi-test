"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { api } from "@/lib/convex";

type Task = {
  type: "generating" | "running" | "exploring" | "healing";
  id: string;
  name: string;
  triggeredByName: string;
  projectId: string;
  suiteId?: string;
};

type TaskOutcome = {
  type: "generating" | "running" | "exploring" | "healing";
  id: string;
  outcome: "success" | "failed";
  name: string;
  projectId: string;
  suiteId?: string;
};

const TYPE_META: Record<
  Task["type"],
  { singular: string; verb: string }
> = {
  generating: { singular: "generation", verb: "Generating" },
  running: { singular: "run", verb: "Running" },
  exploring: { singular: "exploration", verb: "Exploring" },
  healing: { singular: "heal", verb: "Healing" },
};

const TYPE_ICONS: Record<Task["type"], React.ReactNode> = {
  generating: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 3l1.912 5.813h6.16l-4.985 3.619 1.912 5.813L12 14.626l-4.985 3.619 1.912-5.813-4.985-3.619h6.16z" />
    </svg>
  ),
  running: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  ),
  exploring: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  ),
  healing: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  ),
};

function ProgressRing() {
  return (
    <svg
      className="task-progress-ring"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      style={{ animation: "task-ring-spin 1.4s linear infinite" }}
    >
      <circle
        cx="12"
        cy="12"
        r="9.5"
        stroke="var(--accent)"
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
        strokeDasharray="60"
        style={{ animation: "task-ring 1.4s ease-in-out infinite" }}
      />
    </svg>
  );
}

function getIndicatorLabel(tasks: Task[]): string {
  if (tasks.length === 0) return "";
  const types = new Set(tasks.map((t) => t.type));
  if (types.size === 1) {
    const [type] = types;
    const { verb } = TYPE_META[type];
    return tasks.length === 1 ? verb : `${verb} (${tasks.length})`;
  }
  return `${tasks.length} tasks running`;
}

function outcomeMessage(outcome: TaskOutcome): string {
  const ok = outcome.outcome === "success";
  switch (outcome.type) {
    case "generating":
      return ok
        ? `"${outcome.name}" is ready`
        : `"${outcome.name}" generation failed`;
    case "exploring": {
      const url = outcome.name.replace("Exploring ", "");
      return ok ? `Exploration completed: ${url}` : `Exploration failed: ${url}`;
    }
    case "healing":
      return ok ? `Healed: ${outcome.name}` : `Healing failed: ${outcome.name}`;
    case "running":
      return ok
        ? `Run completed: ${outcome.name}`
        : `Run failed: ${outcome.name}`;
  }
}

export function TaskTray() {
  const router = useRouter();
  const tasks = useQuery(api.suites.queries.getActiveTasks) as
    | Task[]
    | undefined;

  const [pendingChecks, setPendingChecks] = useState<
    { type: Task["type"]; id: string }[]
  >([]);
  const outcomes = useQuery(
    api.suites.queries.getTaskOutcomes,
    pendingChecks.length > 0 ? { tasks: pendingChecks } : "skip",
  ) as TaskOutcome[] | undefined;

  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const prevTaskMapRef = useRef<Map<string, Task["type"]>>(new Map());
  const notifiedRef = useRef<Set<string>>(new Set());

  const handleNavigateOutcome = useCallback(
    (o: TaskOutcome) => {
      if (o.type === "generating" && o.suiteId) {
        router.push(`/projects/${o.projectId}/suites/${o.suiteId}`);
      } else if (o.type === "running") {
        router.push(`/runs/${o.id}`);
      } else if (o.type === "exploring") {
        router.push(`/projects/${o.projectId}/explore`);
      } else if (o.type === "healing" && o.suiteId) {
        router.push(`/projects/${o.projectId}/suites/${o.suiteId}`);
      }
    },
    [router],
  );

  useEffect(() => {
    if (!tasks) return;

    const currentMap = new Map(tasks.map((t) => [t.id, t.type]));
    const prevMap = prevTaskMapRef.current;
    const disappeared: { type: Task["type"]; id: string }[] = [];

    for (const [id, type] of prevMap) {
      if (!currentMap.has(id)) {
        disappeared.push({ type, id });
      }
    }

    prevTaskMapRef.current = currentMap;

    if (disappeared.length > 0) {
      queueMicrotask(() => setPendingChecks(disappeared));
    }
  }, [tasks]);

  useEffect(() => {
    if (!outcomes || outcomes.length === 0) return;

    for (const outcome of outcomes) {
      const key = `${outcome.type}:${outcome.id}`;
      if (notifiedRef.current.has(key)) continue;
      notifiedRef.current.add(key);

      const ok = outcome.outcome === "success";
      toast[ok ? "success" : "error"](outcomeMessage(outcome), {
        action: {
          label: "View",
          onClick: () => handleNavigateOutcome(outcome),
        },
      });
    }

    queueMicrotask(() => setPendingChecks([]));
  }, [outcomes, handleNavigateOutcome]);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  if (!tasks || tasks.length === 0) return null;

  const handleTaskClick = (task: Task) => {
    setOpen(false);
    if (task.type === "generating" && task.suiteId) {
      router.push(`/projects/${task.projectId}/suites/${task.suiteId}`);
    } else if (task.type === "running") {
      router.push(`/runs/${task.id}`);
    } else if (task.type === "exploring") {
      router.push(`/projects/${task.projectId}/explore`);
    } else if (task.type === "healing" && task.suiteId) {
      router.push(`/projects/${task.projectId}/suites/${task.suiteId}`);
    }
  };

  const label = getIndicatorLabel(tasks);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-[var(--radius-pill)] text-sm text-[var(--accent)] bg-[color-mix(in_oklab,var(--accent)_8%,transparent)] hover:bg-[color-mix(in_oklab,var(--accent)_14%,transparent)] transition-colors duration-[var(--motion-fast)]"
        aria-label={`${tasks.length} background task${tasks.length === 1 ? "" : "s"}`}
      >
        <ProgressRing />
        <span className="font-medium text-xs whitespace-nowrap">{label}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-[340px] bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] shadow-[var(--elev-raised)] z-50 max-h-[420px] overflow-y-auto origin-top scale-y-[0.97] opacity-0 animate-[task-dropdown-in_150ms_var(--ease-standard)_forwards]">
          <div className="px-3 py-2.5 border-b border-[var(--border-soft)]">
            <span className="text-sm font-medium text-[var(--fg)]">
              Background Tasks
            </span>
          </div>
          {tasks.map((task) => (
            <button
              key={`${task.type}-${task.id}`}
              onClick={() => handleTaskClick(task)}
              className="w-full text-left px-3 py-3 hover:bg-[color-mix(in_oklab,var(--accent)_5%,transparent)] transition-colors duration-[var(--motion-fast)] flex items-center gap-3 border-b border-[var(--border-soft)] last:border-b-0 group"
            >
              <div className="shrink-0 text-[var(--accent)]">
                {TYPE_ICONS[task.type]}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm text-[var(--fg)] truncate">
                  {task.name}
                </div>
                <div className="text-xs text-[var(--muted)] mt-0.5">
                  {TYPE_META[task.type].verb} &middot; {task.triggeredByName}
                </div>
              </div>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--muted)"
                strokeWidth="2"
                className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-[var(--motion-fast)]"
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

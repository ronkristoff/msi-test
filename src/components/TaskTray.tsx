"use client";

import { useState, useRef, useEffect } from "react";
import { useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/convex";

type Task = {
  type: "generating" | "running" | "exploring" | "healing";
  id: string;
  name: string;
  triggeredByName: string;
  projectId: string;
  suiteId?: string;
};

export function TaskTray() {
  const router = useRouter();
  const tasks = useQuery(api.suites.queries.getActiveTasks) as Task[] | undefined;
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
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

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen(!open)}
        className="relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-[var(--radius-sm)] text-sm text-[var(--fg)] hover:bg-[var(--border-soft)] transition-colors"
      >
        <svg
          className="animate-spin h-3.5 w-3.5 text-[var(--accent)]"
          viewBox="0 0 24 24"
          fill="none"
        >
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <span className="font-[var(--font-mono)] text-xs">{tasks.length}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-[320px] bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] shadow-[var(--elev-raised)] z-50 max-h-[400px] overflow-y-auto">
          <div className="px-3 py-2 border-b border-[var(--border-soft)]">
            <span className="font-[var(--font-mono)] text-[11px] uppercase tracking-[0.05em] text-[var(--muted)]">
              Background Tasks
            </span>
          </div>
          {tasks.map((task) => (
            <button
              key={`${task.type}-${task.id}`}
              onClick={() => handleTaskClick(task)}
              className="w-full text-left px-3 py-2.5 hover:bg-[var(--border-soft)] transition-colors flex items-center gap-3 border-b border-[var(--border-soft)] last:border-b-0"
            >
              <div className="shrink-0">
                {task.type === "generating" || task.type === "exploring" || task.type === "healing" ? (
                  <svg className="animate-spin h-4 w-4 text-[var(--accent)]" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2">
                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                  </svg>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm text-[var(--fg)] truncate">{task.name}</div>
                <div className="text-xs text-[var(--muted)]">
                  {task.type === "generating" ? "Generating" : task.type === "running" ? "Running" : task.type === "healing" ? "Healing" : "Exploring"} · {task.triggeredByName}
                </div>
              </div>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" className="shrink-0">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { api } from "@/lib/convex";
import type { Id } from "@/lib/convex";

type StaleTest = {
  _id: Id<"tests">;
  name: string;
  suite_id: Id<"suites">;
  suite_name: string;
  module_name: string;
  reason: "changed" | "removed";
};

export function StaleTestsBanner({ projectId }: { projectId: Id<"projects"> }) {
  const staleTests = useQuery(api.knowledge.queries.getStaleTests, {
    project_id: projectId,
  });

  if (!staleTests || staleTests.length === 0) return null;

  const count = staleTests.length;
  const label = `${count} test${count !== 1 ? "s" : ""} may be stale due to recent Knowledge Base re-sync.`;

  return (
    <div className="mb-4 p-3 rounded-[var(--radius-md)] border border-amber-300/30 bg-amber-50/10">
      <p className="text-sm font-medium text-amber-600 mb-2">{label}</p>
      <ul className="space-y-2">
        {staleTests.map((test) => (
          <li
            key={test._id}
            className="flex flex-wrap items-center gap-2 text-sm text-[var(--fg)]"
          >
            <span className="font-medium">{test.name}</span>
            <span className="text-[var(--muted)]">in {test.suite_name}</span>
            <span className="text-[var(--muted)]">·</span>
            <span className="text-amber-600">
              {test.module_name} ({test.reason})
            </span>
            <Link
              href={`/projects/${projectId}/suites/${test.suite_id}`}
              className="ml-auto text-[var(--accent)] hover:underline text-xs font-medium"
            >
              Regenerate
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default StaleTestsBanner;

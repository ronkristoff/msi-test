"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/convex";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { StatusPill } from "@/components/ui/StatusPill";
import { statusVariant } from "@/lib/format";

function CreateListModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const createTestList = useMutation(api.test_lists.mutations.createTestList);
  const router = useRouter();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] p-6 max-w-[440px] w-full shadow-[var(--elev-raised)]" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-[var(--font-display)] text-lg font-bold text-[var(--fg)] mb-4">
          New Test List
        </h3>
        {error && (
          <div className="mb-3 px-3 py-2 bg-[var(--danger)]/10 border border-[var(--danger)]/20 rounded-[var(--radius-sm)] text-xs text-[var(--danger-text)]">
            {error}
          </div>
        )}
        <div className="space-y-3">
          <div>
            <label className="font-[var(--font-mono)] text-[11px] uppercase tracking-[0.05em] text-[var(--muted)] mb-1 block">
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Smoke Tests"
              className="w-full text-sm bg-[var(--bg)] text-[var(--fg)] border border-[var(--border)] rounded-[var(--radius-sm)] px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
              autoFocus
            />
          </div>
          <div>
            <label className="font-[var(--font-mono)] text-[11px] uppercase tracking-[0.05em] text-[var(--muted)] mb-1 block">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description..."
              className="w-full min-h-[60px] text-sm bg-[var(--bg)] text-[var(--fg)] border border-[var(--border)] rounded-[var(--radius-sm)] px-3 py-2 resize-y focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
            />
          </div>
        </div>
        <div className="flex gap-3 justify-end mt-5">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            size="sm"
            disabled={!name.trim()}
            onClick={async () => {
              try {
                const id = await createTestList({
                  name: name.trim(),
                  description: description.trim() || undefined,
                });
                if (id) router.push(`/test-lists/${id}`);
              } catch (err) {
                setError(err instanceof Error ? err.message : "Failed to create list");
              }
            }}
          >
            Create
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function TestListsPage() {
  const [showCreate, setShowCreate] = useState(false);
  const testLists = useQuery(api.test_lists.queries.getTestLists);

  if (testLists === undefined) {
    return <div className="text-[var(--muted)] text-sm">Loading...</div>;
  }

  if (testLists.length === 0) {
    return (
      <>
        <EmptyState
          icon={
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
              <rect x="9" y="3" width="6" height="4" rx="1" />
              <line x1="9" y1="12" x2="15" y2="12" />
              <line x1="9" y1="16" x2="13" y2="16" />
            </svg>
          }
          title="No test lists yet"
          description="Create test lists to group tests across projects and suites for targeted re-runs, CI gates, or scheduled monitoring."
          action={
            <Button onClick={() => setShowCreate(true)}>Create Test List</Button>
          }
        />
        {showCreate && <CreateListModal onClose={() => setShowCreate(false)} />}
      </>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div />
        <Button size="sm" onClick={() => setShowCreate(true)}>New Test List</Button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {testLists.map((list) => (
          <Link
            key={list._id}
            href={`/test-lists/${list._id}`}
            className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] p-5 shadow-[var(--elev-raised)] hover:border-[var(--accent)] transition-colors duration-[var(--motion-fast)] block"
          >
            <div className="font-[var(--font-display)] text-base font-bold text-[var(--fg)] mb-1 truncate">
              {list.name}
            </div>
            {list.description && (
              <div className="text-sm text-[var(--muted)] truncate mb-3">
                {list.description}
              </div>
            )}
            <div className="flex items-center gap-3 text-xs text-[var(--muted)]">
              <span>{list.member_count} {list.member_count === 1 ? "test" : "tests"}</span>
              {list.last_run_status && (
                <StatusPill variant={statusVariant(list.last_run_status)} showDot={list.last_run_status === "running"}>
                  {list.last_run_status}
                </StatusPill>
              )}
            </div>
          </Link>
        ))}
      </div>
      {showCreate && <CreateListModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}

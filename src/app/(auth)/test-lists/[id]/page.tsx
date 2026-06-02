"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api, asId } from "@/lib/convex";
import type { Id } from "@/lib/convex";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { StatusPill } from "@/components/ui/StatusPill";
import { QueryResult } from "@/components/ui/QueryResult";
import { Alert } from "@/components/ui/Alert";
import { PageSkeleton } from "@/components/ui/Skeleton";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { statusVariant, formatTime, formatDuration } from "@/lib/format";
import { useErrorLogger } from "@/lib/error-logger";

function AddTestsModal({ testListId, onClose }: { testListId: string; onClose: () => void }) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tests = useQuery(api.test_lists.queries.getApprovedTestsForWorkspace, { search: search || undefined });
  const addTestsToList = useMutation(api.test_lists.mutations.addTestsToList);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] p-6 max-w-[560px] w-full max-h-[80vh] flex flex-col shadow-[var(--elev-raised)]" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-[var(--font-display)] text-lg font-bold text-[var(--fg)] mb-4">
          Add Tests
        </h3>
        {error && <Alert variant="error" className="mb-3">{error}</Alert>}
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search tests by name, suite, or project..."
          className="w-full text-sm bg-[var(--bg)] text-[var(--fg)] border border-[var(--border)] rounded-[var(--radius-sm)] px-3 py-2 mb-3 focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
          autoFocus
        />
        <div className="flex-1 overflow-y-auto border border-[var(--border)] rounded-[var(--radius-sm)] min-h-[200px]">
          {tests === undefined ? (
            <div className="p-4 text-sm text-[var(--muted)]">Loading...</div>
          ) : tests.length === 0 ? (
            <div className="p-4 text-sm text-[var(--muted)]">No approved tests found</div>
          ) : (
            <div className="divide-y divide-[var(--border-soft)]">
              {tests.map((test) => (
                <label
                  key={test._id}
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--border-soft)] cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(test._id)}
                    onChange={() => toggle(test._id)}
                    className="rounded border-[var(--border)]"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-[var(--fg)] truncate">{test.name}</div>
                    <div className="text-xs text-[var(--muted)] truncate">
                      {test.suite_name ?? "Unknown suite"} · {test.project_name ?? "Unknown project"}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center justify-between mt-4">
          <span className="text-xs text-[var(--muted)]">{selected.size} selected</span>
          <div className="flex gap-3">
            <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
            <Button
              size="sm"
              disabled={selected.size === 0 || adding}
              onClick={async () => {
                setAdding(true);
                setError(null);
                try {
                  await addTestsToList({
                    test_list_id: testListId as Id<"test_lists">,
                    test_ids: [...selected] as Id<"tests">[],
                  });
                  onClose();
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Failed to add tests");
                } finally {
                  setAdding(false);
                }
              }}
            >
              {adding ? "Adding..." : `Add ${selected.size} Test${selected.size === 1 ? "" : "s"}`}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function TestListDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { logError } = useErrorLogger();
  const testListId = params.id;

  const detail = useQuery(api.test_lists.queries.getTestListDetail, {
    test_list_id: asId(testListId, "test_lists"),
  });

  const environments = useQuery(api.environments.queries.getWorkspaceEnvironments);

  const updateTestList = useMutation(api.test_lists.mutations.updateTestList);
  const deleteTestList = useMutation(api.test_lists.mutations.deleteTestList);
  const removeTestFromList = useMutation(api.test_lists.mutations.removeTestFromList);
  const triggerRun = useMutation(api.runs.mutations.triggerRun);

  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState("");
  const [isEditingDesc, setIsEditingDesc] = useState(false);
  const [editDesc, setEditDesc] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showAddTests, setShowAddTests] = useState(false);
  const [selectedEnvId, setSelectedEnvId] = useState<string | null>(null);
  const [triggeringRun, setTriggeringRun] = useState(false);
  const [triggerError, setTriggerError] = useState<string | null>(null);

  if (detail === undefined) {
    return <PageSkeleton />;
  }

  return (
    <QueryResult
      data={detail}
      notFound={
        <EmptyState
          icon={
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" />
            </svg>
          }
          title="Test list not found"
          description="This test list may have been deleted or you don't have access."
          action={
            <Link href="/test-lists">
              <Button variant="secondary">Back to Test Lists</Button>
            </Link>
          }
        />
      }
    >
      {(detail) => (
        <div className="max-w-[900px]">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] p-5 shadow-[var(--elev-raised)] mb-5">
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1 min-w-0">
                {isEditingName ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          updateTestList({ test_list_id: asId(testListId, "test_lists"), name: editName.trim() });
                          setIsEditingName(false);
                        }
                        if (e.key === "Escape") setIsEditingName(false);
                      }}
                      className="font-[var(--font-display)] text-xl font-bold text-[var(--fg)] bg-transparent border-b-2 border-[var(--accent)] outline-none flex-1"
                      autoFocus
                    />
                    <Button variant="primary" size="sm" onClick={() => {
                      updateTestList({ test_list_id: asId(testListId, "test_lists"), name: editName.trim() });
                      setIsEditingName(false);
                    }}>Save</Button>
                    <Button variant="ghost" size="sm" onClick={() => setIsEditingName(false)}>Cancel</Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 cursor-pointer group" onClick={() => { setEditName(detail.name); setIsEditingName(true); }}>
                    <h2 className="font-[var(--font-display)] text-xl font-bold text-[var(--fg)]">
                      {detail.name}
                    </h2>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[var(--muted)] opacity-0 group-hover:opacity-100 transition-opacity">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                  </div>
                )}
                {isEditingDesc ? (
                  <div className="flex items-center gap-2 mt-1">
                    <input
                      type="text"
                      value={editDesc}
                      onChange={(e) => setEditDesc(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          updateTestList({ test_list_id: asId(testListId, "test_lists"), description: editDesc.trim() || undefined });
                          setIsEditingDesc(false);
                        }
                        if (e.key === "Escape") setIsEditingDesc(false);
                      }}
                      placeholder="Add description..."
                      className="text-sm text-[var(--muted)] bg-transparent border-b border-[var(--accent)] outline-none flex-1"
                      autoFocus
                    />
                    <Button variant="ghost" size="sm" onClick={() => setIsEditingDesc(false)}>Cancel</Button>
                  </div>
                ) : (
                  <div
                    className={`text-sm mt-1 ${detail.description ? "text-[var(--muted)]" : "text-[var(--muted)]/50 italic"} cursor-pointer group`}
                    onClick={() => { setEditDesc(detail.description ?? ""); setIsEditingDesc(true); }}
                  >
                    {detail.description || "Click to add description"}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-4">
                <Button variant="danger" size="sm" onClick={() => setShowDeleteConfirm(true)}>
                  Delete List
                </Button>
              </div>
            </div>
            <div className="text-xs text-[var(--muted)]">
              {detail.members.length} {detail.members.length === 1 ? "test" : "tests"}
            </div>
          </div>

          {detail.members.length > 0 && (
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] p-4 shadow-[var(--elev-raised)] mb-5">
              <div className="font-[var(--font-mono)] text-[11px] uppercase tracking-[0.05em] text-[var(--muted)] mb-2">
                Run All Tests
              </div>
              {triggerError && <Alert variant="error" className="mb-3">{triggerError}</Alert>}
              <div className="flex gap-3 items-center">
                <select
                  value={selectedEnvId ?? ""}
                  onChange={(e) => setSelectedEnvId(e.target.value || null)}
                  className="font-[var(--font-mono)] text-sm bg-[var(--bg)] text-[var(--fg)] border border-[var(--border)] rounded-[var(--radius-sm)] px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                >
                  <option value="">Select environment...</option>
                  {environments?.map((env) => (
                    <option key={env._id} value={env._id}>{env.name} ({env.base_url})</option>
                  ))}
                </select>
                <Button
                  onClick={async () => {
                    if (!selectedEnvId) return;
                    setTriggerError(null);
                    setTriggeringRun(true);
                    try {
                      const firstMember = detail.members[0];
                      const runId = await triggerRun({
                        project_id: firstMember.source_project_id as Id<"projects">,
                        test_list_id: asId(testListId, "test_lists"),
                        environment_id: asId(selectedEnvId, "environments"),
                      });
                      router.push(`/runs/${runId}`);
                    } catch (err) {
                      const msg = err instanceof Error ? err.message : "Failed to trigger run";
                      setTriggerError(msg);
                      logError(msg, { severity: "error", context: { source: "TestListDetailPage.handleTriggerRun" } });
                    } finally {
                      setTriggeringRun(false);
                    }
                  }}
                  disabled={triggeringRun || !selectedEnvId}
                >
                  {triggeringRun ? (
                    <>
                      <svg className="animate-spin h-3 w-3 mr-1" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Starting...
                    </>
                  ) : "Run All"}
                </Button>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between mb-4">
            <h3 className="font-[var(--font-display)] text-lg font-bold text-[var(--fg)]">
              Tests
            </h3>
            <Button size="sm" onClick={() => setShowAddTests(true)}>Add Tests</Button>
          </div>

          {detail.members.length === 0 ? (
            <EmptyState
              icon={
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                </svg>
              }
              title="No tests added yet"
              description="Add approved tests from any suite or project to build your test list."
              action={
                <Button size="sm" onClick={() => setShowAddTests(true)}>Add Tests</Button>
              }
            />
          ) : (
            <div className="border border-[var(--border)] rounded-[var(--radius-md)] overflow-hidden mb-8">
              <table className="w-full">
                <thead>
                  <tr className="bg-[var(--border-soft)]">
                    <th className="text-left font-[var(--font-mono)] text-[11px] uppercase tracking-[0.05em] text-[var(--muted)] px-4 py-2">Test</th>
                    <th className="text-left font-[var(--font-mono)] text-[11px] uppercase tracking-[0.05em] text-[var(--muted)] px-4 py-2">Suite</th>
                    <th className="text-left font-[var(--font-mono)] text-[11px] uppercase tracking-[0.05em] text-[var(--muted)] px-4 py-2">Project</th>
                    <th className="text-left font-[var(--font-mono)] text-[11px] uppercase tracking-[0.05em] text-[var(--muted)] px-4 py-2">Status</th>
                    <th className="text-right font-[var(--font-mono)] text-[11px] uppercase tracking-[0.05em] text-[var(--muted)] px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-soft)]">
                  {detail.members.map((member) => (
                    <tr key={member._id} className="hover:bg-[var(--border-soft)] transition-colors">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-[var(--fg)]">{member.test_name ?? "Unknown"}</span>
                          {member.stale && (
                            <StatusPill variant="danger" showDot={false}>Test deleted</StatusPill>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        {member.suite_name ? (
                          <Link
                            href={`/projects/${member.source_project_id}/suites/${member.source_suite_id}`}
                            className="text-sm text-[var(--accent)] hover:underline"
                          >
                            {member.suite_name}
                          </Link>
                        ) : (
                          <span className="text-sm text-[var(--muted)]">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        {member.project_name ? (
                          <Link
                            href={`/projects/${member.source_project_id}`}
                            className="text-sm text-[var(--accent)] hover:underline"
                          >
                            {member.project_name}
                          </Link>
                        ) : (
                          <span className="text-sm text-[var(--muted)]">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        {member.test_status ? (
                          <StatusPill variant={member.test_status === "approved" ? "success" : "neutral"} showDot={member.test_status === "approved"}>
                            {member.test_status}
                          </StatusPill>
                        ) : (
                          <StatusPill variant="danger" showDot={false}>deleted</StatusPill>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={async () => {
                            await removeTestFromList({
                              test_list_id: asId(testListId, "test_lists"),
                              test_id: member.test_id as Id<"tests">,
                            });
                          }}
                        >
                          Remove
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {detail.runs.length > 0 && (
            <div>
              <h3 className="font-[var(--font-display)] text-lg font-bold text-[var(--fg)] mb-4">
                Recent Runs
              </h3>
              <div className="border border-[var(--border)] rounded-[var(--radius-md)] overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="bg-[var(--border-soft)]">
                      <th className="text-left font-[var(--font-mono)] text-[11px] uppercase tracking-[0.05em] text-[var(--muted)] px-4 py-2">Run</th>
                      <th className="text-left font-[var(--font-mono)] text-[11px] uppercase tracking-[0.05em] text-[var(--muted)] px-4 py-2">Status</th>
                      <th className="text-left font-[var(--font-mono)] text-[11px] uppercase tracking-[0.05em] text-[var(--muted)] px-4 py-2">Duration</th>
                      <th className="text-left font-[var(--font-mono)] text-[11px] uppercase tracking-[0.05em] text-[var(--muted)] px-4 py-2">Results</th>
                      <th className="text-left font-[var(--font-mono)] text-[11px] uppercase tracking-[0.05em] text-[var(--muted)] px-4 py-2">Started</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-soft)]">
                    {detail.runs.map((run) => (
                      <tr key={run._id} className="hover:bg-[var(--border-soft)] transition-colors">
                        <td className="px-4 py-2.5">
                          <Link href={`/runs/${run._id}`} className="text-sm text-[var(--accent)] hover:underline font-[var(--font-mono)]">
                            {run._id.slice(0, 12)}…
                          </Link>
                        </td>
                        <td className="px-4 py-2.5">
                          <StatusPill variant={statusVariant(run.status)} showDot={run.status === "running"}>
                            {run.status}
                          </StatusPill>
                        </td>
                        <td className="px-4 py-2.5 text-sm text-[var(--muted)]">
                          {formatDuration(run.duration_ms)}
                        </td>
                        <td className="px-4 py-2.5 text-sm text-[var(--muted)]">
                          {run.pass_count !== null && (
                            <span>
                              <span className="text-[var(--success-text)]">{run.pass_count} passed</span>
                              {run.fail_count !== null && run.fail_count > 0 && (
                                <span className="text-[var(--danger-text)]"> / {run.fail_count} failed</span>
                              )}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-sm text-[var(--muted)]">
                          {formatTime(run._creationTime)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {showDeleteConfirm && (
            <ConfirmDialog
              title="Delete test list?"
              message={`This will permanently delete "${detail.name}" and remove all ${detail.members.length} test references. Source tests will not be affected.`}
              onConfirm={async () => {
                setShowDeleteConfirm(false);
                await deleteTestList({ test_list_id: asId(testListId, "test_lists") });
                router.push("/test-lists");
              }}
              onCancel={() => setShowDeleteConfirm(false)}
            />
          )}

          {showAddTests && (
            <AddTestsModal testListId={testListId} onClose={() => setShowAddTests(false)} />
          )}
        </div>
      )}
    </QueryResult>
  );
}

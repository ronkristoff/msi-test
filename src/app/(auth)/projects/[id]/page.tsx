"use client";

import { useState, useRef, useEffect } from "react";
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
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Select } from "@/components/ui/FormField";
import { formatDate } from "@/lib/format";
import { useErrorLogger } from "@/lib/error-logger";
import { SOURCE_TYPE_LABELS } from "@/lib/source-types";
import { PageSkeleton } from "@/components/ui/Skeleton";

function ActionMenu({
  onAction,
}: {
  onAction: (action: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <Button variant="secondary" size="sm" onClick={() => setOpen(!open)}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" />
        </svg>
        Actions
      </Button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-40 bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-sm)] shadow-[var(--elev-raised)] py-1 min-w-[200px]">
          <button
            onClick={() => { onAction("createSuite"); setOpen(false); }}
            className="w-full text-left px-3 py-2 text-sm text-[var(--fg)] hover:bg-[var(--border-soft)] transition-colors duration-[var(--motion-fast)]"
          >
            Create Suite
          </button>
          <button
            onClick={() => { onAction("createRegression"); setOpen(false); }}
            className="w-full text-left px-3 py-2 text-sm text-[var(--fg)] hover:bg-[var(--border-soft)] transition-colors duration-[var(--motion-fast)]"
          >
            Create Regression Suite
          </button>
          <div className="border-t border-[var(--border-soft)] my-1" />
          <Link
            href=""
            onClick={(e) => { e.preventDefault(); onAction("generateNl"); setOpen(false); }}
            className="block px-3 py-2 text-sm text-[var(--fg)] hover:bg-[var(--border-soft)] transition-colors duration-[var(--motion-fast)]"
          >
            Generate from Description
          </Link>
          <Link
            href=""
            onClick={(e) => { e.preventDefault(); onAction("generatePrd"); setOpen(false); }}
            className="block px-3 py-2 text-sm text-[var(--fg)] hover:bg-[var(--border-soft)] transition-colors duration-[var(--motion-fast)]"
          >
            Generate from PRD
          </Link>
        </div>
      )}
    </div>
  );
}

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { logError } = useErrorLogger();
  const [creating, setCreating] = useState(false);
  const [showCreateRegression, setShowCreateRegression] = useState(false);
  const [regressionName, setRegressionName] = useState("");
  const [regressionAutoAll, setRegressionAutoAll] = useState(false);
  const [runAllEnvId, setRunAllEnvId] = useState<string | null>(null);
  const [triggeringRunAll, setTriggeringRunAll] = useState(false);
  const [runAllError, setRunAllError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [deleteSuiteId, setDeleteSuiteId] = useState<string | null>(null);

  const projectId = asId(params.id, "projects");
  const project = useQuery(api.projects.queries.getProject, { project_id: projectId });
  const suites = useQuery(api.suites.queries.getSuites, { project_id: projectId });
  const environments = useQuery(api.environments.queries.getEnvironments, { project_id: projectId });
  const functionalSuites = useQuery(api.suites.queries.getFunctionalSuites, { project_id: projectId });

  const createSuite = useMutation(api.suites.mutations.createSuite);
  const createRegressionSuite = useMutation(api.suites.mutations.createRegressionSuite);
  const deleteSuite = useMutation(api.suites.mutations.deleteSuite);
  const runAllTests = useMutation(api.runs.mutations.runAllTests);

  const handleCreateSuite = async () => {
    try {
      setCreating(true);
      const suiteId = await createSuite({ project_id: projectId });
      router.push(`/projects/${params.id}/suites/${suiteId}`);
    } catch (err) {
      logError(err instanceof Error ? err.message : "Failed to create suite", {
        severity: "error",
        context: { source: "ProjectDetailPage.handleCreateSuite" },
      });
    } finally {
      setCreating(false);
    }
  };

  const handleCreateRegression = async () => {
    if (!regressionName.trim()) return;
    try {
      setCreating(true);
      setCreateError(null);
      const suiteId = await createRegressionSuite({
        project_id: projectId,
        name: regressionName.trim(),
        auto_include_all: regressionAutoAll,
        member_suite_ids: regressionAutoAll ? undefined :
          functionalSuites?.map((s) => s._id as Id<"suites">) ?? undefined,
      });
      setShowCreateRegression(false);
      setRegressionName("");
      router.push(`/projects/${params.id}/suites/${suiteId}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to create regression suite";
      setCreateError(msg);
      logError(msg, { severity: "error", context: { source: "ProjectDetailPage.handleCreateRegression" } });
    } finally {
      setCreating(false);
    }
  };

  const handleRunAll = async () => {
    if (!runAllEnvId) return;
    try {
      setTriggeringRunAll(true);
      setRunAllError(null);
      const runId = await runAllTests({
        project_id: projectId,
        environment_id: asId(runAllEnvId, "environments"),
      });
      router.push(`/runs/${runId}`);
    } catch (err) {
      const msg = err instanceof Error
        ? err.message.replace(/^Uncaught ConvexError:\s*/, "")
        : "Failed to run all tests";
      setRunAllError(msg || "Failed to run all tests");
      logError(msg, { severity: "error", context: { source: "ProjectDetailPage.handleRunAll" } });
    } finally {
      setTriggeringRunAll(false);
    }
  };

  const handleAction = (action: string) => {
    switch (action) {
      case "createSuite":
        handleCreateSuite();
        break;
      case "createRegression":
        setShowCreateRegression(true);
        break;
      case "generateNl":
        router.push(`/projects/${params.id}/generate-nl`);
        break;
      case "generatePrd":
        router.push(`/projects/${params.id}/generate`);
        break;
    }
  };

  if (project === undefined || suites === undefined || environments === undefined) {
    return <PageSkeleton />;
  }

  return (
    <QueryResult
      data={project}
      notFound={
        <EmptyState
          icon={
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" />
            </svg>
          }
          title="Project not found"
          description="This project may have been deleted or you don't have access."
          action={
            <Link href="/projects">
              <Button variant="secondary">Back to Projects</Button>
            </Link>
          }
        />
      }
    >
      {(project) => {
        const hasPrd = !!(project.prd_text || project.prd_file_id);
        const functionalSuitesList = suites.filter((s) => s.suite_type !== "regression");
        const regressionSuitesList = suites.filter((s) => s.suite_type === "regression");

        return (
          <div className="max-w-[1080px]">
            {/* Header */}
            <div className="mb-6">
              <div className="flex items-start justify-between gap-4 mb-3">
                <div className="min-w-0">
                  <h2 className="font-[var(--font-display)] text-2xl font-bold text-[var(--fg)] truncate">
                    {project.name}
                  </h2>
                  <a
                    href={project.app_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-[var(--accent)] hover:underline"
                  >
                    {project.app_url}
                  </a>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Link href={`/projects/${project._id}/explore`}>
                    <Button size="sm">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                      </svg>
                      Explore
                    </Button>
                  </Link>
                  <Link href={`/projects/${project._id}/knowledge`}>
                    <Button variant="secondary" size="sm">
                      <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4 19.5A2.5 2.5 0 016.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
                      </svg>
                      Knowledge
                    </Button>
                  </Link>
                  <Link href={`/projects/${project._id}/stories`}>
                    <Button variant="secondary" size="sm">Stories</Button>
                  </Link>
                  <Link href={`/projects/${project._id}/environments`}>
                    <Button variant="secondary" size="sm">Environments</Button>
                  </Link>
                  <Link href={`/projects/${project._id}/settings`}>
                    <Button variant="secondary" size="sm">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                      </svg>
                      Settings
                    </Button>
                  </Link>
                </div>
              </div>

              <div className="flex items-center gap-4 text-xs text-[var(--muted)]">
                <span>Created {formatDate(project._creationTime)}</span>
                {hasPrd && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-[var(--radius-pill)] bg-[var(--accent)]/10 text-[var(--accent)] font-medium">
                    {project.prd_file_id ? "PRD file" : "PRD text"}
                  </span>
                )}
              </div>
            </div>

            {/* Suites section */}
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] shadow-[var(--elev-raised)]">
              <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-soft)]">
                <h3 className="font-[var(--font-display)] text-lg font-bold text-[var(--fg)]">
                  Suites
                </h3>
                <ActionMenu onAction={handleAction} />
              </div>

              {suites.length === 0 ? (
                <div className="px-5 py-8">
                  <EmptyState
                    icon={
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                      </svg>
                    }
                    title="No suites yet"
                    description="Create a suite to start organizing your tests, or generate them from exploration, PRD, or a description."
                  />
                </div>
              ) : (
                <div>
                  {functionalSuitesList.length > 0 && (
                    <div>
                      <div className="px-5 pt-4 pb-2">
                        <span className="text-[11px] font-[var(--font-mono)] font-semibold uppercase tracking-[0.05em] text-[var(--muted)]">
                          Functional ({functionalSuitesList.length})
                        </span>
                      </div>
                      <div className="px-3 pb-2">
                        {functionalSuitesList.map((suite) => (
                          <div
                            key={suite._id}
                            className="flex items-center justify-between py-2.5 px-2 -mx-0.5 rounded-[var(--radius-sm)] hover:bg-[var(--border-soft)] transition-colors duration-[var(--motion-fast)] group"
                          >
                            <Link
                              href={`/projects/${params.id}/suites/${suite._id}`}
                              className="flex items-center gap-3 min-w-0 flex-1"
                            >
                              <div className="min-w-0">
                                <div className="text-sm font-medium text-[var(--fg)] group-hover:text-[var(--accent)] truncate">
                                  {suite.name}
                                </div>
                                <div className="text-xs text-[var(--muted)] mt-0.5">
                                  {formatDate(suite._creationTime)}
                                </div>
                              </div>
                            </Link>
                            <div className="flex items-center gap-3 shrink-0">
                              {suite.status === "generating" ? (
                                <span className="text-xs text-[var(--accent)] inline-flex items-center gap-1.5">
                                  <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                  </svg>
                                  {suite.progress_message ?? "Generating..."}
                                </span>
                              ) : suite.status === "failed" ? (
                                <span className="text-xs text-[var(--danger)]">Generation failed</span>
                              ) : (
                                <span className="text-xs text-[var(--muted)]">
                                  {suite.testCount} {suite.testCount === 1 ? "test" : "tests"}
                                </span>
                              )}
                              <StatusPill variant="neutral" showDot={false}>
                                {SOURCE_TYPE_LABELS[suite.source_type] ?? suite.source_type}
                              </StatusPill>
                              <button
                                onClick={(e) => { e.preventDefault(); setDeleteSuiteId(suite._id); }}
                                className="opacity-0 group-hover:opacity-100 p-1 rounded-[var(--radius-sm)] hover:bg-[var(--danger)]/10 text-[var(--muted)] hover:text-[var(--danger)] transition-opacity duration-[var(--motion-fast)]"
                                title="Delete suite"
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                                </svg>
                              </button>
                              <Link href={`/projects/${params.id}/suites/${suite._id}`}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[var(--muted)] group-hover:text-[var(--fg)]">
                                  <polyline points="9 18 15 12 9 6" />
                                </svg>
                              </Link>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {regressionSuitesList.length > 0 && (
                    <div>
                      {functionalSuitesList.length > 0 && <div className="border-t border-[var(--border-soft)] mx-5" />}
                      <div className="px-5 pt-4 pb-2">
                        <span className="text-[11px] font-[var(--font-mono)] font-semibold uppercase tracking-[0.05em] text-[var(--muted)]">
                          Regression ({regressionSuitesList.length})
                        </span>
                      </div>
                      <div className="px-3 pb-2">
                        {regressionSuitesList.map((suite) => (
                          <Link
                            key={suite._id}
                            href={`/projects/${params.id}/suites/${suite._id}`}
                            className="flex items-center justify-between py-2.5 px-2 -mx-0.5 rounded-[var(--radius-sm)] hover:bg-[var(--border-soft)] transition-colors duration-[var(--motion-fast)] group"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <div className="text-sm font-medium text-[var(--fg)] group-hover:text-[var(--accent)] truncate">
                                    {suite.name}
                                  </div>
                                  {suite.auto_include_all && (
                                    <span className="inline-flex items-center rounded-full bg-[var(--accent)]/10 px-2 py-0.5 text-[10px] font-[var(--font-mono)] font-medium text-[var(--accent)]">
                                      Auto
                                    </span>
                                  )}
                                </div>
                                <div className="text-xs text-[var(--muted)] mt-0.5">
                                  {formatDate(suite._creationTime)}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                              <span className="text-xs text-[var(--muted)]">
                                {suite.testCount} {suite.testCount === 1 ? "test" : "tests"}
                              </span>
                              <StatusPill variant="neutral" showDot={false}>
                                Regression
                              </StatusPill>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[var(--muted)] group-hover:text-[var(--fg)]">
                                <polyline points="9 18 15 12 9 6" />
                              </svg>
                            </div>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Run All Tests */}
              {environments.length > 0 && (
                <>
                  <div className="border-t border-[var(--border-soft)] mx-5" />
                  <div className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="flex-1">
                        <Select
                          label="Run All Tests"
                          hint="Select an environment and run every approved test across all suites."
                          value={runAllEnvId ?? ""}
                          onChange={(e) => setRunAllEnvId(e.target.value || null)}
                        >
                          <option value="">Select environment...</option>
                          {environments.map((env) => (
                            <option key={env._id} value={env._id}>{env.name} ({env.base_url})</option>
                          ))}
                        </Select>
                      </div>
                      <div className="pt-6">
                        <Button
                          onClick={handleRunAll}
                          disabled={triggeringRunAll || !runAllEnvId}
                          size="sm"
                        >
                          {triggeringRunAll ? (
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
                    {runAllError && <Alert variant="error" className="mt-3">{runAllError}</Alert>}
                  </div>
                </>
              )}
            </div>

            {/* Create Regression Modal */}
            {showCreateRegression && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowCreateRegression(false)}>
                <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] p-6 max-w-[440px] w-full shadow-[var(--elev-raised)]" onClick={(e) => e.stopPropagation()}>
                  <h3 className="font-[var(--font-display)] text-lg font-bold text-[var(--fg)] mb-4">
                    Create Regression Suite
                  </h3>
                  {createError && <Alert variant="error" className="mb-3">{createError}</Alert>}
                  <div className="mb-4">
                    <label className="block font-[var(--font-mono)] text-[11px] uppercase tracking-[0.05em] text-[var(--muted)] mb-2">
                      Name
                    </label>
                    <input
                      type="text"
                      value={regressionName}
                      onChange={(e) => setRegressionName(e.target.value)}
                      placeholder="e.g., Full Smoke Test"
                      className="w-full px-3 py-[9px] border border-[var(--border)] rounded-[var(--radius-sm)] text-sm bg-[var(--surface)] text-[var(--fg)] outline-none focus:border-[var(--accent)] focus:shadow-[var(--focus-ring)] transition-all duration-[var(--motion-fast)]"
                      autoFocus
                    />
                  </div>
                  <label className="flex items-start gap-2.5 mb-5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={regressionAutoAll}
                      onChange={(e) => setRegressionAutoAll(e.target.checked)}
                      className="mt-0.5 accent-[var(--accent)]"
                    />
                    <div>
                      <span className="text-sm text-[var(--fg)]">
                        Auto-include all current and future functional suites
                      </span>
                      <span className="text-xs text-[var(--muted)] block mt-0.5">
                        New functional suites will be automatically added to this regression suite.
                      </span>
                    </div>
                  </label>
                  <div className="flex gap-3 justify-end">
                    <Button variant="secondary" size="sm" onClick={() => { setShowCreateRegression(false); setCreateError(null); }}>
                      Cancel
                    </Button>
                    <Button size="sm" onClick={handleCreateRegression} disabled={!regressionName.trim() || creating}>
                      {creating ? "Creating..." : "Create"}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {deleteSuiteId && (
              <ConfirmDialog
                title="Delete suite?"
                message="This will permanently delete the suite and all tests inside it."
                onConfirm={async () => {
                  try {
                    await deleteSuite({ suite_id: deleteSuiteId as Id<"suites"> });
                  } catch (err) {
                    logError(err instanceof Error ? err.message : "Failed to delete suite", {
                      severity: "error",
                      context: { source: "ProjectDetailPage.deleteSuite" },
                    });
                  }
                  setDeleteSuiteId(null);
                }}
                onCancel={() => setDeleteSuiteId(null)}
              />
            )}
          </div>
        );
      }}
    </QueryResult>
  );
}

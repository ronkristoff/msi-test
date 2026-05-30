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
import { formatDate } from "@/lib/format";
import { useErrorLogger } from "@/lib/error-logger";
import { SOURCE_TYPE_LABELS } from "@/lib/source-types";
import { PageSkeleton } from "@/components/ui/Skeleton";

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
  const projectId = asId(params.id, "projects");
  const project = useQuery(api.projects.queries.getProject, {
    project_id: projectId,
  });
  const suites = useQuery(api.suites.queries.getSuites, {
    project_id: projectId,
  });
  const environments = useQuery(api.environments.queries.getEnvironments, {
    project_id: projectId,
  });
  const functionalSuites = useQuery(api.suites.queries.getFunctionalSuites, {
    project_id: projectId,
  });

  const createSuite = useMutation(api.suites.mutations.createSuite);
  const createRegressionSuite = useMutation(api.suites.mutations.createRegressionSuite);
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
      const msg = err instanceof Error ? err.message : "Failed to run all tests";
      setRunAllError(msg);
      logError(msg, { severity: "error", context: { source: "ProjectDetailPage.handleRunAll" } });
    } finally {
      setTriggeringRunAll(false);
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
        return (
    <div className="max-w-[720px]">
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] p-5 shadow-[var(--elev-raised)] mb-5">
        <div className="flex items-start justify-between mb-4 pb-4 border-b border-[var(--border-soft)]">
          <div>
            <h2 className="font-[var(--font-display)] text-xl font-bold text-[var(--fg)]">
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
          <div className="flex items-center gap-2">
            <Link href={`/projects/${project._id}/explore`}>
              <Button variant="secondary" size="sm">Explore</Button>
            </Link>
            <Link href={`/projects/${project._id}/environments`}>
              <Button variant="secondary" size="sm">Environments</Button>
            </Link>
            <Link href={`/projects/${project._id}/settings`}>
              <Button variant="secondary" size="sm">Edit</Button>
            </Link>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 max-[600px]:grid-cols-1">
          <div>
            <div className="font-[var(--font-mono)] text-[11px] uppercase tracking-[0.05em] text-[var(--muted)] mb-1">
              Created
            </div>
            <div className="text-sm text-[var(--fg)]">{formatDate(project._creationTime)}</div>
          </div>
          <div>
            <div className="font-[var(--font-mono)] text-[11px] uppercase tracking-[0.05em] text-[var(--muted)] mb-1">
              PRD
            </div>
            <div className="text-sm text-[var(--fg)]">
              {hasPrd ? (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[var(--radius-sm)] bg-[var(--border-soft)] text-[var(--fg)]">
                  {project.prd_file_id ? "File uploaded" : "Text provided"}
                </span>
              ) : (
                <span className="text-[var(--muted)]">None</span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] p-5 shadow-[var(--elev-raised)]">
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-[var(--border-soft)]">
          <h3 className="font-[var(--font-display)] text-lg font-bold text-[var(--fg)]">
            Suites
          </h3>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowCreateRegression(true)}
            >
              Create Regression
            </Button>
            <Link href={`/projects/${params.id}/generate-nl`}>
              <Button variant="secondary" size="sm">
                Generate from NL
              </Button>
            </Link>
            {hasPrd && (
              <Link href={`/projects/${params.id}/generate`}>
                <Button variant="secondary" size="sm">
                  Generate from PRD
                </Button>
              </Link>
            )}
            <Button
              variant="secondary"
              size="sm"
              onClick={handleCreateSuite}
              disabled={creating}
              icon={
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              }
            >
              Create Suite
            </Button>
          </div>
        </div>

        {suites.length === 0 ? (
          <EmptyState
            icon={
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
            }
            title="No suites yet"
            description="Create a suite to start organizing your tests."
          />
        ) : (
          <>
            {(() => {
              const functionalSuites = suites.filter((s) => s.suite_type !== "regression");
              const regressionSuites = suites.filter((s) => s.suite_type === "regression");
              return (
                <>
                  {functionalSuites.length > 0 && (
                    <div className="mb-4">
                      <div className="font-[var(--font-mono)] text-[11px] uppercase tracking-[0.05em] text-[var(--muted)] mb-2 px-1">
                        Functional Suites
                      </div>
                      <div className="divide-y divide-[var(--border-soft)]">
                        {functionalSuites.map((suite) => (
                          <Link
                            key={suite._id}
                            href={`/projects/${params.id}/suites/${suite._id}`}
                            className="flex items-center justify-between py-3 px-1 -mx-1 rounded-[var(--radius-sm)] hover:bg-[var(--border-soft)] transition-colors duration-[var(--motion-fast)] group"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="min-w-0">
                                <div className="text-sm font-medium text-[var(--fg)] group-hover:text-[var(--accent)] truncate">
                                  {suite.name}
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
                                {SOURCE_TYPE_LABELS[suite.source_type] ?? suite.source_type}
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

                  {regressionSuites.length > 0 && (
                    <div className="mb-4">
                      <div className="font-[var(--font-mono)] text-[11px] uppercase tracking-[0.05em] text-[var(--muted)] mb-2 px-1">
                        Regression Suites
                      </div>
                      <div className="divide-y divide-[var(--border-soft)]">
                        {regressionSuites.map((suite) => (
                          <Link
                            key={suite._id}
                            href={`/projects/${params.id}/suites/${suite._id}`}
                            className="flex items-center justify-between py-3 px-1 -mx-1 rounded-[var(--radius-sm)] hover:bg-[var(--border-soft)] transition-colors duration-[var(--motion-fast)] group"
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
                </>
              );
            })()}
          </>
        )}

        {environments.length > 0 && (
          <div className="pt-4 mt-4 border-t border-[var(--border-soft)]">
            <div className="font-[var(--font-mono)] text-[11px] uppercase tracking-[0.05em] text-[var(--muted)] mb-2">
              Run All Tests
            </div>
            {runAllError && <Alert variant="error" className="mb-3">{runAllError}</Alert>}
            <div className="flex gap-3 items-center">
              <select
                value={runAllEnvId ?? ""}
                onChange={(e) => setRunAllEnvId(e.target.value || null)}
                className="font-[var(--font-mono)] text-sm bg-[var(--bg)] text-[var(--fg)] border border-[var(--border)] rounded-[var(--radius-sm)] px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
              >
                <option value="">Select environment...</option>
                {environments.map((env) => (
                  <option key={env._id} value={env._id}>{env.name} ({env.base_url})</option>
                ))}
              </select>
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
        )}
      </div>

      {showCreateRegression && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowCreateRegression(false)}>
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] p-6 max-w-[440px] w-full shadow-[var(--elev-raised)]" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-[var(--font-display)] text-lg font-bold text-[var(--fg)] mb-4">
              Create Regression Suite
            </h3>
            {createError && <Alert variant="error" className="mb-3">{createError}</Alert>}
            <div className="mb-4">
              <label className="font-[var(--font-mono)] text-[11px] uppercase tracking-[0.05em] text-[var(--muted)] mb-1 block">
                Name
              </label>
              <input
                type="text"
                value={regressionName}
                onChange={(e) => setRegressionName(e.target.value)}
                placeholder="e.g., Full Smoke Test"
                className="w-full font-[var(--font-mono)] text-sm bg-[var(--bg)] text-[var(--fg)] border border-[var(--border)] rounded-[var(--radius-sm)] px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                autoFocus
              />
            </div>
            <label className="flex items-center gap-2 mb-4 cursor-pointer">
              <input
                type="checkbox"
                checked={regressionAutoAll}
                onChange={(e) => setRegressionAutoAll(e.target.checked)}
                className="accent-[var(--accent)]"
              />
              <span className="text-sm text-[var(--fg)]">
                Auto-include all current and future functional suites
              </span>
              <span className="text-xs text-[var(--muted)] block mt-0.5">
                New functional suites will be automatically added to this regression suite.
              </span>
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
    </div>
         );
       }}
     </QueryResult>
   );
 }

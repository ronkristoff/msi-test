"use client";

import { useState } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
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
import { SOURCE_TYPE_LABELS } from "@/lib/source-types";
import { useErrorLogger } from "@/lib/error-logger";
import { hasAiConfig } from "@/lib/ai-presets";
import { PageSkeleton } from "@/components/ui/Skeleton";
import { SuiteStatusBanners } from "@/components/SuiteStatusBanners";
import { TestAccordionItem } from "@/components/TestAccordionItem";

export default function SuiteDetailPage() {
  const params = useParams<{ id: string; suiteId: string }>();
  const router = useRouter();
  const { logError } = useErrorLogger();
  const suiteId = asId(params.suiteId, "suites");
  const suite = useQuery(api.suites.queries.getSuite, {
    suite_id: suiteId,
  });
  const tests = useQuery(api.tests.queries.getTests, {
    suite_id: suiteId,
  });
  const regressionMembers = useQuery(
    api.suites.queries.getRegressionMembers,
    suite?.suite_type === "regression" ? { suite_id: suiteId } : "skip",
  );
  const workspace = useQuery(api.workspaces.queries.getWorkspaceForUser);
  const environments = useQuery(
    api.environments.queries.getEnvironments,
    suite ? { project_id: suite.project_id } : "skip",
  );
  const activeRun = useQuery(
    api.runs.queries.getActiveRunForSuite,
    { suite_id: suiteId },
  );

  const updateSuite = useMutation(api.suites.mutations.updateSuite);
  const deleteSuite = useMutation(api.suites.mutations.deleteSuite);
  const addSuiteMember = useMutation(api.suites.mutations.addSuiteMember);
  const generateNlTests = useAction(api.ai.generateNlTests.generateNlTests);
  const triggerRun = useMutation(api.runs.mutations.triggerRun);

  const regressionSuites = useQuery(
    api.suites.queries.getSuites,
    suite ? { project_id: suite.project_id } : "skip",
  );

  const existingRegressionIds = useQuery(
    api.suites.queries.getRegressionsForMemberSuite,
    suite ? { member_suite_id: suiteId as Id<"suites"> } : "skip",
  );

  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const [nlPrompt, setNlPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  const [selectedEnvId, setSelectedEnvId] = useState<string | null>(null);
  const [triggeringRun, setTriggeringRun] = useState(false);
  const [triggerError, setTriggerError] = useState<string | null>(null);

  const aiConfigReady = hasAiConfig(workspace);
  const currentUser = useQuery(api.workspaces.queries.getCurrentUser);
  const currentUserId = currentUser?._id;

  const [showAddToRegression, setShowAddToRegression] = useState(false);
  const [addToRegError, setAddToRegError] = useState<string | null>(null);

  const approvedCount = tests?.filter((t) => t.status === "approved").length ?? 0;

  const regressionApprovedCount = regressionMembers
    ? regressionMembers.suiteRefs.reduce(
        (sum, ref) => sum + ref.tests.filter((t) => t.status === "approved").length,
        0,
      ) + regressionMembers.individualTests.filter((t) => t.status === "approved").length
    : 0;

  const effectiveApprovedCount = suite?.suite_type === "regression"
    ? regressionApprovedCount
    : approvedCount;

  const handleStartEditName = () => {
    if (!suite) return;
    setEditName(suite.name);
    setIsEditingName(true);
  };

  const handleSaveName = async () => {
    if (editName.trim()) {
      await updateSuite({ suite_id: suiteId, name: editName.trim() });
    }
    setIsEditingName(false);
  };

  const handleDeleteSuite = async () => {
    await deleteSuite({ suite_id: suiteId });
    router.push(`/projects/${params.id}`);
  };

  const handleGenerateNl = async () => {
    if (!nlPrompt.trim()) return;
    setGenerateError(null);
    if (!suite) return;
    setGenerating(true);
    try {
      await generateNlTests({
        project_id: suite.project_id,
        prompt: nlPrompt.trim(),
        suite_id: suiteId,
      });
      setNlPrompt("");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Generation failed";
      setGenerateError(msg);
      logError(msg, { severity: "error", context: { source: "SuiteDetailPage.handleGenerateNl" } });
    } finally {
      setGenerating(false);
    }
  };

  const handleTriggerRun = async () => {
    if (!suite || !selectedEnvId) return;
    setTriggerError(null);
    setTriggeringRun(true);
    try {
      const runId = await triggerRun({
        project_id: suite.project_id,
        suite_id: suiteId,
        environment_id: asId(selectedEnvId, "environments"),
      });
      router.push(`/runs/${runId}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to trigger run";
      setTriggerError(msg);
      logError(msg, { severity: "error", context: { source: "SuiteDetailPage.handleTriggerRun" } });
    } finally {
      setTriggeringRun(false);
    }
  };

  if (suite === undefined || tests === undefined || workspace === undefined || environments === undefined) {
    return <PageSkeleton />;
  }

  return (
    <QueryResult
      data={suite}
      notFound={
        <EmptyState
          icon={
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" />
            </svg>
          }
          title="Suite not found"
          description="This suite may have been deleted or you don't have access."
          action={
            <Link href={`/projects/${params.id}`}>
              <Button variant="secondary">Back to Project</Button>
            </Link>
          }
        />
      }
    >
      {(suite) => (
    <div className="max-w-[840px]">
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
                    if (e.key === "Enter") handleSaveName();
                    if (e.key === "Escape") setIsEditingName(false);
                  }}
                  className="font-[var(--font-display)] text-xl font-bold text-[var(--fg)] bg-transparent border-b-2 border-[var(--accent)] outline-none flex-1"
                  autoFocus
                />
                <Button variant="primary" size="sm" onClick={handleSaveName}>Save</Button>
                <Button variant="ghost" size="sm" onClick={() => setIsEditingName(false)}>Cancel</Button>
              </div>
            ) : (
              <div className="flex items-center gap-2 cursor-pointer group" onClick={handleStartEditName}>
                <h2 className="font-[var(--font-display)] text-xl font-bold text-[var(--fg)]">
                  {suite.name}
                </h2>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[var(--muted)] opacity-0 group-hover:opacity-100 transition-opacity">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </div>
            )}
            {suite.description && (
              <p className="text-sm text-[var(--muted)] mt-1">{suite.description}</p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-4">
            <StatusPill variant="neutral" showDot={false}>
              {SOURCE_TYPE_LABELS[suite.source_type] ?? suite.source_type}
            </StatusPill>
            {suite.suite_type !== "regression" && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => { setShowAddToRegression(true); setAddToRegError(null); }}
              >
                Add Suite to Regression
              </Button>
            )}
            <Button variant="danger" size="sm" onClick={() => setShowDeleteConfirm(true)}>
              Delete Suite
            </Button>
          </div>
        </div>
        <div className="text-xs text-[var(--muted)]">
          {suite.testCount} {suite.testCount === 1 ? "test" : "tests"}
        </div>
      </div>

      {activeRun && (
        <div className="bg-[var(--surface)] border border-[var(--accent)] rounded-[var(--radius-md)] p-4 shadow-[var(--elev-raised)] mb-5">
          <div className="flex items-center gap-3">
            <svg className="animate-spin h-4 w-4 text-[var(--accent)]" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span className="text-sm text-[var(--fg)]">Run in progress</span>
            <Link href={`/runs/${activeRun._id}`} className="text-sm text-[var(--accent)] underline font-medium ml-auto">
              View progress →
            </Link>
          </div>
        </div>
      )}

      <SuiteStatusBanners suite={suite} activeRun={activeRun} />

      {!activeRun && effectiveApprovedCount > 0 && (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] p-4 shadow-[var(--elev-raised)] mb-5">
          <div className="font-[var(--font-mono)] text-[11px] uppercase tracking-[0.05em] text-[var(--muted)] mb-2">
            Run Tests ({effectiveApprovedCount} approved)
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
              onClick={handleTriggerRun}
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
              ) : "Run Tests"}
            </Button>
          </div>
        </div>
      )}

      {suite.suite_type !== "regression" && (
        <>
          {!aiConfigReady ? (
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] p-4 shadow-[var(--elev-raised)] mb-5">
              <Alert variant="error">
                AI provider not configured.{" "}
                <Link href="/settings" className="underline font-medium">
                  Configure AI settings
                </Link>{" "}
                to generate tests from descriptions.
              </Alert>
            </div>
          ) : (
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] p-4 shadow-[var(--elev-raised)] mb-5">
              <div className="font-[var(--font-mono)] text-[11px] uppercase tracking-[0.05em] text-[var(--muted)] mb-2">
                Describe a Test
              </div>
              {generateError && <Alert variant="error" className="mb-3">{generateError}</Alert>}
              <div className="flex gap-3">
                <textarea
                  value={nlPrompt}
                  onChange={(e) => setNlPrompt(e.target.value)}
                  placeholder={"e.g., Test that login works with valid credentials"}
                  className="flex-1 min-h-[60px] max-h-[120px] font-[var(--font-mono)] text-sm bg-[var(--bg)] text-[var(--fg)] border border-[var(--border)] rounded-[var(--radius-sm)] p-3 resize-y focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                  disabled={generating}
                />
                <Button
                  onClick={handleGenerateNl}
                  disabled={generating || !nlPrompt.trim()}
                  className="self-end shrink-0"
                >
                  {generating ? (
                    <>
                      <svg className="animate-spin h-3 w-3 mr-1" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Generating...
                    </>
                  ) : "Generate Tests"}
                </Button>
              </div>
            </div>
          )}

          <div>
            <h3 className="font-[var(--font-display)] text-lg font-bold text-[var(--fg)] mb-4">
              Tests
            </h3>

            {tests.length === 0 ? (
              <EmptyState
                icon={
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                  </svg>
                }
                title="No tests yet"
                description="Tests will appear here when they are generated from exploration, PRD, or natural language."
              />
            ) : (
              <div className="flex flex-col gap-4">
                {tests.map((test) => (
              <TestAccordionItem
                key={test._id}
                test={test}
                environments={environments}
                workspace={workspace}
                currentUserId={currentUserId}
                onRunTest={(testId, envId) => {
                      if (!envId) return;
                      setTriggeringRun(true);
                      triggerRun({
                        project_id: asId(params.id, "projects"),
                        test_id: asId(testId, "tests"),
                        environment_id: asId(envId, "environments"),
                      })
                        .then((runId) => {
                          if (runId) router.push(`/runs/${runId}`);
                        })
                        .finally(() => setTriggeringRun(false));
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {suite.suite_type === "regression" && (
        <div>
          <h3 className="font-[var(--font-display)] text-lg font-bold text-[var(--fg)] mb-4">
            Included Tests
          </h3>

          {!regressionMembers || (regressionMembers.suiteRefs.length === 0 && regressionMembers.individualTests.length === 0) ? (
            <EmptyState
              icon={
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
              }
              title="No suites or tests added yet"
              description="Add functional suites or individual tests to this regression suite from the project page."
            />
          ) : (
            <div className="space-y-4">
              {regressionMembers.suiteRefs.map((ref) => (
                <div key={ref.suite._id} className="border border-[var(--border)] rounded-[var(--radius-md)] overflow-hidden">
                  <div className="px-4 py-3 bg-[var(--surface)] border-b border-[var(--border-soft)]">
                    <div className="flex items-center justify-between">
                      <div>
                        <Link
                          href={`/projects/${params.id}/suites/${ref.suite._id}`}
                          className="text-sm font-medium text-[var(--fg)] hover:text-[var(--accent)] transition-colors"
                        >
                          {ref.suite.name}
                        </Link>
                        {ref.suite.description && (
                          <div className="text-xs text-[var(--muted)] mt-0.5">{ref.suite.description}</div>
                        )}
                      </div>
                      <span className="text-xs text-[var(--muted)]">
                        {ref.tests.length} {ref.tests.length === 1 ? "test" : "tests"}
                      </span>
                    </div>
                  </div>
                  <div className="divide-y divide-[var(--border-soft)]">
                    {ref.tests.map((test) => (
                      <div key={test._id} className="px-4 py-2 flex items-center justify-between">
                        <Link
                          href={`/projects/${params.id}/suites/${ref.suite._id}`}
                          className="text-sm text-[var(--fg)] hover:text-[var(--accent)] transition-colors"
                        >
                          {test.name}
                        </Link>
                        <StatusPill variant={test.status === "approved" ? "success" : "neutral"} showDot={test.status === "approved"}>
                          {test.status}
                        </StatusPill>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {regressionMembers.individualTests.length > 0 && (
                <div className="border border-[var(--border)] rounded-[var(--radius-md)] overflow-hidden">
                  <div className="px-4 py-3 bg-[var(--surface)] border-b border-[var(--border-soft)]">
                    <div className="text-sm font-medium text-[var(--fg)]">Individual Tests</div>
                  </div>
                  <div className="divide-y divide-[var(--border-soft)]">
                    {regressionMembers.individualTests.map((test) => (
                      <div key={test._id} className="px-4 py-2 flex items-center justify-between">
                        <div>
                          <Link
                            href={`/projects/${params.id}/suites/${test.source_suite_id}`}
                            className="text-sm text-[var(--fg)] hover:text-[var(--accent)] transition-colors"
                          >
                            {test.name}
                          </Link>
                          <span className="text-xs text-[var(--muted)] ml-2">from {test.source_suite_name}</span>
                        </div>
                        <StatusPill variant={test.status === "approved" ? "success" : "neutral"} showDot={test.status === "approved"}>
                          {test.status}
                        </StatusPill>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {showDeleteConfirm && (
        <ConfirmDialog
          title="Delete suite?"
          message={`This will permanently delete "${suite.name}" and all ${suite.testCount} test${suite.testCount === 1 ? "" : "s"} inside it. Run history will be preserved but show as orphaned.`}
          onConfirm={handleDeleteSuite}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}

      {showAddToRegression && regressionSuites && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowAddToRegression(false)}>
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] p-6 max-w-[400px] w-full shadow-[var(--elev-raised)]" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-[var(--font-display)] text-lg font-bold text-[var(--fg)] mb-4">
              Add to Regression Suite
            </h3>
            {addToRegError && <Alert variant="error" className="mb-3">{addToRegError}</Alert>}
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {regressionSuites
                .filter((s) => s.suite_type === "regression")
                .filter((s) => !existingRegressionIds?.includes(s._id))
                .map((regSuite) => (
                  <Button
                    key={regSuite._id}
                    variant="secondary"
                    size="sm"
                    className="w-full text-left"
                    onClick={async () => {
                      try {
                        await addSuiteMember({
                          regression_suite_id: regSuite._id as Id<"suites">,
                          member_suite_id: suiteId as Id<"suites">,
                        });
                        setShowAddToRegression(false);
                      } catch (err) {
                        const msg = err instanceof Error ? err.message : "Failed to add";
                        setAddToRegError(msg);
                      }
                    }}
                  >
                    {regSuite.name}
                  </Button>
                ))}
              {regressionSuites.filter((s) => s.suite_type === "regression").length === 0 && (
                <p className="text-sm text-[var(--muted)]">No regression suites yet. Create one from the project page.</p>
              )}
              {regressionSuites.filter((s) => s.suite_type === "regression").length > 0 &&
                regressionSuites.filter((s) => s.suite_type === "regression" && !existingRegressionIds?.includes(s._id)).length === 0 && (
                <p className="text-sm text-[var(--muted)]">Already added to all regression suites.</p>
              )}
            </div>
            <div className="flex justify-end mt-4">
              <Button variant="ghost" size="sm" onClick={() => setShowAddToRegression(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
      )}
    </QueryResult>
  );
}

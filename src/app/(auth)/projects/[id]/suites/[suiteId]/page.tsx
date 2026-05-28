"use client";

import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import hljs from "highlight.js/lib/core";
import javascript from "highlight.js/lib/languages/javascript";
import "highlight.js/styles/github-dark.css";
import { api, asId } from "@/lib/convex";
import type { Doc } from "@/lib/convex";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { StatusPill } from "@/components/ui/StatusPill";
import { QueryResult } from "@/components/ui/QueryResult";
import { Alert } from "@/components/ui/Alert";
import { SOURCE_TYPE_LABELS } from "@/lib/source-types";
import { useErrorLogger } from "@/lib/error-logger";
import { hasAiConfig } from "@/lib/ai-presets";

hljs.registerLanguage("javascript", javascript);

function ConfirmDialog({ title, message, onConfirm, onCancel }: {
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onCancel}>
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] p-6 max-w-[400px] w-full shadow-[var(--elev-raised)]" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-[var(--font-display)] text-lg font-bold text-[var(--fg)] mb-2">{title}</h3>
        <p className="text-sm text-[var(--muted)] mb-5">{message}</p>
        <div className="flex gap-3 justify-end">
          <Button variant="secondary" size="sm" onClick={onCancel}>Cancel</Button>
          <Button variant="danger" size="sm" onClick={onConfirm}>Delete</Button>
        </div>
      </div>
    </div>
  );
}

function CodePreview({ code }: { code: string }) {
  const codeRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (codeRef.current) {
      codeRef.current.removeAttribute("data-highlighted");
      hljs.highlightElement(codeRef.current);
    }
  }, [code]);

  return (
    <pre className="bg-[#0d1117] rounded-[var(--radius-sm)] p-4 overflow-x-auto text-sm">
      <code ref={codeRef} className="language-javascript">
        {code}
      </code>
    </pre>
  );
}

function TestAccordionItem({ test, environments, onRunTest }: {
  test: Doc<"tests">;
  environments: Doc<"environments">[] | undefined;
  onRunTest: (testId: string, envId: string | null) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [localCode, setLocalCode] = useState<string | null>(null);
  const isDirty = localCode !== null && localCode !== test.playwright_code;
  const displayCode = localCode ?? test.playwright_code;

  const updateTestCode = useMutation(api.tests.mutations.updateTestCode);
  const updateTestStatus = useMutation(api.tests.mutations.updateTestStatus);
  const deleteTest = useMutation(api.tests.mutations.deleteTest);
  const regenerateTest = useAction(api.ai.regenerateTest.regenerateTest);
  const { logError } = useErrorLogger();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  const handleSave = async () => {
    await updateTestCode({ test_id: test._id, playwright_code: localCode! });
    setLocalCode(null);
  };

  const handleDiscard = () => {
    setLocalCode(null);
  };

  const toggleStatus = async () => {
    const newStatus = test.status === "draft" ? "approved" : "draft";
    await updateTestStatus({ test_id: test._id, status: newStatus });
  };

  const handleRegenerate = async () => {
    setRegenerating(true);
    try {
      await regenerateTest({ test_id: test._id });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Regeneration failed";
      logError(msg, { severity: "error", context: { source: "TestAccordionItem.handleRegenerate" } });
    } finally {
      setRegenerating(false);
    }
  };

  return (
    <>
      <div className="border border-[var(--border)] rounded-[var(--radius-md)] overflow-hidden">
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-between px-4 py-3 bg-[var(--surface)] hover:bg-[var(--border-soft)] transition-colors duration-[var(--motion-fast)] text-left"
        >
          <div className="flex items-center gap-3 min-w-0">
            <svg
              width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              className={`text-[var(--muted)] transition-transform duration-[var(--motion-fast)] shrink-0 ${expanded ? "rotate-90" : ""}`}
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
            <span className="text-sm font-medium text-[var(--fg)] truncate">{test.name}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <StatusPill variant={test.status === "approved" ? "success" : "neutral"} showDot={test.status === "approved"}>
              {test.status}
            </StatusPill>
            <StatusPill variant="neutral" showDot={false}>
              {SOURCE_TYPE_LABELS[test.source_type] ?? test.source_type}
            </StatusPill>
          </div>
        </button>

        {expanded && (
          <div className="border-t border-[var(--border)] p-4 bg-[var(--surface)]">
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="font-[var(--font-mono)] text-[11px] uppercase tracking-[0.05em] text-[var(--muted)] mb-1 block">
                  Editor
                </label>
                <textarea
                  value={displayCode}
                  onChange={(e) => setLocalCode(e.target.value)}
                  className="w-full min-h-[200px] font-[var(--font-mono)] text-sm bg-[#0d1117] text-[var(--fg)] border border-[var(--border)] rounded-[var(--radius-sm)] p-3 resize-y focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                  spellCheck={false}
                />
              </div>
              <div>
                <label className="font-[var(--font-mono)] text-[11px] uppercase tracking-[0.05em] text-[var(--muted)] mb-1 block">
                  Preview
                </label>
                <CodePreview code={displayCode} />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-3 border-t border-[var(--border-soft)]">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRegenerate}
                disabled={regenerating}
              >
                {regenerating ? (
                  <>
                    <svg className="animate-spin h-3 w-3 mr-1" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Regenerating...
                  </>
                ) : "Regenerate"}
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleSave}
                disabled={!isDirty || updateTestCode === undefined}
              >
                {isDirty ? "Save Changes" : "Saved"}
              </Button>
              {isDirty && (
                <Button variant="ghost" size="sm" onClick={handleDiscard}>
                  Discard
                </Button>
              )}
              <div className="flex-1" />
              {test.status === "approved" && environments && environments.length > 0 && (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={environments.length > 1}
                  title={environments.length > 1 ? "Use \"Run All Tests\" to select an environment" : undefined}
                  onClick={() => {
                    onRunTest(test._id, environments[0]._id);
                  }}
                >
                  Run Test
                </Button>
              )}
              <Button
                variant="secondary"
                size="sm"
                onClick={toggleStatus}
                disabled={updateTestStatus === undefined}
              >
                {test.status === "draft" ? "Approve" : "Revert to Draft"}
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => setShowDeleteConfirm(true)}
                disabled={deleteTest === undefined}
              >
                Delete Test
              </Button>
            </div>
          </div>
        )}
      </div>

      {showDeleteConfirm && (
        <ConfirmDialog
          title="Delete test?"
          message={`This will permanently delete "${test.name}". Run history referencing this test will be preserved but show as orphaned.`}
          onConfirm={async () => {
            setShowDeleteConfirm(false);
            await deleteTest({ test_id: test._id });
          }}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
    </>
  );
}

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
  const workspace = useQuery(api.workspaces.queries.getWorkspaceForUser);
  const environments = useQuery(
    suite ? api.environments.queries.getEnvironments : "skip",
    suite ? { project_id: suite.project_id } : "skip",
  );
  const activeRun = useQuery(
    api.runs.queries.getActiveRunForSuite,
    { suite_id: suiteId },
  );

  const updateSuite = useMutation(api.suites.mutations.updateSuite);
  const deleteSuite = useMutation(api.suites.mutations.deleteSuite);
  const generateNlTests = useAction(api.ai.generateNlTests.generateNlTests);
  const triggerRun = useMutation(api.runs.mutations.triggerRun);

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

  const approvedCount = tests?.filter((t) => t.status === "approved").length ?? 0;

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
    if (!suite) return;
    setTriggerError(null);
    setTriggeringRun(true);
    try {
      const runId = await triggerRun({
        project_id: suite.project_id,
        suite_id: suiteId,
        environment_id: selectedEnvId ?? undefined,
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
    return <div className="text-[var(--muted)] text-sm">Loading...</div>;
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

      {!activeRun && approvedCount > 0 && (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] p-4 shadow-[var(--elev-raised)] mb-5">
          <div className="font-[var(--font-mono)] text-[11px] uppercase tracking-[0.05em] text-[var(--muted)] mb-2">
            Run Tests ({approvedCount} approved)
          </div>
          {triggerError && <Alert variant="error" className="mb-3">{triggerError}</Alert>}
          <div className="flex gap-3 items-center">
            <select
              value={selectedEnvId ?? ""}
              onChange={(e) => setSelectedEnvId(e.target.value || null)}
              className="font-[var(--font-mono)] text-sm bg-[var(--bg)] text-[var(--fg)] border border-[var(--border)] rounded-[var(--radius-sm)] px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
            >
              <option value="">Default URL</option>
              {environments?.map((env) => (
                <option key={env._id} value={env._id}>{env.name} ({env.base_url})</option>
              ))}
            </select>
            <Button
              onClick={handleTriggerRun}
              disabled={triggeringRun}
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
          <div className="flex flex-col gap-3">
            {tests.map((test) => (
              <TestAccordionItem
                key={test._id}
                test={test}
                environments={environments}
                onRunTest={(testId, envId) => {
                  setTriggeringRun(true);
                  triggerRun({
                    project_id: asId(params.id, "projects"),
                    test_id: asId(testId, "tests"),
                    environment_id: envId ? asId(envId, "environments") : undefined,
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

      {showDeleteConfirm && (
        <ConfirmDialog
          title="Delete suite?"
          message={`This will permanently delete "${suite.name}" and all ${suite.testCount} test${suite.testCount === 1 ? "" : "s"} inside it. Run history will be preserved but show as orphaned.`}
          onConfirm={handleDeleteSuite}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
    </div>
      )}
    </QueryResult>
  );
}

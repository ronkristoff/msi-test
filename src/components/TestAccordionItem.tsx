"use client";

import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import hljs from "highlight.js/lib/core";
import javascript from "highlight.js/lib/languages/javascript";
import "highlight.js/styles/github-dark.css";
import { api } from "@/lib/convex";
import type { Doc, Id } from "@/lib/convex";
import { Button } from "@/components/ui/Button";
import { StatusPill } from "@/components/ui/StatusPill";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { AddToListModal } from "@/components/AddToListModal";
import { SOURCE_TYPE_LABELS } from "@/lib/source-types";
import { useErrorLogger } from "@/lib/error-logger";
import { hasAiConfig } from "@/lib/ai-presets";
import { TestChat } from "@/components/TestChat";

hljs.registerLanguage("javascript", javascript);

function CodePreview({ code }: { code: string }) {
  const codeRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (codeRef.current) {
      codeRef.current.removeAttribute("data-highlighted");
      hljs.highlightElement(codeRef.current);
    }
  }, [code]);

  return (
    <pre className="bg-[#0d1117] rounded-[var(--radius-sm)] p-4 overflow-x-auto text-sm text-[#e6edf3]">
      <code ref={codeRef} className="language-javascript">
        {code}
      </code>
    </pre>
  );
}

export function TestAccordionItem({ test, environments, onRunTest, workspace, currentUserId }: {
  test: Doc<"tests">;
  environments: Doc<"environments">[] | undefined;
  onRunTest: (testId: string, envId: string | null) => void;
  workspace: { ai_config?: { endpoint_url?: string; model_name?: string; api_key_masked?: string } } | null | undefined;
  currentUserId?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [localCode, setLocalCode] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"code" | "steps">("code");
  const [showAddToList, setShowAddToList] = useState(false);
  const isStagehand = test.execution_type === "stagehand" && test.steps && test.steps.length > 0;
  const isDirty = localCode !== null && localCode !== (test.playwright_code ?? "");
  const displayCode = localCode ?? test.playwright_code ?? "";

  const recentlyHealed = test.last_healed_at !== undefined && test.last_healed_at > 0;

  const updateTestCode = useMutation(api.tests.mutations.updateTestCode);
  const updateTestStatus = useMutation(api.tests.mutations.updateTestStatus);
  const deleteTest = useMutation(api.tests.mutations.deleteTest);
  const lockTestMut = useMutation(api.tests.mutations.lockTest);
  const unlockTestMut = useMutation(api.tests.mutations.unlockTest);
  const regenerateTest = useAction(api.ai.regenerateTest.regenerateTest);
  const healTestAction = useAction(api.ai.healTest.healTest);
  const { logError } = useErrorLogger();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [healing, setHealing] = useState(false);
  const [healSuccess, setHealSuccess] = useState(false);
  const [healHint, setHealHint] = useState("");

  const latestFailure = useQuery(
    api.runs.queries.getLatestFailureForTest,
    expanded ? { test_id: test._id } : "skip",
  );

  const aiConfigReady = hasAiConfig(workspace);

  const handleExpand = async (opening: boolean) => {
    setExpanded(opening);
    if (!opening) {
      setHealSuccess(false);
    }
    if (opening) {
      try {
        await lockTestMut({ test_id: test._id });
      } catch {
        // Lock may fail if another user has it — still expand for viewing
      }
    } else {
      try {
        await unlockTestMut({ test_id: test._id });
      } catch {
        // Ignore unlock errors
      }
    }
  };

  const handleSave = async () => {
    await updateTestCode({ test_id: test._id, playwright_code: localCode!, clear_healed_at: true });
    setLocalCode(null);
  };

  const handleDiscard = () => {
    setLocalCode(null);
  };

  const toggleStatus = async () => {
    const newStatus = test.status === "draft" ? "approved" : "draft";
    await updateTestStatus({ test_id: test._id, status: newStatus });
    if (newStatus === "approved" && test.last_healed_at) {
      await updateTestCode({ test_id: test._id, playwright_code: test.playwright_code, clear_healed_at: true });
    }
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

  const handleHeal = async () => {
    setHealing(true);
    setHealSuccess(false);
    try {
      await healTestAction({
        test_id: test._id as Id<"tests">,
        user_hint: healHint.trim() || undefined,
      });
      setHealSuccess(true);
      setHealHint("");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Healing failed";
      logError(msg, { severity: "error", context: { source: "TestAccordionItem.handleHeal" } });
    } finally {
      setHealing(false);
    }
  };

  return (
    <>
      <div className="border border-[var(--border)] rounded-[var(--radius-md)] overflow-hidden">
        <button
          onClick={() => handleExpand(!expanded)}
          className="w-full flex items-center justify-between px-5 py-4 bg-[var(--surface)] hover:bg-[var(--border-soft)] transition-colors duration-[var(--motion-fast)] text-left"
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
            {test.locked_by && test.locked_by !== currentUserId && (
              <span className="text-xs text-[var(--warning)] bg-[var(--warning)]/10 px-2 py-0.5 rounded">
                Editing
              </span>
            )}
            {test.last_healed_at && recentlyHealed && (
              <span className="text-[10px] font-[var(--font-mono)] uppercase tracking-[0.04em] text-[var(--accent)] bg-[var(--accent)]/10 px-1.5 py-0.5 rounded">
                healed
              </span>
            )}
            <StatusPill variant={test.status === "approved" ? "success" : "neutral"} showDot={test.status === "approved"}>
              {test.status}
            </StatusPill>
            <StatusPill variant="neutral" showDot={false}>
              {SOURCE_TYPE_LABELS[test.source_type] ?? test.source_type}
            </StatusPill>
            {test.execution_type && (
              <StatusPill variant={test.execution_type === "stagehand" ? "success" : "neutral"} showDot={test.execution_type === "stagehand"}>
                {test.execution_type}
              </StatusPill>
            )}
          </div>
        </button>

        {expanded && (
          <div className="border-t border-[var(--border)] p-5 bg-[var(--surface)]">
            {test.locked_by && test.locked_by !== currentUserId && (
              <div className="mb-3 px-3 py-2 bg-[var(--warning)]/10 border border-[var(--warning)]/20 rounded-[var(--radius-sm)] text-xs text-[var(--warning)]">
                This test is currently being edited by another team member. Changes are read-only.
              </div>
            )}
            {recentlyHealed && (
              <div className="mb-3">
                <div className="px-3 py-2 bg-[var(--accent)]/8 border border-[var(--accent)]/20 rounded-t-[var(--radius-sm)] text-xs text-[var(--fg)]">
                  AI fixed this test from a recent failure. Review changes before approving.
                </div>
                {test.last_healed_diff && (
                  <pre className="px-3 py-2 bg-[#0d1117] border border-t-0 border-[var(--accent)]/20 rounded-b-[var(--radius-sm)] text-[11px] font-[var(--font-mono)] leading-relaxed overflow-x-auto max-h-[200px] overflow-y-auto">
                    {test.last_healed_diff.split("\n").map((line, i) => (
                      <span key={i} className={
                        line.startsWith("+") && !line.startsWith("+ ") || line.startsWith("+ ") ? "text-[#3fb950]" :
                        line.startsWith("-") ? "text-[#f85149]" :
                        line.startsWith("...") ? "text-[var(--muted)]" :
                        "text-[#8b949e]"
                      }>
                        {line}
                        {"\n"}
                      </span>
                    ))}
                  </pre>
                )}
              </div>
            )}
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-[var(--font-mono)] text-[11px] uppercase tracking-[0.05em] text-[var(--muted)]">
                    Editor
                  </label>
                  {isStagehand && (
                    <div className="flex gap-1">
                      <button
                        onClick={() => setViewMode("steps")}
                        className={`text-[10px] font-[var(--font-mono)] uppercase tracking-[0.04em] px-2 py-0.5 rounded transition-colors ${viewMode === "steps" ? "bg-[var(--accent)] text-white" : "bg-[var(--border-soft)] text-[var(--muted)] hover:text-[var(--fg)]"}`}
                      >
                        Steps
                      </button>
                      <button
                        onClick={() => setViewMode("code")}
                        className={`text-[10px] font-[var(--font-mono)] uppercase tracking-[0.04em] px-2 py-0.5 rounded transition-colors ${viewMode === "code" ? "bg-[var(--accent)] text-white" : "bg-[var(--border-soft)] text-[var(--muted)] hover:text-[var(--fg)]"}`}
                      >
                        Code
                      </button>
                    </div>
                  )}
                </div>
                {viewMode === "steps" && test.steps ? (
                  <div className="min-h-[300px] bg-[#0d1117] border border-[var(--border)] rounded-[var(--radius-sm)] p-3 overflow-y-auto space-y-3">
                    {test.steps.map((step, i) => (
                      <div key={i} className="border-l-2 border-[var(--accent)] pl-3">
                        <div className="flex items-start gap-2">
                          <span className="font-[var(--font-mono)] text-[10px] text-[var(--muted)] shrink-0 mt-0.5">
                            {String(i + 1).padStart(2, "0")}
                          </span>
                          <div className="min-w-0">
                            <p className="text-sm text-[#e6edf3]">{step.instruction}</p>
                            {step.expected_outcome && (
                              <p className="text-xs text-[#8b949e] mt-0.5">Expected: {step.expected_outcome}</p>
                            )}
                            {step.assertion_code && (
                              <pre className="text-[11px] font-[var(--font-mono)] text-[#79c0ff] mt-1 bg-[#161b22] rounded px-2 py-1 overflow-x-auto">
                                {step.assertion_code}
                              </pre>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <textarea
                    value={displayCode}
                    onChange={(e) => setLocalCode(e.target.value)}
                    readOnly={!!(test.locked_by && test.locked_by !== currentUserId)}
                    className={`w-full min-h-[300px] font-[var(--font-mono)] text-base bg-[#0d1117] text-[#e6edf3] border border-[var(--border)] rounded-[var(--radius-sm)] p-3 resize-y focus:outline-none focus:ring-1 focus:ring-[var(--accent)] ${test.locked_by && test.locked_by !== currentUserId ? "opacity-60 cursor-not-allowed" : ""}`}
                    spellCheck={false}
                  />
                )}
              </div>
              <div>
                <label className="font-[var(--font-mono)] text-[11px] uppercase tracking-[0.05em] text-[var(--muted)] mb-1 block">
                  Preview
                </label>
                {viewMode === "steps" && test.steps ? (
                  <div className="min-h-[300px] bg-[#0d1117] rounded-[var(--radius-sm)] p-4 overflow-y-auto">
                    <div className="space-y-2">
                      {test.steps.map((step, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <span className="font-[var(--font-mono)] text-[10px] text-[var(--muted)]">{i + 1}.</span>
                          <span className="text-sm text-[#e6edf3]">{step.instruction}</span>
                          {step.assertion_code && (
                            <span className="text-[10px] text-[#79c0ff] bg-[#161b22] rounded px-1">assert</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <CodePreview code={displayCode} />
                )}
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
              {aiConfigReady && latestFailure && (
                <div className="flex items-start gap-2">
                  <input
                    type="text"
                    value={healHint}
                    onChange={(e) => setHealHint(e.target.value)}
                    placeholder="Describe what's wrong..."
                    disabled={healing}
                    className="flex-1 min-w-[180px] max-w-[320px] text-sm bg-[var(--surface)] text-[var(--fg)] border border-[var(--border)] rounded-[var(--radius-sm)] px-2.5 py-1.5 placeholder:text-[var(--muted)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)] disabled:opacity-50"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleHeal}
                    disabled={healing}
                  >
                    {healing ? (
                      <>
                        <svg className="animate-spin h-3 w-3 mr-1" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Healing...
                      </>
                    ) : "AI Heal"}
                  </Button>
                </div>
              )}
              {healSuccess && (
                <span className="text-xs text-[var(--success-text)]">Healed and saved as draft. Review before approving.</span>
              )}
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
                variant="ghost"
                size="sm"
                onClick={() => setShowAddToList(true)}
              >
                Add to List
              </Button>
              {aiConfigReady && (
                <TestChat
                  test={test}
                  latestFailure={latestFailure}
                  onApply={() => {
                    setLocalCode(null);
                  }}
                />
              )}
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

      {showAddToList && (
        <AddToListModal testId={test._id} onClose={() => setShowAddToList(false)} />
      )}
    </>
  );
}

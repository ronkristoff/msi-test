"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useAction, useMutation } from "convex/react";
import { api } from "@/lib/convex";
import type { Doc, Id } from "@/lib/convex";
import { Button } from "@/components/ui/Button";

type LatestFailure = {
  error_message: string | null;
  step_errors: string | null;
  run_id: Id<"runs">;
  _creationTime: number;
};

type ModifiedSteps = Array<{
  instruction: string;
  assertion_code?: string;
  expected_outcome?: string;
}> | null;

type ChatMessage =
  | { id: string; role: "user"; content: string }
  | {
      id: string;
      role: "assistant";
      state: "pending";
      diffSummary: string;
      diff: string;
      modified_code: string | null;
      modified_steps: ModifiedSteps;
    }
  | { id: string; role: "assistant"; state: "applied"; diffSummary: string }
  | { id: string; role: "assistant"; state: "discarded" }
  | { id: string; role: "assistant"; state: "error"; content: string };

type PendingMessage = Extract<ChatMessage, { role: "assistant"; state: "pending" }>;
type ErrorMessage = Extract<ChatMessage, { role: "assistant"; state: "error" }>;

type QuickAction = {
  label: string;
  message: string;
  visible: boolean;
};

type TestChatProps = {
  test: Doc<"tests">;
  latestFailure?: LatestFailure | null;
  onApply: (code?: string | null, steps?: ModifiedSteps) => void;
  externalOpen?: boolean;
  onExternalOpenConsumed?: () => void;
};

function getStorageKey(testId: string) {
  return `testchat_open_${testId}`;
}

export function TestChat({ test, latestFailure, onApply, externalOpen, onExternalOpenConsumed }: TestChatProps) {
  const [internalOpen, setInternalOpen] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(getStorageKey(test._id)) === "true";
  });

  const isOpen = externalOpen ?? internalOpen;

  const setIsOpen = useCallback((next: boolean | ((prev: boolean) => boolean)) => {
    setInternalOpen((prev) => {
      const resolved = typeof next === "function" ? next(prev) : next;
      localStorage.setItem(getStorageKey(test._id), String(resolved));
      return resolved;
    });
  }, [test._id]);

  useEffect(() => {
    if (externalOpen) {
      onExternalOpenConsumed?.();
    }
  }, [externalOpen, onExternalOpenConsumed]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [threadId, setThreadId] = useState<string | undefined>();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const refineTestAction = useAction(api.ai.refineTest.refineTest);
  const updateTestCode = useMutation(api.tests.mutations.updateTestCode);

  const toggleOpen = useCallback(() => {
    setIsOpen((prev) => {
      const next = !prev;
      localStorage.setItem(getStorageKey(test._id), String(next));
      return next;
    });
  }, [test._id]);

  useEffect(() => {
    if (isOpen && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [isOpen, messages, loading]);

  const quickActions = useMemo<QuickAction[]>(() => [
    {
      label: "Fix this failure",
      message: `Fix this failing test. Error: ${latestFailure?.error_message ?? "unknown error"}`,
      visible: !!latestFailure,
    },
    {
      label: "Add a wait",
      message: "Add a wait for the page to be ready before the main interaction",
      visible: true,
    },
    {
      label: "Stricter assertions",
      message: "Make the assertions stricter — use toHaveText() instead of toContainText() where appropriate, and add more specific checks",
      visible: true,
    },
  ], [latestFailure]);

  const visibleQuickActions = useMemo(
    () => quickActions.filter((a) => a.visible),
    [quickActions],
  );

  const handleSend = useCallback(async (messageOverride?: string) => {
    const text = (messageOverride ?? input).trim();
    if (!text || loading) return;

    const userMsg: ChatMessage = {
      id: `user_${Date.now()}`,
      role: "user",
      content: text,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const result = await refineTestAction({
        test_id: test._id as Id<"tests">,
        message: text,
        thread_id: threadId,
      });

      setThreadId(result.thread_id);

      const aiMsg: ChatMessage = {
        id: `ai_${Date.now()}`,
        role: "assistant",
        state: "pending",
        diffSummary: result.diff_summary,
        diff: result.diff,
        modified_code: result.modified_code,
        modified_steps: result.modified_steps,
      };

      setMessages((prev) => [...prev, aiMsg]);
    } catch (err) {
      const errorMsg: ChatMessage = {
        id: `err_${Date.now()}`,
        role: "assistant",
        state: "error",
        content: err instanceof Error ? err.message : "Failed to refine test",
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, refineTestAction, test._id, threadId]);

  const handleApply = useCallback(async (msg: PendingMessage) => {
    try {
      await updateTestCode({
        test_id: test._id as Id<"tests">,
        playwright_code: msg.modified_code ?? undefined,
        steps: msg.modified_steps ?? undefined,
        status: "draft",
        clear_healed_at: true,
      });
      const applied: ChatMessage = { id: msg.id, role: "assistant", state: "applied", diffSummary: msg.diffSummary };
      setMessages((prev) => prev.map((m) => (m.id === msg.id ? applied : m)));
      onApply(msg.modified_code, msg.modified_steps);
    } catch {
      const err: ChatMessage = { id: msg.id, role: "assistant", state: "error", content: "Failed to apply changes. Try again." };
      setMessages((prev) => prev.map((m) => (m.id === msg.id ? err : m)));
    }
  }, [updateTestCode, test._id, onApply]);

  const handleDiscard = useCallback((msg: PendingMessage) => {
    const discarded: ChatMessage = { id: msg.id, role: "assistant", state: "discarded" };
    setMessages((prev) => prev.map((m) => (m.id === msg.id ? discarded : m)));
  }, []);

  const handleRetry = useCallback((msg: ErrorMessage) => {
    const idx = messages.findIndex((m) => m.id === msg.id);
    const prevMsg = idx > 0 ? messages[idx - 1] : null;
    setMessages((prev) => prev.filter((m) => m.id !== msg.id));
    if (prevMsg && prevMsg.role === "user") {
      handleSend(prevMsg.content);
    }
  }, [messages, handleSend]);

  return (
    <>
      <Button variant="ghost" size="sm" onClick={toggleOpen}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mr-1">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        Chat
      </Button>

      {isOpen && (
        <ChatPanel onClose={toggleOpen}>
          <ChatContent
            messages={messages}
            loading={loading}
            input={input}
            setInput={setInput}
            onSend={handleSend}
            onApply={handleApply}
            onDiscard={handleDiscard}
            onRetry={handleRetry}
            quickActions={visibleQuickActions}
            messagesEndRef={messagesEndRef}
          />
        </ChatPanel>
      )}
    </>
  );
}

function ChatPanel({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <>
      <div className="fixed inset-0 z-40 md:hidden" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 z-50 md:hidden max-h-[70vh] flex flex-col bg-[var(--surface)] border border-[var(--border)] rounded-t-[var(--radius-md)] shadow-[var(--elev-raised)]">
        <PanelHeader onClose={onClose} />
        {children}
      </div>
      <div className="hidden md:block fixed right-4 top-20 z-40 w-[400px] max-h-[calc(100vh-120px)] flex flex-col bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] shadow-[var(--elev-raised)]">
        <PanelHeader onClose={onClose} />
        {children}
      </div>
    </>
  );
}

function PanelHeader({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-soft)]">
      <span className="text-sm font-semibold text-[var(--fg)]">Refine Test</span>
      <button onClick={onClose} className="text-[var(--muted)] hover:text-[var(--fg)]">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

function ChatContent({
  messages,
  loading,
  input,
  setInput,
  onSend,
  onApply,
  onDiscard,
  onRetry,
  quickActions,
  messagesEndRef,
}: {
  messages: ChatMessage[];
  loading: boolean;
  input: string;
  setInput: (v: string) => void;
  onSend: (override?: string) => void;
  onApply: (msg: PendingMessage) => void;
  onDiscard: (msg: PendingMessage) => void;
  onRetry: (msg: ErrorMessage) => void;
  quickActions: QuickAction[];
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <>
      <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
        {messages.length === 0 && !loading && (
          <p className="text-xs text-[var(--muted)] text-center py-6">
            Describe how you want to change this test.
          </p>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <MessageBubble msg={msg} onApply={onApply} onDiscard={onDiscard} onRetry={onRetry} />
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-[var(--border-soft)] rounded-[var(--radius-sm)] px-3 py-2 text-sm text-[var(--muted)] flex items-center gap-2">
              <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Refining test...
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="border-t border-[var(--border-soft)] px-3 py-2">
        {quickActions.length > 0 && !loading && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {quickActions.map((action) => (
              <button
                key={action.label}
                onClick={() => onSend(action.message)}
                className="text-[10px] font-mono uppercase tracking-[0.03em] px-2 py-1 rounded-[var(--radius-sm)] bg-[var(--border-soft)] text-[var(--muted)] hover:text-[var(--fg)] hover:bg-[var(--border)] transition-colors"
              >
                {action.label}
              </button>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSend();
              }
            }}
            placeholder="Describe your change..."
            disabled={loading}
            rows={1}
            className="flex-1 text-sm bg-[var(--bg)] text-[var(--fg)] border border-[var(--border)] rounded-[var(--radius-sm)] px-2.5 py-1.5 placeholder:text-[var(--muted)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)] resize-none disabled:opacity-50"
          />
          <Button
            variant="primary"
            size="sm"
            onClick={() => onSend()}
            disabled={loading || !input.trim()}
            className="self-end shrink-0"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </Button>
        </div>
      </div>
    </>
  );
}

function MessageBubble({
  msg,
  onApply,
  onDiscard,
  onRetry,
}: {
  msg: ChatMessage;
  onApply: (msg: PendingMessage) => void;
  onDiscard: (msg: PendingMessage) => void;
  onRetry: (msg: ErrorMessage) => void;
}) {
  if (msg.role === "user") {
    return (
      <div className="max-w-[85%] rounded-[var(--radius-sm)] px-3 py-2 text-sm bg-[var(--accent)] text-[var(--accent-on)]">
        <p className="whitespace-pre-wrap">{msg.content}</p>
      </div>
    );
  }

  if (msg.state === "error") {
    return (
      <div className="max-w-[85%] rounded-[var(--radius-sm)] px-3 py-2 text-sm bg-[rgba(220,38,38,0.06)] border border-[rgba(220,38,38,0.2)] text-[var(--danger)]">
        <p>{msg.content}</p>
        <Button variant="ghost" size="sm" onClick={() => onRetry(msg)} className="mt-1">
          Retry
        </Button>
      </div>
    );
  }

  if (msg.state === "discarded") {
    return (
      <div className="max-w-[85%] rounded-[var(--radius-sm)] px-3 py-2 text-sm bg-[var(--border-soft)] text-[var(--muted)] italic">
        Changes discarded.
      </div>
    );
  }

  if (msg.state === "applied") {
    return (
      <div className="max-w-[85%] rounded-[var(--radius-sm)] px-3 py-2 text-sm bg-[var(--border-soft)] text-[var(--fg)]">
        <p className="whitespace-pre-wrap">{msg.diffSummary}</p>
        <span className="text-xs text-[var(--success-text)]">Applied. Review and approve when ready.</span>
      </div>
    );
  }

  return (
    <div className="max-w-[85%] rounded-[var(--radius-sm)] px-3 py-2 text-sm bg-[var(--border-soft)] text-[var(--fg)]">
      <p className="whitespace-pre-wrap">{msg.diffSummary}</p>
      {msg.diff && (
        <pre className="mt-2 text-[11px] font-mono bg-[#0d1117] rounded p-2 overflow-x-auto max-h-[160px] overflow-y-auto">
          {msg.diff.split("\n").map((line, i) => (
            <span
              key={i}
              className={
                line.startsWith("+")
                  ? "text-[#3fb950]"
                  : line.startsWith("-")
                    ? "text-[#f85149]"
                    : line.startsWith("...")
                      ? "text-[var(--muted)]"
                      : "text-[#8b949e]"
              }
            >
              {line}
              {"\n"}
            </span>
          ))}
        </pre>
      )}
      <div className="flex gap-2 mt-2">
        <Button variant="primary" size="sm" onClick={() => onApply(msg)}>
          Apply
        </Button>
        <Button variant="ghost" size="sm" onClick={() => onDiscard(msg)}>
          Discard
        </Button>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useAction } from "convex/react";
import { api } from "@/lib/convex";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { useErrorLogger } from "@/lib/error-logger";
import type { ImpactAnalysis } from "../../../convex/chat/impactSchema";
import type { UserStory } from "../../../convex/chat/storySchema";

export type PendingMessage = {
  role: "user";
  parts: { type: "text"; text: string }[];
  status: "success";
  order: number;
  stepOrder: number;
  pendingId: string;
};

type ChatMode = "chat" | "impact" | "stories";

type ChatComposerProps = {
  threadId: string;
  onPending: (msg: PendingMessage) => void;
  onSent: () => void;
  onError: (msg: string) => void;
  onRollback: (pendingId: string) => void;
  onSendingChange: (sending: boolean) => void;
  onImpactResult: (analysis: ImpactAnalysis, grounded: boolean) => void;
  onStoriesResult: (stories: UserStory[], grounded: boolean, generationNote?: string) => void;
};

const INPUT_BASE =
  "w-full px-3 py-[9px] border rounded-[var(--radius-sm)] text-sm bg-[var(--surface)] text-[var(--fg)] outline-none focus:border-[var(--accent)] focus:shadow-[var(--focus-ring)] transition-all duration-[var(--motion-fast)] placeholder:text-[var(--muted)] border-[var(--border)] resize-none min-h-[80px]";

function stripConvexError(err: unknown): string {
  if (err instanceof Error) {
    return err.message.replace(/^Uncaught ConvexError:\s*/, "");
  }
  return "Failed to send message.";
}

export function ChatComposer({
  threadId,
  onPending,
  onSent,
  onError,
  onRollback,
  onSendingChange,
  onImpactResult,
  onStoriesResult,
}: ChatComposerProps) {
  const streamMessage = useAction(api.chat.chatActions.streamMessage);
  const analyzeImpact = useAction(api.chat.impactActions.analyzeImpact);
  const generateStories = useAction(api.chat.storyActions.generateStories);
  const { logError } = useErrorLogger();

  const [prompt, setPrompt] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<ChatMode>("chat");

  const isSendingRef = useRef(false);
  const pendingIdRef = useRef(0);
  const lastPendingIdRef = useRef<string | null>(null);

  const trimmed = prompt.trim();
  const canSubmit = trimmed.length > 0 && !isSending;

  const placeholder =
    mode === "impact"
      ? "Paste a feature request to analyze its impact…"
      : mode === "stories"
        ? "Describe a feature to generate user stories…"
        : "Ask about this project's codebase…";

  useEffect(() => {
    onSendingChange(isSending);
  }, [isSending, onSendingChange]);

  const handleSubmit = async () => {
    if (!canSubmit || isSendingRef.current) return;
    const saved = trimmed;
    const pendingId = `pending-${++pendingIdRef.current}`;
    setError(null);
    setPrompt("");
    isSendingRef.current = true;
    setIsSending(true);
    lastPendingIdRef.current = pendingId;
    onPending({
      role: "user",
      parts: [{ type: "text", text: saved }],
      status: "success",
      order: Number.MAX_SAFE_INTEGER,
      stepOrder: 0,
      pendingId,
    });

    const activeMode = mode;

    try {
      if (activeMode === "impact") {
        const result = await analyzeImpact({
          threadId,
          featureRequest: saved,
        });
        if (result?.analysis) {
          onImpactResult(result.analysis, result.grounded ?? true);
        }
        onSent();
        setMode("chat");
      } else if (activeMode === "stories") {
        const result = await generateStories({
          threadId,
          featureRequest: saved,
        });
        if (result?.stories && Array.isArray(result.stories) && result.stories.length > 0) {
          onStoriesResult(
            result.stories,
            result.grounded ?? false,
            result.generationNote,
          );
        } else {
          const msg = "Story generation returned no stories. Please retry.";
          setError(msg);
          onError(msg);
          logError(msg, {
            severity: "error",
            context: { source: "ChatComposer.handleSubmit.stories", result },
          });
        }
        onSent();
        if (mode === activeMode) setMode("chat");
      } else {
        await streamMessage({ threadId, prompt: saved });
        onSent();
      }
      lastPendingIdRef.current = null;
    } catch (err) {
      const msg = stripConvexError(err);
      setError(msg);
      setPrompt(saved);
      if (mode === activeMode) setMode("chat");
      onError(msg);
      if (lastPendingIdRef.current !== null) {
        onRollback(lastPendingIdRef.current);
        lastPendingIdRef.current = null;
      }
      logError(msg, {
        severity: "error",
        context: { source: "ChatComposer.handleSubmit" },
      });
    } finally {
      isSendingRef.current = false;
      setIsSending(false);
    }
  };

  const submitSafely = () => {
    void handleSubmit().catch((err) => {
      logError(stripConvexError(err), {
        severity: "error",
        context: { source: "ChatComposer.handleSubmit" },
      });
    });
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submitSafely();
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {error && (
        <Alert variant="error" className="mb-1">
          {error}
        </Alert>
      )}
      <div
        role="group"
        aria-label="Message mode"
        className="flex gap-1 p-1 rounded-[var(--radius-sm)] bg-[var(--bg)] border border-[var(--border)] w-fit"
      >
        <button
          type="button"
          onClick={() => setMode("chat")}
          aria-pressed={mode === "chat"}
          disabled={isSending}
          className={`px-3 py-1 text-xs font-medium rounded-[var(--radius-sm)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
            mode === "chat"
              ? "bg-[var(--accent)] text-[var(--accent-on)]"
              : "text-[var(--muted)] hover:text-[var(--fg)]"
          }`}
        >
          Chat
        </button>
        <button
          type="button"
          onClick={() => setMode("impact")}
          aria-pressed={mode === "impact"}
          disabled={isSending}
          className={`px-3 py-1 text-xs font-medium rounded-[var(--radius-sm)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
            mode === "impact"
              ? "bg-[var(--accent)] text-[var(--accent-on)]"
              : "text-[var(--muted)] hover:text-[var(--fg)]"
          }`}
        >
          Analyze Impact
        </button>
        <button
          type="button"
          onClick={() => setMode("stories")}
          aria-pressed={mode === "stories"}
          disabled={isSending}
          className={`px-3 py-1 text-xs font-medium rounded-[var(--radius-sm)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
            mode === "stories"
              ? "bg-[var(--accent)] text-[var(--accent-on)]"
              : "text-[var(--muted)] hover:text-[var(--fg)]"
          }`}
        >
          Generate Stories
        </button>
      </div>
      <label htmlFor="chat-input" className="sr-only">
        Message
      </label>
      <textarea
        id="chat-input"
        value={prompt}
        onChange={(e) => {
          setError(null);
          setPrompt(e.target.value);
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={2}
        className={INPUT_BASE}
        aria-label="Type your message"
        disabled={isSending}
      />
      <div className="flex justify-end">
        <Button onClick={submitSafely} disabled={!canSubmit}>
          {isSending ? "Sending…" : "Send"}
        </Button>
      </div>
    </div>
  );
}

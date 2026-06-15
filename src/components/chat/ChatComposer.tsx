"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useAction } from "convex/react";
import { api } from "@/lib/convex";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { useErrorLogger } from "@/lib/error-logger";

export type PendingMessage = {
  role: "user";
  parts: { type: "text"; text: string }[];
  status: "success";
  order: number;
  stepOrder: number;
  pendingId: string;
};

type ChatComposerProps = {
  threadId: string;
  onPending: (msg: PendingMessage) => void;
  onSent: () => void;
  onError: (msg: string) => void;
  onRollback: (pendingId: string) => void;
  onSendingChange: (sending: boolean) => void;
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
}: ChatComposerProps) {
  const streamMessage = useAction(api.chat.chatActions.streamMessage);
  const { logError } = useErrorLogger();

  const [prompt, setPrompt] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSendingRef = useRef(false);
  const pendingIdRef = useRef(0);
  const lastPendingIdRef = useRef<string | null>(null);

  const trimmed = prompt.trim();
  const canSubmit = trimmed.length > 0 && !isSending;

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
    try {
      await streamMessage({ threadId, prompt: saved });
      onSent();
      lastPendingIdRef.current = null;
    } catch (err) {
      const msg = stripConvexError(err);
      setError(msg);
      setPrompt(saved);
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
        placeholder="Ask about this project's codebase…"
        rows={2}
        className={INPUT_BASE}
        aria-label="Type your message"
      />
      <div className="flex justify-end">
        <Button onClick={submitSafely} disabled={!canSubmit}>
          {isSending ? "Sending…" : "Send"}
        </Button>
      </div>
    </div>
  );
}

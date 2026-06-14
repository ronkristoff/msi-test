"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api, asId } from "@/lib/convex";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { PageSkeleton } from "@/components/ui/Skeleton";
import { formatRelativeTime } from "@/lib/format";
import { useErrorLogger } from "@/lib/error-logger";

type ThreadListItem = {
  thread_id: string;
  title: string;
  last_message_preview: string | null;
  last_message_at: number | null;
  _creationTime: number;
};

export default function ChatPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { logError } = useErrorLogger();
  const projectId = asId(params.id, "projects");

  const threads = useQuery(api.chat.queries.listThreads, {
    project_id: projectId,
  });
  const createThread = useMutation(api.chat.mutations.createThread);

  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const handleNewChat = async () => {
    setCreateError(null);
    setIsCreating(true);
    try {
      const { threadId } = await createThread({ project_id: projectId });
      router.push(`/projects/${params.id}/chat/${threadId}`);
    } catch (err) {
      const msg = err instanceof Error
        ? err.message.replace(/^Uncaught ConvexError:\s*/, "")
        : "Failed to start a new chat.";
      setCreateError(msg);
      logError(msg, {
        severity: "error",
        context: { source: "ChatPage.handleNewChat" },
      });
      setIsCreating(false);
    }
  };

  if (threads === undefined) {
    return <PageSkeleton />;
  }

  if (threads === null) {
    return (
      <div className="max-w-[1080px]">
        <EmptyState
          icon={
            <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z" /><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z" />
            </svg>
          }
          title="Project not found"
          description="This project may have been removed or you don't have access to it."
          action={
            <Link href="/projects">
              <Button variant="secondary">Back to Projects</Button>
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="max-w-[1080px]">
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <h2 className="font-[var(--font-display)] text-2xl font-bold text-[var(--fg)]">
            Chat
          </h2>
          <Link href={`/projects/${params.id}`} className="ml-auto">
            <Button variant="secondary" size="sm">
              <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
              </svg>
              Back to Project
            </Button>
          </Link>
          {threads.length > 0 && (
            <Button
              size="sm"
              onClick={handleNewChat}
              disabled={isCreating}
            >
              {isCreating ? "Creating…" : "New Chat"}
            </Button>
          )}
        </div>
      </div>

      {createError && (
        <Alert variant="error" className="mb-4">
          {createError}
        </Alert>
      )}

      {threads.length === 0 ? (
        <EmptyState
          icon={
            <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
            </svg>
          }
          title="No conversations yet"
          description="Start a new chat to ask questions about this project's codebase."
          action={
            <Button onClick={handleNewChat} disabled={isCreating}>
              {isCreating ? "Creating…" : "New Chat"}
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-2">
          {threads.map((thread: ThreadListItem) => (
            <Link
              key={thread.thread_id}
              href={`/projects/${params.id}/chat/${thread.thread_id}`}
              className="block p-4 border border-[var(--border)] rounded-[var(--radius-md)] hover:border-[var(--accent)] hover:bg-[var(--border-soft)] transition-colors duration-[var(--motion-fast)]"
            >
              <div className="flex items-center justify-between gap-3 mb-1">
                <span className="text-sm font-semibold text-[var(--fg)] truncate">
                  {thread.title}
                </span>
                <span className="text-xs text-[var(--muted)] shrink-0">
                  {formatRelativeTime(thread.last_message_at ?? thread._creationTime)}
                </span>
              </div>
              <div className="text-sm text-[var(--muted)] truncate">
                {thread.last_message_preview ?? "No messages yet"}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

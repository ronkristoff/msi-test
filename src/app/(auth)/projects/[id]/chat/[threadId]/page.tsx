"use client";

import { useQuery } from "convex/react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useUIMessages } from "@convex-dev/agent/react";
import { api } from "@/lib/convex";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { PageSkeleton } from "@/components/ui/Skeleton";
import { MessageBubble, MessageList } from "@/components/chat/MessageBubble";

type UIMessageLike = {
  role: string;
  order: number;
  stepOrder: number;
  status: string;
  parts: { type: string; text?: string }[];
};

export default function ThreadViewPage() {
  const params = useParams<{ id: string; threadId: string }>();

  const thread = useQuery(api.chat.queries.getThread, {
    thread_id: params.threadId,
  });

  const { results, status } = useUIMessages(
    api.chat.queries.listThreadMessages,
    thread ? { threadId: params.threadId } : "skip",
    { initialNumItems: 50 },
  );

  if (thread === undefined) {
    return <PageSkeleton />;
  }

  if (thread === null) {
    return (
      <div className="max-w-[1080px]">
        <EmptyState
          icon={
            <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          }
          title="Thread not found"
          description="This conversation may have been deleted or you don't have access to it."
          action={
            <Link href={`/projects/${params.id}/chat`}>
              <Button variant="secondary">Back to Chat</Button>
            </Link>
          }
        />
      </div>
    );
  }

  if (status === "LoadingFirstPage") {
    return <PageSkeleton />;
  }

  const messages = [...results].sort(
    (a: UIMessageLike, b: UIMessageLike) =>
      a.order - b.order || a.stepOrder - b.stepOrder,
  ) as UIMessageLike[];

  return (
    <div className="max-w-[1080px]">
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <h2 className="font-[var(--font-display)] text-2xl font-bold text-[var(--fg)] truncate">
            {thread.title}
          </h2>
          <Link href={`/projects/${params.id}/chat`} className="ml-auto">
            <Button variant="secondary" size="sm">
              <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
              </svg>
              Back to Chat
            </Button>
          </Link>
        </div>
      </div>

      {messages.length === 0 ? (
        <EmptyState
          icon={
            <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
            </svg>
          }
          title="No messages"
          description="This conversation has no messages yet."
        />
      ) : (
        <MessageList>
          {messages.map((msg, i) => (
            <MessageBubble
              key={`${msg.order}-${msg.stepOrder}-${i}`}
              role={msg.role}
              parts={msg.parts}
            />
          ))}
        </MessageList>
      )}
    </div>
  );
}

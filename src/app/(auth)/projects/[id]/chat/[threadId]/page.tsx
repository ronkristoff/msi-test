"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "convex/react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useUIMessages } from "@convex-dev/agent/react";
import { api } from "@/lib/convex";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { PageSkeleton } from "@/components/ui/Skeleton";
import { MessageBubble, MessageList } from "@/components/chat/MessageBubble";
import { TypingIndicator } from "@/components/chat/TypingIndicator";
import { ImpactAnalysisCard } from "@/components/chat/ImpactAnalysisCard";
import { UserStoriesCard } from "@/components/chat/UserStoriesCard";
import type { ImpactAnalysis } from "../../../../../../../convex/chat/impactSchema";
import type { UserStory } from "../../../../../../../convex/chat/storySchema";
import {
  ChatComposer,
  type PendingMessage,
} from "@/components/chat/ChatComposer";

type UIMessageLike = {
  role: string;
  order: number;
  stepOrder: number;
  status: string;
  parts: { type: string; text?: string }[];
};

const SCROLL_NEAR_BOTTOM_THRESHOLD_PX = 100;

function isActive(m: UIMessageLike): boolean {
  return (
    m.role === "assistant" &&
    (m.status === "streaming" || m.status === "pending")
  );
}

export default function ThreadViewPage() {
  const params = useParams<{ id: string; threadId: string }>();

  const thread = useQuery(api.chat.queries.getThread, {
    thread_id: params.threadId,
  });

  const { results, status } = useUIMessages(
    api.chat.queries.listThreadMessages,
    thread ? { threadId: params.threadId } : "skip",
    { initialNumItems: 50, stream: true },
  );

  const [pendingMessages, setPendingMessages] = useState<PendingMessage[]>([]);
  const [composerSending, setComposerSending] = useState(false);
  const [prevThreadId, setPrevThreadId] = useState(params.threadId);
  const [impactResults, setImpactResults] = useState<
    Array<{ analysis: ImpactAnalysis; grounded: boolean }>
  >([]);
  const [storyResults, setStoryResults] = useState<
    Array<{ stories: UserStory[]; grounded: boolean; generationNote?: string }>
  >([]);

  if (prevThreadId !== params.threadId) {
    setPrevThreadId(params.threadId);
    setPendingMessages([]);
    setImpactResults([]);
    setStoryResults([]);
  }

  const activeThreadIdRef = useRef(params.threadId);
  useEffect(() => {
    activeThreadIdRef.current = params.threadId;
  }, [params.threadId]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);

  const subscriptionResults = results as UIMessageLike[];
  const hasActiveBubble = subscriptionResults.some(isActive);
  const hasEmptyActiveBubble = subscriptionResults.some(
    (m: UIMessageLike) =>
      isActive(m) && m.parts.every((p) => p.type !== "text" || !p.text),
  );
  const showBelowListTyping =
    (composerSending || hasActiveBubble) && !hasEmptyActiveBubble;
  const streamingTextLen = subscriptionResults
    .filter(isActive)
    .reduce((sum, m) => sum + (m.parts[0]?.text?.length ?? 0), 0);

  const deliveredUserTexts = new Set(
    subscriptionResults
      .filter((m) => m.role === "user")
      .map((m) => m.parts[0]?.text ?? ""),
  );
  const visiblePending = pendingMessages.filter(
    (m) => !deliveredUserTexts.has(m.parts[0]?.text ?? ""),
  );

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    isNearBottomRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight <
      SCROLL_NEAR_BOTTOM_THRESHOLD_PX;
  };

  useEffect(() => {
    if (isNearBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [
    results.length,
    visiblePending.length,
    hasActiveBubble,
    showBelowListTyping,
    streamingTextLen,
    impactResults.length,
    storyResults.length,
  ]);

  const handlePending = (msg: PendingMessage) => {
    setPendingMessages((prev) => [...prev, msg]);
  };

  const handleSent = () => {
    setPendingMessages([]);
  };

  const handleRollback = (pendingId: string) => {
    setPendingMessages((prev) => prev.filter((m) => m.pendingId !== pendingId));
  };

  const handleError = () => {};

  const handleImpactResult = (analysis: ImpactAnalysis, grounded: boolean) => {
    if (activeThreadIdRef.current !== params.threadId) return;
    setImpactResults((prev) => [...prev, { analysis, grounded }]);
  };

  const handleStoriesResult = (
    stories: UserStory[],
    grounded: boolean,
    generationNote?: string,
  ) => {
    if (activeThreadIdRef.current !== params.threadId) return;
    setStoryResults((prev) => [...prev, { stories, grounded, generationNote }]);
  };

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

  const subscriptionMessages = [...subscriptionResults].sort(
    (a: UIMessageLike, b: UIMessageLike) =>
      a.order - b.order || a.stepOrder - b.stepOrder,
  );

  const hasMessages =
    subscriptionMessages.length > 0 || visiblePending.length > 0;

  return (
    <div className="max-w-[1080px] flex flex-col h-full">
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

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto min-h-[300px]"
      >
        {hasMessages ? (
          <>
            <MessageList>
              {subscriptionMessages.map((msg, i) => (
                <MessageBubble
                  key={`sub-${msg.order}-${msg.stepOrder}-${i}`}
                  role={msg.role}
                  parts={msg.parts}
                  isStreaming={isActive(msg)}
                />
              ))}
              {visiblePending.map((msg) => (
                <MessageBubble
                  key={msg.pendingId}
                  role={msg.role}
                  parts={msg.parts}
                  isStreaming={false}
                />
              ))}
            </MessageList>
            {impactResults.map((item, i) => (
              <ImpactAnalysisCard
                key={`impact-${i}`}
                analysis={item.analysis}
                grounded={item.grounded}
              />
            ))}
            {storyResults.map((item, i) => (
              <UserStoriesCard
                key={`stories-${i}`}
                stories={item.stories}
                grounded={item.grounded}
                generationNote={item.generationNote}
              />
            ))}
            {showBelowListTyping && (
              <div className="flex justify-start mt-3">
                <TypingIndicator />
              </div>
            )}
            <div ref={messagesEndRef} />
          </>
        ) : (
          <EmptyState
            icon={
              <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
              </svg>
            }
            title="No messages"
            description="This conversation has no messages yet."
          />
        )}
      </div>

      <div className="mt-4">
        <ChatComposer
          threadId={params.threadId}
          onPending={handlePending}
          onSent={handleSent}
          onError={handleError}
          onRollback={handleRollback}
          onSendingChange={setComposerSending}
          onImpactResult={handleImpactResult}
          onStoriesResult={handleStoriesResult}
        />
      </div>
    </div>
  );
}

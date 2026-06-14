"use client";

import type { ReactNode } from "react";

export type MessagePart = { type: string; text?: string };

type MessageBubbleProps = {
  role: string;
  parts: MessagePart[];
};

export function MessageBubble({ role, parts }: MessageBubbleProps) {
  const textParts = parts.filter(
    (p): p is { type: "text"; text: string } =>
      p.type === "text" && typeof p.text === "string",
  );

  const ariaLabel = role === "user" ? "Your message" : "AI response";
  const isUser = role === "user";

  return (
    <div
      aria-label={ariaLabel}
      className={`flex ${isUser ? "justify-end" : "justify-start"}`}
    >
      <div
        className={`max-w-[80%] rounded-[var(--radius-md)] px-4 py-2.5 ${
          isUser
            ? "bg-[var(--accent)] text-[var(--accent-on)]"
            : "bg-[var(--surface)] border border-[var(--border)] text-[var(--fg)]"
        }`}
      >
        <div className="text-xs font-semibold uppercase tracking-wide opacity-70 mb-1">
          {isUser ? "You" : "Assistant"}
        </div>
        {textParts.length > 0 ? (
          <div className="whitespace-pre-wrap text-sm leading-relaxed">
            {textParts.map((p, i) => (
              <span key={`${p.type}-${i}`}>
                {p.text}
                {i < textParts.length - 1 ? " " : null}
              </span>
            ))}
          </div>
        ) : (
          <div className="text-sm italic opacity-60">[non-text content]</div>
        )}
      </div>
    </div>
  );
}

export function MessageList({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-3">{children}</div>;
}

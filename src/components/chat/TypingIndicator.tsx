"use client";

const DOT_DELAYS = ["0ms", "150ms", "300ms"];

export function TypingIndicator() {
  return (
    <div
      role="status"
      aria-label="Assistant is typing"
      aria-live="polite"
      className="flex gap-1 items-center"
    >
      {DOT_DELAYS.map((delay) => (
        <span
          key={delay}
          className="w-2 h-2 rounded-full bg-[var(--muted)] animate-bounce"
          style={{ animationDelay: delay }}
        />
      ))}
    </div>
  );
}

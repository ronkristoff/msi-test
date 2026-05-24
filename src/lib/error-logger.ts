import { useMutation } from "convex/react";
import { api } from "./convex";

type ErrorContext = {
  stack?: string;
  severity?: "error" | "warn";
  url?: string;
  userId?: string;
  context?: Record<string, unknown>;
};

export function useErrorLogger() {
  const logErrorMutation = useMutation(api.logs.mutations.logError);

  const logError = async (message: string, ctx?: ErrorContext) => {
    try {
      await logErrorMutation({
        message,
        stack: ctx?.stack,
        source: "frontend",
        severity: ctx?.severity ?? "error",
        url: ctx?.url ?? (typeof window !== "undefined" ? window.location.href : undefined),
        user_agent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
        user_id: ctx?.userId,
        context: ctx?.context ? JSON.stringify(ctx.context) : undefined,
      });
    } catch {
      // Silently fail — never let error logging break the app
    }
  };

  return { logError };
}

let globalLogError:
  | ((message: string, ctx?: ErrorContext) => Promise<void>)
  | null = null;

export function setGlobalErrorLogger(
  logFn: (message: string, ctx?: ErrorContext) => Promise<void>,
) {
  globalLogError = logFn;
}

export function initGlobalErrorHandlers(userId?: string) {
  if (typeof window === "undefined") return;

  window.onerror = (message, source, lineno, colno, error) => {
    globalLogError?.(String(message), {
      stack: error?.stack ?? `${source}:${lineno}:${colno}`,
      userId,
    });
  };

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    globalLogError?.(
      reason instanceof Error ? reason.message : String(reason),
      {
        stack: reason instanceof Error ? reason.stack : undefined,
        userId,
      },
    );
  });
}

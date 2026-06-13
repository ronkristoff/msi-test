"use client";

import { useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";

type KnowledgeErrorProps = {
  errorMessage: string | null;
  projectId: string;
  onRetry: () => Promise<void>;
};

export function KnowledgeError({ errorMessage, projectId, onRetry }: KnowledgeErrorProps) {
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);

  const handleRetry = async () => {
    setRetryError(null);
    try {
      setRetrying(true);
      await onRetry();
    } catch (err) {
      const msg = err instanceof Error
        ? err.message.replace(/^Uncaught ConvexError:\s*/, "")
        : "Failed to retry analysis";
      setRetryError(msg);
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Alert variant="error">
        {errorMessage ?? "An error occurred while building the knowledge base."}
      </Alert>
      {retryError && <Alert variant="error">{retryError}</Alert>}
      <div>
        <Button onClick={handleRetry} disabled={retrying} size="sm">
          {retrying ? (
            <>
              <svg aria-hidden="true" className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Retrying...
            </>
          ) : (
            <>
              <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 4v6h-6" /><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10" />
              </svg>
              Retry
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

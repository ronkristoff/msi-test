"use client";

import { useState } from "react";
import type { Doc } from "@/lib/convex";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { useErrorLogger } from "@/lib/error-logger";
import { buildStoryMarkdown } from "../exportFormatters";

type CopyStoryButtonProps = {
  story: Doc<"user_stories">;
};

function errorMessage(err: unknown): string {
  if (err instanceof Error && err.message) {
    return err.message.replace(/^(?:Uncaught\s+)?\w*Error:\s*/i, "");
  }
  if (typeof err === "string") return err;
  return "An unexpected error occurred.";
}

export function CopyStoryButton({ story }: CopyStoryButtonProps) {
  const [copying, setCopying] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const { logError } = useErrorLogger();

  const handleClick = async () => {
    setCopyError(null);
    setCopying(true);
    try {
      await navigator.clipboard.writeText(buildStoryMarkdown(story));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      const msg = errorMessage(err);
      setCopyError(msg);
      logError(msg, {
        severity: "error",
        context: { source: "CopyStoryButton.handleClick", storyId: story._id },
      });
    } finally {
      setCopying(false);
    }
  };

  return (
    <div>
      <Button
        variant="secondary"
        size="sm"
        onClick={handleClick}
        disabled={copying}
      >
        {copying ? "Copying…" : copied ? "Copied!" : "Copy to Clipboard"}
      </Button>
      {copyError && <Alert variant="error">{copyError}</Alert>}
    </div>
  );
}

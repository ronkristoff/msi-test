import { ANALYST_CHAT_PROMPT } from "./agents";
import { CHAT_RAG_MAX_CONTEXT_CHARS } from "../lib/constraints";

const RAG_CONTEXT_HEADER = "## Retrieved Codebase Context";
const TRUNCATION_MARKER = "… [truncated]";

export function buildRagSystemPrompt(
  ragText: string | null,
): string | undefined {
  if (!ragText || ragText.trim().length === 0) return undefined;

  const truncated =
    ragText.length > CHAT_RAG_MAX_CONTEXT_CHARS
      ? `${ragText.slice(0, CHAT_RAG_MAX_CONTEXT_CHARS)}${TRUNCATION_MARKER}`
      : ragText;

  return `${ANALYST_CHAT_PROMPT}\n\n${RAG_CONTEXT_HEADER}\n\n${truncated}`;
}

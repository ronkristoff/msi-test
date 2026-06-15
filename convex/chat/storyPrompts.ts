import { STORY_GENERATION_PROMPT } from "./storyAgent";
import {
  CHAT_RAG_MAX_CONTEXT_CHARS,
  EXTRACTION_MAX_CONTEXT_CHARS,
} from "../lib/constraints";
import type { BmadContext } from "./storySchema";

const RAG_CONTEXT_HEADER = "## Retrieved Codebase Context";
const BMAD_CONTEXT_HEADER = "## BMAD Project Context";
const TRUNCATION_MARKER = "… [truncated]";

function formatBmadEntries(
  label: string,
  entries: Array<{ key: string; content: string }>,
): string {
  if (entries.length === 0) return "";
  const body = entries
    .map((e) => `- **${e.key}**: ${e.content}`)
    .join("\n");
  return `### ${label}\n${body}`;
}

function buildBmadSection(bmad: BmadContext): string | null {
  const parts = [
    formatBmadEntries("ADRs", bmad.adrs),
    formatBmadEntries("Conventions", bmad.conventions),
    formatBmadEntries("PRD Sections", bmad.prd_sections),
    formatBmadEntries("Domain Terms", bmad.domain_terms),
  ].filter((s) => s.length > 0);

  if (parts.length === 0) return null;

  const joined = parts.join("\n\n");
  const bounded =
    joined.length > EXTRACTION_MAX_CONTEXT_CHARS
      ? `${joined.slice(0, EXTRACTION_MAX_CONTEXT_CHARS)}${TRUNCATION_MARKER}`
      : joined;

  return `${BMAD_CONTEXT_HEADER}\n\n${bounded}`;
}

export function buildStoryGenerationPrompt(
  ragText: string | null,
  bmadContext: BmadContext | null,
): string | undefined {
  const hasRag = ragText !== null && ragText.trim().length > 0;
  const hasBmad =
    bmadContext !== null &&
    (bmadContext.adrs.length > 0 ||
      bmadContext.conventions.length > 0 ||
      bmadContext.prd_sections.length > 0 ||
      bmadContext.domain_terms.length > 0);

  if (!hasRag && !hasBmad) return undefined;

  const sections: string[] = [STORY_GENERATION_PROMPT];

  if (hasRag) {
    const truncated =
      ragText!.length > CHAT_RAG_MAX_CONTEXT_CHARS
        ? `${ragText!.slice(0, CHAT_RAG_MAX_CONTEXT_CHARS)}${TRUNCATION_MARKER}`
        : ragText!;
    sections.push(`${RAG_CONTEXT_HEADER}\n\n${truncated}`);
  }

  if (hasBmad) {
    const bmadSection = buildBmadSection(bmadContext!);
    if (bmadSection) sections.push(bmadSection);
  }

  return sections.join("\n\n");
}

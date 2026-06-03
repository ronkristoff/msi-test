import { normalizeUrl } from "./explorer-utils";
import type { CapturedPage, PrdCoverageItem } from "./types";

export const PRD_TEXT_LIMIT = 1500;
export const PRD_ANALYSIS_LIMIT = 4000;
export const PRD_KEYWORD_MAX = 20;

const STOP_WORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "can", "shall", "to", "of", "in", "for",
  "on", "with", "at", "by", "from", "as", "into", "through", "during",
  "before", "after", "above", "below", "between", "out", "off", "over",
  "under", "again", "further", "then", "once", "here", "there", "when",
  "where", "why", "how", "all", "each", "every", "both", "few", "more",
  "most", "other", "some", "such", "no", "nor", "not", "only", "own",
  "same", "so", "than", "too", "very", "just", "because", "but", "and",
  "or", "if", "while", "about", "up", "it", "its", "this", "that",
  "these", "those", "i", "me", "my", "we", "our", "you", "your", "he",
  "him", "his", "she", "her", "they", "them", "their", "what", "which",
  "who", "whom", "user", "want", "able", "using",
]);

export function extractPrdKeywords(prdText: string): string[] {
  const words = prdText
    .slice(0, PRD_TEXT_LIMIT)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));

  const freq = new Map<string, number>();
  for (const w of words) {
    freq.set(w, (freq.get(w) ?? 0) + 1);
  }

  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, PRD_KEYWORD_MAX)
    .map(([word]) => word);
}

function scoreLinkByPrd(link: { text: string; href: string }, keywords: string[]): number {
  if (keywords.length === 0) return 0;
  const combined = `${link.text} ${link.href}`.toLowerCase();
  return keywords.filter((kw) => combined.includes(kw)).length;
}

export function sortQueueByPrdRelevance(
  queue: string[],
  linksSnapshot: Map<string, Array<{ text: string; href: string }>>,
  keywords: string[],
): void {
  if (keywords.length === 0) return;

  const linkMap = new Map<string, { text: string; href: string }>();
  for (const links of linksSnapshot.values()) {
    for (const l of links) {
      const norm = normalizeUrl(l.href);
      if (norm) linkMap.set(norm, l);
    }
  }

  queue.sort((a, b) => {
    const scoreA = linkMap.has(a) ? scoreLinkByPrd(linkMap.get(a)!, keywords) : 0;
    const scoreB = linkMap.has(b) ? scoreLinkByPrd(linkMap.get(b)!, keywords) : 0;
    return scoreB - scoreA;
  });
}

export function buildPrdCoverage(
  prdText: string | undefined,
  capturedPages: CapturedPage[],
  discoveredFlows: Array<{ name: string; steps: string[] }>,
): PrdCoverageItem[] | undefined {
  if (!prdText) return undefined;

  const keywords = extractPrdKeywords(prdText);
  if (keywords.length === 0) return undefined;

  const pageContent = capturedPages
    .map((p) => `${p.title} ${p.semantic_description ?? ""}`)
    .join(" ")
    .toLowerCase();

  const flowContent = discoveredFlows
    .map((f) => `${f.name} ${f.steps.join(" ")}`)
    .join(" ")
    .toLowerCase();

  const allContent = `${pageContent} ${flowContent}`;

  return keywords.map((kw) => ({
    feature: kw,
    found: allContent.includes(kw),
    evidence: allContent.includes(kw) ? "Matched in explored content" : undefined,
  }));
}

export function buildPrdInstructionSection(prdText: string | undefined): string {
  if (!prdText) return "";
  return `\n\nPRD / Product Requirements:\n${prdText.slice(0, PRD_TEXT_LIMIT)}\n\nIMPORTANT: Use the PRD above to guide your exploration. Specifically look for features described in the PRD. Try to navigate to and verify each described feature. If a feature cannot be found, note it.`;
}

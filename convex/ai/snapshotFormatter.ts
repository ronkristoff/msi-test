import { formatElementLine, type FormattableElement } from "./formatElements";

export type SnapshotData = {
  aria_snapshot: string;
  page_title: string;
  url: string;
  interactive_elements?: FormattableElement[];
};

export function formatSnapshotForPrompt(snapshot: SnapshotData): string {
  let ariaText: string;
  try {
    const parsed = JSON.parse(snapshot.aria_snapshot);
    ariaText = JSON.stringify(parsed, null, 2);
  } catch {
    ariaText = snapshot.aria_snapshot;
  }

  const lines: string[] = [];
  lines.push(`--- Live Page: ${snapshot.page_title} (${snapshot.url}) ---`);
  lines.push("");
  lines.push("Accessibility Tree:");
  lines.push(ariaText);

  if (snapshot.interactive_elements && snapshot.interactive_elements.length > 0) {
    lines.push("");
    lines.push("Interactive Elements:");
    for (const el of snapshot.interactive_elements) {
      lines.push(formatElementLine(el));
    }
  }

  return lines.join("\n");
}

const ABSOLUTE_URL_RE = /https?:\/\/[^\s)\]>"',;}]+/g;
const RELATIVE_PATH_RE = /(?:^|[\s)\]>"',;:])((?:\/[a-zA-Z0-9_-]+)+)/g;

export function extractUrlsFromText(text: string): string[] {
  const urls = new Set<string>();

  const absMatches = text.matchAll(ABSOLUTE_URL_RE);
  for (const m of absMatches) {
    urls.add(m[0]);
  }

  const relMatches = text.matchAll(RELATIVE_PATH_RE);
  for (const m of relMatches) {
    const path = m[1];
    if (path.length > 1 && !path.match(/\.[a-z]{1,4}$/)) {
      urls.add(path);
    }
  }

  return [...urls];
}

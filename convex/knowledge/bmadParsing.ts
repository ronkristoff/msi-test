import type { TreeEntry } from "./github";

export type BmadMetadataEntry = {
  type: "prd_section" | "adr" | "convention" | "domain_term";
  key: string;
  content: string;
  source_path: string;
  metadata?: Record<string, unknown>;
};

export type BmadFileType =
  | "prd"
  | "adr"
  | "project_context"
  | "context_md"
  | "agents_md"
  | "other";

const BMAD_PATH_PREFIXES = ["_bmad-output/", "_bmad/", "docs/adr/"];
const BMAD_PATH_EXACT = ["AGENTS.md", "CLAUDE.md", "CONTEXT.md"];

export function detectBmadFiles(tree: TreeEntry[]): TreeEntry[] {
  return tree.filter((entry) => {
    if (entry.type !== "blob") return false;
    return (
      BMAD_PATH_PREFIXES.some((p) => entry.path.startsWith(p)) ||
      BMAD_PATH_EXACT.includes(entry.path)
    );
  });
}

export function categorizeBmadFile(path: string): BmadFileType {
  if (path.startsWith("docs/adr/") && path.endsWith(".md")) return "adr";
  if (path === "CONTEXT.md") return "context_md";
  if (path === "AGENTS.md" || path === "CLAUDE.md") return "agents_md";
  if (/(^|\/)project-context\.md$/.test(path)) return "project_context";
  if (
    (path.startsWith("_bmad-output/") || path.startsWith("_bmad/")) &&
    /\bprd\b/i.test(path) &&
    path.endsWith(".md")
  )
    return "prd";
  return "other";
}

export function parsePrd(
  content: string,
  sourcePath: string,
): BmadMetadataEntry[] {
  const sections = content.split(/\n(?=## )/);
  return sections
    .filter((s) => s.startsWith("## "))
    .map((s) => {
      const lineEnd = s.indexOf("\n");
      const title = s.slice(3, lineEnd === -1 ? s.length : lineEnd).trim();
      const body = lineEnd === -1 ? "" : s.slice(lineEnd + 1).trim();
      return {
        type: "prd_section" as const,
        key: title,
        content: body,
        source_path: sourcePath,
      };
    });
}

export function parseAdr(
  content: string,
  sourcePath: string,
): BmadMetadataEntry | null {
  if (!content.trim()) return null;

  const titleMatch = content.match(/^#\s+(.+)$/m);
  if (!titleMatch) return null;

  const statusMatch = content.match(/^##\s+Status\s*\n\s*(\w+)/m);
  const decisionMatch = content.match(
    /^##\s+Decision\s*\n([\s\S]*?)(?=\n##\s|$)/m,
  );

  const filename = sourcePath.split("/").pop() ?? sourcePath;
  const idMatch = filename.match(/^(\d+)/);
  const adrId = idMatch
    ? `ADR-${idMatch[1].padStart(4, "0")}`
    : filename.replace(/\.md$/, "");

  return {
    type: "adr",
    key: adrId,
    content: decisionMatch?.[1]?.trim() ?? content.slice(0, 500),
    source_path: sourcePath,
    metadata: {
      title: titleMatch?.[1]?.trim() ?? adrId,
      status: statusMatch?.[1]?.trim() ?? "Unknown",
    },
  };
}

export function parseProjectContext(
  content: string,
  sourcePath: string,
): BmadMetadataEntry[] {
  const body = content.replace(/^---[\s\S]*?---\n/, "");
  const sections = body.split(/\n(?=### )/);
  return sections
    .filter((s) => s.startsWith("### "))
    .map((s) => {
      const lineEnd = s.indexOf("\n");
      const title = s.slice(4, lineEnd === -1 ? s.length : lineEnd).trim();
      const rules = lineEnd === -1 ? "" : s.slice(lineEnd + 1).trim();
      return {
        type: "convention" as const,
        key: title,
        content: rules,
        source_path: sourcePath,
      };
    });
}

export function parseContextMd(
  content: string,
  sourcePath: string,
): BmadMetadataEntry[] {
  const lines = content.split("\n");
  let inGlossary = false;
  const entries: BmadMetadataEntry[] = [];

  for (const line of lines) {
    if (/^##\s+Glossary\b/.test(line)) {
      inGlossary = true;
      continue;
    }
    if (inGlossary && /^##\s/.test(line)) {
      break;
    }
    if (inGlossary) {
      const match = line.match(/^-\s+\*\*(.+?)\*\*\s+[—–:\-]\s+(.+)$/);
      if (match) {
        entries.push({
          type: "domain_term",
          key: match[1].trim(),
          content: match[2].trim(),
          source_path: sourcePath,
        });
      }
    }
  }
  return entries;
}

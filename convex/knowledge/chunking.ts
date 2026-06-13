import { CHUNK_SIZE } from "../lib/constraints";

const EXTENSION_LANGUAGE_MAP: Record<string, string> = {
  ".ts": "typescript",
  ".tsx": "typescript",
  ".js": "javascript",
  ".jsx": "javascript",
  ".py": "python",
  ".json": "json",
  ".yaml": "yaml",
  ".yml": "yaml",
  ".css": "css",
  ".html": "html",
  ".sql": "sql",
  ".go": "go",
  ".rs": "rust",
  ".java": "java",
  ".md": "markdown",
};

const BOUNDARY_REGEX = /^([ \t]*(export\s+)?(async\s+)?(function|class|const|interface|type|enum|trait|impl)\s)|^(\s*)$/;

export interface CodeChunk {
  file_path: string;
  directory: string;
  content: string;
  chunk_index: number;
  language: string;
  char_count: number;
}

export function detectLanguage(filePath: string): string {
  const lastDot = filePath.lastIndexOf(".");
  if (lastDot === -1) return "unknown";
  const ext = filePath.slice(lastDot).toLowerCase();
  return EXTENSION_LANGUAGE_MAP[ext] ?? "unknown";
}

export function getDirectory(filePath: string): string {
  const lastSlash = filePath.lastIndexOf("/");
  if (lastSlash === -1) return "";
  return filePath.slice(0, lastSlash);
}

function findNextBoundary(content: string, fromIndex: number, maxIndex: number): number {
  for (let i = fromIndex; i < maxIndex && i < content.length; i++) {
    if (content[i] === "\n") {
      const lineStart = i + 1;
      const lineEnd = content.indexOf("\n", lineStart);
      const line = content.slice(
        lineStart,
        lineEnd === -1 ? content.length : lineEnd,
      );
      if (BOUNDARY_REGEX.test(line)) {
        return lineStart;
      }
    }
  }
  return -1;
}

function findNearestNewline(content: string, nearIndex: number): number {
  const backward = content.lastIndexOf("\n", nearIndex);
  return backward === -1 ? nearIndex : backward;
}

export function splitAtBoundaries(content: string, chunkSize: number): string[] {
  if (content.length <= chunkSize) return [content];

  const chunks: string[] = [];
  let start = 0;

  while (start < content.length) {
    const remaining = content.length - start;
    if (remaining <= chunkSize) {
      chunks.push(content.slice(start));
      break;
    }

    const windowEnd = start + chunkSize;
    const boundary = findNextBoundary(content, start + 1, windowEnd);
    let splitPoint: number;

    if (boundary !== -1) {
      splitPoint = boundary;
    } else {
      const nearestNewline = findNearestNewline(content, windowEnd);
      splitPoint = nearestNewline > start ? nearestNewline : windowEnd;
    }

    chunks.push(content.slice(start, splitPoint));
    start = splitPoint;
  }

  return chunks;
}

export function chunkFile(
  filePath: string,
  content: string,
  chunkSize: number = CHUNK_SIZE,
): CodeChunk[] {
  if (!content || content.length === 0) return [];

  const directory = getDirectory(filePath);
  const language = detectLanguage(filePath);
  const parts = splitAtBoundaries(content, chunkSize);

  return parts.map((part, index) => ({
    file_path: filePath,
    directory,
    content: part,
    chunk_index: index,
    language,
    char_count: part.length,
  }));
}

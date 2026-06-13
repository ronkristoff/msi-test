import { EXTRACTION_MAX_CONTEXT_CHARS } from "../lib/constraints";

type ChunkLike = {
  file_path: string;
  directory: string;
  content: string;
  char_count: number;
  chunk_index: number;
};

const PRIORITY_PATTERNS = [
  /^package\.json$/,
  /^tsconfig.*\.json$/,
  /next\.config/,
  /angular\.json/,
  /vite\.config/,
  /cargo\.toml/,
  /go\.mod/,
  /requirements\.txt$/,
  /\.env\.example$/,
];

const ENTRY_POINT_PATTERNS = [
  /\/index\.[tj]sx?$/,
  /\/main\.[tj]sx?$/,
  /\/app\.[tj]sx?$/,
  /^index\.[tj]sx?$/,
  /^main\.[tj]sx?$/,
];

const SCHEMA_PATTERNS = [
  /schema\.[tj]s$/,
  /models?\.[tj]s$/,
  /\/db\//,
];

function getFilePriority(filePath: string): number {
  if (PRIORITY_PATTERNS.some((p) => p.test(filePath))) return 0;
  if (ENTRY_POINT_PATTERNS.some((p) => p.test(filePath))) return 1;
  if (SCHEMA_PATTERNS.some((p) => p.test(filePath))) return 2;
  return 3;
}

export function buildFileTree(chunks: ChunkLike[]): string {
  if (chunks.length === 0) return "";

  const seen = new Set<string>();
  const filePaths: string[] = [];
  for (const chunk of chunks) {
    if (!seen.has(chunk.file_path)) {
      seen.add(chunk.file_path);
      filePaths.push(chunk.file_path);
    }
  }

  const sorted = [...filePaths].sort();
  const tree = new Map<string, string[]>();

  for (const fp of sorted) {
    const lastSlash = fp.lastIndexOf("/");
    const dir = lastSlash >= 0 ? fp.substring(0, lastSlash) : "";
    const fileName = lastSlash >= 0 ? fp.substring(lastSlash + 1) : fp;
    if (!tree.has(dir)) {
      tree.set(dir, []);
    }
    tree.get(dir)!.push(fileName);
  }

  const sortedDirs = [...tree.entries()].sort((a, b) => {
    if (a[0] === "") return -1;
    if (b[0] === "") return 1;
    return a[0].localeCompare(b[0]);
  });

  const lines: string[] = [];
  for (const [dir, files] of sortedDirs) {
    if (dir) {
      lines.push(`${dir}/`);
    }
    for (const f of files) {
      lines.push(`  ${f}`);
    }
  }

  return lines.join("\n");
}

export function sampleCodeForExtraction(
  chunks: ChunkLike[],
  maxChars = EXTRACTION_MAX_CONTEXT_CHARS,
): string {
  if (chunks.length === 0) return "";

  const seen = new Set<string>();
  const uniqueChunks: ChunkLike[] = [];
  for (const chunk of chunks) {
    if (!seen.has(chunk.file_path)) {
      seen.add(chunk.file_path);
      uniqueChunks.push(chunk);
    }
  }

  const sorted = [...uniqueChunks].sort((a, b) => {
    const pa = getFilePriority(a.file_path);
    const pb = getFilePriority(b.file_path);
    if (pa !== pb) return pa - pb;
    return a.file_path.localeCompare(b.file_path);
  });

  const lines: string[] = [];
  let totalChars = 0;

  for (const chunk of sorted) {
    const header = `--- ${chunk.file_path} ---`;
    const content = chunk.content;
    const blockChars = header.length + content.length + 2;
    if (totalChars + blockChars > maxChars) break;

    lines.push(header);
    lines.push(content);
    totalChars += blockChars;
  }

  return lines.join("\n");
}

export function buildDirectorySummary(chunks: ChunkLike[]): string {
  if (chunks.length === 0) return "";

  const seen = new Set<string>();
  const dirFileMap = new Map<string, string[]>();

  for (const chunk of chunks) {
    if (seen.has(chunk.file_path)) continue;
    seen.add(chunk.file_path);

    const dir = chunk.directory || "(root)";
    if (!dirFileMap.has(dir)) {
      dirFileMap.set(dir, []);
    }
    const lastSlash = chunk.file_path.lastIndexOf("/");
    const fileName = lastSlash >= 0 ? chunk.file_path.substring(lastSlash + 1) : chunk.file_path;
    dirFileMap.get(dir)!.push(fileName);
  }

  const sortedDirs = [...dirFileMap.entries()].sort((a, b) => {
    if (a[0] === "(root)") return -1;
    if (b[0] === "(root)") return 1;
    return a[0].localeCompare(b[0]);
  });

  const lines: string[] = [];
  for (const [dir, files] of sortedDirs) {
    const count = files.length;
    const label = count === 1 ? "1 file" : `${count} files`;
    lines.push(`${dir}/ (${label})`);
    for (const f of files.sort()) {
      lines.push(`  ${f}`);
    }
  }

  return lines.join("\n");
}

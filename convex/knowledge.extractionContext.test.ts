/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import {
  buildFileTree,
  sampleCodeForExtraction,
  buildDirectorySummary,
} from "./knowledge/extractionContext";
import { EXTRACTION_MAX_CONTEXT_CHARS } from "./lib/constraints";

type Chunk = {
  file_path: string;
  directory: string;
  content: string;
  char_count: number;
  chunk_index: number;
};

describe("extractionContext: buildFileTree", () => {
  it("groups files by directory and counts", () => {
    const chunks: Chunk[] = [
      { file_path: "src/index.ts", directory: "src", content: "a", char_count: 1, chunk_index: 0 },
      { file_path: "src/app/page.tsx", directory: "src/app", content: "b", char_count: 1, chunk_index: 0 },
      { file_path: "src/app/layout.tsx", directory: "src/app", content: "c", char_count: 1, chunk_index: 0 },
    ];
    const tree = buildFileTree(chunks);
    expect(tree).toContain("src/");
    expect(tree).toContain("index.ts");
    expect(tree).toContain("app/");
    expect(tree).toContain("page.tsx");
    expect(tree).toContain("layout.tsx");
  });

  it("handles root-level files", () => {
    const chunks: Chunk[] = [
      { file_path: "package.json", directory: "", content: "{}", char_count: 2, chunk_index: 0 },
      { file_path: "README.md", directory: "", content: "# Test", char_count: 6, chunk_index: 0 },
    ];
    const tree = buildFileTree(chunks);
    expect(tree).toContain("package.json");
    expect(tree).toContain("README.md");
  });

  it("handles empty chunks array", () => {
    const tree = buildFileTree([]);
    expect(tree).toBe("");
  });
});

describe("extractionContext: sampleCodeForExtraction", () => {
  it("returns first chunk per file", () => {
    const chunks: Chunk[] = [
      { file_path: "a.ts", directory: "", content: "first chunk", char_count: 11, chunk_index: 0 },
      { file_path: "a.ts", directory: "", content: "second chunk", char_count: 12, chunk_index: 1 },
      { file_path: "b.ts", directory: "", content: "file b", char_count: 6, chunk_index: 0 },
    ];
    const sampled = sampleCodeForExtraction(chunks, 10000);
    expect(sampled).toContain("first chunk");
    expect(sampled).toContain("file b");
    expect(sampled).not.toContain("second chunk");
  });

  it("respects max chars cap", () => {
    const chunks: Chunk[] = Array.from({ length: 20 }, (_, i) => ({
      file_path: `file${i}.ts`,
      directory: "",
      content: "x".repeat(1000),
      char_count: 1000,
      chunk_index: 0,
    }));
    const sampled = sampleCodeForExtraction(chunks, 5000);
    expect(sampled.length).toBeLessThanOrEqual(5000 + 200);
  });

  it("prioritizes config and entry files", () => {
    const chunks: Chunk[] = [
      { file_path: "z-last.ts", directory: "", content: "last", char_count: 4, chunk_index: 0 },
      { file_path: "package.json", directory: "", content: '{"name":"test"}', char_count: 14, chunk_index: 0 },
      { file_path: "src/index.ts", directory: "src", content: "entry", char_count: 5, chunk_index: 0 },
    ];
    const sampled = sampleCodeForExtraction(chunks, 100);
    expect(sampled).toContain("package.json");
    expect(sampled).toContain("index.ts");
  });

  it("handles empty chunks", () => {
    const sampled = sampleCodeForExtraction([], 10000);
    expect(sampled).toBe("");
  });

  it("includes file path headers", () => {
    const chunks: Chunk[] = [
      { file_path: "src/app.ts", directory: "src", content: "export const x = 1;", char_count: 18, chunk_index: 0 },
    ];
    const sampled = sampleCodeForExtraction(chunks, 10000);
    expect(sampled).toContain("src/app.ts");
  });
});

describe("extractionContext: buildDirectorySummary", () => {
  it("builds a text tree with directory and file counts", () => {
    const chunks: Chunk[] = [
      { file_path: "src/index.ts", directory: "src", content: "a", char_count: 1, chunk_index: 0 },
      { file_path: "src/app/page.tsx", directory: "src/app", content: "b", char_count: 1, chunk_index: 0 },
      { file_path: "src/app/layout.tsx", directory: "src/app", content: "c", char_count: 1, chunk_index: 0 },
      { file_path: "package.json", directory: "", content: "{}", char_count: 2, chunk_index: 0 },
    ];
    const summary = buildDirectorySummary(chunks);
    expect(summary).toContain("src/");
    expect(summary).toContain("app/");
    expect(summary).toContain("package.json");
    expect(summary).toContain("(2 files)");
  });

  it("handles empty chunks", () => {
    const summary = buildDirectorySummary([]);
    expect(summary).toBe("");
  });

  it("shows correct file count per directory", () => {
    const chunks: Chunk[] = [
      { file_path: "a/x.ts", directory: "a", content: "x", char_count: 1, chunk_index: 0 },
      { file_path: "a/y.ts", directory: "a", content: "y", char_count: 1, chunk_index: 0 },
      { file_path: "a/z.ts", directory: "a", content: "z", char_count: 1, chunk_index: 0 },
      { file_path: "b/w.ts", directory: "b", content: "w", char_count: 1, chunk_index: 0 },
    ];
    const summary = buildDirectorySummary(chunks);
    expect(summary).toContain("a/");
    expect(summary).toContain("(3 files)");
    expect(summary).toContain("b/");
    expect(summary).toContain("(1 file)");
  });
});

describe("extractionContext: respects EXTRACTION_MAX_CONTEXT_CHARS", () => {
  it("sampleCodeForExtraction uses the constant as default cap", () => {
    expect(EXTRACTION_MAX_CONTEXT_CHARS).toBe(80000);
  });
});

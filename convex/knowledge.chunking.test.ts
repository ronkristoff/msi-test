/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";

describe("chunking: detectLanguage", () => {
  it("detects TypeScript from .ts extension", async () => {
    const { detectLanguage } = await import("./knowledge/chunking");
    expect(detectLanguage("src/index.ts")).toBe("typescript");
  });

  it("detects TypeScript from .tsx extension", async () => {
    const { detectLanguage } = await import("./knowledge/chunking");
    expect(detectLanguage("component.tsx")).toBe("typescript");
  });

  it("detects JavaScript from .js extension", async () => {
    const { detectLanguage } = await import("./knowledge/chunking");
    expect(detectLanguage("app.js")).toBe("javascript");
  });

  it("detects Python from .py extension", async () => {
    const { detectLanguage } = await import("./knowledge/chunking");
    expect(detectLanguage("main.py")).toBe("python");
  });

  it("detects JSON from .json extension", async () => {
    const { detectLanguage } = await import("./knowledge/chunking");
    expect(detectLanguage("package.json")).toBe("json");
  });

  it("detects all supported extensions", async () => {
    const { detectLanguage } = await import("./knowledge/chunking");
    const cases: Record<string, string> = {
      "a.ts": "typescript",
      "a.tsx": "typescript",
      "a.js": "javascript",
      "a.jsx": "javascript",
      "a.py": "python",
      "a.json": "json",
      "a.yaml": "yaml",
      "a.yml": "yaml",
      "a.css": "css",
      "a.html": "html",
      "a.sql": "sql",
      "a.go": "go",
      "a.rs": "rust",
      "a.java": "java",
      "a.md": "markdown",
    };
    for (const [file, expected] of Object.entries(cases)) {
      expect(detectLanguage(file)).toBe(expected);
    }
  });

  it("returns unknown for unsupported extension", async () => {
    const { detectLanguage } = await import("./knowledge/chunking");
    expect(detectLanguage("data.csv")).toBe("unknown");
  });

  it("returns unknown for file with no extension", async () => {
    const { detectLanguage } = await import("./knowledge/chunking");
    expect(detectLanguage("Makefile")).toBe("unknown");
  });
});

describe("chunking: getDirectory", () => {
  it("extracts parent directory from nested path", async () => {
    const { getDirectory } = await import("./knowledge/chunking");
    expect(getDirectory("src/components/Button.tsx")).toBe("src/components");
  });

  it("returns empty string for root-level file", async () => {
    const { getDirectory } = await import("./knowledge/chunking");
    expect(getDirectory("README.md")).toBe("");
  });
});

describe("chunking: chunkFile", () => {
  it("returns empty array for empty content", async () => {
    const { chunkFile } = await import("./knowledge/chunking");
    const chunks = chunkFile("empty.ts", "");
    expect(chunks).toEqual([]);
  });

  it("returns single chunk for content smaller than chunkSize", async () => {
    const { chunkFile } = await import("./knowledge/chunking");
    const content = "console.log('hello');";
    const chunks = chunkFile("app.ts", content, 2000);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toBe(content);
    expect(chunks[0].chunk_index).toBe(0);
    expect(chunks[0].file_path).toBe("app.ts");
    expect(chunks[0].language).toBe("typescript");
    expect(chunks[0].char_count).toBe(content.length);
  });

  it("returns single chunk for content exactly at chunk boundary", async () => {
    const { chunkFile } = await import("./knowledge/chunking");
    const content = "a".repeat(100);
    const chunks = chunkFile("data.ts", content, 100);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toBe(content);
  });

  it("splits large file into multiple chunks", async () => {
    const { chunkFile } = await import("./knowledge/chunking");
    const part = "console.log('line');\n";
    const content = part.repeat(100);
    const chunks = chunkFile("big.ts", content, 200);
    expect(chunks.length).toBeGreaterThan(1);
    for (let i = 0; i < chunks.length; i++) {
      expect(chunks[i].chunk_index).toBe(i);
    }
  });

  it("splits at function boundary when possible", async () => {
    const { chunkFile } = await import("./knowledge/chunking");
    const func1 = `function foo() {\n  return 1;\n}\n`;
    const func2 = `function bar() {\n  return 2;\n}\n`;
    const content = func1.repeat(5) + func2.repeat(5);
    const chunks = chunkFile("fns.ts", content, func1.length * 3 + 10);

    expect(chunks.length).toBeGreaterThan(1);
  });

  it("assigns correct directory to each chunk", async () => {
    const { chunkFile } = await import("./knowledge/chunking");
    const content = "x".repeat(300);
    const chunks = chunkFile("src/utils/helpers.ts", content, 100);
    for (const chunk of chunks) {
      expect(chunk.directory).toBe("src/utils");
    }
  });

  it("assigns correct language based on file extension", async () => {
    const { chunkFile } = await import("./knowledge/chunking");
    const content = "some content here";
    const tsChunks = chunkFile("file.ts", content);
    const pyChunks = chunkFile("file.py", content);
    expect(tsChunks[0].language).toBe("typescript");
    expect(pyChunks[0].language).toBe("python");
  });

  it("handles hard split when no boundary found in window", async () => {
    const { chunkFile } = await import("./knowledge/chunking");
    const content = "a".repeat(500) + "\n" + "b".repeat(500);
    const chunks = chunkFile("data.json", content, 100);
    expect(chunks.length).toBeGreaterThan(5);
  });
});

describe("chunking: splitAtBoundaries", () => {
  it("returns single element for content under chunkSize", async () => {
    const { splitAtBoundaries } = await import("./knowledge/chunking");
    expect(splitAtBoundaries("short", 100)).toEqual(["short"]);
  });

  it("splits at newlines when no function boundary found", async () => {
    const { splitAtBoundaries } = await import("./knowledge/chunking");
    const content = "line1\nline2\nline3\nline4\n";
    const parts = splitAtBoundaries(content, 12);
    expect(parts.length).toBeGreaterThan(1);
    const reassembled = parts.join("");
    expect(reassembled).toBe(content);
  });

  it("preserves all content when reassembled", async () => {
    const { splitAtBoundaries } = await import("./knowledge/chunking");
    const content = "export function a() { return 1; }\nexport function b() { return 2; }\n".repeat(20);
    const parts = splitAtBoundaries(content, 200);
    expect(parts.join("")).toBe(content);
  });
});

/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";

describe("github: parseOwnerRepo", () => {
  it("parses normal GitHub URL", async () => {
    const { parseOwnerRepo } = await import("./knowledge/github");
    const result = parseOwnerRepo("https://github.com/owner/repo");
    expect(result).toEqual({ owner: "owner", repo: "repo" });
  });

  it("parses URL with trailing slash", async () => {
    const { parseOwnerRepo } = await import("./knowledge/github");
    const result = parseOwnerRepo("https://github.com/owner/repo/");
    expect(result).toEqual({ owner: "owner", repo: "repo" });
  });

  it("parses URL with extra path segments (takes first two)", async () => {
    const { parseOwnerRepo } = await import("./knowledge/github");
    const result = parseOwnerRepo("https://github.com/owner/repo/tree/main");
    expect(result).toEqual({ owner: "owner", repo: "repo" });
  });

  it("parses URL with .git suffix", async () => {
    const { parseOwnerRepo } = await import("./knowledge/github");
    const result = parseOwnerRepo("https://github.com/owner/repo.git");
    expect(result).toEqual({ owner: "owner", repo: "repo" });
  });

  it("throws on invalid URL", async () => {
    const { parseOwnerRepo } = await import("./knowledge/github");
    expect(() => parseOwnerRepo("not-a-url")).toThrow();
  });

  it("throws on URL without owner/repo", async () => {
    const { parseOwnerRepo } = await import("./knowledge/github");
    expect(() => parseOwnerRepo("https://github.com/")).toThrow();
  });
});

describe("github: filterFiles", () => {
  it("includes .ts and .tsx files", async () => {
    const { filterFiles } = await import("./knowledge/github");
    const entries = [
      { path: "src/index.ts", type: "blob" as const },
      { path: "component.tsx", type: "blob" as const },
    ];
    const result = filterFiles(entries);
    expect(result).toHaveLength(2);
  });

  it("excludes non-blob entries (directories)", async () => {
    const { filterFiles } = await import("./knowledge/github");
    const entries = [
      { path: "src", type: "tree" as const },
      { path: "src/index.ts", type: "blob" as const },
    ];
    const result = filterFiles(entries);
    expect(result).toHaveLength(1);
    expect(result[0].path).toBe("src/index.ts");
  });

  it("excludes files in node_modules", async () => {
    const { filterFiles } = await import("./knowledge/github");
    const entries = [
      { path: "node_modules/pkg/index.js", type: "blob" as const },
      { path: "src/index.ts", type: "blob" as const },
    ];
    const result = filterFiles(entries);
    expect(result).toHaveLength(1);
    expect(result[0].path).toBe("src/index.ts");
  });

  it("excludes files in all default exclude dirs", async () => {
    const { filterFiles } = await import("./knowledge/github");
    const excludeDirs = ["node_modules", ".git", "dist", "build", "__pycache__", ".next", "vendor", "target", ".cache"];
    const entries = excludeDirs.map((dir) => ({
      path: `${dir}/file.ts`,
      type: "blob" as const,
    }));
    const result = filterFiles(entries);
    expect(result).toHaveLength(0);
  });

  it("excludes files with unsupported extensions", async () => {
    const { filterFiles } = await import("./knowledge/github");
    const entries = [
      { path: "image.png", type: "blob" as const },
      { path: "data.csv", type: "blob" as const },
      { path: "code.ts", type: "blob" as const },
    ];
    const result = filterFiles(entries);
    expect(result).toHaveLength(1);
    expect(result[0].path).toBe("code.ts");
  });

  it("includes all supported extensions", async () => {
    const { filterFiles } = await import("./knowledge/github");
    const exts = [".ts", ".tsx", ".js", ".jsx", ".py", ".json", ".yaml", ".yml", ".css", ".html", ".sql", ".go", ".rs", ".java", ".md"];
    const entries = exts.map((ext, i) => ({
      path: `file${i}${ext}`,
      type: "blob" as const,
    }));
    const result = filterFiles(entries);
    expect(result).toHaveLength(exts.length);
  });

  it("handles empty tree", async () => {
    const { filterFiles } = await import("./knowledge/github");
    expect(filterFiles([])).toEqual([]);
  });

  it("handles tree where all files are excluded", async () => {
    const { filterFiles } = await import("./knowledge/github");
    const entries = [
      { path: "node_modules/a.js", type: "blob" as const },
      { path: "build/b.js", type: "blob" as const },
    ];
    expect(filterFiles(entries)).toEqual([]);
  });

  it("handles files without extension", async () => {
    const { filterFiles } = await import("./knowledge/github");
    const entries = [
      { path: "Makefile", type: "blob" as const },
      { path: "Dockerfile", type: "blob" as const },
    ];
    expect(filterFiles(entries)).toEqual([]);
  });

  it("handles case-insensitive extensions", async () => {
    const { filterFiles } = await import("./knowledge/github");
    const entries = [
      { path: "file.TS", type: "blob" as const },
    ];
    const result = filterFiles(entries);
    expect(result).toHaveLength(1);
  });
});

describe("github: checkRateLimit", () => {
  function mockResponse(headers: Record<string, string>): Response {
    return new Response("{}", {
      status: 200,
      headers,
    });
  }

  it("parses rate limit headers correctly", async () => {
    const { checkRateLimit } = await import("./knowledge/github");
    const response = mockResponse({
      "x-ratelimit-remaining": "42",
      "x-ratelimit-reset": "1700000000",
    });
    const info = checkRateLimit(response);
    expect(info.remaining).toBe(42);
    expect(info.resetAt).toBe(1700000000);
  });

  it("returns default remaining when header missing", async () => {
    const { checkRateLimit } = await import("./knowledge/github");
    const response = mockResponse({});
    const info = checkRateLimit(response);
    expect(info.remaining).toBe(5000);
  });

  it("returns 0 reset when header missing", async () => {
    const { checkRateLimit } = await import("./knowledge/github");
    const response = mockResponse({});
    const info = checkRateLimit(response);
    expect(info.resetAt).toBe(0);
  });

  it("handles remaining=0 (rate limited)", async () => {
    const { checkRateLimit } = await import("./knowledge/github");
    const response = mockResponse({
      "x-ratelimit-remaining": "0",
      "x-ratelimit-reset": "1700000000",
    });
    const info = checkRateLimit(response);
    expect(info.remaining).toBe(0);
  });
});

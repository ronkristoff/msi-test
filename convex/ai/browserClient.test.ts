import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { getRunnerUrl, snapshotFetch, validateTestFetch } from "./browserClient";

describe("getRunnerUrl", () => {
  it("returns null when env var is not set", () => {
    expect(getRunnerUrl(undefined)).toBeNull();
    expect(getRunnerUrl("")).toBeNull();
  });

  it("returns trimmed URL when set", () => {
    expect(getRunnerUrl("http://localhost:8931")).toBe("http://localhost:8931");
    expect(getRunnerUrl("  http://localhost:8931  ")).toBe("http://localhost:8931");
  });
});

describe("snapshotFetch", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns SnapshotData on successful response", async () => {
    const mockData = {
      aria_snapshot: JSON.stringify({ role: "WebArea", name: "Test" }),
      page_title: "Test Page",
      url: "https://example.com",
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockData),
    });

    const result = await snapshotFetch("http://localhost:8931", "secret123", {
      url: "https://example.com",
      project_id: "proj1",
      workspace_id: "ws1",
    });

    expect(result).toEqual(mockData);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:8931/snapshot",
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer secret123",
        },
      }),
    );
  });

  it("returns null when Runner is unreachable", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));

    const result = await snapshotFetch("http://localhost:8931", "secret", {
      url: "https://example.com",
      project_id: "proj1",
      workspace_id: "ws1",
    });

    expect(result).toBeNull();
  });

  it("returns null on non-200 response", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: () => Promise.resolve({ error: "Bad Gateway" }),
    });

    const result = await snapshotFetch("http://localhost:8931", "secret", {
      url: "https://example.com",
      project_id: "proj1",
      workspace_id: "ws1",
    });

    expect(result).toBeNull();
  });

  it("returns null when fetch throws", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("timeout"));

    const result = await snapshotFetch("http://localhost:8931", "secret", {
      url: "https://example.com",
      project_id: "proj1",
      workspace_id: "ws1",
    });

    expect(result).toBeNull();
  });
});

describe("validateTestFetch", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns validation result on pass", async () => {
    const mockData = { passed: true };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockData),
    });

    const result = await validateTestFetch("http://localhost:8931", "secret", {
      url: "https://example.com",
      project_id: "proj1",
      workspace_id: "ws1",
      playwright_code: "test('works', () => {});",
    });

    expect(result).toEqual({ passed: true });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:8931/validate-test",
      expect.objectContaining({
        method: "POST",
      }),
    );
  });

  it("returns failure result with error_message", async () => {
    const mockData = { passed: false, error_message: "Element not found" };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockData),
    });

    const result = await validateTestFetch("http://localhost:8931", "secret", {
      url: "https://example.com",
      project_id: "proj1",
      workspace_id: "ws1",
      playwright_code: "test('fails', () => { expect(true).toBe(false); });",
    });

    expect(result).toEqual({ passed: false, error_message: "Element not found" });
  });

  it("returns null when Runner is unreachable", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));

    const result = await validateTestFetch("http://localhost:8931", "secret", {
      url: "https://example.com",
      project_id: "proj1",
      workspace_id: "ws1",
      playwright_code: "test('x', () => {});",
    });

    expect(result).toBeNull();
  });

  it("returns null on non-200 response", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: "Internal error" }),
    });

    const result = await validateTestFetch("http://localhost:8931", "secret", {
      url: "https://example.com",
      project_id: "proj1",
      workspace_id: "ws1",
      playwright_code: "test('x', () => {});",
    });

    expect(result).toBeNull();
  });
});

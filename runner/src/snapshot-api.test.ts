import { describe, it, expect, afterEach, vi } from "vitest";
import * as http from "http";
import { createSnapshotApiServer, type SnapshotApiDeps } from "./snapshot-api";
import type { StagehandInstance } from "./stagehand";

const SECRET = "test-runner-secret";
let server: http.Server;
let baseUrl: string;

function createMockStagehand() {
  const mockPage = {
    goto: vi.fn().mockResolvedValue(undefined),
    title: vi.fn().mockResolvedValue("Example Page"),
    url: vi.fn().mockReturnValue("https://example.com"),
    screenshot: vi.fn().mockResolvedValue(Buffer.from("png")),
    accessibility: {
      snapshot: vi.fn().mockResolvedValue({ role: "WebArea", name: "Example Page", children: [{ role: "heading", name: "Welcome" }, { role: "button", name: "Submit" }] }),
    },
  };
  const stagehand = {
    init: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    context: {
      activePage: vi.fn().mockReturnValue(null),
      newPage: vi.fn().mockResolvedValue(mockPage),
    },
  } as unknown as StagehandInstance;
  return { stagehand, mockPage };
}

function startServer(deps?: Partial<SnapshotApiDeps>): Promise<void> {
  return new Promise((resolve) => {
    const { stagehand } = createMockStagehand();
    server = createSnapshotApiServer({
      runnerSecret: SECRET,
      getAiConfig: async () => ({
        endpoint_url: "https://api.openai.com/v1",
        api_key: "sk-test",
        model_name: "gpt-4o",
      }),
      initStagehand: async () => stagehand,
      log: () => {},
      ...deps,
    });
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (addr && typeof addr === "object") {
        baseUrl = `http://127.0.0.1:${addr.port}`;
      }
      resolve();
    });
  });
}

function stopServer(): Promise<void> {
  return new Promise((resolve) => {
    server.close(() => resolve());
  });
}

function post(
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const data = JSON.stringify(body);
    const req = http.request(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(data),
          ...headers,
        },
      },
      (res) => {
        let chunks = "";
        res.on("data", (d: Buffer) => { chunks += d.toString(); });
        res.on("end", () => {
          resolve({
            status: res.statusCode ?? 0,
            body: JSON.parse(chunks || "{}"),
          });
        });
      },
    );
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

function get(
  path: string,
  headers: Record<string, string> = {},
): Promise<{ status: number }> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const req = http.request(url, { method: "GET", headers }, (res) => {
      let data = "";
      res.on("data", (d: Buffer) => { data += d.toString(); });
      res.on("end", () => resolve({ status: res.statusCode ?? 0 }));
    });
    req.on("error", reject);
    req.end();
  });
}

describe("Snapshot API — auth", () => {
  afterEach(async () => {
    await stopServer();
  });

  it("rejects requests without Authorization header with 401", async () => {
    await startServer();
    const res = await post("/snapshot", {
      project_id: "p1",
      url: "https://example.com",
      workspace_id: "w1",
    });
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty("error");
  });

  it("rejects requests with wrong bearer token with 401", async () => {
    await startServer();
    const res = await post(
      "/snapshot",
      { project_id: "p1", url: "https://example.com", workspace_id: "w1" },
      { Authorization: "Bearer wrong-secret" },
    );
    expect(res.status).toBe(401);
  });
});

describe("Snapshot API — POST /snapshot", () => {
  afterEach(async () => {
    await stopServer();
  });

  it("returns snapshot data for a valid request", async () => {
    const { stagehand } = createMockStagehand();
    await startServer({ initStagehand: async () => stagehand });

    const res = await post(
      "/snapshot",
      { project_id: "p1", url: "https://example.com", workspace_id: "w1" },
      { Authorization: `Bearer ${SECRET}` },
    );

    expect(res.status).toBe(200);
    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty("aria_snapshot");
    expect(body).toHaveProperty("page_title", "Example Page");
    expect(body).toHaveProperty("url", "https://example.com");
    expect(body).not.toHaveProperty("structure_text");
    expect(body).not.toHaveProperty("interactive_elements");
  });

  it("returns 400 for missing required fields", async () => {
    await startServer();
    const res = await post(
      "/snapshot",
      { url: "https://example.com" },
      { Authorization: `Bearer ${SECRET}` },
    );
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
    expect(res.body).toHaveProperty("details");
  });

  it("returns structured error when navigation fails", async () => {
    const { stagehand, mockPage } = createMockStagehand();
    mockPage.goto.mockRejectedValue(new Error("net::ERR_CONNECTION_REFUSED"));
    await startServer({ initStagehand: async () => stagehand });

    const res = await post(
      "/snapshot",
      { project_id: "p1", url: "https://unreachable.invalid", workspace_id: "w1" },
      { Authorization: `Bearer ${SECRET}` },
    );

    expect(res.status).toBe(502);
    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty("error");
    expect(body.error).toContain("Navigation failed");
  });
});

describe("Snapshot API — session management", () => {
  afterEach(async () => {
    await stopServer();
  });

  it("reuses Stagehand instance for same project_id", async () => {
    const initStagehand = vi.fn().mockImplementation(async () => {
      const { stagehand } = createMockStagehand();
      return stagehand;
    });
    await startServer({ initStagehand });

    await post("/snapshot", { project_id: "p1", url: "https://example.com/a", workspace_id: "w1" }, { Authorization: `Bearer ${SECRET}` });
    await post("/snapshot", { project_id: "p1", url: "https://example.com/b", workspace_id: "w1" }, { Authorization: `Bearer ${SECRET}` });

    expect(initStagehand).toHaveBeenCalledTimes(1);
  });

  it("creates separate Stagehand instances for different project_ids", async () => {
    const initStagehand = vi.fn().mockImplementation(async () => {
      const { stagehand } = createMockStagehand();
      return stagehand;
    });
    await startServer({ initStagehand });

    await post("/snapshot", { project_id: "p1", url: "https://example.com", workspace_id: "w1" }, { Authorization: `Bearer ${SECRET}` });
    await post("/snapshot", { project_id: "p2", url: "https://example.com", workspace_id: "w1" }, { Authorization: `Bearer ${SECRET}` });

    expect(initStagehand).toHaveBeenCalledTimes(2);
  });
});

describe("Snapshot API — session cleanup", () => {
  afterEach(async () => {
    await stopServer();
  });

  it("closes Stagehand after idle timeout", async () => {
    const mockClose = vi.fn().mockResolvedValue(undefined);
    const initStagehand = vi.fn().mockImplementation(async () => {
      const { stagehand } = createMockStagehand();
      (stagehand as unknown as { close: ReturnType<typeof vi.fn> }).close = mockClose;
      return stagehand;
    });
    const idleMs = 100;
    await startServer({ initStagehand, sessionIdleMs: idleMs });

    await post("/snapshot", { project_id: "p1", url: "https://example.com", workspace_id: "w1" }, { Authorization: `Bearer ${SECRET}` });

    expect(mockClose).not.toHaveBeenCalled();

    await new Promise((resolve) => setTimeout(resolve, idleMs + 50));

    expect(mockClose).toHaveBeenCalled();
  });
});

describe("Snapshot API — POST /validate-test", () => {
  afterEach(async () => {
    await stopServer();
  });

  it("returns passed=true when test succeeds", async () => {
    const { stagehand } = createMockStagehand();
    await startServer({
      initStagehand: async () => stagehand,
      runPlaywrightTest: async () => ({ exitCode: 0, stdout: "1 passed", stderr: "" }),
    });

    const res = await post(
      "/validate-test",
      {
        project_id: "p1",
        url: "https://example.com",
        workspace_id: "w1",
        playwright_code: "test('works', async ({ page }) => { await page.goto('/'); });",
      },
      { Authorization: `Bearer ${SECRET}` },
    );

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ passed: true });
  });

  it("returns passed=false with error when test fails", async () => {
    const { stagehand } = createMockStagehand();
    await startServer({
      initStagehand: async () => stagehand,
      runPlaywrightTest: async () => ({
        exitCode: 1,
        stdout: "1 failed",
        stderr: "Error: expect(received).toBe(expected)",
      }),
    });

    const res = await post(
      "/validate-test",
      {
        project_id: "p1",
        url: "https://example.com",
        workspace_id: "w1",
        playwright_code: "test('fails', async ({ page }) => { expect(1).toBe(2); });",
      },
      { Authorization: `Bearer ${SECRET}` },
    );

    expect(res.status).toBe(200);
    const body = res.body as Record<string, unknown>;
    expect(body.passed).toBe(false);
    expect(body).toHaveProperty("error_message");
  });

  it("returns 400 for missing playwright_code", async () => {
    await startServer();
    const res = await post(
      "/validate-test",
      { project_id: "p1", url: "https://example.com", workspace_id: "w1" },
      { Authorization: `Bearer ${SECRET}` },
    );
    expect(res.status).toBe(400);
  });
});

describe("Snapshot API — routing", () => {
  afterEach(async () => {
    await stopServer();
  });

  it("returns 404 for unknown routes", async () => {
    await startServer();
    const res = await post("/unknown", {}, { Authorization: `Bearer ${SECRET}` });
    expect(res.status).toBe(404);
  });

  it("returns 405 for GET requests", async () => {
    await startServer();
    const res = await get("/snapshot", { Authorization: `Bearer ${SECRET}` });
    expect(res.status).toBe(405);
  });

  it("handles query strings in URL", async () => {
    await startServer();
    const res = await post("/snapshot?t=123", {
      project_id: "p1",
      url: "https://example.com",
      workspace_id: "w1",
    });
    expect(res.status).toBe(401);
  });
});

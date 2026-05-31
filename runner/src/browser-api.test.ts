import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as http from "http";
import { createBrowserApiServer } from "../src/browser-api";
import type { BrowserSessionManager } from "../src/browser-sessions";

function createMockSessionManager(): BrowserSessionManager {
  return {
    navigateAndSnapshot: vi.fn().mockResolvedValue({
      snapshot: "- heading 'Dashboard' [ref=e1]",
      url: "https://app.com/dashboard",
      title: "Dashboard",
    }),
    getSnapshot: vi.fn().mockResolvedValue({
      snapshot: "- heading 'Dashboard' [ref=e1]",
      url: "https://app.com/dashboard",
      title: "Dashboard",
    }),
    login: vi.fn().mockResolvedValue({ success: true }),
    closeSession: vi.fn().mockResolvedValue(undefined),
    hasSession: vi.fn().mockReturnValue(true),
    startIdleSweep: vi.fn(),
    stopIdleSweep: vi.fn(),
    closeAll: vi.fn().mockResolvedValue(undefined),
    getSessionCount: vi.fn().mockReturnValue(1),
    isSessionAuthed: vi.fn().mockReturnValue(true),
  } as unknown as BrowserSessionManager;
}

function request(
  port: number,
  method: string,
  path: string,
  body?: Record<string, unknown>,
  headers?: Record<string, string>
): Promise<{ status: number; body: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: "localhost", port, path, method, headers },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          resolve({
            status: res.statusCode ?? 0,
            body: JSON.parse(data || "{}"),
          });
        });
      }
    );
    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

describe("Browser API", () => {
  let server: http.Server;
  let port: number;
  let sessionManager: BrowserSessionManager;
  const secret = "test-secret";

  beforeEach(async () => {
    sessionManager = createMockSessionManager();
    server = createBrowserApiServer(sessionManager, secret, () => {});
    port = await new Promise<number>((resolve) => {
      server.listen(0, () => {
        const addr = server.address();
        resolve(typeof addr === "object" && addr ? addr.port : 0);
      });
    });
  });

  afterEach(() => {
    server.close();
  });

  it("rejects requests without auth header", async () => {
    const res = await request(port, "POST", "/browser/navigate", {
      project_id: "p1",
      url: "https://app.com",
    });
    expect(res.status).toBe(401);
  });

  it("rejects requests with wrong auth header", async () => {
    const res = await request(
      port,
      "POST",
      "/browser/navigate",
      { project_id: "p1", url: "https://app.com" },
      { Authorization: "Bearer wrong-secret" }
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 for unknown routes", async () => {
    const res = await request(
      port,
      "POST",
      "/browser/unknown",
      {},
      { Authorization: `Bearer ${secret}` }
    );
    expect(res.status).toBe(404);
  });

  it("POST /browser/navigate returns snapshot", async () => {
    const res = await request(
      port,
      "POST",
      "/browser/navigate",
      { project_id: "p1", url: "https://app.com/dashboard" },
      { Authorization: `Bearer ${secret}` }
    );
    expect(res.status).toBe(200);
    expect(res.body.snapshot).toBe("- heading 'Dashboard' [ref=e1]");
    expect(res.body.url).toBe("https://app.com/dashboard");
    expect(res.body.title).toBe("Dashboard");
  });

  it("POST /browser/navigate returns 400 when project_id missing", async () => {
    const res = await request(
      port,
      "POST",
      "/browser/navigate",
      { url: "https://app.com" },
      { Authorization: `Bearer ${secret}` }
    );
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("project_id");
  });

  it("POST /browser/navigate returns 400 when url missing", async () => {
    const res = await request(
      port,
      "POST",
      "/browser/navigate",
      { project_id: "p1" },
      { Authorization: `Bearer ${secret}` }
    );
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("url");
  });

  it("POST /browser/snapshot returns 400 when project_id missing", async () => {
    const res = await request(
      port,
      "POST",
      "/browser/snapshot",
      {},
      { Authorization: `Bearer ${secret}` }
    );
    expect(res.status).toBe(400);
  });

  it("POST /browser/snapshot returns 404 when no session exists", async () => {
    (sessionManager.hasSession as ReturnType<typeof vi.fn>).mockReturnValue(false);
    const res = await request(
      port,
      "POST",
      "/browser/snapshot",
      { project_id: "p1" },
      { Authorization: `Bearer ${secret}` }
    );
    expect(res.status).toBe(404);
  });

  it("POST /browser/login returns success", async () => {
    const res = await request(
      port,
      "POST",
      "/browser/login",
      { project_id: "p1" },
      { Authorization: `Bearer ${secret}` }
    );
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("POST /browser/context/close returns closed", async () => {
    const res = await request(
      port,
      "POST",
      "/browser/context/close",
      { project_id: "p1" },
      { Authorization: `Bearer ${secret}` }
    );
    expect(res.status).toBe(200);
    expect(res.body.closed).toBe(true);
  });

  it("returns 500 when navigateAndSnapshot throws", async () => {
    (sessionManager.navigateAndSnapshot as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Navigation failed: timeout")
    );
    const res = await request(
      port,
      "POST",
      "/browser/navigate",
      { project_id: "p1", url: "https://app.com" },
      { Authorization: `Bearer ${secret}` }
    );
    expect(res.status).toBe(500);
    expect(res.body.error).toContain("Navigation failed");
  });
});

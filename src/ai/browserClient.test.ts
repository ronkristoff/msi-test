import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as http from "http";

const { getLiveSnapshot, extractTargetUrl } = await import(
  "../../convex/ai/browserClient"
);

describe("extractTargetUrl", () => {
  it("extracts http URL from page.goto()", () => {
    const code = `await page.goto('https://example.com/dashboard')`;
    expect(extractTargetUrl(code, "https://fallback.com")).toBe(
      "https://example.com/dashboard"
    );
  });

  it("extracts double-quoted URL", () => {
    const code = `await page.goto("https://app.com/settings")`;
    expect(extractTargetUrl(code, "https://fallback.com")).toBe(
      "https://app.com/settings"
    );
  });

  it("extracts template literal URL", () => {
    const code = "await page.goto(`https://myapp.com/profile`)";
    expect(extractTargetUrl(code, "https://fallback.com")).toBe(
      "https://myapp.com/profile"
    );
  });

  it("resolves relative path against fallback origin", () => {
    const code = `await page.goto('/dashboard')`;
    expect(extractTargetUrl(code, "https://app.com")).toBe(
      "https://app.com/dashboard"
    );
  });

  it("returns fallback when no page.goto() found", () => {
    const code = `await page.click('button')`;
    expect(extractTargetUrl(code, "https://app.com")).toBe("https://app.com");
  });

  it("returns fallback for empty test code", () => {
    expect(extractTargetUrl("", "https://app.com")).toBe("https://app.com");
  });
});

describe("getLiveSnapshot", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns null when RUNNER_URL is not set", async () => {
    delete process.env.RUNNER_URL;
    const result = await getLiveSnapshot({
      projectId: "proj1",
      url: "https://example.com",
      authConfig: {
        auth_mode: "none",
        app_url: "https://example.com",
      },
    });
    expect(result).toBeNull();
  });

  it("returns null when RUNNER_SECRET is not set", async () => {
    process.env.RUNNER_URL = "http://localhost:8931";
    delete process.env.RUNNER_SECRET;
    const result = await getLiveSnapshot({
      projectId: "proj1",
      url: "https://example.com",
      authConfig: {
        auth_mode: "none",
        app_url: "https://example.com",
      },
    });
    expect(result).toBeNull();
  });

  it("returns null when Runner returns error status", async () => {
    process.env.RUNNER_URL = "http://localhost:18931";
    process.env.RUNNER_SECRET = "test-secret";

    const result = await getLiveSnapshot({
      projectId: "proj1",
      url: "https://example.com",
      authConfig: {
        auth_mode: "none",
        app_url: "https://example.com",
      },
    });

    expect(result).toBeNull();
  });

  it("returns null when Runner is unreachable", async () => {
    process.env.RUNNER_URL = "http://localhost:19999";
    process.env.RUNNER_SECRET = "test-secret";

    const result = await getLiveSnapshot({
      projectId: "proj1",
      url: "https://example.com",
      authConfig: {
        auth_mode: "none",
        app_url: "https://example.com",
      },
    });

    expect(result).toBeNull();
  });

  it("sends correct auth header and body to Runner", async () => {
    let receivedRequest: {
      method?: string;
      url?: string;
      headers?: Record<string, string>;
      body?: Record<string, unknown>;
    } = {};

    const server = await new Promise<{ close: () => void }>((resolve) => {
      const srv = http.createServer(
        (req: http.IncomingMessage, res: http.ServerResponse) => {
          let body = "";
          req.on("data", (chunk: Buffer) => (body += chunk.toString()));
          req.on("end", () => {
            receivedRequest = {
              method: req.method,
              url: req.url,
              headers: req.headers as Record<string, string>,
              body: JSON.parse(body || "{}"),
            };
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(
              JSON.stringify({
                snapshot: "- heading 'Test' [ref=e1]",
                url: "https://example.com",
                title: "Test Page",
              })
            );
          });
        }
      );
      srv.listen(19876, () => resolve({ close: () => srv.close() }));
    });

    process.env.RUNNER_URL = "http://localhost:19876";
    process.env.RUNNER_SECRET = "my-secret-key";

    const result = await getLiveSnapshot({
      projectId: "proj1",
      url: "https://example.com",
      authConfig: {
        auth_mode: "form",
        username: "user@test.com",
        password: "pass123",
        app_url: "https://example.com",
      },
    });

    expect(result).toEqual({
      snapshot: "- heading 'Test' [ref=e1]",
      url: "https://example.com",
      title: "Test Page",
    });

    expect(receivedRequest.method).toBe("POST");
    expect(receivedRequest.url).toBe("/browser/navigate");
    expect(receivedRequest.headers?.authorization).toBe(
      "Bearer my-secret-key"
    );
    expect(receivedRequest.body?.project_id).toBe("proj1");
    expect(receivedRequest.body?.url).toBe("https://example.com");

    server.close();
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { BrowserSessionManager } from "../src/browser-sessions";

vi.mock("playwright", () => ({
  chromium: {
    launch: vi.fn().mockResolvedValue({
      isConnected: () => true,
      newContext: vi.fn().mockResolvedValue({
        newPage: vi.fn().mockResolvedValue({
          goto: vi.fn().mockResolvedValue(undefined),
          waitForTimeout: vi.fn().mockResolvedValue(undefined),
          url: vi.fn().mockReturnValue("https://app.com"),
          title: vi.fn().mockResolvedValue("Test Page"),
          evaluate: vi.fn().mockResolvedValue(true),
          close: vi.fn().mockResolvedValue(undefined),
          ariaSnapshot: vi.fn().mockResolvedValue("- heading 'Test' [ref=e1]"),
        }),
        addCookies: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
      }),
      close: vi.fn().mockResolvedValue(undefined),
    }),
  },
}));

describe("BrowserSessionManager", () => {
  let manager: BrowserSessionManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new BrowserSessionManager(() => {});
  });

  it("creates a session on first request", async () => {
    const session = await manager.getOrCreateSession("proj1", {
      auth_mode: "none",
      app_url: "https://app.com",
    });
    expect(session).toBeDefined();
    expect(session.authed).toBe(false);
    expect(manager.hasSession("proj1")).toBe(true);
  });

  it("reuses session on subsequent requests", async () => {
    const s1 = await manager.getOrCreateSession("proj1", {
      auth_mode: "none",
      app_url: "https://app.com",
    });
    const s2 = await manager.getOrCreateSession("proj1", {
      auth_mode: "none",
      app_url: "https://app.com",
    });
    expect(s1).toBe(s2);
    expect(manager.getSessionCount()).toBe(1);
  });

  it("creates separate sessions for different projects", async () => {
    await manager.getOrCreateSession("proj1", {
      auth_mode: "none",
      app_url: "https://app1.com",
    });
    await manager.getOrCreateSession("proj2", {
      auth_mode: "none",
      app_url: "https://app2.com",
    });
    expect(manager.getSessionCount()).toBe(2);
    expect(manager.hasSession("proj1")).toBe(true);
    expect(manager.hasSession("proj2")).toBe(true);
  });

  it("marks session as authed after cookie injection", async () => {
    await manager.getOrCreateSession("proj1", {
      auth_mode: "cookie",
      cookie_name: "session",
      cookie_value: "abc123",
      app_url: "https://app.com",
    });
    expect(manager.isSessionAuthed("proj1")).toBe(true);
  });

  it("closes a session", async () => {
    await manager.getOrCreateSession("proj1", {
      auth_mode: "none",
      app_url: "https://app.com",
    });
    expect(manager.hasSession("proj1")).toBe(true);

    await manager.closeSession("proj1");
    expect(manager.hasSession("proj1")).toBe(false);
    expect(manager.getSessionCount()).toBe(0);
  });

  it("closeAll closes all sessions and browser", async () => {
    await manager.getOrCreateSession("proj1", {
      auth_mode: "none",
      app_url: "https://app1.com",
    });
    await manager.getOrCreateSession("proj2", {
      auth_mode: "none",
      app_url: "https://app2.com",
    });

    await manager.closeAll();
    expect(manager.getSessionCount()).toBe(0);
  });

  it("navigateAndSnapshot returns snapshot result", async () => {
    const result = await manager.navigateAndSnapshot("proj1", "https://app.com", {
      auth_mode: "none",
      app_url: "https://app.com",
    });
    expect(result.snapshot).toBe("- heading 'Test' [ref=e1]");
    expect(result.url).toBeDefined();
    expect(result.title).toBeDefined();
  });

  it("queues concurrent requests for the same project", async () => {
    const results = await Promise.all([
      manager.navigateAndSnapshot("proj1", "https://app.com/page1", {
        auth_mode: "none",
        app_url: "https://app.com",
      }),
      manager.navigateAndSnapshot("proj1", "https://app.com/page2", {
        auth_mode: "none",
        app_url: "https://app.com",
      }),
    ]);
    expect(results).toHaveLength(2);
    expect(results[0].snapshot).toBeDefined();
    expect(results[1].snapshot).toBeDefined();
  });

  it("startIdleSweep and stopIdleSweep do not throw", () => {
    expect(() => manager.startIdleSweep(100)).not.toThrow();
    expect(() => manager.stopIdleSweep()).not.toThrow();
  });
});

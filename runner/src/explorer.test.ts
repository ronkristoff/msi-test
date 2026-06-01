import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { executeExploration } from "./explorer";
import type { RunnerConvexClient } from "./convex-client";
import type { ExplorationWorkItem } from "./types";

vi.mock("./stagehand", () => ({
  initStagehand: vi.fn(),
}));

function createMockPage() {
  return {
    goto: vi.fn().mockResolvedValue(null),
    title: vi.fn().mockResolvedValue("Test Page"),
    screenshot: vi.fn().mockResolvedValue(Buffer.from("png")),
    url: vi.fn().mockReturnValue("https://example.com"),
    waitForTimeout: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockStagehand(mockPage: ReturnType<typeof createMockPage>) {
  return {
    context: {
      activePage: vi.fn().mockReturnValue(mockPage),
      newPage: vi.fn().mockResolvedValue(mockPage),
      addCookies: vi.fn().mockResolvedValue(undefined),
      pages: vi.fn().mockReturnValue([mockPage]),
    },
    act: vi.fn().mockResolvedValue({ success: true, message: "done", actionDescription: "test", actions: [] }),
    extract: vi.fn().mockImplementation((...args: unknown[]) => {
      if (args.length === 0) return Promise.resolve({ pageText: "Page content" });
      return Promise.resolve({ links: [] });
    }),
    observe: vi.fn().mockResolvedValue([]),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockClient(overrides?: Partial<RunnerConvexClient>) {
  return {
    getWorkspaceAiConfig: vi.fn().mockResolvedValue({
      endpoint_url: "https://api.openai.com/v1",
      api_key: "sk-test",
      model_name: "gpt-4o",
    }),
    uploadBuffer: vi.fn().mockResolvedValue("storage-id-1"),
    updateExplorationProgress: vi.fn().mockResolvedValue(undefined),
    completeExploration: vi.fn().mockResolvedValue(undefined),
    failExploration: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as RunnerConvexClient;
}

interface TestContext {
  stagehand: ReturnType<typeof createMockStagehand>;
  client: RunnerConvexClient;
  mockPage: ReturnType<typeof createMockPage>;
  work: ExplorationWorkItem;
}

function createTestContext(overrides?: {
  work?: Partial<ExplorationWorkItem>;
  client?: Partial<RunnerConvexClient>;
  extract?: Mock;
  observe?: Mock;
}): TestContext {
  const mockPage = createMockPage();
  const stagehand = createMockStagehand(mockPage);

  if (overrides?.extract) stagehand.extract = overrides.extract;
  if (overrides?.observe) stagehand.observe = overrides.observe;

  const work: ExplorationWorkItem = {
    exploration_id: "exp-1",
    url: "https://example.com",
    workspace_id: "ws-1",
    auth_mode: "none",
    interactive: false,
    ...overrides?.work,
  };

  const client = createMockClient(overrides?.client);

  return { stagehand, client, mockPage, work };
}

const log = vi.fn();

describe("executeExploration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("captures the start page and completes", async () => {
    const { initStagehand } = await import("./stagehand");
    const { stagehand, client, work } = createTestContext();
    (initStagehand as Mock).mockResolvedValue(stagehand);

    await executeExploration(client, work, log);

    expect(client.completeExploration).toHaveBeenCalledOnce();
    const capturedPages = (client.completeExploration as Mock).mock.calls[0][1];
    expect(capturedPages).toHaveLength(1);
    expect(capturedPages[0].title).toBe("Test Page");
    expect(capturedPages[0].semantic_description).toContain("Test Page");
    expect(capturedPages[0].structure_text).toBe("");
  });

  it("skips noise URLs", async () => {
    const { initStagehand } = await import("./stagehand");

    const extractFn = vi.fn().mockImplementation((...args: unknown[]) => {
      if (args.length === 0) return Promise.resolve({ pageText: "Home page" });
      return Promise.resolve({
        links: [
          { text: "Privacy", href: "https://example.com/privacy" },
          { text: "Terms", href: "https://example.com/terms" },
          { text: "About", href: "https://example.com/about" },
        ],
      });
    });

    const { stagehand, client, work } = createTestContext({ extract: extractFn });
    (initStagehand as Mock).mockResolvedValue(stagehand);

    await executeExploration(client, work, log);

    expect(client.completeExploration).toHaveBeenCalledOnce();
    const capturedPages = (client.completeExploration as Mock).mock.calls[0][1];
    const urls = capturedPages.map((p: { url: string }) => p.url);
    expect(urls).not.toContain("https://example.com/privacy");
    expect(urls).not.toContain("https://example.com/terms");
    expect(urls).toContain("https://example.com/about");
  });

  it("performs form login via act() with variables", async () => {
    const { initStagehand } = await import("./stagehand");
    const { stagehand, client, work } = createTestContext({
      work: {
        auth_mode: "form",
        login_url: "https://example.com/login",
        username: "user@test.com",
        password: "pass123",
      },
    });
    (initStagehand as Mock).mockResolvedValue(stagehand);

    await executeExploration(client, work, log);

    expect(stagehand.act).toHaveBeenCalledWith(
      expect.stringContaining("username"),
      expect.objectContaining({
        variables: {
          username: "user@test.com",
          password: "pass123",
        },
      }),
    );
  });

  it("calls failExploration on error", async () => {
    const { initStagehand } = await import("./stagehand");
    (initStagehand as Mock).mockRejectedValue(new Error("Stagehand init failed"));

    const { client, work } = createTestContext();

    await executeExploration(client, work, log);

    expect(client.failExploration).toHaveBeenCalledWith("exp-1", "Stagehand init failed");
  });

  it("closes Stagehand even on error", async () => {
    const { initStagehand } = await import("./stagehand");
    const { stagehand, client, work } = createTestContext({
      client: { completeExploration: vi.fn().mockRejectedValue(new Error("Convex error")) },
    });
    (initStagehand as Mock).mockResolvedValue(stagehand);

    await executeExploration(client, work, log);

    expect(stagehand.close).toHaveBeenCalledWith({ force: true });
  });

  it("streams live progress messages", async () => {
    const { initStagehand } = await import("./stagehand");
    const { stagehand, client, work } = createTestContext();
    (initStagehand as Mock).mockResolvedValue(stagehand);

    await executeExploration(client, work, log);

    expect(client.updateExplorationProgress).toHaveBeenCalledWith(
      "exp-1",
      expect.stringContaining("Visiting page 1"),
      1,
    );
  });

  it("explores interactive elements when interactive mode is enabled", async () => {
    const { initStagehand } = await import("./stagehand");

    const observeFn = vi.fn().mockResolvedValue([
      { selector: "button.submit", description: "Submit button" },
      { selector: "nav a", description: "Navigation link" },
    ]);

    const { stagehand, client, work } = createTestContext({
      work: { interactive: true },
      observe: observeFn,
    });
    (initStagehand as Mock).mockResolvedValue(stagehand);

    await executeExploration(client, work, log);

    expect(stagehand.act).toHaveBeenCalled();
  });
});

import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { executeExploration } from "./explorer";
import { extractPrdKeywords, buildPrdCoverage, sortQueueByPrdRelevance } from "./prd-utils";
import type { RunnerConvexClient } from "./convex-client";
import type { ExplorationWorkItem, CapturedPage } from "./types";

vi.mock("./stagehand", () => ({
  initStagehand: vi.fn(),
}));

vi.mock("./explorer-utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./explorer-utils")>();
  return {
    ...actual,
    captureScreenshot: vi.fn().mockResolvedValue("storage-id-1"),
    handleFormLogin: vi.fn(),
  };
});

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
    const opts = (client.completeExploration as Mock).mock.calls[0][1];
    expect(opts.capturedPages).toHaveLength(1);
    expect(opts.capturedPages[0].title).toBe("Test Page");
    expect(opts.capturedPages[0].semantic_description).toContain("Test Page");
    expect(opts.capturedPages[0].structure_text).toBe("");
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
    const opts = (client.completeExploration as Mock).mock.calls[0][1];
    const urls = opts.capturedPages.map((p: { url: string }) => p.url);
    expect(urls).not.toContain("https://example.com/privacy");
    expect(urls).not.toContain("https://example.com/terms");
    expect(urls).toContain("https://example.com/about");
  });

  it("delegates form login to handleFormLogin with credentials", async () => {
    const { initStagehand } = await import("./stagehand");
    const { handleFormLogin } = await import("./explorer-utils");
    const { stagehand, client, work } = createTestContext({
      work: {
        auth_mode: "form",
        login_url: "https://example.com/login",
        username: "user@test.com",
        password: "pass123",
      },
    });
    (initStagehand as Mock).mockResolvedValue(stagehand);
    (handleFormLogin as Mock).mockResolvedValue({
      url: "https://example.com/login",
      title: "Login",
      structure_text: "",
      semantic_description: "Login",
    });

    await executeExploration(client, work, log);

    expect(handleFormLogin).toHaveBeenCalledWith(
      stagehand,
      work,
      client,
      log,
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

  it("passes prd_coverage to completeExploration when prd_text is provided", async () => {
    const { initStagehand } = await import("./stagehand");
    const { stagehand, client, work } = createTestContext({
      work: { prd_text: "Checkout payment tax withholding" },
    });
    (initStagehand as Mock).mockResolvedValue(stagehand);

    await executeExploration(client, work, log);

    expect(client.completeExploration).toHaveBeenCalledOnce();
    const opts = (client.completeExploration as Mock).mock.calls[0][1];
    expect(opts.prdCoverage).toBeDefined();
    expect(opts.prdCoverage.length).toBeGreaterThan(0);
  });

  it("does not pass prd_coverage when no prd_text", async () => {
    const { initStagehand } = await import("./stagehand");
    const { stagehand, client, work } = createTestContext();
    (initStagehand as Mock).mockResolvedValue(stagehand);

    await executeExploration(client, work, log);

    const opts = (client.completeExploration as Mock).mock.calls[0][1];
    expect(opts.prdCoverage).toBeUndefined();
  });

  it("prioritizes PRD-relevant links in crawl queue", async () => {
    const { initStagehand } = await import("./stagehand");
    const visitOrder: string[] = [];

    const extractFn = vi.fn().mockImplementation((...args: unknown[]) => {
      if (args.length === 0) return Promise.resolve({ pageText: "Home page" });
      return Promise.resolve({
        links: [
          { text: "About Us", href: "https://example.com/about" },
          { text: "Checkout", href: "https://example.com/checkout" },
          { text: "Contact", href: "https://example.com/contact" },
        ],
      });
    });

    const { stagehand, client, work } = createTestContext({
      work: { prd_text: "checkout payment billing" },
      extract: extractFn,
    });

    const origGoto = stagehand.context.activePage().goto;
    stagehand.context.activePage().goto = vi.fn().mockImplementation(async (url: string) => {
      visitOrder.push(url);
      return origGoto(url);
    });

    (initStagehand as Mock).mockResolvedValue(stagehand);

    await executeExploration(client, work, log);

    expect(visitOrder.length).toBeGreaterThan(1);
    const checkoutIndex = visitOrder.indexOf("https://example.com/checkout");
    const aboutIndex = visitOrder.indexOf("https://example.com/about");
    if (checkoutIndex >= 0 && aboutIndex >= 0) {
      expect(checkoutIndex).toBeLessThan(aboutIndex);
    }
  });
});

describe("extractPrdKeywords", () => {
  it("extracts meaningful keywords from PRD text", () => {
    const prd = "The checkout page should allow users to pay with credit card and PayPal. Tax withholding must be calculated automatically.";
    const keywords = extractPrdKeywords(prd);
    expect(keywords).toContain("checkout");
    expect(keywords).toContain("pay");
    expect(keywords).toContain("credit");
    expect(keywords).toContain("card");
    expect(keywords).toContain("tax");
    expect(keywords).toContain("withholding");
  });

  it("filters out stop words", () => {
    const prd = "The user should be able to log in with their email and password";
    const keywords = extractPrdKeywords(prd);
    expect(keywords).not.toContain("the");
    expect(keywords).not.toContain("should");
    expect(keywords).not.toContain("able");
    expect(keywords).toContain("log");
    expect(keywords).toContain("email");
    expect(keywords).toContain("password");
  });

  it("returns up to 20 keywords sorted by frequency", () => {
    const prd = "checkout checkout checkout payment payment dashboard";
    const keywords = extractPrdKeywords(prd);
    expect(keywords[0]).toBe("checkout");
    expect(keywords[1]).toBe("payment");
    expect(keywords[2]).toBe("dashboard");
  });

  it("returns empty for empty text", () => {
    expect(extractPrdKeywords("")).toEqual([]);
  });

  it("ignores words shorter than 3 chars", () => {
    expect(extractPrdKeywords("a an is to do")).toEqual([]);
  });
});

describe("buildPrdCoverage", () => {
  const pages: CapturedPage[] = [
    { url: "https://example.com", title: "Home", structure_text: "", semantic_description: "Home: checkout payment dashboard" },
    { url: "https://example.com/login", title: "Login", structure_text: "", semantic_description: "Login: email password form" },
  ];
  const flows = [
    { name: "Checkout flow", steps: ["Home", "Cart", "Payment"] },
  ];

  it("returns coverage items for each keyword", () => {
    const coverage = buildPrdCoverage("checkout payment login", pages, flows);
    expect(coverage).toBeDefined();
    expect(coverage!.length).toBeGreaterThan(0);
  });

  it("marks found features correctly", () => {
    const coverage = buildPrdCoverage("checkout login", pages, flows);
    const checkoutItem = coverage!.find((c) => c.feature === "checkout");
    expect(checkoutItem?.found).toBe(true);
  });

  it("marks missing features correctly", () => {
    const coverage = buildPrdCoverage("tax withholding settings", pages, flows);
    const missingItems = coverage!.filter((c) => !c.found);
    expect(missingItems.length).toBeGreaterThan(0);
  });

  it("returns undefined when no PRD text", () => {
    expect(buildPrdCoverage(undefined, pages, flows)).toBeUndefined();
  });

  it("checks flow names and steps too", () => {
    const coverage = buildPrdCoverage("checkout", [pages[0]], flows);
    expect(coverage!.find((c) => c.feature === "checkout")?.found).toBe(true);
  });
});

describe("sortQueueByPrdRelevance", () => {
  it("prioritizes links matching PRD keywords", () => {
    const queue = [
      "https://example.com/about",
      "https://example.com/checkout",
      "https://example.com/contact",
    ];
    const linksSnapshot = new Map([
      ["https://example.com", [
        { text: "About Us", href: "https://example.com/about" },
        { text: "Checkout", href: "https://example.com/checkout" },
        { text: "Contact", href: "https://example.com/contact" },
      ]],
    ]);

    sortQueueByPrdRelevance(queue, linksSnapshot, ["checkout", "payment"]);

    expect(queue[0]).toBe("https://example.com/checkout");
  });

  it("does nothing when keywords empty", () => {
    const queue = ["https://example.com/a", "https://example.com/b"];
    sortQueueByPrdRelevance(queue, new Map(), []);
    expect(queue[0]).toBe("https://example.com/a");
  });
});

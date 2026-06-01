import { vi } from "vitest";
import type { RunnerConvexClient } from "../convex-client";

export function createMockClient(overrides: Partial<RunnerConvexClient> = {}): RunnerConvexClient {
  return {
    getWorkspaceAiConfig: vi.fn().mockResolvedValue({
      endpoint_url: "https://api.openai.com/v1",
      api_key: "sk-test",
      model_name: "gpt-4o",
    }),
    writeStepResult: vi.fn().mockResolvedValue(undefined),
    writeRunResult: vi.fn().mockResolvedValue(undefined),
    completeRun: vi.fn().mockResolvedValue(undefined),
    forceCompleteRun: vi.fn().mockResolvedValue(undefined),
    uploadBuffer: vi.fn().mockResolvedValue("storage-id-123"),
    uploadFile: vi.fn().mockResolvedValue("storage-id-123"),
    generateUploadUrl: vi.fn().mockResolvedValue("https://upload.example.com"),
    recordHealingHistory: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as RunnerConvexClient;
}

export function createMockPage() {
  return {
    goto: vi.fn().mockResolvedValue(undefined),
    title: vi.fn().mockResolvedValue("Test Page"),
    url: vi.fn().mockReturnValue("https://example.com"),
    screenshot: vi.fn().mockResolvedValue(Buffer.from("png-data")),
    evaluate: vi.fn().mockResolvedValue(undefined),
  };
}

export function createMockStagehandContext(mockPage: ReturnType<typeof createMockPage>) {
  return {
    activePage: vi.fn().mockReturnValue(mockPage),
    newPage: vi.fn().mockResolvedValue(mockPage),
    addCookies: vi.fn().mockResolvedValue(undefined),
  };
}

export function createHealMockStagehand(config: {
  failOnStep?: number;
  observeResults?: Array<{ selector: string; description: string }>;
  extractResult?: { confidence: number; reasoning: string };
  healActSucceeds?: boolean;
}) {
  const mockAct = vi.fn();
  const mockObserve = vi.fn();
  const mockExtract = vi.fn();
  const mockClose = vi.fn().mockResolvedValue(undefined);
  const mockPage = createMockPage();

  let callCount = 0;
  mockAct.mockImplementation(async () => {
    callCount++;
    if (config.failOnStep && callCount === config.failOnStep) {
      throw new Error("Element not found: could not locate button");
    }
    return { success: true };
  });

  if (config.observeResults) {
    mockObserve.mockResolvedValue(config.observeResults);
  } else {
    mockObserve.mockResolvedValue([]);
  }

  if (config.extractResult) {
    mockExtract.mockResolvedValue(config.extractResult);
  } else {
    mockExtract.mockResolvedValue({ confidence: 0, reasoning: "" });
  }

  const stagehand = {
    init: vi.fn().mockResolvedValue(undefined),
    close: mockClose,
    act: mockAct,
    observe: mockObserve,
    extract: mockExtract,
    context: createMockStagehandContext(mockPage),
  };

  return { stagehand, mockAct, mockObserve, mockExtract, mockClose, mockPage };
}

export function createLearnedMockStagehand(config: {
  observeResults: Array<{ selector: string; description: string }>;
  actFailsOnInstruction?: boolean;
}) {
  const mockAct = vi.fn().mockResolvedValue({ success: true });
  const mockObserve = vi.fn().mockResolvedValue(config.observeResults);
  const mockExtract = vi.fn().mockResolvedValue({ confidence: 0.9, reasoning: "Good match" });
  const mockClose = vi.fn().mockResolvedValue(undefined);
  const mockPage = createMockPage();

  if (config.actFailsOnInstruction) {
    mockAct.mockRejectedValue(new Error("Element not found: button"));
  }

  const stagehand = {
    init: vi.fn().mockResolvedValue(undefined),
    close: mockClose,
    act: mockAct,
    observe: mockObserve,
    extract: mockExtract,
    context: createMockStagehandContext(mockPage),
  };

  return { stagehand, mockAct, mockObserve, mockExtract, mockClose, mockPage };
}

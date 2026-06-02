import { describe, it, expect, vi, beforeEach } from "vitest";
import { initStagehandConfig, initStagehand } from "../src/stagehand";
import type { AiConfig } from "../../convex/ai/model";

const mockInit = vi.fn().mockResolvedValue(undefined);
const mockClose = vi.fn().mockResolvedValue(undefined);
let lastStagehandArgs: Record<string, unknown> = {};

vi.mock("@browserbasehq/stagehand", () => {
  class MockStagehand {
    init = mockInit;
    close = mockClose;
    constructor(args: Record<string, unknown>) {
      lastStagehandArgs = { ...args };
    }
  }
  return { Stagehand: MockStagehand, LLMClient: class {} };
});

vi.mock("@ai-sdk/openai", () => {
  function mockCreateOpenAI() {
    return Object.assign(
      function fakeProvider(modelName: string) {
        return { type: "language-model-v3", modelId: modelName, provider: "openai", specificationVersion: "v3" };
      },
      {
        chat(modelName: string) {
          return { type: "language-model-v3", modelId: modelName, provider: "openai.chat", specificationVersion: "v3" };
        },
      },
    );
  }
  return { createOpenAI: mockCreateOpenAI };
});

vi.mock("ai", () => ({
  generateText: vi.fn(),
  generateObject: vi.fn(),
}));

vi.mock("@ai-sdk/provider-utils", () => ({
  toJsonSchema: vi.fn((s) => s),
}));

const BASE_CONFIG: AiConfig = {
  endpoint_url: "https://api.openai.com/v1",
  api_key: "sk-test-key-12345",
  model_name: "gpt-4o",
};

describe("initStagehandConfig", () => {
  it("sets env to LOCAL", () => {
    expect(initStagehandConfig(BASE_CONFIG).env).toBe("LOCAL");
  });

  it("enables experimental mode and disables API", () => {
    const config = initStagehandConfig(BASE_CONFIG);
    expect(config.experimental).toBe(true);
    expect(config.disableAPI).toBe(true);
  });

  it("runs browser headless", () => {
    expect(initStagehandConfig(BASE_CONFIG).localBrowserLaunchOptions).toEqual({ headless: true });
  });

  it("disables pino logging", () => {
    expect(initStagehandConfig(BASE_CONFIG).disablePino).toBe(true);
  });

  it("sets verbose to 1", () => {
    expect(initStagehandConfig(BASE_CONFIG).verbose).toBe(1);
  });

  it("includes cacheDir when provided", () => {
    expect(initStagehandConfig(BASE_CONFIG, "/tmp/cache/proj-1").cacheDir).toBe("/tmp/cache/proj-1");
  });

  it("sets cacheDir to undefined when not provided", () => {
    expect(initStagehandConfig(BASE_CONFIG).cacheDir).toBeUndefined();
  });
});

describe("initStagehand", () => {
  const log = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    lastStagehandArgs = {};
  });

  it("creates and initializes a Stagehand instance", async () => {
    const stagehand = await initStagehand(BASE_CONFIG, log);
    expect(stagehand).toBeDefined();
    expect(mockInit).toHaveBeenCalled();
  });

  it("logs model name and endpoint", async () => {
    await initStagehand(BASE_CONFIG, log);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("model=gpt-4o"));
    expect(log).toHaveBeenCalledWith(expect.stringContaining("endpoint=https://api.openai.com/v1"));
  });

  it("prefers stagehand_model_name over model_name", async () => {
    await initStagehand({ ...BASE_CONFIG, stagehand_model_name: "gpt-4o-mini" }, log);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("model=gpt-4o-mini"));
  });

  it("passes cacheDir to config", async () => {
    await initStagehand(BASE_CONFIG, log, "/tmp/test-cache/proj-1");
    expect(log).toHaveBeenCalledWith(expect.stringContaining("cacheDir=/tmp/test-cache/proj-1"));
  });

  it("omits cacheDir log when not provided", async () => {
    await initStagehand(BASE_CONFIG, log);
    expect(log).not.toHaveBeenCalledWith(expect.stringContaining("cacheDir="));
  });

  it("creates ZAiClient with .chat() model", async () => {
    await initStagehand(BASE_CONFIG, log);
    const llmClient = lastStagehandArgs.llmClient as { type: string; hasVision: boolean };
    expect(llmClient).toBeDefined();
    expect(llmClient.type).toBe("openai");
    expect(llmClient.hasVision).toBe(true);
  });

  it("creates ZAiClient for Z.AI config", async () => {
    const zaiConfig: AiConfig = {
      endpoint_url: "https://api.z.ai/api/coding/paas/v4",
      api_key: "zai-key",
      model_name: "glm-4.5-air",
    };
    await initStagehand(zaiConfig, log);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("model=glm-4.5-air"));
    const llmClient = lastStagehandArgs.llmClient as { type: string };
    expect(llmClient.type).toBe("openai");
  });
});

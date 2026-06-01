import { describe, it, expect, vi, beforeEach } from "vitest";
import { createStagehandConfig, initStagehand } from "../src/stagehand";
import type { AiConfig } from "../../convex/ai/model";

vi.mock("@browserbasehq/stagehand", () => {
  const mockInit = vi.fn().mockResolvedValue(undefined);
  const mockClose = vi.fn().mockResolvedValue(undefined);
  class MockStagehand {
    init = mockInit;
    close = mockClose;
    context = { pages: vi.fn().mockReturnValue([]) };
  }
  return { Stagehand: MockStagehand };
});

const BASE_CONFIG: AiConfig = {
  endpoint_url: "https://api.openai.com/v1",
  api_key: "sk-test-key-12345",
  model_name: "gpt-4o",
};

describe("createStagehandConfig", () => {
  it("uses primary model when no stagehand model specified", () => {
    const config = createStagehandConfig(BASE_CONFIG);
    expect(config.env).toBe("LOCAL");
    expect(config.model).toEqual({
      modelName: "gpt-4o",
      apiKey: "sk-test-key-12345",
      baseURL: "https://api.openai.com/v1",
    });
  });

  it("uses stagehand_model_name when specified", () => {
    const config = createStagehandConfig({
      ...BASE_CONFIG,
      stagehand_model_name: "gpt-4o-mini",
    });
    expect(config.model.modelName).toBe("gpt-4o-mini");
  });

  it("falls back to primary model when stagehand_model_name is empty", () => {
    const config = createStagehandConfig({
      ...BASE_CONFIG,
      stagehand_model_name: "",
    });
    expect(config.model.modelName).toBe("gpt-4o");
  });

  it("passes endpoint_url as baseURL", () => {
    const config = createStagehandConfig({
      ...BASE_CONFIG,
      endpoint_url: "https://custom.proxy.com/v1",
    });
    expect(config.model.baseURL).toBe("https://custom.proxy.com/v1");
  });

  it("disables pino logging", () => {
    const config = createStagehandConfig(BASE_CONFIG);
    expect(config.disablePino).toBe(true);
  });
});

describe("initStagehand", () => {
  const log = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates and initializes a Stagehand instance", async () => {
    const stagehand = await initStagehand(BASE_CONFIG, log);
    expect(stagehand).toBeDefined();
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("Initializing Stagehand"),
    );
  });

  it("logs the model name and endpoint", async () => {
    await initStagehand(BASE_CONFIG, log);
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("model=gpt-4o"),
    );
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("endpoint=https://api.openai.com/v1"),
    );
  });

  it("logs the stagehand model when specified", async () => {
    await initStagehand(
      { ...BASE_CONFIG, stagehand_model_name: "gpt-4o-mini" },
      log,
    );
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("model=gpt-4o-mini"),
    );
  });
});

/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import type { AiConfig } from "./model";

function makeConfig(model_name: string): AiConfig {
  return {
    endpoint_url: "https://api.test.com/v1",
    api_key: "test-key",
    model_name,
  };
}

describe("getWorkspaceModel — *-free model guard (C5)", () => {
  it("accepts a normal model name without throwing", async () => {
    const { getWorkspaceModel } = await import("./model");
    const model = getWorkspaceModel(makeConfig("gpt-4o"));
    expect(model).toBeDefined();
  });

  it("rejects a model ending in -free", async () => {
    const { getWorkspaceModel } = await import("./model");
    expect(() => getWorkspaceModel(makeConfig("gpt-4o-free"))).toThrow(/free/i);
  });

  it("rejects an OpenRouter :free suffix", async () => {
    const { getWorkspaceModel } = await import("./model");
    expect(() => getWorkspaceModel(makeConfig("openai/gpt-4o:free"))).toThrow(/free/i);
  });

  it("rejects case-insensitively (FREE uppercase)", async () => {
    const { getWorkspaceModel } = await import("./model");
    expect(() => getWorkspaceModel(makeConfig("GPT-4O-FREE"))).toThrow(/free/i);
  });

  it("rejects a model named just 'free'", async () => {
    const { getWorkspaceModel } = await import("./model");
    expect(() => getWorkspaceModel(makeConfig("free"))).toThrow(/free/i);
  });

  it("accepts a model containing 'free' as a non-suffix substring", async () => {
    const { getWorkspaceModel } = await import("./model");
    const model = getWorkspaceModel(makeConfig("freespeech-v1"));
    expect(model).toBeDefined();
  });
});

import { describe, expect, it } from "vitest";
import { ANALYST_CHAT_PROMPT, createAnalystChatAgent } from "./agents";

describe("ANALYST_CHAT_PROMPT content (AC4)", () => {
  it("is a non-empty string", () => {
    expect(typeof ANALYST_CHAT_PROMPT).toBe("string");
    expect(ANALYST_CHAT_PROMPT.length).toBeGreaterThan(0);
  });

  it("references the Retrieved Codebase Context section so it can ground on it", () => {
    expect(ANALYST_CHAT_PROMPT).toContain("Retrieved Codebase Context");
  });

  it("contains an explicit do-not-fabricate instruction", () => {
    const lower = ANALYST_CHAT_PROMPT.toLowerCase();
    expect(
      lower.includes("fabricate") || lower.includes("do not invent"),
    ).toBe(true);
  });

  it("contains a citation instruction", () => {
    const lower = ANALYST_CHAT_PROMPT.toLowerCase();
    expect(lower.includes("cite") || lower.includes("reference")).toBe(true);
  });

  it("instructs the agent to say when the KB lacks evidence", () => {
    expect(ANALYST_CHAT_PROMPT).toContain("Knowledge Base does not contain");
  });

  it("defines both grounded and ungrounded modes", () => {
    expect(ANALYST_CHAT_PROMPT).toContain("is present");
    expect(ANALYST_CHAT_PROMPT).toContain("is absent");
  });
});

describe("createAnalystChatAgent factory", () => {
  it("returns an agent named 'Analyst Chat' with streamText", async () => {
    const { getWorkspaceModel } = await import("../ai/model");
    const model = getWorkspaceModel({
      endpoint_url: "https://api.example.com/v1",
      api_key: "test-key",
      model_name: "gpt-4",
    });
    const agent = createAnalystChatAgent(model);

    expect(agent).toBeDefined();
    expect(typeof agent.streamText).toBe("function");
    expect(agent.options.name).toBe("Analyst Chat");
  });
});

/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import type { Id } from "../_generated/dataModel";
import { seedFullStack } from "../testHelpers";

interface AiErrorData {
  type: string;
  code: string;
  message: string;
}

const modules = import.meta.glob("../**/*.ts");

describe("AI Error handling", () => {
  it("createAiError throws ConvexError with structured payload", async () => {
    const { createAiError } = await import("./errors");

    try {
      createAiError("invalid_api_key", "The API key is invalid");
      expect.unreachable("Should have thrown");
    } catch (e: unknown) {
      const error = e as { data: AiErrorData };
      expect(error.data).toEqual({
        type: "ai_error",
        code: "invalid_api_key",
        message: "The API key is invalid",
      });
    }
  });

  it("createAiError handles rate_limit code", async () => {
    const { createAiError } = await import("./errors");

    try {
      createAiError("rate_limit", "Rate limit exceeded");
      expect.unreachable("Should have thrown");
    } catch (e: unknown) {
      const error = e as { data: AiErrorData };
      expect(error.data.code).toBe("rate_limit");
      expect(error.data.type).toBe("ai_error");
    }
  });

  it("createAiError handles timeout code", async () => {
    const { createAiError } = await import("./errors");

    try {
      createAiError("timeout", "Request timed out after 30s");
      expect.unreachable("Should have thrown");
    } catch (e: unknown) {
      const error = e as { data: AiErrorData };
      expect(error.data.code).toBe("timeout");
      expect(error.data.type).toBe("ai_error");
    }
  });

  it("createAiError handles malformed_response code", async () => {
    const { createAiError } = await import("./errors");

    try {
      createAiError("malformed_response", "Could not parse AI response");
      expect.unreachable("Should have thrown");
    } catch (e: unknown) {
      const error = e as { data: AiErrorData };
      expect(error.data.code).toBe("malformed_response");
      expect(error.data.type).toBe("ai_error");
    }
  });
});

describe("AI Model bootstrapping", () => {
  it("getWorkspaceAiConfig internal query returns ai_config from workspace", async () => {
    const t = convexTest(schema, modules);
    const { workspaceId } = await seedFullStack(t);

    const config = await t.run(async (ctx) => {
      const { getWorkspaceAiConfig } = await import("./model");
      return getWorkspaceAiConfig(ctx, workspaceId);
    });

    expect(config).toEqual({
      endpoint_url: "https://api.example.com",
      api_key: "key123",
      model_name: "gpt-4",
    });
  });

  it("getWorkspaceAiConfig throws for missing workspace", async () => {
    const t = convexTest(schema, modules);

    await expect(
      t.run(async (ctx) => {
        const { getWorkspaceAiConfig } = await import("./model");
        return getWorkspaceAiConfig(ctx, "00000000000000000000000000000000" as Id<"workspaces">);
      }),
    ).rejects.toThrow();
  });

  it("getWorkspaceModel creates an AI SDK model with workspace config", async () => {
    const { getWorkspaceModel } = await import("./model");

    const model = getWorkspaceModel({
      endpoint_url: "https://api.example.com/v1",
      api_key: "sk-test-key-123",
      model_name: "gpt-4",
    });

    expect(model).toBeDefined();
    expect(model).not.toBeNull();
  });
});

describe("Agent definitions", () => {
  it("createTestGenerationAgent creates agent with correct name and prompt", async () => {
    const { createTestGenerationAgent, TEST_GENERATION_PROMPT } = await import("./agents");
    const { getWorkspaceModel } = await import("./model");

    const model = getWorkspaceModel({
      endpoint_url: "https://api.example.com/v1",
      api_key: "test-key-not-real",
      model_name: "gpt-4",
    });
    const agent = createTestGenerationAgent(model);

    expect(agent).toBeDefined();
    expect(agent.options.name).toBe("Test Generation");
    expect(agent.options.instructions).toBe(TEST_GENERATION_PROMPT);
    expect(agent.options.languageModel).toBeDefined();
  });

  it("createExplorationAnalysisAgent creates agent with correct name", async () => {
    const { createExplorationAnalysisAgent } = await import("./agents");
    const { getWorkspaceModel } = await import("./model");

    const model = getWorkspaceModel({
      endpoint_url: "https://api.example.com/v1",
      api_key: "test-key-not-real",
      model_name: "gpt-4",
    });
    const agent = createExplorationAnalysisAgent(model);

    expect(agent).toBeDefined();
    expect(agent.options.name).toBe("Exploration Analysis");
  });

  it("createFailureAnalysisAgent creates agent with correct name", async () => {
    const { createFailureAnalysisAgent } = await import("./agents");
    const { getWorkspaceModel } = await import("./model");

    const model = getWorkspaceModel({
      endpoint_url: "https://api.example.com/v1",
      api_key: "test-key-not-real",
      model_name: "gpt-4",
    });
    const agent = createFailureAnalysisAgent(model);

    expect(agent).toBeDefined();
    expect(agent.options.name).toBe("Failure Analysis");
  });
});

describe("Agent zod schemas", () => {
  it("exploration scenario schema validates correct shape", async () => {
    const { explorationScenarioSchema } = await import("./agents");

    const valid = {
      name: "Login Flow",
      description: "User logs in",
      flowSummary: "Navigate → Enter → Submit",
    };
    expect(explorationScenarioSchema.safeParse(valid).success).toBe(true);
  });

  it("exploration scenario schema rejects missing fields", async () => {
    const { explorationScenarioSchema } = await import("./agents");

    const result = explorationScenarioSchema.safeParse({ name: "Test" });
    expect(result.success).toBe(false);
  });

  it("failure analysis schema validates correct shape", async () => {
    const { failureAnalysisSchema } = await import("./agents");

    const valid = {
      rootCause: "Element not found",
      suggestedFix: "Add waitForSelector",
      confidenceScore: 0.85,
    };
    expect(failureAnalysisSchema.safeParse(valid).success).toBe(true);
  });

  it("failure analysis schema rejects invalid confidenceScore", async () => {
    const { failureAnalysisSchema } = await import("./agents");

    const result = failureAnalysisSchema.safeParse({
      rootCause: "Element not found",
      suggestedFix: "Add waitForSelector",
      confidenceScore: 1.5,
    });
    expect(result.success).toBe(false);
  });

  it("failure analysis schema rejects missing fields", async () => {
    const { failureAnalysisSchema } = await import("./agents");

    const result = failureAnalysisSchema.safeParse({ rootCause: "x" });
    expect(result.success).toBe(false);
  });
});

describe("Response parsing", () => {
  it("extracts Playwright code from markdown fence", async () => {
    const { extractPlaywrightCode } = await import("./agents");

    const response = `Here is the test:\n\n\`\`\`typescript\nimport { test, expect } from '@playwright/test';\n\ntest('login', async ({ page }) => {\n  await page.goto('/login');\n});\n\`\`\`\n\nThat should work!`;
    const code = extractPlaywrightCode(response);
    expect(code).toContain("import { test, expect } from '@playwright/test'");
    expect(code).toContain("await page.goto('/login')");
  });

  it("extractPlaywrightCode returns null for no code fence", async () => {
    const { extractPlaywrightCode } = await import("./agents");

    const code = extractPlaywrightCode("No code here, just text.");
    expect(code).toBeNull();
  });

  it("extractPlaywrightCode handles multiple fences, picks first", async () => {
    const { extractPlaywrightCode } = await import("./agents");

    const response = "```typescript\ncode1\n```\n```javascript\ncode2\n```";
    const code = extractPlaywrightCode(response);
    expect(code).toBe("code1");
  });
});

describe("Agent tools", () => {
  it("readExistingTests tool returns tests for a suite from test DB", async () => {
    const t = convexTest(schema, modules);
    const { suiteId } = await seedFullStack(t);

    const results = await t.run(async (ctx) => {
      const { readExistingTestsLogic } = await import("./tools/logic");
      return readExistingTestsLogic(ctx, suiteId);
    });

    expect(Array.isArray(results)).toBe(true);
    expect(results).toHaveLength(1);
    expect(results[0]).toHaveProperty("name", "Test Case");
    expect(results[0].playwright_code).toContain("@playwright/test");
  });

  it("readProjectContext tool returns project data from test DB", async () => {
    const t = convexTest(schema, modules);
    const { projectId } = await seedFullStack(t);

    const result = await t.run(async (ctx) => {
      const { readProjectContextLogic } = await import("./tools/logic");
      return readProjectContextLogic(ctx, projectId);
    });

    expect(result).toBeDefined();
    expect(result).toHaveProperty("name", "Test Project");
    expect(result).toHaveProperty("app_url", "https://example.com");
  });

  it("readTestCode tool returns test code from test DB", async () => {
    const t = convexTest(schema, modules);
    const { testId } = await seedFullStack(t);

    const result = await t.run(async (ctx) => {
      const { readTestCodeLogic } = await import("./tools/logic");
      return readTestCodeLogic(ctx, testId);
    });

    expect(result).toBeDefined();
    expect(result!.playwright_code).toContain("@playwright/test");
    expect(result).toHaveProperty("name", "Test Case");
  });

  it("readExistingTests returns empty array for unknown suite", async () => {
    const t = convexTest(schema, modules);
    await seedFullStack(t);

    const results = await t.run(async (ctx) => {
      const { readExistingTestsLogic } = await import("./tools/logic");
      return readExistingTestsLogic(ctx, "00000000000000000000000000000000" as Id<"suites">);
    });

    expect(results).toEqual([]);
  });

  it("readTestCode returns null for unknown test", async () => {
    const t = convexTest(schema, modules);
    await seedFullStack(t);

    const result = await t.run(async (ctx) => {
      const { readTestCodeLogic } = await import("./tools/logic");
      return readTestCodeLogic(ctx, "00000000000000000000000000000000" as Id<"tests">);
    });

    expect(result).toBeNull();
  });

  it("readPreviousExplorations stub returns empty array", async () => {
    const { readPreviousExplorationsLogic } = await import("./tools/logic");
    const result = readPreviousExplorationsLogic();
    expect(result).toEqual([]);
  });

  it("readRecentFailures stub returns empty array", async () => {
    const { readRecentFailuresLogic } = await import("./tools/logic");
    const result = readRecentFailuresLogic();
    expect(result).toEqual([]);
  });
});

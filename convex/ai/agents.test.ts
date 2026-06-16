/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import type { Id } from "../_generated/dataModel";
import { seedFullStack, seedWorkspace, seedProject, seedKnowledgeBase, seedModule, seedBaselineRd } from "../testHelpers";

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

  it("createTestGenerationAgent tool set includes readKnowledgeBase", async () => {
    const { createTestGenerationAgent } = await import("./agents");
    const { getWorkspaceModel } = await import("./model");

    const model = getWorkspaceModel({
      endpoint_url: "https://api.example.com/v1",
      api_key: "test-key-not-real",
      model_name: "gpt-4",
    });
    const agent = createTestGenerationAgent(model);

    expect(Object.keys(agent.options.tools ?? {})).toContain("readKnowledgeBase");
    expect(Object.keys(agent.options.tools ?? {})).toContain("readProjectContext");
  });

  it("createTestGenerationAgent tool set includes readBaselineRd", async () => {
    const { createTestGenerationAgent } = await import("./agents");
    const { getWorkspaceModel } = await import("./model");

    const model = getWorkspaceModel({
      endpoint_url: "https://api.example.com/v1",
      api_key: "test-key-not-real",
      model_name: "gpt-4",
    });
    const agent = createTestGenerationAgent(model);

    expect(Object.keys(agent.options.tools ?? {})).toContain("readBaselineRd");
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
      area: "Authentication",
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

  describe("readKnowledgeBase", () => {
    it("returns full KB shape with content for a ready KB and modules", async () => {
      const t = convexTest(schema, modules);
      const workspaceId = await seedWorkspace(t);
      const projectId = await seedProject(t, workspaceId);
      const kbId = await seedKnowledgeBase(t, workspaceId, projectId, {
        status: "ready",
        architecture_summary: "Modular monolith with auth + billing.",
        tech_stack: ["Next.js", "Convex"],
        architecture_type: "modular monolith",
      });
      await seedModule(t, workspaceId, kbId, {
        name: "Auth Module",
        description: "Handles login and sessions.",
        file_count: 8,
        dependencies: ["User Module", "Core Module"],
        apis: { endpoints: [{ path: "/api/login", method: "POST" }] },
        data_models: { tables: ["sessions"] },
        user_flows: { flows: ["login"] },
      });
      await seedModule(t, workspaceId, kbId, {
        name: "Billing Module",
        dependencies: [],
      });

      const result = await t.run(async (ctx) => {
        const { readKnowledgeBaseLogic } = await import("./tools/logic");
        return readKnowledgeBaseLogic(ctx, projectId as Id<"projects">);
      });

      expect(result).not.toBeNull();
      expect(result!.architecture_summary).toBe("Modular monolith with auth + billing.");
      expect(result!.tech_stack).toEqual(["Next.js", "Convex"]);
      expect(result!.architecture_type).toBe("modular monolith");
      expect(result!.modules).toHaveLength(2);
      expect(result!.modules[0].name).toBe("Auth Module");
      expect(result!.modules[0].description).toBe("Handles login and sessions.");
      expect(result!.modules[0].file_count).toBe(8);
      expect(result!.modules[0].dependencies).toEqual(["User Module", "Core Module"]);
      expect(result!.modules[0].apis).toEqual({ endpoints: [{ path: "/api/login", method: "POST" }] });
      expect(result!.modules[0].data_models).toEqual({ tables: ["sessions"] });
      expect(result!.modules[0].user_flows).toEqual({ flows: ["login"] });
      expect(result!.modules[1].name).toBe("Billing Module");
      expect(result!.modules[1].dependencies).toEqual([]);
    });

    it("returns null when project has no knowledge_bases row", async () => {
      const t = convexTest(schema, modules);
      const workspaceId = await seedWorkspace(t);
      const projectId = await seedProject(t, workspaceId);

      const result = await t.run(async (ctx) => {
        const { readKnowledgeBaseLogic } = await import("./tools/logic");
        return readKnowledgeBaseLogic(ctx, projectId as Id<"projects">);
      });

      expect(result).toBeNull();
    });

    it("returns null when latest KB status is building", async () => {
      const t = convexTest(schema, modules);
      const workspaceId = await seedWorkspace(t);
      const projectId = await seedProject(t, workspaceId);
      await seedKnowledgeBase(t, workspaceId, projectId, { status: "building" });

      const result = await t.run(async (ctx) => {
        const { readKnowledgeBaseLogic } = await import("./tools/logic");
        return readKnowledgeBaseLogic(ctx, projectId as Id<"projects">);
      });

      expect(result).toBeNull();
    });

    it("returns null when latest KB status is error", async () => {
      const t = convexTest(schema, modules);
      const workspaceId = await seedWorkspace(t);
      const projectId = await seedProject(t, workspaceId);
      await seedKnowledgeBase(t, workspaceId, projectId, { status: "error" });

      const result = await t.run(async (ctx) => {
        const { readKnowledgeBaseLogic } = await import("./tools/logic");
        return readKnowledgeBaseLogic(ctx, projectId as Id<"projects">);
      });

      expect(result).toBeNull();
    });

    it("returns modules: [] (not null) when KB ready but has zero modules", async () => {
      const t = convexTest(schema, modules);
      const workspaceId = await seedWorkspace(t);
      const projectId = await seedProject(t, workspaceId);
      await seedKnowledgeBase(t, workspaceId, projectId, {
        status: "ready",
        architecture_summary: "Empty KB.",
      });

      const result = await t.run(async (ctx) => {
        const { readKnowledgeBaseLogic } = await import("./tools/logic");
        return readKnowledgeBaseLogic(ctx, projectId as Id<"projects">);
      });

      expect(result).not.toBeNull();
      expect(result!.modules).toEqual([]);
      expect(result!.architecture_summary).toBe("Empty KB.");
    });

    it("picks the latest KB when multiple ready KBs exist", async () => {
      const t = convexTest(schema, modules);
      const workspaceId = await seedWorkspace(t);
      const projectId = await seedProject(t, workspaceId);
      await seedKnowledgeBase(t, workspaceId, projectId, {
        status: "ready",
        architecture_summary: "Older summary",
        last_synced_at: 1000,
      });
      await seedKnowledgeBase(t, workspaceId, projectId, {
        status: "ready",
        architecture_summary: "Newer summary",
        last_synced_at: 2000,
      });

      const result = await t.run(async (ctx) => {
        const { readKnowledgeBaseLogic } = await import("./tools/logic");
        return readKnowledgeBaseLogic(ctx, projectId as Id<"projects">);
      });

      expect(result).not.toBeNull();
      expect(result!.architecture_summary).toBe("Newer summary");
    });

    it("returns null for a non-existent project_id", async () => {
      const t = convexTest(schema, modules);
      await seedWorkspace(t);

      const result = await t.run(async (ctx) => {
        const { readKnowledgeBaseLogic } = await import("./tools/logic");
        return readKnowledgeBaseLogic(ctx, "00000000000000000000000000000000" as Id<"projects">);
      });

      expect(result).toBeNull();
    });
  });

  describe("readBaselineRd", () => {
    it("returns full RD shape with content for an approved RD", async () => {
      const t = convexTest(schema, modules);
      const workspaceId = await seedWorkspace(t);
      const projectId = await seedProject(t, workspaceId);
      const kbId = await seedKnowledgeBase(t, workspaceId, projectId);
      await seedBaselineRd(t, workspaceId, projectId, kbId, {
        status: "approved",
        version: 2,
        sections: [
          { id: "overview", title: "Overview", content: "Auth + billing app.", confidence: 0.82 },
        ],
      });

      const result = await t.run(async (ctx) => {
        const { readBaselineRdLogic } = await import("./tools/logic");
        return readBaselineRdLogic(ctx, projectId as Id<"projects">);
      });

      expect(result).not.toBeNull();
      expect(result!.version).toBe(2);
      expect(result!.status).toBe("approved");
      expect(result!.sections).toHaveLength(1);
      expect(result!.sections[0].id).toBe("overview");
      expect(result!.sections[0].title).toBe("Overview");
      expect(result!.sections[0].content).toBe("Auth + billing app.");
      expect(result!.sections[0].confidence).toBe(0.82);
    });

    it("returns full shape for a draft RD (default seed status — no over-filtering to approved-only)", async () => {
      const t = convexTest(schema, modules);
      const workspaceId = await seedWorkspace(t);
      const projectId = await seedProject(t, workspaceId);
      const kbId = await seedKnowledgeBase(t, workspaceId, projectId);
      await seedBaselineRd(t, workspaceId, projectId, kbId, {
        status: "draft",
        version: 1,
        sections: [{ id: "overview", title: "Overview", content: "Draft overview.", confidence: 0.6 }],
      });

      const result = await t.run(async (ctx) => {
        const { readBaselineRdLogic } = await import("./tools/logic");
        return readBaselineRdLogic(ctx, projectId as Id<"projects">);
      });

      expect(result).not.toBeNull();
      expect(result!.status).toBe("draft");
    });

    it("returns null when project has no baseline_rds row", async () => {
      const t = convexTest(schema, modules);
      const workspaceId = await seedWorkspace(t);
      const projectId = await seedProject(t, workspaceId);
      await seedKnowledgeBase(t, workspaceId, projectId);

      const result = await t.run(async (ctx) => {
        const { readBaselineRdLogic } = await import("./tools/logic");
        return readBaselineRdLogic(ctx, projectId as Id<"projects">);
      });

      expect(result).toBeNull();
    });

    it("returns null when all RDs are archived", async () => {
      const t = convexTest(schema, modules);
      const workspaceId = await seedWorkspace(t);
      const projectId = await seedProject(t, workspaceId);
      const kbId = await seedKnowledgeBase(t, workspaceId, projectId);
      await seedBaselineRd(t, workspaceId, projectId, kbId, {
        status: "archived",
        version: 1,
        sections: [{ id: "overview", title: "Overview", content: "Old.", confidence: 0.5 }],
      });

      const result = await t.run(async (ctx) => {
        const { readBaselineRdLogic } = await import("./tools/logic");
        return readBaselineRdLogic(ctx, projectId as Id<"projects">);
      });

      expect(result).toBeNull();
    });

    it("returns null when all RDs are failed", async () => {
      const t = convexTest(schema, modules);
      const workspaceId = await seedWorkspace(t);
      const projectId = await seedProject(t, workspaceId);
      const kbId = await seedKnowledgeBase(t, workspaceId, projectId);
      await seedBaselineRd(t, workspaceId, projectId, kbId, {
        status: "failed",
        version: 1,
        sections: [{ id: "overview", title: "Overview", content: "Broken.", confidence: 0.3 }],
      });

      const result = await t.run(async (ctx) => {
        const { readBaselineRdLogic } = await import("./tools/logic");
        return readBaselineRdLogic(ctx, projectId as Id<"projects">);
      });

      expect(result).toBeNull();
    });

    it("picks the latest version when multiple usable RDs exist", async () => {
      const t = convexTest(schema, modules);
      const workspaceId = await seedWorkspace(t);
      const projectId = await seedProject(t, workspaceId);
      const kbId = await seedKnowledgeBase(t, workspaceId, projectId);
      await seedBaselineRd(t, workspaceId, projectId, kbId, {
        status: "approved",
        version: 1,
        sections: [{ id: "overview", title: "Overview", content: "v1 overview", confidence: 0.7 }],
      });
      await seedBaselineRd(t, workspaceId, projectId, kbId, {
        status: "approved",
        version: 2,
        sections: [{ id: "overview", title: "Overview", content: "v2 overview", confidence: 0.9 }],
      });

      const result = await t.run(async (ctx) => {
        const { readBaselineRdLogic } = await import("./tools/logic");
        return readBaselineRdLogic(ctx, projectId as Id<"projects">);
      });

      expect(result).not.toBeNull();
      expect(result!.version).toBe(2);
      expect(result!.sections[0].content).toBe("v2 overview");
    });

    it("skips archived/failed at the top, picks the next usable RD", async () => {
      const t = convexTest(schema, modules);
      const workspaceId = await seedWorkspace(t);
      const projectId = await seedProject(t, workspaceId);
      const kbId = await seedKnowledgeBase(t, workspaceId, projectId);
      await seedBaselineRd(t, workspaceId, projectId, kbId, {
        status: "approved",
        version: 2,
        sections: [{ id: "overview", title: "Overview", content: "v2 overview", confidence: 0.9 }],
      });
      await seedBaselineRd(t, workspaceId, projectId, kbId, {
        status: "failed",
        version: 3,
        sections: [{ id: "overview", title: "Overview", content: "v3 broken", confidence: 0.1 }],
      });

      const result = await t.run(async (ctx) => {
        const { readBaselineRdLogic } = await import("./tools/logic");
        return readBaselineRdLogic(ctx, projectId as Id<"projects">);
      });

      expect(result).not.toBeNull();
      expect(result!.version).toBe(2);
      expect(result!.sections[0].content).toBe("v2 overview");
    });

    it("passes through divergence_note + bmad_alignment on the seeded section", async () => {
      const t = convexTest(schema, modules);
      const workspaceId = await seedWorkspace(t);
      const projectId = await seedProject(t, workspaceId);
      const kbId = await seedKnowledgeBase(t, workspaceId, projectId);
      await seedBaselineRd(t, workspaceId, projectId, kbId, {
        status: "approved",
        version: 1,
        sections: [
          {
            id: "tech-stack",
            title: "Tech Stack",
            content: "Next.js + Convex.",
            confidence: 0.75,
            divergence_note: "PRD mentions Vue.",
            bmad_alignment: { prd_section_title: "Tech Stack", agreement: "diverge" },
          },
        ],
      });

      const result = await t.run(async (ctx) => {
        const { readBaselineRdLogic } = await import("./tools/logic");
        return readBaselineRdLogic(ctx, projectId as Id<"projects">);
      });

      expect(result).not.toBeNull();
      const section = result!.sections.find((s) => s.id === "tech-stack");
      expect(section).toBeDefined();
      expect(section!.divergence_note).toBe("PRD mentions Vue.");
      expect(section!.bmad_alignment?.prd_section_title).toBe("Tech Stack");
      expect(section!.bmad_alignment?.agreement).toBe("diverge");
    });

    it("returns null for a non-existent project_id", async () => {
      const t = convexTest(schema, modules);
      await seedWorkspace(t);

      const result = await t.run(async (ctx) => {
        const { readBaselineRdLogic } = await import("./tools/logic");
        return readBaselineRdLogic(ctx, "00000000000000000000000000000000" as Id<"projects">);
      });

      expect(result).toBeNull();
    });
  });
});

describe("Prompt content snapshots", () => {
  it("TEST_GENERATION_PROMPT contains key rules", async () => {
    const { TEST_GENERATION_PROMPT } = await import("./agents");

    expect(TEST_GENERATION_PROMPT).toContain("Duplicate Element Rules");
    expect(TEST_GENERATION_PROMPT).toContain(".nth(");
    expect(TEST_GENERATION_PROMPT).toContain("Landmark");
    expect(TEST_GENERATION_PROMPT).toContain("strict mode violation");
    expect(TEST_GENERATION_PROMPT).toContain("Grounding Rules");
    expect(TEST_GENERATION_PROMPT).toContain("Form Submission Resilience");
  });

  it("TEST_HEALING_PROMPT contains key rules", async () => {
    const { TEST_HEALING_PROMPT } = await import("./agents");

    expect(TEST_HEALING_PROMPT).toContain("Strict Mode Violation Rules");
    expect(TEST_HEALING_PROMPT).toContain("Test Intent Preservation");
    expect(TEST_HEALING_PROMPT).toContain("Root Cause Analysis");
  });

  it("createHealAgent uses combined generation + healing prompts", async () => {
    const { createHealAgent, TEST_GENERATION_PROMPT, TEST_HEALING_PROMPT } = await import("./agents");
    const { getWorkspaceModel } = await import("./model");

    const model = getWorkspaceModel({
      endpoint_url: "https://api.example.com/v1",
      api_key: "test-key",
      model_name: "gpt-4",
    });
    const agent = createHealAgent(model);

    expect(agent.options.instructions).toBe(`${TEST_GENERATION_PROMPT}\n\n${TEST_HEALING_PROMPT}`);
  });

  it("createRefineAgent uses combined generation + refinement prompts", async () => {
    const { createRefineAgent, TEST_GENERATION_PROMPT, TEST_REFINEMENT_PROMPT } = await import("./agents");
    const { getWorkspaceModel } = await import("./model");

    const model = getWorkspaceModel({
      endpoint_url: "https://api.example.com/v1",
      api_key: "test-key",
      model_name: "gpt-4",
    });
    const agent = createRefineAgent(model);

    expect(agent.options.instructions).toBe(`${TEST_GENERATION_PROMPT}\n\n${TEST_REFINEMENT_PROMPT}`);
  });

  it("buildPrdGenerationPrompt injects projectId + readKnowledgeBase hint when projectId provided", async () => {
    const { buildPrdGenerationPrompt } = await import("./agents");

    const prompt = buildPrdGenerationPrompt({
      projectName: "P",
      appUrl: "https://example.com",
      authContext: "",
      prdText: "prd",
      snapshotContext: "",
      retryContext: "",
      projectId: "abc123",
    });

    expect(prompt).toContain("Project ID: abc123");
    expect(prompt).toContain("readKnowledgeBase");
  });

  it("buildPrdGenerationPrompt omits readKnowledgeBase when projectId omitted", async () => {
    const { buildPrdGenerationPrompt } = await import("./agents");

    const prompt = buildPrdGenerationPrompt({
      projectName: "P",
      appUrl: "https://example.com",
      authContext: "",
      prdText: "prd",
      snapshotContext: "",
      retryContext: "",
    });

    expect(prompt).not.toContain("readKnowledgeBase");
    expect(prompt).not.toContain("Project ID:");
  });

  it("buildPrdGenerationPrompt omits readKnowledgeBase when projectId is empty string", async () => {
    const { buildPrdGenerationPrompt } = await import("./agents");

    const prompt = buildPrdGenerationPrompt({
      projectName: "P",
      appUrl: "https://example.com",
      authContext: "",
      prdText: "prd",
      snapshotContext: "",
      retryContext: "",
      projectId: "",
    });

    expect(prompt).not.toContain("readKnowledgeBase");
  });

  it("buildNlGenerationPrompt injects projectId + readKnowledgeBase hint when projectId provided", async () => {
    const { buildNlGenerationPrompt } = await import("./agents");

    const prompt = buildNlGenerationPrompt({
      projectName: "P",
      appUrl: "https://example.com",
      authContext: "",
      prdContext: "",
      snapshotContext: "",
      retryContext: "",
      prompt: "do a thing",
      projectId: "xyz789",
    });

    expect(prompt).toContain("Project ID: xyz789");
    expect(prompt).toContain("readKnowledgeBase");
  });

  it("buildNlGenerationPrompt omits readKnowledgeBase when projectId omitted", async () => {
    const { buildNlGenerationPrompt } = await import("./agents");

    const prompt = buildNlGenerationPrompt({
      projectName: "P",
      appUrl: "https://example.com",
      authContext: "",
      prdContext: "",
      snapshotContext: "",
      retryContext: "",
      prompt: "do a thing",
    });

    expect(prompt).not.toContain("readKnowledgeBase");
  });

  it("buildPrdFormatRetryPrompt does not reference readKnowledgeBase", async () => {
    const { buildPrdFormatRetryPrompt } = await import("./agents");

    const prompt = buildPrdFormatRetryPrompt({
      projectName: "P",
      appUrl: "https://example.com",
      authContext: "",
      prdText: "prd",
      snapshotContext: "",
    });

    expect(prompt).not.toContain("readKnowledgeBase");
    expect(prompt).not.toContain("Project ID:");
  });

  it("buildNlFormatRetryPrompt does not reference readKnowledgeBase", async () => {
    const { buildNlFormatRetryPrompt } = await import("./agents");

    const prompt = buildNlFormatRetryPrompt({
      projectName: "P",
      appUrl: "https://example.com",
      authContext: "",
      prdContext: "",
      snapshotContext: "",
      prompt: "do a thing",
    });

    expect(prompt).not.toContain("readKnowledgeBase");
    expect(prompt).not.toContain("Project ID:");
  });

  it("buildPrdGenerationPrompt injects readBaselineRd hint alongside readKnowledgeBase when projectId provided", async () => {
    const { buildPrdGenerationPrompt } = await import("./agents");

    const prompt = buildPrdGenerationPrompt({
      projectName: "P",
      appUrl: "https://example.com",
      authContext: "",
      prdText: "prd",
      snapshotContext: "",
      retryContext: "",
      projectId: "abc123",
    });

    expect(prompt).toContain("Project ID: abc123");
    expect(prompt).toContain("readKnowledgeBase");
    expect(prompt).toContain("readBaselineRd");
  });

  it("buildPrdGenerationPrompt omits readBaselineRd when projectId omitted", async () => {
    const { buildPrdGenerationPrompt } = await import("./agents");

    const prompt = buildPrdGenerationPrompt({
      projectName: "P",
      appUrl: "https://example.com",
      authContext: "",
      prdText: "prd",
      snapshotContext: "",
      retryContext: "",
    });

    expect(prompt).not.toContain("readBaselineRd");
  });

  it("buildPrdGenerationPrompt omits readBaselineRd when projectId is empty string", async () => {
    const { buildPrdGenerationPrompt } = await import("./agents");

    const prompt = buildPrdGenerationPrompt({
      projectName: "P",
      appUrl: "https://example.com",
      authContext: "",
      prdText: "prd",
      snapshotContext: "",
      retryContext: "",
      projectId: "",
    });

    expect(prompt).not.toContain("readBaselineRd");
  });

  it("buildNlGenerationPrompt injects readBaselineRd hint alongside readKnowledgeBase when projectId provided", async () => {
    const { buildNlGenerationPrompt } = await import("./agents");

    const prompt = buildNlGenerationPrompt({
      projectName: "P",
      appUrl: "https://example.com",
      authContext: "",
      prdContext: "",
      snapshotContext: "",
      retryContext: "",
      prompt: "do a thing",
      projectId: "xyz789",
    });

    expect(prompt).toContain("Project ID: xyz789");
    expect(prompt).toContain("readKnowledgeBase");
    expect(prompt).toContain("readBaselineRd");
  });

  it("buildNlGenerationPrompt omits readBaselineRd when projectId omitted", async () => {
    const { buildNlGenerationPrompt } = await import("./agents");

    const prompt = buildNlGenerationPrompt({
      projectName: "P",
      appUrl: "https://example.com",
      authContext: "",
      prdContext: "",
      snapshotContext: "",
      retryContext: "",
      prompt: "do a thing",
    });

    expect(prompt).not.toContain("readBaselineRd");
  });

  it("buildPrdFormatRetryPrompt does not reference readBaselineRd", async () => {
    const { buildPrdFormatRetryPrompt } = await import("./agents");

    const prompt = buildPrdFormatRetryPrompt({
      projectName: "P",
      appUrl: "https://example.com",
      authContext: "",
      prdText: "prd",
      snapshotContext: "",
    });

    expect(prompt).not.toContain("readBaselineRd");
    expect(prompt).not.toContain("Project ID:");
  });

  it("buildNlFormatRetryPrompt does not reference readBaselineRd", async () => {
    const { buildNlFormatRetryPrompt } = await import("./agents");

    const prompt = buildNlFormatRetryPrompt({
      projectName: "P",
      appUrl: "https://example.com",
      authContext: "",
      prdContext: "",
      snapshotContext: "",
      prompt: "do a thing",
    });

    expect(prompt).not.toContain("readBaselineRd");
    expect(prompt).not.toContain("Project ID:");
  });
});

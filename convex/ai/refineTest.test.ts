/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { seedFullStack } from "../testHelpers";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";

const modules = import.meta.glob("../**/*.ts");

describe("Refine Agent", () => {
  it("createRefineAgent creates agent with correct name and prompt", async () => {
    const { createRefineAgent, TEST_REFINEMENT_PROMPT } = await import("./agents");
    const { getWorkspaceModel } = await import("./model");

    const model = getWorkspaceModel({
      endpoint_url: "https://api.example.com/v1",
      api_key: "test-key-not-real",
      model_name: "gpt-4",
    });
    const agent = createRefineAgent(model);

    expect(agent).toBeDefined();
    expect(agent.options.name).toBe("Test Refinement");
    expect(agent.options.instructions).toBe(TEST_REFINEMENT_PROMPT);
  });

  it("TEST_REFINEMENT_PROMPT contains key rules", async () => {
    const { TEST_REFINEMENT_PROMPT } = await import("./agents");

    expect(TEST_REFINEMENT_PROMPT).toContain("Test Refinement Agent");
    expect(TEST_REFINEMENT_PROMPT).toContain("Apply the user's requested change precisely");
    expect(TEST_REFINEMENT_PROMPT).toContain("FULL modified test code");
    expect(TEST_REFINEMENT_PROMPT).toContain("---CHANGES---");
    expect(TEST_REFINEMENT_PROMPT).toContain("---END CHANGES---");
  });
});

describe("Refine Test - diff computation", () => {
  it("computeDiff returns empty string for identical code", async () => {
    const { computeDiff } = await import("./diff");

    const code = "line1\nline2\nline3";
    const result = computeDiff(code, code);
    expect(result).toBe("");
  });

  it("computeDiff shows additions", async () => {
    const { computeDiff } = await import("./diff");

    const result = computeDiff("line1\nline2", "line1\nline2\nline3");
    expect(result).toContain("+ line3");
    expect(result).not.toContain("- line3");
  });

  it("computeDiff shows removals", async () => {
    const { computeDiff } = await import("./diff");

    const result = computeDiff("line1\nline2\nline3", "line1\nline3");
    expect(result).toContain("- line2");
  });

  it("computeDiff shows modifications", async () => {
    const { computeDiff } = await import("./diff");

    const result = computeDiff("old line", "new line");
    expect(result).toContain("- old line");
    expect(result).toContain("+ new line");
  });
});

describe("Refine Test - applyRefinement via updateTestCode", () => {
  it("applies playwright_code update via direct DB patch", async () => {
    const t = convexTest(schema, modules);
    const { testId } = await seedFullStack(t);

    const testBefore = await t.run(async (ctx) => {
      return ctx.db.get(testId);
    });
    expect(testBefore?.playwright_code).toContain("@playwright/test");

    await t.run(async (ctx) => {
      await ctx.db.patch(testId, {
        playwright_code: "updated code",
        status: "draft",
      });
    });

    const testAfter = await t.run(async (ctx) => {
      return ctx.db.get(testId);
    });
    expect(testAfter?.playwright_code).toBe("updated code");
    expect(testAfter?.status).toBe("draft");
  });

  it("applies steps update via direct DB patch", async () => {
    const t = convexTest(schema, modules);
    const { testId } = await seedFullStack(t);

    const steps = [
      { instruction: "Navigate to /login" },
      { instruction: "Click submit button", assertion_code: "expect(btn).toBeEnabled()" },
    ];

    await t.run(async (ctx) => {
      await ctx.db.patch(testId, {
        steps,
        status: "draft",
      });
    });

    const testAfter = await t.run(async (ctx) => {
      return ctx.db.get(testId);
    });
    expect(testAfter?.steps).toHaveLength(2);
    expect(testAfter?.steps?.[0]?.instruction).toBe("Navigate to /login");
    expect(testAfter?.status).toBe("draft");
  });
});

describe("Refine Test - input validation", () => {
  it("refineTest rejects missing test", async () => {
    const t = convexTest(schema, modules);
    await seedFullStack(t);

    await expect(
      t.action(api.ai.refineTest.refineTest, {
        test_id: "00000000000000000000000000000000" as Id<"tests">,
        message: "Change something",
      }),
    ).rejects.toThrow();
  });
});

describe("resolveTestContext — query chain", () => {
  it("resolves test → suite → project → aiConfig through internal queries", async () => {
    const t = convexTest(schema, modules);
    const { testId, suiteId, projectId, workspaceId } = await seedFullStack(t);

    const test = await t.run(async (ctx) => {
      return ctx.db.get(testId);
    });
    expect(test).toBeDefined();
    expect(test!.name).toBe("Test Case");
    expect(test!.suite_id).toBe(suiteId);

    const suite = await t.run(async (ctx) => {
      return ctx.db.get(suiteId);
    });
    expect(suite).toBeDefined();
    expect(suite!.project_id).toBe(projectId);

    const project = await t.run(async (ctx) => {
      return ctx.db.get(projectId);
    });
    expect(project).toBeDefined();
    expect(project!.workspace_id).toBe(workspaceId);
    expect(project!.app_url).toBe("https://example.com");

    const workspace = await t.run(async (ctx) => {
      return ctx.db.get(workspaceId);
    });
    expect(workspace).toBeDefined();
    expect(workspace!.ai_config.endpoint_url).toBe("https://api.example.com");
    expect(workspace!.ai_config.model_name).toBe("gpt-4");
  });

  it("returns null for nonexistent test via db.get", async () => {
    const t = convexTest(schema, modules);
    await seedFullStack(t);

    const test = await t.run(async (ctx) => {
      return ctx.db.get("00000000000000000000000000000000" as Id<"tests">);
    });
    expect(test).toBeNull();
  });
});

describe("Hybrid steps parsing", () => {
  it("extractJsonFromAiResponse parses valid steps JSON", async () => {
    const { extractJsonFromAiResponse } = await import("./parse");
    const { hybridTestStepSchema } = await import("./agents");
    const { z } = await import("zod/v3");

    const schema = z.array(hybridTestStepSchema);

    const input = JSON.stringify([
      { instruction: "Click the login button" },
      { instruction: "Verify dashboard", assertion_code: "expect(page).toHaveURL('/dashboard')" },
    ]);

    const result = extractJsonFromAiResponse(input, schema);
    expect(result).toHaveLength(2);
    expect(result?.[0]?.instruction).toBe("Click the login button");
    expect(result?.[1]?.assertion_code).toBe("expect(page).toHaveURL('/dashboard')");
  });

  it("extractJsonFromAiResponse handles code-fenced JSON", async () => {
    const { extractJsonFromAiResponse } = await import("./parse");
    const { hybridTestStepSchema } = await import("./agents");
    const { z } = await import("zod/v3");

    const schema = z.array(hybridTestStepSchema);

    const input = "```json\n[{\"instruction\": \"Navigate to /home\"}]\n```";
    const result = extractJsonFromAiResponse(input, schema);
    expect(result).toHaveLength(1);
    expect(result?.[0]?.instruction).toBe("Navigate to /home");
  });

  it("extractJsonFromAiResponse returns null for invalid JSON", async () => {
    const { extractJsonFromAiResponse } = await import("./parse");
    const { hybridTestStepSchema } = await import("./agents");
    const { z } = await import("zod/v3");

    const schema = z.array(hybridTestStepSchema);
    const result = extractJsonFromAiResponse("not json at all", schema);
    expect(result).toBeNull();
  });
});

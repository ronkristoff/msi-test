/// <reference types="vite/client" />
import { describe, expect, it, vi, beforeEach } from "vitest";

const { generateTextMock } = vi.hoisted(() => ({
  generateTextMock: vi.fn<(opts: { prompt: string }) => Promise<{ text: string }>>(async () => ({
    text: "```typescript\ntest('mock test', async () => {});\n```",
  })),
}));

vi.mock("./ai/agents", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./ai/agents")>();
  return {
    ...actual,
    createTestGenerationAgent: () => ({
      createThread: async () => ({
        thread: { generateText: generateTextMock },
      }),
    }),
    createExplorationAnalysisAgent: () => ({
      createThread: async () => ({
        thread: { generateText: generateTextMock },
      }),
    }),
  };
});

vi.mock("./ai/model", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./ai/model")>();
  return {
    ...actual,
    getWorkspaceModel: () => ({}) as never,
  };
});

import { convexTest } from "convex-test";
import schema from "./schema";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { seedWorkspace, seedProject, seedKnowledgeBase, seedModule, seedBaselineRd, seedExploration } from "./testHelpers";

const modules = import.meta.glob("./**/*.ts");

describe("KB context integration", () => {
  beforeEach(() => {
    generateTextMock.mockClear();
  });

  it("PRD action injects KB context block when KB + RD present", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const kbId = await seedKnowledgeBase(t, workspaceId, projectId, {
      status: "ready",
      architecture_type: "monolith",
      tech_stack: ["Next.js"],
      architecture_summary: "Web app.",
    });
    await seedModule(t, workspaceId, kbId, {
      name: "Auth Module",
      description: "Handles auth.",
      apis: [{ path: "/api/login", method: "POST" }],
      user_flows: [{ route: "/dashboard", name: "Dashboard" }],
    });
    await seedBaselineRd(t, workspaceId, projectId, kbId, {
      status: "approved",
      sections: [{ id: "overview", title: "Overview", content: "Auth app.", confidence: 0.85 }],
    });

    await t.action(internal.ai.prdWorkflowActions.generateTestsAction, {
      project_id: projectId as never,
      workspace_id: workspaceId as never,
      prd_text: "Feature: Login",
    });

    expect(generateTextMock).toHaveBeenCalledTimes(1);
    const capturedPrompt = generateTextMock.mock.calls[0][0].prompt;
    expect(capturedPrompt).toContain("## Project Knowledge Context");
    expect(capturedPrompt).toContain("### Knowledge Base");
    expect(capturedPrompt).toContain("Auth Module");
    expect(capturedPrompt).toContain("/api/login");
    expect(capturedPrompt).toContain("### Baseline Requirements Document");
    expect(capturedPrompt).toContain("Overview");
  });

  it("PRD action omits KB context when no KB and no RD (no-op path)", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);

    const result = await t.action(internal.ai.prdWorkflowActions.generateTestsAction, {
      project_id: projectId as never,
      workspace_id: workspaceId as never,
      prd_text: "Feature: Login",
    });

    expect(result).toEqual({ testBlocks: expect.any(Array) });
    expect(generateTextMock).toHaveBeenCalledTimes(1);
    const capturedPrompt = generateTextMock.mock.calls[0][0].prompt;
    expect(capturedPrompt).not.toContain("## Project Knowledge Context");
  });

  it("NL action injects KB context block when KB + RD present", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const kbId = await seedKnowledgeBase(t, workspaceId, projectId, {
      status: "ready",
      architecture_type: "monolith",
      tech_stack: ["React"],
      architecture_summary: "SPA app.",
    });
    await seedModule(t, workspaceId, kbId, {
      name: "Billing Module",
      description: "Handles billing.",
    });
    await seedBaselineRd(t, workspaceId, projectId, kbId, {
      status: "approved",
      sections: [{ id: "billing", title: "Billing", content: "Stripe integration.", confidence: 0.9 }],
    });

    await t.action(internal.ai.nlWorkflowActions.generateTestsAction, {
      project_id: projectId as never,
      workspace_id: workspaceId as never,
      prompt: "Test the billing flow",
    });

    expect(generateTextMock).toHaveBeenCalledTimes(1);
    const capturedPrompt = generateTextMock.mock.calls[0][0].prompt;
    expect(capturedPrompt).toContain("## Project Knowledge Context");
    expect(capturedPrompt).toContain("Billing Module");
  });

  it("exploration analysis injects KB context + computes coverage gaps when KB present", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const kbId = await seedKnowledgeBase(t, workspaceId, projectId, {
      status: "ready",
      architecture_type: "monolith",
      tech_stack: ["Next.js"],
      architecture_summary: "Web app.",
    });
    await seedModule(t, workspaceId, kbId, {
      name: "Auth Module",
      description: "Handles auth.",
    });
    await seedModule(t, workspaceId, kbId, {
      name: "Billing Module",
      description: "Handles billing.",
    });
    const explorationId = await seedExploration(t, workspaceId, projectId, {
      url: "https://example.com",
      status: "captured",
      captured_pages: [
        { url: "https://example.com", title: "Home", structure_text: "Homepage content" },
      ],
    });

    generateTextMock.mockResolvedValueOnce({
      text: JSON.stringify([
        { name: "Login", description: "Test login", flowSummary: "Go to login", area: "Auth", kbModule: "Auth Module" },
      ]),
    });

    await t.action(internal.ai.exploreApp.analyzeExploration, {
      exploration_id: explorationId as never,
    });

    expect(generateTextMock).toHaveBeenCalledTimes(1);
    const capturedPrompt = generateTextMock.mock.calls[0][0].prompt;
    expect(capturedPrompt).toContain("## Project Knowledge Context");
    expect(capturedPrompt).toContain("Auth Module");
    expect(capturedPrompt).toContain("Billing Module");

    const exploration = await t.run(async (ctx) => {
      return ctx.db.get(explorationId as Id<"explorations">);
    });
    expect(exploration?.status).toBe("analyzed");
    expect(exploration?.proposed_scenarios).toHaveLength(1);
    expect(exploration?.proposed_scenarios?.[0].kb_module).toBe("Auth Module");
    expect(exploration?.kb_coverage_gaps).toEqual(["Billing Module"]);
  });

  it("exploration analysis omits KB context and leaves kb_coverage_gaps undefined when no KB (no-regression)", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const explorationId = await seedExploration(t, workspaceId, projectId, {
      url: "https://example.com",
      status: "captured",
      captured_pages: [
        { url: "https://example.com", title: "Home", structure_text: "Homepage content" },
      ],
    });

    generateTextMock.mockResolvedValueOnce({
      text: JSON.stringify([
        { name: "Basic test", description: "Test homepage", flowSummary: "Load page", area: "Navigation" },
      ]),
    });

    await t.action(internal.ai.exploreApp.analyzeExploration, {
      exploration_id: explorationId as never,
    });

    expect(generateTextMock).toHaveBeenCalledTimes(1);
    const capturedPrompt = generateTextMock.mock.calls[0][0].prompt;
    expect(capturedPrompt).not.toContain("## Project Knowledge Context");

    const exploration = await t.run(async (ctx) => {
      return ctx.db.get(explorationId as Id<"explorations">);
    });
    expect(exploration?.status).toBe("analyzed");
    expect(exploration?.kb_coverage_gaps).toBeUndefined();
  });
});

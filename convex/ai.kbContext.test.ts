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
import { seedWorkspace, seedProject, seedKnowledgeBase, seedModule, seedBaselineRd } from "./testHelpers";

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
});

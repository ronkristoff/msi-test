/// <reference types="vite/client" />
import { describe, expect, it, vi, beforeEach } from "vitest";

const { chatRagSearchMock, generateObjectMock } = vi.hoisted(() => ({
  chatRagSearchMock: vi.fn(),
  generateObjectMock: vi.fn(),
}));

vi.mock("./chat/impactAgent", () => ({
  IMPACT_ANALYSIS_PROMPT: "mock impact prompt",
  createImpactAnalysisAgent: () => ({
    continueThread: async () => ({
      thread: {
        generateObject: generateObjectMock,
      },
    }),
  }),
}));

vi.mock("./ai/model", async () => {
  const { mockModel } = await import("@convex-dev/agent");
  return {
    getWorkspaceModel: () =>
      mockModel({
        content: [{ type: "text", text: "mocked" }],
      }),
  };
});

vi.mock("./knowledge/rag", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./knowledge/rag")>();
  return {
    ...actual,
    createProjectRag: () => ({
      add: vi.fn(),
      search: chatRagSearchMock,
    }),
  };
});

import { convexTest } from "convex-test";
import schema from "./schema";
import {
  seedWorkspace,
  seedProject,
  seedChatThread,
  seedKnowledgeBase,
  seedBmadMetadata,
} from "./testHelpers";
import { NoObjectGeneratedError } from "ai";
import type { ImpactAnalysis } from "./chat/impactSchema";
import { impactAnalysisSchema } from "./chat/impactSchema";
import { CHAT_RAG_RATE_LIMIT_PER_MINUTE } from "./lib/constraints";

function mockGenerateObjectResult(object: ImpactAnalysis) {
  return {
    object,
    finishReason: "stop" as const,
    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    warnings: undefined,
    providerMetadata: undefined,
  };
}

const modules = import.meta.glob("./**/*.ts");
const agentSchema = (
  await import("../node_modules/@convex-dev/agent/dist/component/schema.js")
).default;
const agentModules = import.meta.glob(
  "../node_modules/@convex-dev/agent/dist/component/**/*.js",
);
const rateLimiterSchema = (
  await import("../node_modules/@convex-dev/rate-limiter/dist/component/schema.js")
).default;
const rateLimiterModules = import.meta.glob(
  "../node_modules/@convex-dev/rate-limiter/dist/component/**/*.js",
);

function chatTest() {
  const t = convexTest(schema, modules);
  t.registerComponent("agent", agentSchema, agentModules);
  t.registerComponent("rateLimiter", rateLimiterSchema, rateLimiterModules);
  return t;
}

const mockAnalysis: ImpactAnalysis = {
  summary: "Add OAuth login affecting the auth module.",
  affected_modules: [
    { name: "auth", reason: "New OAuth provider", confidence_score: 0.9 },
  ],
  affected_apis: [],
  affected_data_models: [],
  affected_user_flows: [],
  hidden_dependencies: [],
};

async function setupReadyProject(t: ReturnType<typeof chatTest>) {
  const workspaceId = await seedWorkspace(t);
  const projectId = await seedProject(t, workspaceId);
  const kbId = await seedKnowledgeBase(t, workspaceId, projectId, {
    status: "ready",
    bmad_detected: false,
  });
  const asUser = t.withIdentity({ subject: "user1", issuer: "test" });
  const { api } = await import("./_generated/api");
  const { threadId } = await asUser.mutation(api.chat.mutations.createThread, {
    project_id: projectId as never,
  });
  return { workspaceId, projectId, kbId, threadId, asUser, api };
}

beforeEach(() => {
  generateObjectMock.mockReset();
  generateObjectMock.mockResolvedValue(
    mockGenerateObjectResult(mockAnalysis) as never,
  );
  chatRagSearchMock.mockReset();
});

describe("analyzeImpact: ownership and config guards", () => {
  it("throws Thread not found for cross-workspace threadId", async () => {
    const t = chatTest();
    const wsA = await seedWorkspace(t, "user1");
    const wsB = await seedWorkspace(t, "user2");
    const projectB = await seedProject(t, wsB);
    await seedChatThread(t, wsB, projectB, "thread-xyz");
    await seedKnowledgeBase(t, wsB, projectB, { status: "ready" });
    void wsA;

    const { api } = await import("./_generated/api");
    const asUserA = t.withIdentity({ subject: "user1", issuer: "test" });
    await expect(
      asUserA.action(api.chat.impactActions.analyzeImpact, {
        threadId: "thread-xyz",
        featureRequest: "Add OAuth login",
      }),
    ).rejects.toThrow("Thread not found");
  });

  it("throws Thread not found for non-existent thread", async () => {
    const t = chatTest();
    await seedWorkspace(t);

    const { api } = await import("./_generated/api");
    const asUser = t.withIdentity({ subject: "user1", issuer: "test" });
    await expect(
      asUser.action(api.chat.impactActions.analyzeImpact, {
        threadId: "nonexistent",
        featureRequest: "Add OAuth login",
      }),
    ).rejects.toThrow("Thread not found");
  });
});

describe("analyzeImpact: KB status guard", () => {
  it("throws when KB is not ready", async () => {
    const t = chatTest();
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    await seedChatThread(t, workspaceId, projectId, "thread-1");
    await seedKnowledgeBase(t, workspaceId, projectId, { status: "building" });

    const { api } = await import("./_generated/api");
    const asUser = t.withIdentity({ subject: "user1", issuer: "test" });
    await expect(
      asUser.action(api.chat.impactActions.analyzeImpact, {
        threadId: "thread-1",
        featureRequest: "Add OAuth login",
      }),
    ).rejects.toThrow("Knowledge Base is not ready");
  });

  it("throws when KB does not exist", async () => {
    const t = chatTest();
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    await seedChatThread(t, workspaceId, projectId, "thread-1");

    const { api } = await import("./_generated/api");
    const asUser = t.withIdentity({ subject: "user1", issuer: "test" });
    await expect(
      asUser.action(api.chat.impactActions.analyzeImpact, {
        threadId: "thread-1",
        featureRequest: "Add OAuth login",
      }),
    ).rejects.toThrow("Knowledge Base is not ready");
  });
});

describe("analyzeImpact: workspace config guard", () => {
  it("throws when workspace AI config is missing (deleted workspace)", async () => {
    const t = chatTest();
    const workspaceId = await seedWorkspace(t);
    await t.run(async (ctx) => {
      await ctx.db.delete(workspaceId);
    });

    const { internal } = await import("./_generated/api");
    const result = await t.query(
      internal.chat.internal._getChatWorkspaceConfig,
      { workspace_id: workspaceId },
    );
    expect(result).toBeNull();
    expect(result?.ai_config).toBeFalsy();
  });
});

describe("analyzeImpact: featureRequest validation", () => {
  it("throws on empty featureRequest", async () => {
    const t = chatTest();
    const { threadId, asUser, api } = await setupReadyProject(t);

    await expect(
      asUser.action(api.chat.impactActions.analyzeImpact, {
        threadId,
        featureRequest: "   ",
      }),
    ).rejects.toThrow("cannot be empty");
  });
});

describe("analyzeImpact: happy path without BMAD", () => {
  it("calls generateObject with schema and prompt, returns analysis", async () => {
    chatRagSearchMock.mockResolvedValue({
      results: [],
      text: "function auth() { return tokens; }",
    });

    const t = chatTest();
    const { threadId, asUser, api } = await setupReadyProject(t);

    const result = await asUser.action(api.chat.impactActions.analyzeImpact, {
      threadId,
      featureRequest: "Add OAuth login",
    });

    expect(generateObjectMock).toHaveBeenCalledTimes(1);
    const callArgs = generateObjectMock.mock.calls[0][0] as {
      prompt: string;
      schema: typeof impactAnalysisSchema;
    };
    expect(callArgs.prompt).toBe("Add OAuth login");
    expect(callArgs.schema).toBe(impactAnalysisSchema);
    expect(result.threadId).toBe(threadId);
    expect(result.analysis.summary).toBe(
      "Add OAuth login affecting the auth module.",
    );
    expect(result.grounded).toBe(true);
  });

  it("works when RAG returns null (KB not indexed)", async () => {
    chatRagSearchMock.mockResolvedValue(null);

    const t = chatTest();
    const { threadId, asUser, api } = await setupReadyProject(t);

    const result = await asUser.action(api.chat.impactActions.analyzeImpact, {
      threadId,
      featureRequest: "Add feature X",
    });

    expect(generateObjectMock).toHaveBeenCalledTimes(1);
    expect(result.analysis).toBeDefined();
    expect(result.grounded).toBe(false);
  });

  it("includes system prompt with RAG context when RAG returns text", async () => {
    chatRagSearchMock.mockResolvedValue({
      results: [],
      text: "function authenticate() { /* auth code */ }",
    });

    const t = chatTest();
    const { threadId, asUser, api } = await setupReadyProject(t);

    await asUser.action(api.chat.impactActions.analyzeImpact, {
      threadId,
      featureRequest: "Add OAuth login",
    });

    const callArgs = generateObjectMock.mock.calls[0][0] as {
      system?: string;
    };
    expect(callArgs.system).toBeDefined();
    expect(callArgs.system!).toContain("## Retrieved Codebase Context");
    expect(callArgs.system!).toContain("function authenticate()");
  });
});

describe("analyzeImpact: BMAD-aware path", () => {
  it("fetches BMAD metadata when bmad_detected is true", async () => {
    chatRagSearchMock.mockResolvedValue({
      results: [],
      text: "some code",
    });

    const t = chatTest();
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const kbId = await seedKnowledgeBase(t, workspaceId, projectId, {
      status: "ready",
      bmad_detected: true,
    });
    const asUser = t.withIdentity({ subject: "user1", issuer: "test" });
    const { api } = await import("./_generated/api");
    const { threadId } = await asUser.mutation(api.chat.mutations.createThread, {
      project_id: projectId as never,
    });
    await seedBmadMetadata(t, workspaceId, kbId, [
      {
        type: "adr",
        key: "ADR-0003",
        content: "Use Convex Agent Component for AI.",
        source_path: "docs/adr/0003.md",
      },
      {
        type: "convention",
        key: "use-zod-validation",
        content: "All inputs validated with zod.",
        source_path: "project-context.md",
      },
    ]);

    await asUser.action(api.chat.impactActions.analyzeImpact, {
      threadId,
      featureRequest: "Add OAuth login",
    });

    const callArgs = generateObjectMock.mock.calls[0][0] as {
      system?: string;
    };
    expect(callArgs.system).toBeDefined();
    expect(callArgs.system!).toContain("### ADRs");
    expect(callArgs.system!).toContain("ADR-0003");
    expect(callArgs.system!).toContain("### Conventions");
    expect(callArgs.system!).toContain("use-zod-validation");
  });

  it("skips BMAD metadata when bmad_detected is false", async () => {
    chatRagSearchMock.mockResolvedValue({
      results: [],
      text: "some code",
    });

    const t = chatTest();
    const { threadId, asUser, api } = await setupReadyProject(t);

    await asUser.action(api.chat.impactActions.analyzeImpact, {
      threadId,
      featureRequest: "Add OAuth login",
    });

    const callArgs = generateObjectMock.mock.calls[0][0] as {
      system?: string;
    };
    expect(callArgs.system).toBeDefined();
    expect(callArgs.system!).not.toContain("### ADRs");
    expect(callArgs.system!).not.toContain("### Conventions");
  });
});

describe("analyzeImpact: error handling", () => {
  it("re-throws rate-limit error when workspace exceeds RAG search quota", async () => {
    chatRagSearchMock.mockResolvedValue({
      results: [],
      text: "some code",
    });

    const t = chatTest();
    const { threadId, asUser, api } = await setupReadyProject(t);

    for (let i = 0; i < CHAT_RAG_RATE_LIMIT_PER_MINUTE; i++) {
      chatRagSearchMock.mockClear();
      await asUser.action(api.chat.impactActions.analyzeImpact, {
        threadId,
        featureRequest: `feature request ${i}`,
      });
    }

    await expect(
      asUser.action(api.chat.impactActions.analyzeImpact, {
        threadId,
        featureRequest: "one too many",
      }),
    ).rejects.toThrow("too quickly");
  });

  it("swallows non-rate-limit RAG errors and continues without RAG", async () => {
    chatRagSearchMock.mockRejectedValue(new Error("Network error"));

    const t = chatTest();
    const { threadId, asUser, api } = await setupReadyProject(t);

    const result = await asUser.action(api.chat.impactActions.analyzeImpact, {
      threadId,
      featureRequest: "Add OAuth login",
    });

    expect(generateObjectMock).toHaveBeenCalledTimes(1);
    expect(result.analysis).toBeDefined();
    expect(result.grounded).toBe(false);
  });

  it("surfaces generateObject failure as ConvexError with friendly message", async () => {
    const authError = Object.assign(new Error("Invalid API key"), {
      statusCode: 401,
      data: { statusCode: 401 },
    });
    generateObjectMock.mockRejectedValue(authError);

    chatRagSearchMock.mockResolvedValue(null);

    const t = chatTest();
    const { threadId, asUser, api } = await setupReadyProject(t);

    await expect(
      asUser.action(api.chat.impactActions.analyzeImpact, {
        threadId,
        featureRequest: "Add OAuth login",
      }),
    ).rejects.toThrow("authentication error");
  });

  it("distinguishes schema-validation failures with malformed-analysis message", async () => {
    const schemaError = new NoObjectGeneratedError({
      message: "No object generated: response did not match schema",
      text: "garbage",
      response: { id: "mock", timestamp: new Date(), modelId: "mock" },
      usage: { promptTokens: 0, completionTokens: 0 },
      finishReason: "content-filter",
    });
    generateObjectMock.mockRejectedValue(schemaError);

    chatRagSearchMock.mockResolvedValue(null);

    const t = chatTest();
    const { threadId, asUser, api } = await setupReadyProject(t);

    await expect(
      asUser.action(api.chat.impactActions.analyzeImpact, {
        threadId,
        featureRequest: "Add OAuth login",
      }),
    ).rejects.toThrow("malformed analysis");
  });
});

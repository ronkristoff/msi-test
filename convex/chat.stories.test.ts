/// <reference types="vite/client" />
import { describe, expect, it, vi, beforeEach } from "vitest";

const { chatRagSearchMock, generateObjectMock, persistOverride } = vi.hoisted(() => ({
  chatRagSearchMock: vi.fn(),
  generateObjectMock: vi.fn(),
  persistOverride: { fn: null as null | ((...args: unknown[]) => Promise<void>) },
}));

vi.mock("./chat/storyAgent", () => ({
  STORY_GENERATION_PROMPT: "mock story prompt",
  createStoryGenerationAgent: () => ({
    continueThread: async () => ({
      thread: {
        generateObject: generateObjectMock,
      },
    }),
  }),
}));

vi.mock("./ai/model", async () => {
  const { mockModel: agentMockModel } = await import("@convex-dev/agent");
  return {
    getWorkspaceModel: () =>
      agentMockModel({
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

vi.mock("./chat/storyPersistence", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./chat/storyPersistence")>();
  return {
    ...actual,
    persistUserStories: async (ctx: unknown, args: unknown) => {
      if (persistOverride.fn) return persistOverride.fn(ctx, args);
      return actual.persistUserStories(ctx as never, args as never);
    },
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
import type { StoryGenerationResult, UserStory } from "./chat/storySchema";
import { storyGenerationSchema } from "./chat/storySchema";
import { CHAT_RAG_RATE_LIMIT_PER_MINUTE } from "./lib/constraints";

function mockGenerateObjectResult(object: StoryGenerationResult) {
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

const mockStories: UserStory[] = [
  {
    title: "User logs in with OAuth",
    user_story: {
      as_a: "an authenticated user",
      i_want: "to log in via Google OAuth",
      so_that: "I do not need a new password",
    },
    acceptance_criteria: [
      "Given a valid Google account, When the user clicks Login, Then they reach the dashboard.",
    ],
    affected_components: {
      modules: ["auth"],
      apis: ["POST /api/auth/oauth/callback"],
      data_models: ["users.oauth_provider"],
    },
  },
  {
    title: "Admin can revoke OAuth sessions",
    user_story: {
      as_a: "an administrator",
      i_want: "to revoke a user's OAuth session",
      so_that: "compromised accounts can be locked out",
    },
    acceptance_criteria: [
      "Given an admin user, When they revoke a session, Then the user is signed out on next request.",
    ],
    affected_components: {
      modules: ["auth", "admin"],
      apis: [],
      data_models: [],
    },
    technical_context: "Follows convention: use-zod-validation.",
  },
];

const mockResult: StoryGenerationResult = {
  stories: mockStories,
  generation_note: "Decomposed into two stories.",
};

async function setupReadyProject(t: ReturnType<typeof chatTest>) {
  const workspaceId = await seedWorkspace(t);
  const projectId = await seedProject(t, workspaceId);
  await seedKnowledgeBase(t, workspaceId, projectId, {
    status: "ready",
    bmad_detected: false,
  });
  const asUser = t.withIdentity({ subject: "user1", issuer: "test" });
  const { api } = await import("./_generated/api");
  const { threadId } = await asUser.mutation(api.chat.mutations.createThread, {
    project_id: projectId as never,
  });
  return { workspaceId, projectId, threadId, asUser, api };
}

beforeEach(() => {
  generateObjectMock.mockReset();
  generateObjectMock.mockResolvedValue(
    mockGenerateObjectResult(mockResult) as never,
  );
  chatRagSearchMock.mockReset();
  persistOverride.fn = null;
});

describe("_storeUserStories internal mutation", () => {
  it("inserts all stories with status draft, correct linkage, returns stored_ids", async () => {
    const t = chatTest();
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const { internal } = await import("./_generated/api");

    const result = await t.mutation(
      internal.chat.internal._storeUserStories,
      {
        thread_id: "thread-store-1",
        workspace_id: workspaceId as never,
        project_id: projectId as never,
        stories: mockStories,
      },
    );

    expect(result.stored_ids).toHaveLength(2);

    const saved = await t.run(async (ctx) => {
      const rows = await ctx.db
        .query("user_stories")
        .withIndex("by_workspace_id", (q) =>
          q.eq("workspace_id", workspaceId as never),
        )
        .collect();
      return rows;
    });

    expect(saved).toHaveLength(2);
    expect(saved.every((r) => r.status === "draft")).toBe(true);
    expect(saved.every((r) => r.thread_id === "thread-store-1")).toBe(true);
    expect(saved[0].title).toBe("User logs in with OAuth");
    expect(saved[1].affected_components.apis).toEqual([]);
    expect(saved[1].technical_context).toBe(
      "Follows convention: use-zod-validation.",
    );
    expect(saved[0].technical_context).toBeUndefined();
  });

  it("supports by_project_id index lookup (AC9 index coverage)", async () => {
    const t = chatTest();
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const { internal } = await import("./_generated/api");

    await t.mutation(internal.chat.internal._storeUserStories, {
      thread_id: "thread-idx-1",
      workspace_id: workspaceId as never,
      project_id: projectId as never,
      stories: [mockStories[0]],
    });

    const rows = await t.run(async (ctx) => {
      return ctx.db
        .query("user_stories")
        .withIndex("by_project_id", (q) =>
          q.eq("project_id", projectId as never),
        )
        .collect();
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].project_id).toBe(projectId);
  });

  it("supports by_project_id_and_status index lookup (AC9 index coverage)", async () => {
    const t = chatTest();
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const { internal } = await import("./_generated/api");

    await t.mutation(internal.chat.internal._storeUserStories, {
      thread_id: "thread-idx-2",
      workspace_id: workspaceId as never,
      project_id: projectId as never,
      stories: [mockStories[0]],
    });

    const rows = await t.run(async (ctx) => {
      return ctx.db
        .query("user_stories")
        .withIndex("by_project_id_and_status", (q) =>
          q.eq("project_id", projectId as never).eq("status", "draft"),
        )
        .collect();
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("draft");
  });

  it("rejects stories with empty acceptance_criteria (defense-in-depth for AC3)", async () => {
    const t = chatTest();
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const { internal } = await import("./_generated/api");

    const malformedStory = {
      ...mockStories[0],
      acceptance_criteria: [],
    };

    await expect(
      t.mutation(internal.chat.internal._storeUserStories, {
        thread_id: "thread-bad",
        workspace_id: workspaceId as never,
        project_id: projectId as never,
        stories: [malformedStory],
      }),
    ).rejects.toThrow("empty acceptance_criteria");
  });
});

describe("generateStories: ownership and config guards", () => {
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
      asUserA.action(api.chat.storyActions.generateStories, {
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
      asUser.action(api.chat.storyActions.generateStories, {
        threadId: "nonexistent",
        featureRequest: "Add OAuth login",
      }),
    ).rejects.toThrow("Thread not found");
  });

  it("throws when workspace AI config is missing (deleted workspace) [AC15c]", async () => {
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

describe("generateStories: KB status guard", () => {
  it("throws when KB is not ready", async () => {
    const t = chatTest();
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    await seedChatThread(t, workspaceId, projectId, "thread-1");
    await seedKnowledgeBase(t, workspaceId, projectId, { status: "building" });

    const { api } = await import("./_generated/api");
    const asUser = t.withIdentity({ subject: "user1", issuer: "test" });
    await expect(
      asUser.action(api.chat.storyActions.generateStories, {
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
      asUser.action(api.chat.storyActions.generateStories, {
        threadId: "thread-1",
        featureRequest: "Add OAuth login",
      }),
    ).rejects.toThrow("Knowledge Base is not ready");
  });
});

describe("generateStories: featureRequest validation", () => {
  it("throws on empty featureRequest", async () => {
    const t = chatTest();
    const { threadId, asUser, api } = await setupReadyProject(t);

    await expect(
      asUser.action(api.chat.storyActions.generateStories, {
        threadId,
        featureRequest: "   ",
      }),
    ).rejects.toThrow("cannot be empty");
  });
});

describe("generateStories: happy path without BMAD", () => {
  it("calls generateObject with schema and prompt, returns stories", async () => {
    chatRagSearchMock.mockResolvedValue({
      results: [],
      text: "function auth() { return tokens; }",
    });

    const t = chatTest();
    const { threadId, asUser, api } = await setupReadyProject(t);

    const result = await asUser.action(api.chat.storyActions.generateStories, {
      threadId,
      featureRequest: "Add OAuth login",
    });

    expect(generateObjectMock).toHaveBeenCalledTimes(1);
    const callArgs = generateObjectMock.mock.calls[0][0] as {
      prompt: string;
      schema: typeof storyGenerationSchema;
      system?: string;
    };
    expect(callArgs.prompt).toBe("Add OAuth login");
    expect(callArgs.schema).toBe(storyGenerationSchema);
    expect(result.threadId).toBe(threadId);
    expect(result.stories).toHaveLength(2);
    expect(result.stories[0].title).toBe("User logs in with OAuth");
    expect(result.grounded).toBe(true);
  });

  it("works when RAG returns null (KB not indexed)", async () => {
    chatRagSearchMock.mockResolvedValue(null);

    const t = chatTest();
    const { threadId, asUser, api } = await setupReadyProject(t);

    const result = await asUser.action(api.chat.storyActions.generateStories, {
      threadId,
      featureRequest: "Add feature X",
    });

    expect(generateObjectMock).toHaveBeenCalledTimes(1);
    const callArgs = generateObjectMock.mock.calls[0][0] as {
      system?: string;
    };
    expect(callArgs.system).toBeUndefined();
    expect(result.stories).toBeDefined();
    expect(result.grounded).toBe(false);
  });

  it("includes system prompt with RAG context when RAG returns text", async () => {
    chatRagSearchMock.mockResolvedValue({
      results: [],
      text: "function authenticate() { /* auth code */ }",
    });

    const t = chatTest();
    const { threadId, asUser, api } = await setupReadyProject(t);

    await asUser.action(api.chat.storyActions.generateStories, {
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

  it("persists generated stories to user_stories table after generateObject success", async () => {
    chatRagSearchMock.mockResolvedValue({
      results: [],
      text: "some code",
    });

    const t = chatTest();
    const { threadId, workspaceId, projectId, asUser, api } =
      await setupReadyProject(t);

    await asUser.action(api.chat.storyActions.generateStories, {
      threadId,
      featureRequest: "Add OAuth login",
    });

    const saved = await t.run(async (ctx) => {
      return ctx.db
        .query("user_stories")
        .withIndex("by_workspace_id", (q) =>
          q.eq("workspace_id", workspaceId as never),
        )
        .collect();
    });

    expect(saved).toHaveLength(2);
    expect(saved.every((r) => r.status === "draft")).toBe(true);
    expect(saved.every((r) => r.project_id === projectId)).toBe(true);
    expect(saved.every((r) => r.thread_id === threadId)).toBe(true);
  });
});

describe("generateStories: BMAD-aware path", () => {
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

    await asUser.action(api.chat.storyActions.generateStories, {
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

    await asUser.action(api.chat.storyActions.generateStories, {
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

describe("generateStories: error handling", () => {
  it("re-throws rate-limit error when workspace exceeds RAG search quota", async () => {
    chatRagSearchMock.mockResolvedValue({
      results: [],
      text: "some code",
    });

    const t = chatTest();
    const { threadId, asUser, api } = await setupReadyProject(t);

    for (let i = 0; i < CHAT_RAG_RATE_LIMIT_PER_MINUTE; i++) {
      chatRagSearchMock.mockClear();
      await asUser.action(api.chat.storyActions.generateStories, {
        threadId,
        featureRequest: `feature request ${i}`,
      });
    }

    await expect(
      asUser.action(api.chat.storyActions.generateStories, {
        threadId,
        featureRequest: "one too many",
      }),
    ).rejects.toThrow("too quickly");
  });

  it("swallows non-rate-limit RAG errors and continues without RAG", async () => {
    chatRagSearchMock.mockRejectedValue(new Error("Network error"));

    const t = chatTest();
    const { threadId, asUser, api } = await setupReadyProject(t);

    const result = await asUser.action(api.chat.storyActions.generateStories, {
      threadId,
      featureRequest: "Add OAuth login",
    });

    expect(generateObjectMock).toHaveBeenCalledTimes(1);
    expect(result.stories).toBeDefined();
    expect(result.grounded).toBe(false);
  });

  it("surfaces generateObject provider failure with Story generation prefix", async () => {
    const authError = Object.assign(new Error("Invalid API key"), {
      statusCode: 401,
      data: { statusCode: 401 },
    });
    generateObjectMock.mockRejectedValue(authError);

    chatRagSearchMock.mockResolvedValue(null);

    const t = chatTest();
    const { threadId, asUser, api } = await setupReadyProject(t);

    await expect(
      asUser.action(api.chat.storyActions.generateStories, {
        threadId,
        featureRequest: "Add OAuth login",
      }),
    ).rejects.toThrow("Story generation failed");
  });

  it("distinguishes schema-validation failures with malformed-stories message", async () => {
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
      asUser.action(api.chat.storyActions.generateStories, {
        threadId,
        featureRequest: "Add OAuth login",
      }),
    ).rejects.toThrow("malformed stories");
  });

  it("surfaces _storeUserStories failure with could-not-be-saved message (action catch block) [AC15m]", async () => {
    chatRagSearchMock.mockResolvedValue({
      results: [],
      text: "some code",
    });
    persistOverride.fn = async () => {
      throw new Error("DB write failed");
    };

    const t = chatTest();
    const { threadId, asUser, api } = await setupReadyProject(t);

    await expect(
      asUser.action(api.chat.storyActions.generateStories, {
        threadId,
        featureRequest: "Add OAuth login",
      }),
    ).rejects.toThrow("Stories generated but could not be saved");
  });

  it("updates thread last_message_at on generateObject success path (P12 pattern) [AC15n]", async () => {
    chatRagSearchMock.mockResolvedValue({
      results: [],
      text: "some code",
    });

    const t = chatTest();
    const BEFORE_TIMESTAMP = 1_000_000;
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    await seedKnowledgeBase(t, workspaceId, projectId, {
      status: "ready",
      bmad_detected: false,
    });
    await seedChatThread(t, workspaceId, projectId, "thread-lm-success", {
      last_message_at: BEFORE_TIMESTAMP,
    });

    const { api } = await import("./_generated/api");
    const asUser = t.withIdentity({ subject: "user1", issuer: "test" });
    await asUser.action(api.chat.storyActions.generateStories, {
      threadId: "thread-lm-success",
      featureRequest: "Add OAuth login",
    });

    const threadAfter = await t.run(async (ctx) => {
      return ctx.db
        .query("chat_threads")
        .withIndex("by_thread_id", (q) => q.eq("thread_id", "thread-lm-success"))
        .unique();
    });
    expect(threadAfter?.last_message_at).toBeGreaterThan(BEFORE_TIMESTAMP);
  });

  it("updates thread last_message_at on generateObject failure path (P12 pattern) [AC15n]", async () => {
    chatRagSearchMock.mockResolvedValue(null);
    generateObjectMock.mockRejectedValue(
      Object.assign(new Error("Invalid API key"), {
        statusCode: 401,
        data: { statusCode: 401 },
      }),
    );

    const t = chatTest();
    const BEFORE_TIMESTAMP = 1_000_000;
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    await seedKnowledgeBase(t, workspaceId, projectId, {
      status: "ready",
      bmad_detected: false,
    });
    await seedChatThread(t, workspaceId, projectId, "thread-lm-fail", {
      last_message_at: BEFORE_TIMESTAMP,
    });

    const { api } = await import("./_generated/api");
    const asUser = t.withIdentity({ subject: "user1", issuer: "test" });
    await expect(
      asUser.action(api.chat.storyActions.generateStories, {
        threadId: "thread-lm-fail",
        featureRequest: "Add OAuth login",
      }),
    ).rejects.toThrow("Story generation failed");

    const threadAfter = await t.run(async (ctx) => {
      return ctx.db
        .query("chat_threads")
        .withIndex("by_thread_id", (q) => q.eq("thread_id", "thread-lm-fail"))
        .unique();
    });
    expect(threadAfter?.last_message_at).toBeGreaterThan(BEFORE_TIMESTAMP);
  });
});

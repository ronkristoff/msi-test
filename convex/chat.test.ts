/// <reference types="vite/client" />
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return {
    ...actual,
    generateText: vi.fn(),
  };
});

vi.mock("./ai/model", async () => {
  const { mockModel } = await import("@convex-dev/agent");
  return {
    getWorkspaceModel: () =>
      mockModel({
        content: [{ type: "text", text: mockModelText.current }],
      }),
  };
});

const { chatRagSearchMock, mockModelText } = vi.hoisted(() => ({
  chatRagSearchMock: vi.fn(),
  mockModelText: { current: "Mocked assistant response" },
}));

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
import { seedWorkspace, seedProject, seedChatThread, seedKnowledgeBase } from "./testHelpers";
import { CHAT_RAG_RATE_LIMIT_PER_MINUTE } from "./lib/constraints";
import { generateText } from "ai";
import type { Id } from "./_generated/dataModel";

const modules = import.meta.glob("./**/*.ts");
const agentSchema = (await import("../node_modules/@convex-dev/agent/dist/component/schema.js")).default;
const agentModules = import.meta.glob(
  "../node_modules/@convex-dev/agent/dist/component/**/*.js",
);
const rateLimiterSchema = (await import("../node_modules/@convex-dev/rate-limiter/dist/component/schema.js")).default;
const rateLimiterModules = import.meta.glob(
  "../node_modules/@convex-dev/rate-limiter/dist/component/**/*.js",
);

function chatTest() {
  const t = convexTest(schema, modules);
  t.registerComponent("agent", agentSchema, agentModules);
  t.registerComponent("rateLimiter", rateLimiterSchema, rateLimiterModules);
  return t;
}

beforeEach(() => {
  chatRagSearchMock.mockReset();
  mockModelText.current = "Mocked assistant response";
});

describe("chat: createThread + ownership", () => {
  it("createThread rejects unauthenticated user", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const { api } = await import("./_generated/api");

    await expect(
      t.mutation(api.chat.mutations.createThread, { project_id: projectId }),
    ).rejects.toThrow("Not authenticated");
  });

  it("createThread with cross-workspace project throws Project not found", async () => {
    const t = convexTest(schema, modules);
    await seedWorkspace(t, "user1");
    const wsB = await seedWorkspace(t, "user2");
    const projectB = await seedProject(t, wsB);
    const { api } = await import("./_generated/api");

    const asUser1 = t.withIdentity({ subject: "user1", issuer: "test" });
    await expect(
      asUser1.mutation(api.chat.mutations.createThread, {
        project_id: projectB,
      }),
    ).rejects.toThrow("Project not found");
  });

  it("createThread inserts a chat_threads row with correct linkage", async () => {
    const t = chatTest();
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const { api } = await import("./_generated/api");

    const asUser = t.withIdentity({ subject: "user1", issuer: "test" });
    const result = await asUser.mutation(api.chat.mutations.createThread, {
      project_id: projectId,
    });

    expect(result).toBeDefined();
    expect(result.threadId).toBeDefined();
    expect(typeof result.threadId).toBe("string");

    const join = await t.run(async (ctx) => {
      return ctx.db
        .query("chat_threads")
        .withIndex("by_thread_id", (q) =>
          q.eq("thread_id", result.threadId),
        )
        .unique();
    });

    expect(join).not.toBeNull();
    expect(join!.workspace_id).toBe(workspaceId);
    expect(join!.project_id).toBe(projectId);
    expect(join!.title).toBe("New Chat");
    expect(join!.created_by_user_id).toBe("user1");
    expect(join!.last_message_at).toBeDefined();
  });
});

describe("chat: verifyThreadOwnership helper", () => {
  it("returns join row for valid workspace", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    await seedChatThread(t, workspaceId, projectId, "thread-abc");

    const join = await t.run(async (ctx) => {
      const { verifyThreadOwnership } = await import("./chat/internal");
      return verifyThreadOwnership(ctx, "thread-abc", workspaceId);
    });

    expect(join).not.toBeNull();
    expect(join!.thread_id).toBe("thread-abc");
  });

  it("returns null for cross-workspace thread", async () => {
    const t = convexTest(schema, modules);
    const wsA = await seedWorkspace(t, "user1");
    const wsB = await seedWorkspace(t, "user2");
    const projectB = await seedProject(t, wsB);
    await seedChatThread(t, wsB, projectB, "thread-xyz");

    const join = await t.run(async (ctx) => {
      const { verifyThreadOwnership } = await import("./chat/internal");
      return verifyThreadOwnership(ctx, "thread-xyz", wsA);
    });

    expect(join).toBeNull();
  });

  it("returns null for non-existent thread", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);

    const join = await t.run(async (ctx) => {
      const { verifyThreadOwnership } = await import("./chat/internal");
      return verifyThreadOwnership(ctx, "nonexistent", workspaceId);
    });

    expect(join).toBeNull();
  });
});

describe("chat: listThreads query", () => {
  it("returns threads ordered by last_message_at desc", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);

    await seedChatThread(t, workspaceId, projectId, "t1", {
      title: "Old Thread",
      last_message_at: 1000,
    });
    await seedChatThread(t, workspaceId, projectId, "t2", {
      title: "New Thread",
      last_message_at: 3000,
    });
    await seedChatThread(t, workspaceId, projectId, "t3", {
      title: "Mid Thread",
      last_message_at: 2000,
    });

    const { api } = await import("./_generated/api");
    const asUser = t.withIdentity({ subject: "user1", issuer: "test" });
    const result = await asUser.query(api.chat.queries.listThreads, {
      project_id: projectId,
    });

    expect(result).not.toBeNull();
    expect(result!).toHaveLength(3);
    expect(result![0].title).toBe("New Thread");
    expect(result![1].title).toBe("Mid Thread");
    expect(result![2].title).toBe("Old Thread");
  });

  it("returns null for cross-workspace project", async () => {
    const t = convexTest(schema, modules);
    await seedWorkspace(t, "user1");
    const wsB = await seedWorkspace(t, "user2");
    const projectB = await seedProject(t, wsB);
    await seedChatThread(t, wsB, projectB, "t1");

    const { api } = await import("./_generated/api");
    const asUser = t.withIdentity({ subject: "user1", issuer: "test" });
    const result = await asUser.query(api.chat.queries.listThreads, {
      project_id: projectB,
    });

    expect(result).toBeNull();
  });

  it("returns empty array for project with no threads", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);

    const { api } = await import("./_generated/api");
    const asUser = t.withIdentity({ subject: "user1", issuer: "test" });
    const result = await asUser.query(api.chat.queries.listThreads, {
      project_id: projectId,
    });

    expect(result).not.toBeNull();
    expect(result!).toHaveLength(0);
  });

  it("shape includes thread_id, title, last_message_at, _creationTime, last_message_preview", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    await seedChatThread(t, workspaceId, projectId, "t1", {
      last_message_at: 5000,
    });

    const { api } = await import("./_generated/api");
    const asUser = t.withIdentity({ subject: "user1", issuer: "test" });
    const result = await asUser.query(api.chat.queries.listThreads, {
      project_id: projectId,
    });

    expect(result).not.toBeNull();
    expect(result![0]).toHaveProperty("thread_id", "t1");
    expect(result![0]).toHaveProperty("title", "New Chat");
    expect(result![0]).toHaveProperty("last_message_at", 5000);
    expect(result![0]).toHaveProperty("_creationTime");
    expect(result![0]).toHaveProperty("last_message_preview");
    expect(result![0].last_message_preview).toBeNull();
  });
});

describe("chat: listThreads last_message_preview", () => {
  it("returns a non-null preview when the thread has messages", async () => {
    const t = chatTest();
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const { api } = await import("./_generated/api");

    const asUser = t.withIdentity({ subject: "user1", issuer: "test" });
    const { threadId } = await asUser.mutation(api.chat.mutations.createThread, {
      project_id: projectId,
    });
    await asUser.action(api.chat.chatActions.streamMessage, {
      threadId,
      prompt: "What does the auth module do?",
    });

    const result = await asUser.query(api.chat.queries.listThreads, {
      project_id: projectId,
    });

    expect(result).not.toBeNull();
    expect(result!).toHaveLength(1);
    expect(result![0].last_message_preview).not.toBeNull();
    expect(typeof result![0].last_message_preview).toBe("string");
    expect(result![0].last_message_preview).toMatch(/Mocked assistant response/);
  });

  it("returns null preview for a thread with no messages", async () => {
    const t = chatTest();
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const { api } = await import("./_generated/api");

    const asUser = t.withIdentity({ subject: "user1", issuer: "test" });
    await asUser.mutation(api.chat.mutations.createThread, {
      project_id: projectId,
    });

    const result = await asUser.query(api.chat.queries.listThreads, {
      project_id: projectId,
    });

    expect(result).not.toBeNull();
    expect(result!).toHaveLength(1);
    expect(result![0].last_message_preview).toBeNull();
  });

  it("truncates preview for long messages to <=121 chars with ellipsis", async () => {
    mockModelText.current = "x".repeat(200);

    const t = chatTest();
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const { api } = await import("./_generated/api");

    const asUser = t.withIdentity({ subject: "user1", issuer: "test" });
    const { threadId } = await asUser.mutation(api.chat.mutations.createThread, {
      project_id: projectId,
    });
    await asUser.action(api.chat.chatActions.streamMessage, {
      threadId,
      prompt: "Give me a long answer",
    });

    const result = await asUser.query(api.chat.queries.listThreads, {
      project_id: projectId,
    });

    expect(result).not.toBeNull();
    const preview = result![0].last_message_preview;
    expect(preview).not.toBeNull();
    expect(typeof preview).toBe("string");
    expect(preview!.length).toBeLessThanOrEqual(121);
    expect(preview!.endsWith("…")).toBe(true);
    expect(preview!.slice(0, -1)).toBe("x".repeat(120));
  });

  it("returns null preview for seeded thread without a component thread", async () => {
    const t = chatTest();
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    await seedChatThread(t, workspaceId, projectId, "previewless", {
      last_message_at: 1000,
    });

    const { api } = await import("./_generated/api");
    const asUser = t.withIdentity({ subject: "user1", issuer: "test" });
    const result = await asUser.query(api.chat.queries.listThreads, {
      project_id: projectId,
    });

    expect(result).not.toBeNull();
    expect(result![0].last_message_preview).toBeNull();
  });

  it("still returns null for cross-workspace project (preview extension preserves ownership)", async () => {
    const t = chatTest();
    await seedWorkspace(t, "user1");
    const wsB = await seedWorkspace(t, "user2");
    const projectB = await seedProject(t, wsB);
    await seedChatThread(t, wsB, projectB, "tx");

    const { api } = await import("./_generated/api");
    const asUser = t.withIdentity({ subject: "user1", issuer: "test" });
    const result = await asUser.query(api.chat.queries.listThreads, {
      project_id: projectB,
    });

    expect(result).toBeNull();
  });
});

describe("chat: getThread query", () => {
  it("returns title for owned thread", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    await seedChatThread(t, workspaceId, projectId, "thread-get", {
      title: "Custom Title",
      last_message_at: 9000,
    });

    const { api } = await import("./_generated/api");
    const asUser = t.withIdentity({ subject: "user1", issuer: "test" });
    const result = await asUser.query(api.chat.queries.getThread, {
      thread_id: "thread-get",
    });

    expect(result).not.toBeNull();
    expect(result!.title).toBe("Custom Title");
    expect(result!.last_message_at).toBe(9000);
  });

  it("returns null for cross-workspace thread (IDOR guard)", async () => {
    const t = convexTest(schema, modules);
    await seedWorkspace(t, "user1");
    const wsB = await seedWorkspace(t, "user2");
    const projectB = await seedProject(t, wsB);
    await seedChatThread(t, wsB, projectB, "thread-other-ws");

    const { api } = await import("./_generated/api");
    const asUser = t.withIdentity({ subject: "user1", issuer: "test" });
    const result = await asUser.query(api.chat.queries.getThread, {
      thread_id: "thread-other-ws",
    });

    expect(result).toBeNull();
  });

  it("returns null for non-existent thread", async () => {
    const t = convexTest(schema, modules);
    await seedWorkspace(t);

    const { api } = await import("./_generated/api");
    const asUser = t.withIdentity({ subject: "user1", issuer: "test" });
    const result = await asUser.query(api.chat.queries.getThread, {
      thread_id: "ghost",
    });

    expect(result).toBeNull();
  });
});

describe("chat: listThreadMessages query", () => {
  it("throws Thread not found for cross-workspace threadId", async () => {
    const t = convexTest(schema, modules);
    await seedWorkspace(t, "user1");
    const wsB = await seedWorkspace(t, "user2");
    const projectB = await seedProject(t, wsB);
    await seedChatThread(t, wsB, projectB, "thread-other");

    const { api } = await import("./_generated/api");
    const asUser = t.withIdentity({ subject: "user1", issuer: "test" });
    await expect(
      asUser.query(api.chat.queries.listThreadMessages, {
        threadId: "thread-other",
        paginationOpts: { numItems: 50, cursor: null },
      }),
    ).rejects.toThrow("Thread not found");
  });

  it("throws Thread not found for non-existent thread", async () => {
    const t = convexTest(schema, modules);
    await seedWorkspace(t);

    const { api } = await import("./_generated/api");
    const asUser = t.withIdentity({ subject: "user1", issuer: "test" });
    await expect(
      asUser.query(api.chat.queries.listThreadMessages, {
        threadId: "ghost",
        paginationOpts: { numItems: 50, cursor: null },
      }),
    ).rejects.toThrow("Thread not found");
  });
});

describe("chat: streamMessage action — IDOR guard", () => {
  it("streamMessage with cross-workspace threadId throws Thread not found", async () => {
    const t = chatTest();
    await seedWorkspace(t, "user1");
    const wsB = await seedWorkspace(t, "user2");
    const projectB = await seedProject(t, wsB);
    await seedChatThread(t, wsB, projectB, "thread-other");

    const { api } = await import("./_generated/api");
    const asUser = t.withIdentity({ subject: "user1", issuer: "test" });
    await expect(
      asUser.action(api.chat.chatActions.streamMessage, {
        threadId: "thread-other",
        prompt: "Hello",
      }),
    ).rejects.toThrow("Thread not found");
  });

  it("streamMessage with non-existent thread throws Thread not found", async () => {
    const t = chatTest();
    await seedWorkspace(t);

    const { api } = await import("./_generated/api");
    const asUser = t.withIdentity({ subject: "user1", issuer: "test" });
    await expect(
      asUser.action(api.chat.chatActions.streamMessage, {
        threadId: "ghost",
        prompt: "Hello",
      }),
    ).rejects.toThrow("Thread not found");
  });
});

describe("chat: streamMessage action — prompt validation", () => {
  it("rejects empty prompt", async () => {
    const t = chatTest();
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const { api } = await import("./_generated/api");

    const asUser = t.withIdentity({ subject: "user1", issuer: "test" });
    const { threadId } = await asUser.mutation(api.chat.mutations.createThread, {
      project_id: projectId,
    });

    await expect(
      asUser.action(api.chat.chatActions.streamMessage, {
        threadId,
        prompt: "",
      }),
    ).rejects.toThrow("empty");
  });

  it("rejects whitespace-only prompt", async () => {
    const t = chatTest();
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const { api } = await import("./_generated/api");

    const asUser = t.withIdentity({ subject: "user1", issuer: "test" });
    const { threadId } = await asUser.mutation(api.chat.mutations.createThread, {
      project_id: projectId,
    });

    await expect(
      asUser.action(api.chat.chatActions.streamMessage, {
        threadId,
        prompt: "   \n\t  ",
      }),
    ).rejects.toThrow("empty");
  });
});

describe("chat: streamMessage action — streaming + auto-title", () => {
  it("streams a response and updates last_message_at", async () => {
    const t = chatTest();
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const { api } = await import("./_generated/api");

    const asUser = t.withIdentity({ subject: "user1", issuer: "test" });
    const { threadId } = await asUser.mutation(api.chat.mutations.createThread, {
      project_id: projectId,
    });

    const joinBefore = await t.run(async (ctx) => {
      return ctx.db
        .query("chat_threads")
        .withIndex("by_thread_id", (q) => q.eq("thread_id", threadId))
        .unique();
    });
    expect(joinBefore!.last_message_at).toBeDefined();

    const result = await asUser.action(api.chat.chatActions.streamMessage, {
      threadId,
      prompt: "What does this project do?",
    });

    expect(result).toEqual({ threadId });

    const joinAfter = await t.run(async (ctx) => {
      return ctx.db
        .query("chat_threads")
        .withIndex("by_thread_id", (q) => q.eq("thread_id", threadId))
        .unique();
    });

    expect(joinAfter!.last_message_at).toBeDefined();
    expect(joinAfter!.last_message_at!).toBeGreaterThanOrEqual(
      joinBefore!.last_message_at!,
    );
  });

  it("auto-titles on first message", async () => {
    vi.mocked(generateText).mockResolvedValue({
      text: "Project Architecture Question",
    } as Awaited<ReturnType<typeof generateText>>);

    const t = chatTest();
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const { api } = await import("./_generated/api");

    const asUser = t.withIdentity({ subject: "user1", issuer: "test" });
    const { threadId } = await asUser.mutation(api.chat.mutations.createThread, {
      project_id: projectId,
    });

    await asUser.action(api.chat.chatActions.streamMessage, {
      threadId,
      prompt: "What does this project do?",
    });

    const join = await t.run(async (ctx) => {
      return ctx.db
        .query("chat_threads")
        .withIndex("by_thread_id", (q) => q.eq("thread_id", threadId))
        .unique();
    });

    expect(join!.title).toBe("Project Architecture Question");
    expect(join!.title).not.toBe("New Chat");
  });

  it("does NOT re-title on second message", async () => {
    const titleCallCountBefore = vi.mocked(generateText).mock.calls.length;

    const t = chatTest();
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const { api } = await import("./_generated/api");

    const asUser = t.withIdentity({ subject: "user1", issuer: "test" });
    const { threadId } = await asUser.mutation(api.chat.mutations.createThread, {
      project_id: projectId,
    });

    vi.mocked(generateText).mockResolvedValue({
      text: "First Message Title",
    } as Awaited<ReturnType<typeof generateText>>);

    await asUser.action(api.chat.chatActions.streamMessage, {
      threadId,
      prompt: "Tell me about the architecture",
    });

    const titleCallsAfterFirst = vi.mocked(generateText).mock.calls.length;
    expect(titleCallsAfterFirst).toBeGreaterThan(titleCallCountBefore);

    vi.mocked(generateText).mockResolvedValue({
      text: "Should Not Be Used",
    } as Awaited<ReturnType<typeof generateText>>);

    await asUser.action(api.chat.chatActions.streamMessage, {
      threadId,
      prompt: "Follow up question",
    });

    const titleCallsAfterSecond = vi.mocked(generateText).mock.calls.length;
    expect(titleCallsAfterSecond).toBe(titleCallsAfterFirst);

    const join = await t.run(async (ctx) => {
      return ctx.db
        .query("chat_threads")
        .withIndex("by_thread_id", (q) => q.eq("thread_id", threadId))
        .unique();
    });

    expect(join!.title).toBe("First Message Title");
  });
});

describe("chat: _updateThreadTitleIfNew conditional", () => {
  it("updates title and returns true when current title is New Chat", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    await seedChatThread(t, workspaceId, projectId, "thread-cond", {
      title: "New Chat",
    });
    const { internal } = await import("./_generated/api");

    const result = await t.mutation(
      internal.chat.internal._updateThreadTitleIfNew,
      { thread_id: "thread-cond", title: "Updated Title", last_message_at: 9999 },
    );

    expect(result).toBe(true);

    const join = await t.run(async (ctx) => {
      return ctx.db
        .query("chat_threads")
        .withIndex("by_thread_id", (q) => q.eq("thread_id", "thread-cond"))
        .unique();
    });
    expect(join!.title).toBe("Updated Title");
    expect(join!.last_message_at).toBe(9999);
  });

  it("does NOT update and returns false when title is already set", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    await seedChatThread(t, workspaceId, projectId, "thread-set", {
      title: "Existing Title",
      last_message_at: 1000,
    });
    const { internal } = await import("./_generated/api");

    const result = await t.mutation(
      internal.chat.internal._updateThreadTitleIfNew,
      { thread_id: "thread-set", title: "Wrong Title", last_message_at: 9999 },
    );

    expect(result).toBe(false);

    const join = await t.run(async (ctx) => {
      return ctx.db
        .query("chat_threads")
        .withIndex("by_thread_id", (q) => q.eq("thread_id", "thread-set"))
        .unique();
    });
    expect(join!.title).toBe("Existing Title");
    expect(join!.last_message_at).toBe(1000);
  });

  it("returns false for non-existent thread", async () => {
    const t = convexTest(schema, modules);
    await seedWorkspace(t);
    const { internal } = await import("./_generated/api");

    const result = await t.mutation(
      internal.chat.internal._updateThreadTitleIfNew,
      { thread_id: "ghost", title: "Title", last_message_at: 9999 },
    );

    expect(result).toBe(false);
  });
});

describe("chat: _getChatWorkspaceConfig", () => {
  it("returns null for deleted workspace", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    await t.run(async (ctx) => {
      await ctx.db.delete(workspaceId);
    });
    const { internal } = await import("./_generated/api");

    const result = await t.query(internal.chat.internal._getChatWorkspaceConfig, {
      workspace_id: workspaceId as Id<"workspaces">,
    });

    expect(result).toBeNull();
  });

  it("returns ai_config for valid workspace", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const { internal } = await import("./_generated/api");

    const result = await t.query(internal.chat.internal._getChatWorkspaceConfig, {
      workspace_id: workspaceId as Id<"workspaces">,
    });

    expect(result).not.toBeNull();
    expect(result!.ai_config).toBeDefined();
    expect(result!.ai_config.model_name).toBe("gpt-4");
  });
});

describe("chat: agent factory + prompt", () => {
  it("ANALYST_CHAT_PROMPT is a non-empty string constant", async () => {
    const { ANALYST_CHAT_PROMPT } = await import("./chat/agents");
    expect(typeof ANALYST_CHAT_PROMPT).toBe("string");
    expect(ANALYST_CHAT_PROMPT.length).toBeGreaterThan(0);
  });

  it("prompt supports dual-mode (grounded + fallback)", async () => {
    const { ANALYST_CHAT_PROMPT } = await import("./chat/agents");
    expect(ANALYST_CHAT_PROMPT).toContain("Retrieved Codebase Context");
    expect(ANALYST_CHAT_PROMPT.toLowerCase()).toContain("fabricate");
    expect(ANALYST_CHAT_PROMPT).toContain("Knowledge Base does not contain");
  });

  it("createAnalystChatAgent returns agent with streamText defined", async () => {
    const { createAnalystChatAgent } = await import("./chat/agents");
    const { getWorkspaceModel } = await import("./ai/model");

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

describe("chat: streamMessage RAG integration", () => {
  async function seedReadyProject(t: ReturnType<typeof chatTest>, ownerId: string) {
    const workspaceId = await seedWorkspace(t, ownerId);
    const projectId = await seedProject(t, workspaceId);
    await seedKnowledgeBase(t, workspaceId, projectId, { status: "ready" });
    const { api } = await import("./_generated/api");
    const asUser = t.withIdentity({ subject: ownerId, issuer: "test" });
    const { threadId } = await asUser.mutation(api.chat.mutations.createThread, {
      project_id: projectId,
    });
    return { workspaceId, projectId, threadId, asUser };
  }

  it("succeeds when RAG search returns text (grounded response path)", async () => {
    chatRagSearchMock.mockResolvedValue({
      results: [],
      text: "FAKE RAG: convex/foo.ts implements bar()",
      entries: [],
      usage: {},
    });

    const t = chatTest();
    const { threadId, asUser } = await seedReadyProject(t, "rag-text-user");
    const { api } = await import("./_generated/api");

    const result = await asUser.action(api.chat.chatActions.streamMessage, {
      threadId,
      prompt: "What does bar() do?",
    });

    expect(result).toEqual({ threadId });
    expect(chatRagSearchMock).toHaveBeenCalledTimes(1);
  });

  it("succeeds when RAG search returns empty text (graceful degradation)", async () => {
    chatRagSearchMock.mockResolvedValue({
      results: [],
      text: "",
      entries: [],
      usage: {},
    });

    const t = chatTest();
    const { threadId, asUser } = await seedReadyProject(t, "rag-empty-user");
    const { api } = await import("./_generated/api");

    const result = await asUser.action(api.chat.chatActions.streamMessage, {
      threadId,
      prompt: "Tell me about the architecture",
    });

    expect(result).toEqual({ threadId });
    expect(chatRagSearchMock).toHaveBeenCalledTimes(1);
  });

  it("succeeds when RAG search throws (error swallowed, logged)", async () => {
    chatRagSearchMock.mockRejectedValue(new Error("Embedding API down"));

    const t = chatTest();
    const { threadId, asUser } = await seedReadyProject(t, "rag-throw-user");
    const { api } = await import("./_generated/api");

    const result = await asUser.action(api.chat.chatActions.streamMessage, {
      threadId,
      prompt: "What does this project do?",
    });

    expect(result).toEqual({ threadId });
    expect(chatRagSearchMock).toHaveBeenCalledTimes(1);
  });

  it("succeeds when KB is not ready (searchProjectRag returns null, no RAG)", async () => {
    const t = chatTest();
    const ownerId = "rag-no-kb-user";
    const workspaceId = await seedWorkspace(t, ownerId);
    const projectId = await seedProject(t, workspaceId);
    await seedKnowledgeBase(t, workspaceId, projectId, { status: "building" });

    const { api } = await import("./_generated/api");
    const asUser = t.withIdentity({ subject: ownerId, issuer: "test" });
    const { threadId } = await asUser.mutation(api.chat.mutations.createThread, {
      project_id: projectId,
    });

    const result = await asUser.action(api.chat.chatActions.streamMessage, {
      threadId,
      prompt: "What does this project do?",
    });

    expect(result).toEqual({ threadId });
    expect(chatRagSearchMock).not.toHaveBeenCalled();
  });

  it("propagates rate-limit errors instead of swallowing them", async () => {
    chatRagSearchMock.mockResolvedValue({
      results: [],
      text: "FAKE RAG",
      entries: [],
      usage: {},
    });

    const t = chatTest();
    const { projectId, threadId, asUser } = await seedReadyProject(t, "rag-ratelimit-user");
    const { api } = await import("./_generated/api");

    for (let i = 0; i < CHAT_RAG_RATE_LIMIT_PER_MINUTE; i++) {
      await asUser.action(api.knowledge.queries.searchProjectRag, {
        project_id: projectId,
        query_string: "fill the bucket",
      });
    }

    await expect(
      asUser.action(api.chat.chatActions.streamMessage, {
        threadId,
        prompt: "one more message",
      }),
    ).rejects.toThrow(/quickly|slow/i);
  });
});

/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import {
  seedWorkspace,
  seedProject,
  seedKnowledgeBase,
} from "./testHelpers";
import { MAX_EMBEDDING_CHUNKS } from "./lib/constraints";

const modules = import.meta.glob("./**/*.ts");

describe("embeddingActions: helper functions", () => {
  it("getErrorStatusCode reads statusCode property", async () => {
    const { getErrorStatusCode } = await import("./knowledge/embeddingActions");
    expect(getErrorStatusCode({ statusCode: 429 })).toBe(429);
  });

  it("getErrorStatusCode falls back to responseStatus", async () => {
    const { getErrorStatusCode } = await import("./knowledge/embeddingActions");
    expect(getErrorStatusCode({ responseStatus: 500 })).toBe(500);
  });

  it("getErrorStatusCode falls back to status", async () => {
    const { getErrorStatusCode } = await import("./knowledge/embeddingActions");
    expect(getErrorStatusCode({ status: 404 })).toBe(404);
  });

  it("getErrorStatusCode returns undefined for plain errors", async () => {
    const { getErrorStatusCode } = await import("./knowledge/embeddingActions");
    expect(getErrorStatusCode(new Error("boom"))).toBeUndefined();
  });

  it("isRateLimitError detects 429", async () => {
    const { isRateLimitError } = await import("./knowledge/embeddingActions");
    expect(isRateLimitError({ statusCode: 429 })).toBe(true);
    expect(isRateLimitError({ statusCode: 500 })).toBe(false);
    expect(isRateLimitError(new Error("nope"))).toBe(false);
  });

  it("isFatalError detects 401, 403, 404", async () => {
    const { isFatalError } = await import("./knowledge/embeddingActions");
    expect(isFatalError({ statusCode: 401 })).toBe(true);
    expect(isFatalError({ statusCode: 403 })).toBe(true);
    expect(isFatalError({ statusCode: 404 })).toBe(true);
    expect(isFatalError({ statusCode: 429 })).toBe(false);
    expect(isFatalError({ statusCode: 500 })).toBe(false);
    expect(isFatalError(new Error("nope"))).toBe(false);
  });

  it("getErrorMessage extracts Error.message", async () => {
    const { getErrorMessage } = await import("./knowledge/embeddingActions");
    expect(getErrorMessage(new Error("test error"))).toBe("test error");
  });

  it("getErrorMessage extracts object message property", async () => {
    const { getErrorMessage } = await import("./knowledge/embeddingActions");
    expect(getErrorMessage({ message: "custom" })).toBe("custom");
  });

  it("getErrorMessage returns fallback for unknown shapes", async () => {
    const { getErrorMessage } = await import("./knowledge/embeddingActions");
    expect(getErrorMessage(null)).toBe("Unknown error");
    expect(getErrorMessage("string error")).toBe("Unknown error");
  });

  it("buildEmbeddingErrorMessage: 401 → auth message", async () => {
    const { buildEmbeddingErrorMessage } = await import(
      "./knowledge/embeddingActions"
    );
    const msg = buildEmbeddingErrorMessage({ statusCode: 401, message: "bad key" });
    expect(msg).toContain("authentication failed");
  });

  it("buildEmbeddingErrorMessage: 403 → auth message", async () => {
    const { buildEmbeddingErrorMessage } = await import(
      "./knowledge/embeddingActions"
    );
    const msg = buildEmbeddingErrorMessage({ statusCode: 403, message: "forbidden" });
    expect(msg).toContain("authentication failed");
  });

  it("buildEmbeddingErrorMessage: 404 → model not available", async () => {
    const { buildEmbeddingErrorMessage } = await import(
      "./knowledge/embeddingActions"
    );
    const msg = buildEmbeddingErrorMessage({ statusCode: 404, message: "not found" });
    expect(msg).toContain("not available");
  });

  it("buildEmbeddingErrorMessage: other → generic message", async () => {
    const { buildEmbeddingErrorMessage } = await import(
      "./knowledge/embeddingActions"
    );
    const msg = buildEmbeddingErrorMessage({ statusCode: 500, message: "server error" });
    expect(msg).toContain("server error");
  });
});

describe("embeddingActions: data layer for embedChunks", () => {
  it("_getChunksForEmbedding returns chunks for a KB", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const kbId = await seedKnowledgeBase(t, workspaceId, projectId);

    await t.run(async (ctx) => {
      await ctx.db.insert("code_chunks", {
        workspace_id: workspaceId,
        knowledge_base_id: kbId,
        project_id: projectId,
        file_path: "src/a.ts",
        directory: "src",
        content: "const x = 1;",
        chunk_index: 0,
        language: "typescript",
        char_count: 13,
      });
      await ctx.db.insert("code_chunks", {
        workspace_id: workspaceId,
        knowledge_base_id: kbId,
        project_id: projectId,
        file_path: "src/b.ts",
        directory: "src",
        content: "const y = 2;",
        chunk_index: 0,
        language: "typescript",
        char_count: 13,
      });
    });

    const { internal } = await import("./_generated/api");
    const chunks = await t.query(
      internal.knowledge.internal._getChunksForEmbedding,
      { knowledge_base_id: kbId },
    );

    expect(chunks).toHaveLength(2);
    expect(chunks[0].file_path).toBe("src/a.ts");
    expect(chunks[1].file_path).toBe("src/b.ts");
  });

  it("_getChunksForEmbedding returns empty for KB with no chunks", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const kbId = await seedKnowledgeBase(t, workspaceId, projectId);

    const { internal } = await import("./_generated/api");
    const chunks = await t.query(
      internal.knowledge.internal._getChunksForEmbedding,
      { knowledge_base_id: kbId },
    );

    expect(chunks).toHaveLength(0);
  });

  it(`_getChunksForEmbedding respects .take(${MAX_EMBEDDING_CHUNKS}) bound`, async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const kbId = await seedKnowledgeBase(t, workspaceId, projectId);

    await t.run(async (ctx) => {
      for (let i = 0; i < 3; i++) {
        await ctx.db.insert("code_chunks", {
          workspace_id: workspaceId,
          knowledge_base_id: kbId,
          project_id: projectId,
          file_path: `file${i}.ts`,
          directory: "",
          content: `// chunk ${i}`,
          chunk_index: 0,
          language: "typescript",
          char_count: 10,
        });
      }
    });

    const { internal } = await import("./_generated/api");
    const chunks = await t.query(
      internal.knowledge.internal._getChunksForEmbedding,
      { knowledge_base_id: kbId },
    );

    expect(chunks).toHaveLength(3);
  });

  it("_getWorkspaceAiConfig returns ai_config for existing workspace", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);

    const { internal } = await import("./_generated/api");
    const result = await t.query(
      internal.knowledge.internal._getWorkspaceAiConfig,
      { workspace_id: workspaceId },
    );

    expect(result).not.toBeNull();
    expect(result!.ai_config.endpoint_url).toBe("https://api.example.com");
    expect(result!.ai_config.api_key).toBe("key123");
  });

  it("_getWorkspaceAiConfig returns null for non-existent workspace", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);

    await t.run(async (ctx) => {
      await ctx.db.delete(workspaceId);
    });

    const { internal } = await import("./_generated/api");
    const result = await t.query(
      internal.knowledge.internal._getWorkspaceAiConfig,
      { workspace_id: workspaceId },
    );

    expect(result).toBeNull();
  });
});

describe("embeddingActions: _handleIngestionComplete", () => {
  it("transitions KB to error when workflow fails", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const kbId = await seedKnowledgeBase(t, workspaceId, projectId, {
      status: "building",
    });

    const { internal } = await import("./_generated/api");
    await t.mutation(internal.knowledge.internal._handleIngestionComplete, {
      workflowId: "wf-123",
      context: {
        knowledge_base_id: kbId,
        project_id: projectId,
      },
      result: {
        kind: "failed",
        error: "Embedding API authentication failed",
      },
    });

    const kb = await t.run(async (ctx) => ctx.db.get(kbId));
    const project = await t.run(async (ctx) => ctx.db.get(projectId));

    expect(kb!.status).toBe("error");
    expect(kb!.error_message).toBe("Embedding API authentication failed");
    expect(kb!.progress_message).toBeUndefined();
    expect(project!.kb_status).toBe("error");
  });

  it("does nothing when workflow succeeds", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const kbId = await seedKnowledgeBase(t, workspaceId, projectId, {
      status: "building",
    });

    const { internal } = await import("./_generated/api");
    await t.mutation(internal.knowledge.internal._handleIngestionComplete, {
      workflowId: "wf-456",
      context: {
        knowledge_base_id: kbId,
        project_id: projectId,
      },
      result: {
        kind: "success",
        returnValue: { totalEmbedded: 10, totalSkipped: 0 },
      },
    });

    const kb = await t.run(async (ctx) => ctx.db.get(kbId));
    expect(kb!.status).toBe("building");
  });

  it("does nothing when workflow is canceled", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const kbId = await seedKnowledgeBase(t, workspaceId, projectId, {
      status: "building",
    });

    const { internal } = await import("./_generated/api");
    await t.mutation(internal.knowledge.internal._handleIngestionComplete, {
      workflowId: "wf-789",
      context: {
        knowledge_base_id: kbId,
        project_id: projectId,
      },
      result: {
        kind: "canceled",
      },
    });

    const kb = await t.run(async (ctx) => ctx.db.get(kbId));
    expect(kb!.status).toBe("building");
  });

  it("does not override non-building status on failure", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const kbId = await seedKnowledgeBase(t, workspaceId, projectId, {
      status: "ready",
    });

    const { internal } = await import("./_generated/api");
    await t.mutation(internal.knowledge.internal._handleIngestionComplete, {
      workflowId: "wf-000",
      context: {
        knowledge_base_id: kbId,
        project_id: projectId,
      },
      result: {
        kind: "failed",
        error: "Late failure",
      },
    });

    const kb = await t.run(async (ctx) => ctx.db.get(kbId));
    expect(kb!.status).toBe("ready");
  });

  it("uses default error message when workflow error is empty", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const kbId = await seedKnowledgeBase(t, workspaceId, projectId, {
      status: "building",
    });

    const { internal } = await import("./_generated/api");
    await t.mutation(internal.knowledge.internal._handleIngestionComplete, {
      workflowId: "wf-111",
      context: {
        knowledge_base_id: kbId,
        project_id: projectId,
      },
      result: {
        kind: "failed",
        error: "",
      },
    });

    const kb = await t.run(async (ctx) => ctx.db.get(kbId));
    expect(kb!.status).toBe("error");
    expect(kb!.error_message).toBe("Ingestion workflow failed");
  });
});

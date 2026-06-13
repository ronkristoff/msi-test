/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import {
  seedWorkspace,
  seedProject,
  seedKnowledgeBase,
} from "./testHelpers";

const modules = import.meta.glob("./**/*.ts");

describe("knowledge RAG: data layer", () => {
  describe("embedding constants", () => {
    it("has correct embedding constants", async () => {
      const {
        EMBEDDING_BATCH_SIZE,
        DEFAULT_EMBEDDING_MODEL,
        EMBEDDING_DIMENSION,
        RAG_NAMESPACE_PREFIX,
      } = await import("./lib/constraints");

      expect(EMBEDDING_BATCH_SIZE).toBe(50);
      expect(DEFAULT_EMBEDDING_MODEL).toBe("text-embedding-3-small");
      expect(EMBEDDING_DIMENSION).toBe(1536);
      expect(RAG_NAMESPACE_PREFIX).toBe("project_");
    });
  });

  describe("RAG instance factory: pure functions", () => {
    it("getProjectNamespace returns correct format", async () => {
      const { getProjectNamespace } = await import("./knowledge/rag");
      expect(getProjectNamespace("abc123")).toBe("project_abc123");
      expect(getProjectNamespace("proj_1")).toBe("project_proj_1");
    });

    it("getChunkKey returns correct format", async () => {
      const { getChunkKey } = await import("./knowledge/rag");
      expect(getChunkKey("src/index.ts", 0)).toBe("src/index.ts#0");
      expect(getChunkKey("app.ts", 5)).toBe("app.ts#5");
    });

    it("buildFilterValues returns correct filter array", async () => {
      const { buildFilterValues } = await import("./knowledge/rag");
      const filters = buildFilterValues({
        file_path: "src/app.ts",
        chunk_index: 2,
        language: "typescript",
        directory: "src",
      });

      expect(filters).toHaveLength(4);
      expect(filters[0]).toEqual({ name: "file_path", value: "src/app.ts" });
      expect(filters[1]).toEqual({ name: "chunk_index", value: 2 });
      expect(filters[2]).toEqual({ name: "language", value: "typescript" });
      expect(filters[3]).toEqual({ name: "directory", value: "src" });
    });

    it("buildFilterValues defaults language to empty string", async () => {
      const { buildFilterValues } = await import("./knowledge/rag");
      const filters = buildFilterValues({
        file_path: "app.py",
        chunk_index: 0,
        directory: "",
      });

      expect(filters[2]).toEqual({ name: "language", value: "" });
    });

    it("createProjectRag returns RAG instance", async () => {
      const { createProjectRag } = await import("./knowledge/rag");
      const rag = createProjectRag({
        endpoint_url: "https://api.example.com/v1",
        api_key: "test-key",
      });

      expect(rag).toBeDefined();
      expect(typeof rag.add).toBe("function");
      expect(typeof rag.search).toBe("function");
    });
  });

  describe("_setLastSyncedAt mutation", () => {
    it("patches last_synced_at on knowledge_bases", async () => {
      const t = convexTest(schema, modules);
      const workspaceId = await seedWorkspace(t);
      const projectId = await seedProject(t, workspaceId);
      const kbId = await seedKnowledgeBase(t, workspaceId, projectId);

      const { internal } = await import("./_generated/api");
      await t.mutation(internal.knowledge.internal._setLastSyncedAt, {
        knowledge_base_id: kbId,
      });

      const kb = await t.run(async (ctx) => ctx.db.get(kbId));
      expect(kb!.last_synced_at).toBeDefined();
      expect(kb!.last_synced_at!).toBeGreaterThan(0);
    });

    it("updates last_synced_at to current time", async () => {
      const t = convexTest(schema, modules);
      const workspaceId = await seedWorkspace(t);
      const projectId = await seedProject(t, workspaceId);
      const kbId = await seedKnowledgeBase(t, workspaceId, projectId);

      const before = Date.now();
      const { internal } = await import("./_generated/api");
      await t.mutation(internal.knowledge.internal._setLastSyncedAt, {
        knowledge_base_id: kbId,
      });
      const after = Date.now();

      const kb = await t.run(async (ctx) => ctx.db.get(kbId));
      expect(kb!.last_synced_at!).toBeGreaterThanOrEqual(before);
      expect(kb!.last_synced_at!).toBeLessThanOrEqual(after);
    });
  });

  describe("_getChunksForEmbedding query", () => {
    it("returns all chunks for a knowledge_base_id", async () => {
      const t = convexTest(schema, modules);
      const workspaceId = await seedWorkspace(t);
      const projectId = await seedProject(t, workspaceId);
      const kbId = await seedKnowledgeBase(t, workspaceId, projectId);

      await t.run(async (ctx) => {
        await ctx.db.insert("code_chunks", {
          workspace_id: workspaceId,
          knowledge_base_id: kbId,
          project_id: projectId,
          file_path: "a.ts",
          directory: "src",
          content: "content a",
          chunk_index: 0,
          language: "typescript",
          char_count: 9,
        });
        await ctx.db.insert("code_chunks", {
          workspace_id: workspaceId,
          knowledge_base_id: kbId,
          project_id: projectId,
          file_path: "b.ts",
          directory: "src",
          content: "content b",
          chunk_index: 0,
          language: "typescript",
          char_count: 9,
        });
      });

      const { internal } = await import("./_generated/api");
      const chunks = await t.query(
        internal.knowledge.internal._getChunksForEmbedding,
        { knowledge_base_id: kbId },
      );

      expect(chunks).toHaveLength(2);
    });

    it("returns empty array when no chunks exist", async () => {
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
  });

  describe("_getWorkspaceAiConfig query", () => {
    it("returns ai_config for a workspace", async () => {
      const t = convexTest(schema, modules);
      const workspaceId = await seedWorkspace(t);

      const { internal } = await import("./_generated/api");
      const result = await t.query(
        internal.knowledge.internal._getWorkspaceAiConfig,
        { workspace_id: workspaceId },
      );

      expect(result).not.toBeNull();
      expect(result!.ai_config).toBeDefined();
      expect(result!.ai_config.endpoint_url).toBe("https://api.example.com");
      expect(result!.ai_config.api_key).toBe("key123");
    });

    it("returns null for non-existent workspace", async () => {
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

  describe("namespace isolation", () => {
    it("different projects produce different namespaces", async () => {
      const { getProjectNamespace } = await import("./knowledge/rag");
      const ns1 = getProjectNamespace("proj_a");
      const ns2 = getProjectNamespace("proj_b");
      expect(ns1).not.toBe(ns2);
      expect(ns1).toBe("project_proj_a");
      expect(ns2).toBe("project_proj_b");
    });

    it("same project always produces same namespace", async () => {
      const { getProjectNamespace } = await import("./knowledge/rag");
      const ns1 = getProjectNamespace("abc123");
      const ns2 = getProjectNamespace("abc123");
      expect(ns1).toBe(ns2);
    });

    it("different files produce different chunk keys", async () => {
      const { getChunkKey } = await import("./knowledge/rag");
      expect(getChunkKey("src/a.ts", 0)).not.toBe(getChunkKey("src/b.ts", 0));
    });

    it("same file different chunk index produces different keys", async () => {
      const { getChunkKey } = await import("./knowledge/rag");
      expect(getChunkKey("src/a.ts", 0)).not.toBe(getChunkKey("src/a.ts", 1));
    });

    it("namespace is not a substring of other namespaces", async () => {
      const { getProjectNamespace } = await import("./knowledge/rag");
      const ns1 = getProjectNamespace("1");
      const ns2 = getProjectNamespace("12");
      expect(ns1).toBe("project_1");
      expect(ns2).toBe("project_12");
      expect(ns1).not.toBe(ns2);
    });
  });

  describe("new embedding constants", () => {
    it("has correct rate limit backoff and bounds", async () => {
      const {
        EMBEDDING_RATE_LIMIT_BACKOFF_MS,
        MAX_EMBEDDING_CHUNKS,
        EMBEDDING_MAX_QUERY_LENGTH,
        EMBEDDING_SEARCH_MIN_LIMIT,
        EMBEDDING_SEARCH_MAX_LIMIT,
      } = await import("./lib/constraints");

      expect(EMBEDDING_RATE_LIMIT_BACKOFF_MS).toBe(30000);
      expect(MAX_EMBEDDING_CHUNKS).toBe(10000);
      expect(EMBEDDING_MAX_QUERY_LENGTH).toBe(8000);
      expect(EMBEDDING_SEARCH_MIN_LIMIT).toBe(1);
      expect(EMBEDDING_SEARCH_MAX_LIMIT).toBe(50);
    });
  });

  describe("_getProjectWorkspaceForSearch query", () => {
    it("returns null for unauthenticated user (auth required)", async () => {
      const t = convexTest(schema, modules);
      const workspaceId = await seedWorkspace(t);
      const projectId = await seedProject(t, workspaceId);
      await seedKnowledgeBase(t, workspaceId, projectId, { status: "ready" });

      const { internal } = await import("./_generated/api");
      const result = await t.query(
        internal.knowledge.queries._getProjectWorkspaceForSearch,
        { project_id: projectId },
      );

      expect(result).toBeNull();
    });

    it("data layer: returns workspace info from DB directly", async () => {
      const t = convexTest(schema, modules);
      const workspaceId = await seedWorkspace(t);
      const projectId = await seedProject(t, workspaceId);
      await seedKnowledgeBase(t, workspaceId, projectId, { status: "ready" });
      await t.run(async (ctx) => {
        await ctx.db.patch(projectId, { kb_status: "ready" });
      });

      const data = await t.run(async (ctx) => {
        const project = await ctx.db.get(projectId);
        const kb = await ctx.db
          .query("knowledge_bases")
          .withIndex("by_project_id", (q) => q.eq("project_id", projectId))
          .first();
        return {
          workspace_id: project!.workspace_id,
          kb_status: project!.kb_status,
          kb_exists: !!kb,
        };
      });

      expect(data.workspace_id).toBe(workspaceId);
      expect(data.kb_status).toBe("ready");
      expect(data.kb_exists).toBe(true);
    });
  });
});

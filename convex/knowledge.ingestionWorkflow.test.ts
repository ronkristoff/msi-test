/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import {
  seedWorkspace,
  seedProject,
  seedProjectWithRepo,
  seedKnowledgeBase,
} from "./testHelpers";

const modules = import.meta.glob("./**/*.ts");

describe("knowledge ingestion: data layer", () => {
  describe("code_chunks table", () => {
    it("can insert and query code chunks by knowledge_base_id", async () => {
      const t = convexTest(schema, modules);
      const workspaceId = await seedWorkspace(t);
      const projectId = await seedProject(t, workspaceId);
      const kbId = await seedKnowledgeBase(t, workspaceId, projectId);

      await t.run(async (ctx) => {
        await ctx.db.insert("code_chunks", {
          workspace_id: workspaceId,
          knowledge_base_id: kbId,
          project_id: projectId,
          file_path: "src/index.ts",
          directory: "src",
          content: "console.log('hello');",
          chunk_index: 0,
          language: "typescript",
          char_count: 22,
        });
        await ctx.db.insert("code_chunks", {
          workspace_id: workspaceId,
          knowledge_base_id: kbId,
          project_id: projectId,
          file_path: "src/index.ts",
          directory: "src",
          content: "export default main;",
          chunk_index: 1,
          language: "typescript",
          char_count: 19,
        });
      });

      const chunks = await t.run(async (ctx) => {
        return ctx.db
          .query("code_chunks")
          .withIndex("by_knowledge_base_id", (q) =>
            q.eq("knowledge_base_id", kbId),
          )
          .collect();
      });

      expect(chunks).toHaveLength(2);
      expect(chunks[0].chunk_index).toBe(0);
      expect(chunks[1].chunk_index).toBe(1);
    });

    it("can query code chunks by project_id", async () => {
      const t = convexTest(schema, modules);
      const workspaceId = await seedWorkspace(t);
      const projectId = await seedProject(t, workspaceId);
      const kbId = await seedKnowledgeBase(t, workspaceId, projectId);

      await t.run(async (ctx) => {
        await ctx.db.insert("code_chunks", {
          workspace_id: workspaceId,
          knowledge_base_id: kbId,
          project_id: projectId,
          file_path: "app.ts",
          directory: "",
          content: "test content",
          chunk_index: 0,
          language: "typescript",
          char_count: 12,
        });
      });

      const chunks = await t.run(async (ctx) => {
        return ctx.db
          .query("code_chunks")
          .withIndex("by_project_id", (q) => q.eq("project_id", projectId))
          .collect();
      });

      expect(chunks).toHaveLength(1);
      expect(chunks[0].file_path).toBe("app.ts");
    });

    it("can query code chunks by workspace_id", async () => {
      const t = convexTest(schema, modules);
      const workspaceId = await seedWorkspace(t);
      const projectId = await seedProject(t, workspaceId);
      const kbId = await seedKnowledgeBase(t, workspaceId, projectId);

      await t.run(async (ctx) => {
        await ctx.db.insert("code_chunks", {
          workspace_id: workspaceId,
          knowledge_base_id: kbId,
          project_id: projectId,
          file_path: "app.ts",
          directory: "",
          content: "test",
          chunk_index: 0,
          language: "typescript",
          char_count: 4,
        });
      });

      const chunks = await t.run(async (ctx) => {
        return ctx.db
          .query("code_chunks")
          .withIndex("by_workspace_id", (q) =>
            q.eq("workspace_id", workspaceId),
          )
          .collect();
      });

      expect(chunks).toHaveLength(1);
    });
  });

  describe("knowledge_bases with progress_message", () => {
    it("can store and retrieve progress_message", async () => {
      const t = convexTest(schema, modules);
      const workspaceId = await seedWorkspace(t);
      const projectId = await seedProject(t, workspaceId);

      const kbId = await t.run(async (ctx) => {
        return ctx.db.insert("knowledge_bases", {
          workspace_id: workspaceId,
          project_id: projectId,
          status: "building",
          progress_message: "Reading 42 files...",
        });
      });

      const kb = await t.run(async (ctx) => ctx.db.get(kbId));
      expect(kb!.progress_message).toBe("Reading 42 files...");
      expect(kb!.status).toBe("building");
    });
  });

  describe("data layer: _createKnowledgeBase", () => {
    it("creates a knowledge_bases doc with building status", async () => {
      const t = convexTest(schema, modules);
      const workspaceId = await seedWorkspace(t);
      const projectId = await seedProject(t, workspaceId);

      const { internal } = await import("./_generated/api");
      const kbId = await t.mutation(
        internal.knowledge.internal._createKnowledgeBase,
        {
          workspace_id: workspaceId,
          project_id: projectId,
        },
      );

      const kb = await t.run(async (ctx) => ctx.db.get(kbId));
      expect(kb).not.toBeNull();
      expect(kb!.status).toBe("building");
      expect(kb!.workspace_id).toBe(workspaceId);
      expect(kb!.project_id).toBe(projectId);
    });
  });

  describe("data layer: _updateKbStatus", () => {
    it("patches knowledge_bases status and progress_message", async () => {
      const t = convexTest(schema, modules);
      const workspaceId = await seedWorkspace(t);
      const projectId = await seedProject(t, workspaceId);
      const kbId = await seedKnowledgeBase(t, workspaceId, projectId);

      const { internal } = await import("./_generated/api");
      await t.mutation(internal.knowledge.internal._updateKbStatus, {
        knowledge_base_id: kbId,
        project_id: projectId,
        status: "building",
        progress_message: "Fetching file tree...",
      });

      const kb = await t.run(async (ctx) => ctx.db.get(kbId));
      expect(kb!.status).toBe("building");
      expect(kb!.progress_message).toBe("Fetching file tree...");
    });

    it("patches both knowledge_bases and projects kb_status on error", async () => {
      const t = convexTest(schema, modules);
      const workspaceId = await seedWorkspace(t);
      const projectId = await seedProject(t, workspaceId);
      const kbId = await seedKnowledgeBase(t, workspaceId, projectId);

      const { internal } = await import("./_generated/api");
      await t.mutation(internal.knowledge.internal._updateKbStatus, {
        knowledge_base_id: kbId,
        project_id: projectId,
        status: "error",
        error_message: "GitHub API rate limited",
      });

      const kb = await t.run(async (ctx) => ctx.db.get(kbId));
      const project = await t.run(async (ctx) => ctx.db.get(projectId));

      expect(kb!.status).toBe("error");
      expect(kb!.error_message).toBe("GitHub API rate limited");
      expect(project!.kb_status).toBe("error");
    });
  });

  describe("data layer: _deleteChunksByKb", () => {
    it("deletes all chunks for a knowledge_base_id", async () => {
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
          directory: "",
          content: "a",
          chunk_index: 0,
          language: "typescript",
          char_count: 1,
        });
        await ctx.db.insert("code_chunks", {
          workspace_id: workspaceId,
          knowledge_base_id: kbId,
          project_id: projectId,
          file_path: "b.ts",
          directory: "",
          content: "b",
          chunk_index: 0,
          language: "typescript",
          char_count: 1,
        });
      });

      const { internal } = await import("./_generated/api");
      const deletedCount = await t.mutation(
        internal.knowledge.internal._deleteChunksByKb,
        { knowledge_base_id: kbId },
      );
      expect(deletedCount).toBe(2);

      const remaining = await t.run(async (ctx) => {
        return ctx.db
          .query("code_chunks")
          .withIndex("by_knowledge_base_id", (q) =>
            q.eq("knowledge_base_id", kbId),
          )
          .collect();
      });
      expect(remaining).toHaveLength(0);
    });

    it("returns 0 when no chunks exist", async () => {
      const t = convexTest(schema, modules);
      const workspaceId = await seedWorkspace(t);
      const projectId = await seedProject(t, workspaceId);
      const kbId = await seedKnowledgeBase(t, workspaceId, projectId);

      const { internal } = await import("./_generated/api");
      const deletedCount = await t.mutation(
        internal.knowledge.internal._deleteChunksByKb,
        { knowledge_base_id: kbId },
      );
      expect(deletedCount).toBe(0);
    });
  });

  describe("data layer: _insertChunks", () => {
    it("inserts an array of code chunks", async () => {
      const t = convexTest(schema, modules);
      const workspaceId = await seedWorkspace(t);
      const projectId = await seedProject(t, workspaceId);
      const kbId = await seedKnowledgeBase(t, workspaceId, projectId);

      const { internal } = await import("./_generated/api");
      const ids = await t.mutation(internal.knowledge.internal._insertChunks, {
        chunks: [
          {
            workspace_id: workspaceId,
            knowledge_base_id: kbId,
            project_id: projectId,
            file_path: "a.ts",
            directory: "",
            content: "content a",
            chunk_index: 0,
            language: "typescript",
            char_count: 9,
          },
          {
            workspace_id: workspaceId,
            knowledge_base_id: kbId,
            project_id: projectId,
            file_path: "a.ts",
            directory: "",
            content: "content b",
            chunk_index: 1,
            language: "typescript",
            char_count: 9,
          },
        ],
      });

      expect(ids).toHaveLength(2);

      const chunks = await t.run(async (ctx) => {
        return ctx.db
          .query("code_chunks")
          .withIndex("by_knowledge_base_id", (q) =>
            q.eq("knowledge_base_id", kbId),
          )
          .collect();
      });
      expect(chunks).toHaveLength(2);
    });
  });

  describe("data layer: _updateKbStats", () => {
    it("updates total_files and total_size_bytes on KB", async () => {
      const t = convexTest(schema, modules);
      const workspaceId = await seedWorkspace(t);
      const projectId = await seedProject(t, workspaceId);
      const kbId = await seedKnowledgeBase(t, workspaceId, projectId);

      const { internal } = await import("./_generated/api");
      await t.mutation(internal.knowledge.internal._updateKbStats, {
        knowledge_base_id: kbId,
        total_files: 42,
        total_size_bytes: 1024000,
      });

      const kb = await t.run(async (ctx) => ctx.db.get(kbId));
      expect(kb!.total_files).toBe(42);
      expect(kb!.total_size_bytes).toBe(1024000);
    });
  });

  describe("data layer: _getProjectForIngestion", () => {
    it("returns repo_url and encrypted_pat for a project with repo", async () => {
      const t = convexTest(schema, modules);
      const workspaceId = await seedWorkspace(t);
      const projectId = await seedProjectWithRepo(t, workspaceId, {
        repo_url: "https://github.com/owner/repo",
        encrypted_pat: "enc:value",
        kb_status: "building",
      });

      const { internal } = await import("./_generated/api");
      const project = await t.query(
        internal.knowledge.internal._getProjectForIngestion,
        { project_id: projectId },
      );

      expect(project).not.toBeNull();
      expect(project!.repo_url).toBe("https://github.com/owner/repo");
      expect(project!.encrypted_pat).toBe("enc:value");
      expect(project!.workspace_id).toBe(workspaceId);
    });

    it("returns null repo_url and encrypted_pat for project without repo", async () => {
      const t = convexTest(schema, modules);
      const workspaceId = await seedWorkspace(t);
      const projectId = await seedProject(t, workspaceId);

      const { internal } = await import("./_generated/api");
      const project = await t.query(
        internal.knowledge.internal._getProjectForIngestion,
        { project_id: projectId },
      );

      expect(project).not.toBeNull();
      expect(project!.repo_url).toBeNull();
      expect(project!.encrypted_pat).toBeNull();
    });
  });

  describe("data layer: _getKnowledgeBaseForProject", () => {
    it("returns the knowledge_bases doc for a project", async () => {
      const t = convexTest(schema, modules);
      const workspaceId = await seedWorkspace(t);
      const projectId = await seedProject(t, workspaceId);
      const kbId = await seedKnowledgeBase(t, workspaceId, projectId, {
        status: "building",
        progress_message: "Working...",
      });

      const { internal } = await import("./_generated/api");
      const kb = await t.query(
        internal.knowledge.internal._getKnowledgeBaseForProject,
        { project_id: projectId },
      );

      expect(kb).not.toBeNull();
      expect(kb!._id).toBe(kbId);
      expect(kb!.status).toBe("building");
      expect(kb!.progress_message).toBe("Working...");
    });

    it("returns null when no KB exists for project", async () => {
      const t = convexTest(schema, modules);
      const workspaceId = await seedWorkspace(t);
      const projectId = await seedProject(t, workspaceId);

      const { internal } = await import("./_generated/api");
      const kb = await t.query(
        internal.knowledge.internal._getKnowledgeBaseForProject,
        { project_id: projectId },
      );

      expect(kb).toBeNull();
    });
  });

  describe("getIngestionProgress auth scoping", () => {
    it("returns null for unauthenticated user", async () => {
      const t = convexTest(schema, modules);
      const workspaceId = await seedWorkspace(t);
      const projectId = await seedProject(t, workspaceId);
      await seedKnowledgeBase(t, workspaceId, projectId);

      const { api } = await import("./_generated/api");
      const result = await t.query(api.knowledge.queries.getIngestionProgress, {
        project_id: projectId,
      });
      expect(result).toBeNull();
    });

    it("data layer: returns correct fields from knowledge_bases", async () => {
      const t = convexTest(schema, modules);
      const workspaceId = await seedWorkspace(t);
      const projectId = await seedProject(t, workspaceId);
      const kbId = await seedKnowledgeBase(t, workspaceId, projectId, {
        status: "building",
        progress_message: "Reading 10 files...",
        total_files: 10,
        total_size_bytes: 50000,
      });

      await t.run(async (ctx) => {
        await ctx.db.patch(projectId, { kb_status: "building" });
      });

      const expectedShape = await t.run(async (ctx) => {
        const kb = await ctx.db.get(kbId);
        const project = await ctx.db.get(projectId);
        return {
          kb_status: project!.kb_status ?? null,
          status: kb!.status,
          progress_message: kb!.progress_message ?? null,
          error_message: kb!.error_message ?? null,
          total_files: kb!.total_files ?? 0,
          total_size_bytes: kb!.total_size_bytes ?? 0,
        };
      });

      expect(expectedShape).toEqual({
        kb_status: "building",
        status: "building",
        progress_message: "Reading 10 files...",
        error_message: null,
        total_files: 10,
        total_size_bytes: 50000,
      });
    });

    it("data layer: returns null when no KB exists for project", async () => {
      const t = convexTest(schema, modules);
      const workspaceId = await seedWorkspace(t);
      const projectId = await seedProject(t, workspaceId);

      const kb = await t.run(async (ctx) => {
        return ctx.db
          .query("knowledge_bases")
          .withIndex("by_project_id", (q) => q.eq("project_id", projectId))
          .first();
      });

      expect(kb).toBeNull();
    });
  });

  describe("extraction step wiring", () => {
    it("ingestion workflow and extraction action are both registered", async () => {
      const workflowSource = await import("./knowledge/ingestionWorkflow");
      expect(workflowSource.ingestionWorkflow).toBeDefined();

      const { internal } = await import("./_generated/api");
      expect(
        internal.knowledge.extractionActions.extractArchitectureAndModules,
      ).toBeDefined();
    });

    it("extractionActions module exports extractArchitectureAndModules", async () => {
      const extractionModule = await import("./knowledge/extractionActions");
      expect(extractionModule.extractArchitectureAndModules).toBeDefined();
    });

    it("empty-repo guard: _getChunksForExtraction returns empty when no chunks", async () => {
      const t = convexTest(schema, modules);
      const workspaceId = await seedWorkspace(t);
      const projectId = await seedProject(t, workspaceId);
      const kbId = await seedKnowledgeBase(t, workspaceId, projectId);

      const { internal } = await import("./_generated/api");
      const chunks = await t.query(
        internal.knowledge.internal._getChunksForExtraction,
        { knowledge_base_id: kbId },
      );

      expect(chunks).toHaveLength(0);
    });

    it("extraction error helper: 401 → auth error message", async () => {
      const { buildExtractionErrorMessage } = await import(
        "./knowledge/extractionActions"
      );
      const msg = buildExtractionErrorMessage({ statusCode: 401, message: "bad key" });
      expect(msg).toContain("authentication");
    });

    it("extraction error helper: 404 → model not available", async () => {
      const { buildExtractionErrorMessage } = await import(
        "./knowledge/extractionActions"
      );
      const msg = buildExtractionErrorMessage({ statusCode: 404, message: "not found" });
      expect(msg).toContain("model not available");
    });

    it("extraction error helper: generic error → message included", async () => {
      const { buildExtractionErrorMessage } = await import(
        "./knowledge/extractionActions"
      );
      const msg = buildExtractionErrorMessage(new Error("rate limited"));
      expect(msg).toContain("rate limited");
    });
  });
});

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

describe("extraction data layer: _storeArchitectureSummary", () => {
  it("patches all 4 architecture fields on knowledge_bases", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const kbId = await seedKnowledgeBase(t, workspaceId, projectId);

    const { internal } = await import("./_generated/api");
    await t.mutation(internal.knowledge.internal._storeArchitectureSummary, {
      knowledge_base_id: kbId,
      architecture_summary: "A modular monolith",
      tech_stack: ["Next.js", "Convex"],
      folder_structure: "src/app/",
      architecture_type: "monolith",
    });

    const kb = await t.run(async (ctx) => ctx.db.get(kbId));
    expect(kb!.architecture_summary).toBe("A modular monolith");
    expect(kb!.tech_stack).toEqual(["Next.js", "Convex"]);
    expect(kb!.folder_structure).toBe("src/app/");
    expect(kb!.architecture_type).toBe("monolith");
  });
});

describe("extraction data layer: _storeModules", () => {
  it("inserts module rows into kb_modules and returns IDs", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const kbId = await seedKnowledgeBase(t, workspaceId, projectId);

    const { internal } = await import("./_generated/api");
    const ids = await t.mutation(internal.knowledge.internal._storeModules, {
      knowledge_base_id: kbId,
      workspace_id: workspaceId,
      modules: [
        {
          name: "auth",
          description: "Authentication",
          file_count: 3,
          files: ["src/auth/login.ts"],
          dependencies: ["users"],
          apis: [{ path: "/api/login", method: "POST", description: "Login", request_shape: {}, response_shape: {} }],
          data_models: [],
          user_flows: [],
        },
        {
          name: "billing",
          description: "Billing system",
        },
      ],
    });

    expect(ids).toHaveLength(2);

    const modulesInDb = await t.run(async (ctx) => {
      return ctx.db
        .query("kb_modules")
        .withIndex("by_knowledge_base_id", (q) =>
          q.eq("knowledge_base_id", kbId),
        )
        .collect();
    });

    expect(modulesInDb).toHaveLength(2);
    expect(modulesInDb[0].name).toBe("auth");
    expect(modulesInDb[0].knowledge_base_id).toBe(kbId);
    expect(modulesInDb[0].workspace_id).toBe(workspaceId);
    expect(modulesInDb[1].name).toBe("billing");
  });

  it("returns empty array when modules array is empty", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const kbId = await seedKnowledgeBase(t, workspaceId, projectId);

    const { internal } = await import("./_generated/api");
    const ids = await t.mutation(internal.knowledge.internal._storeModules, {
      knowledge_base_id: kbId,
      workspace_id: workspaceId,
      modules: [],
    });

    expect(ids).toEqual([]);
  });
});

describe("extraction data layer: _deleteModulesByKb", () => {
  it("deletes all kb_modules for a knowledge_base_id", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const kbId = await seedKnowledgeBase(t, workspaceId, projectId);

    await t.run(async (ctx) => {
      await ctx.db.insert("kb_modules", {
        workspace_id: workspaceId,
        knowledge_base_id: kbId,
        name: "module-a",
      });
      await ctx.db.insert("kb_modules", {
        workspace_id: workspaceId,
        knowledge_base_id: kbId,
        name: "module-b",
      });
    });

    const { internal } = await import("./_generated/api");
    const deletedCount = await t.mutation(
      internal.knowledge.internal._deleteModulesByKb,
      { knowledge_base_id: kbId },
    );

    expect(deletedCount).toBe(2);

    const remaining = await t.run(async (ctx) => {
      return ctx.db
        .query("kb_modules")
        .withIndex("by_knowledge_base_id", (q) =>
          q.eq("knowledge_base_id", kbId),
        )
        .collect();
    });

    expect(remaining).toHaveLength(0);
  });

  it("returns 0 when no modules exist", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const kbId = await seedKnowledgeBase(t, workspaceId, projectId);

    const { internal } = await import("./_generated/api");
    const deletedCount = await t.mutation(
      internal.knowledge.internal._deleteModulesByKb,
      { knowledge_base_id: kbId },
    );

    expect(deletedCount).toBe(0);
  });
});

describe("extraction data layer: _getChunksForExtraction", () => {
  it("returns only first chunk per file path (deduplication)", async () => {
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
        content: "first chunk",
        chunk_index: 0,
        language: "typescript",
        char_count: 11,
      });
      await ctx.db.insert("code_chunks", {
        workspace_id: workspaceId,
        knowledge_base_id: kbId,
        project_id: projectId,
        file_path: "src/a.ts",
        directory: "src",
        content: "second chunk",
        chunk_index: 1,
        language: "typescript",
        char_count: 12,
      });
      await ctx.db.insert("code_chunks", {
        workspace_id: workspaceId,
        knowledge_base_id: kbId,
        project_id: projectId,
        file_path: "src/b.ts",
        directory: "src",
        content: "file b chunk",
        chunk_index: 0,
        language: "typescript",
        char_count: 12,
      });
    });

    const { internal } = await import("./_generated/api");
    const chunks = await t.query(
      internal.knowledge.internal._getChunksForExtraction,
      { knowledge_base_id: kbId },
    );

    expect(chunks).toHaveLength(2);
    expect(chunks[0].file_path).toBe("src/a.ts");
    expect(chunks[0].chunk_index).toBe(0);
    expect(chunks[1].file_path).toBe("src/b.ts");
  });

  it("returns empty array when no chunks exist", async () => {
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
});

describe("extraction data layer: _getKbForExtraction", () => {
  it("returns the KB document", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const kbId = await seedKnowledgeBase(t, workspaceId, projectId);

    const { internal } = await import("./_generated/api");
    const kb = await t.query(
      internal.knowledge.internal._getKbForExtraction,
      { knowledge_base_id: kbId },
    );

    expect(kb).not.toBeNull();
    expect(kb!._id).toBe(kbId);
  });

  it("bmad_detected is undefined (field does not exist in schema yet)", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const kbId = await seedKnowledgeBase(t, workspaceId, projectId);

    const { internal } = await import("./_generated/api");
    const kb = await t.query(
      internal.knowledge.internal._getKbForExtraction,
      { knowledge_base_id: kbId },
    );

    expect(kb).not.toBeNull();
    expect((kb as Record<string, unknown>).bmad_detected).toBeUndefined();
  });
});

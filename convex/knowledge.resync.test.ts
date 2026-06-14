/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import {
  seedWorkspace,
  seedProject,
  seedProjectWithRepo,
  seedKnowledgeBase,
  seedModule,
} from "./testHelpers";

const modules = import.meta.glob("./**/*.ts");

describe("resync: _resetKbForResync", () => {
  it("clears architecture fields while preserving identity and status", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const kbId = await seedKnowledgeBase(t, workspaceId, projectId, {
      status: "ready",
      architecture_summary: "Monolith with modules",
      tech_stack: ["react", "convex"],
      folder_structure: "src/\n  app/",
      architecture_type: "monolith",
      total_files: 100,
      total_size_bytes: 50000,
      error_message: undefined,
      progress_message: undefined,
      last_synced_at: 1700000000000,
    });

    const { internal } = await import("./_generated/api");
    await t.mutation(internal.knowledge.internal._resetKbForResync, {
      knowledge_base_id: kbId,
    });

    const kb = await t.run(async (ctx) => ctx.db.get(kbId));

    expect(kb!._id).toBe(kbId);
    expect(kb!.workspace_id).toBe(workspaceId);
    expect(kb!.project_id).toBe(projectId);
    expect(kb!.status).toBe("ready");
    expect(kb!.last_synced_at).toBe(1700000000000);
    expect(kb!.architecture_summary).toBeUndefined();
    expect(kb!.tech_stack).toBeUndefined();
    expect(kb!.folder_structure).toBeUndefined();
    expect(kb!.architecture_type).toBeUndefined();
    expect(kb!.total_files).toBeUndefined();
    expect(kb!.total_size_bytes).toBeUndefined();
    expect(kb!.error_message).toBeUndefined();
    expect(kb!.progress_message).toBeUndefined();
  });

  it("clears error_message and progress_message when set", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const kbId = await seedKnowledgeBase(t, workspaceId, projectId, {
      status: "ready",
      error_message: "previous error",
      progress_message: "in progress",
    });

    const { internal } = await import("./_generated/api");
    await t.mutation(internal.knowledge.internal._resetKbForResync, {
      knowledge_base_id: kbId,
    });

    const kb = await t.run(async (ctx) => ctx.db.get(kbId));
    expect(kb!.error_message).toBeUndefined();
    expect(kb!.progress_message).toBeUndefined();
  });
});

describe("resync: _getKnowledgeBaseForProject ordering", () => {
  it("returns the latest KB when multiple exist for the same project", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);

    const oldKbId = await seedKnowledgeBase(t, workspaceId, projectId, {
      status: "ready",
      architecture_type: "old-arch",
    });

    await new Promise((resolve) => setTimeout(resolve, 10));

    const newKbId = await seedKnowledgeBase(t, workspaceId, projectId, {
      status: "ready",
      architecture_type: "new-arch",
    });

    const { internal } = await import("./_generated/api");
    const kb = await t.query(
      internal.knowledge.internal._getKnowledgeBaseForProject,
      { project_id: projectId },
    );

    expect(kb!._id).toBe(newKbId);
    expect(kb!.architecture_type).toBe("new-arch");
    expect(kb!._id).not.toBe(oldKbId);
  });
});

describe("resync: extractArchitectureAndModules idempotency wiring", () => {
  it("extractArchitectureAndModules is registered as an internal action", async () => {
    const mod = await import("./knowledge/extractionActions");
    expect(mod.extractArchitectureAndModules).toBeDefined();
  });
});

describe("resync: clearRagNamespace registration", () => {
  it("clearRagNamespace is registered as an internal action", async () => {
    const mod = await import("./knowledge/embeddingActions");
    expect(mod.clearRagNamespace).toBeDefined();
  });
});

describe("resync: _deleteModulesByKb clears modules for re-sync", () => {
  it("deletes all modules for a ready KB and returns count", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const kbId = await seedKnowledgeBase(t, workspaceId, projectId, {
      status: "ready",
    });

    await seedModule(t, workspaceId, kbId, { name: "auth" });
    await seedModule(t, workspaceId, kbId, { name: "billing" });
    await seedModule(t, workspaceId, kbId, { name: "users" });

    const { internal } = await import("./_generated/api");
    const deletedCount = await t.mutation(
      internal.knowledge.internal._deleteModulesByKb,
      { knowledge_base_id: kbId },
    );

    expect(deletedCount).toBe(3);

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
});

describe("resync: _deleteChunksByKb clears chunks for re-sync", () => {
  it("deletes all chunks for a ready KB and returns count", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const kbId = await seedKnowledgeBase(t, workspaceId, projectId, {
      status: "ready",
    });

    await t.run(async (ctx) => {
      await ctx.db.insert("code_chunks", {
        workspace_id: workspaceId,
        knowledge_base_id: kbId,
        project_id: projectId,
        file_path: "src/a.ts",
        directory: "src",
        content: "const a = 1;",
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
        content: "const b = 2;",
        chunk_index: 0,
        language: "typescript",
        char_count: 13,
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
});

describe("resync: resyncKnowledgeBase registration", () => {
  it("resyncKnowledgeBase is registered as an action", async () => {
    const mod = await import("./knowledge/triggerIngestion");
    expect(mod.resyncKnowledgeBase).toBeDefined();
  });
});

describe("resync: resyncKnowledgeBase guard logic", () => {
  it("rejects when kb_status is 'building'", async () => {
    const t = convexTest(schema, modules).withIdentity({ subject: "user1" });
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProjectWithRepo(t, workspaceId, {
      kb_status: "building",
      repo_url: "https://github.com/test/repo",
      encrypted_pat: "encrypted_pat",
    });

    const { api } = await import("./_generated/api");
    await expect(
      t.action(api.knowledge.triggerIngestion.resyncKnowledgeBase, {
        project_id: projectId as never,
      }),
    ).rejects.toThrow("must be in 'ready' state");
  });

  it("rejects when kb_status is 'none'", async () => {
    const t = convexTest(schema, modules).withIdentity({ subject: "user1" });
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProjectWithRepo(t, workspaceId, {
      kb_status: "none",
      repo_url: "https://github.com/test/repo",
      encrypted_pat: "encrypted_pat",
    });

    const { api } = await import("./_generated/api");
    await expect(
      t.action(api.knowledge.triggerIngestion.resyncKnowledgeBase, {
        project_id: projectId as never,
      }),
    ).rejects.toThrow("must be in 'ready' state");
  });

  it("rejects when project has no connected repository", async () => {
    const t = convexTest(schema, modules).withIdentity({ subject: "user1" });
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProjectWithRepo(t, workspaceId, {
      kb_status: "ready",
    });

    const { api } = await import("./_generated/api");
    await expect(
      t.action(api.knowledge.triggerIngestion.resyncKnowledgeBase, {
        project_id: projectId as never,
      }),
    ).rejects.toThrow("no connected repository");
  });
});

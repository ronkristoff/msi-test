/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import {
  seedWorkspace,
  seedProject,
  seedKnowledgeBase,
  seedModule,
} from "./testHelpers";

const modules = import.meta.glob("./**/*.ts");

describe("getKnowledgeBase query", () => {
  it("returns full KB doc for owned project", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t, "user1");
    const projectId = await seedProject(t, workspaceId);
    const kbId = await seedKnowledgeBase(t, workspaceId, projectId, {
      status: "ready",
      architecture_summary: "A modular monolith",
      tech_stack: ["Next.js", "Convex"],
      folder_structure: "src/app/",
      architecture_type: "monolith",
      total_files: 247,
      total_size_bytes: 1258291,
      last_synced_at: 1700000000000,
    });

    const { api } = await import("./_generated/api");
    const asUser = t.withIdentity({ subject: "user1", issuer: "test" });
    const result = await asUser.query(api.knowledge.queries.getKnowledgeBase, {
      project_id: projectId,
    });

    expect(result).not.toBeNull();
    expect(result!._id).toBe(kbId);
    expect(result!.status).toBe("ready");
    expect(result!.architecture_summary).toBe("A modular monolith");
    expect(result!.tech_stack).toEqual(["Next.js", "Convex"]);
    expect(result!.folder_structure).toBe("src/app/");
    expect(result!.architecture_type).toBe("monolith");
    expect(result!.total_files).toBe(247);
    expect(result!.total_size_bytes).toBe(1258291);
    expect(result!.last_synced_at).toBe(1700000000000);
  });

  it("returns null when no KB exists", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t, "user1");
    const projectId = await seedProject(t, workspaceId);

    const { api } = await import("./_generated/api");
    const asUser = t.withIdentity({ subject: "user1", issuer: "test" });
    const result = await asUser.query(api.knowledge.queries.getKnowledgeBase, {
      project_id: projectId,
    });

    expect(result).toBeNull();
  });

  it("returns null for unauthenticated user", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t, "user1");
    const projectId = await seedProject(t, workspaceId);
    await seedKnowledgeBase(t, workspaceId, projectId, { status: "ready" });

    const { api } = await import("./_generated/api");
    const result = await t.query(api.knowledge.queries.getKnowledgeBase, {
      project_id: projectId,
    });

    expect(result).toBeNull();
  });

  it("returns null for project owned by different user", async () => {
    const t = convexTest(schema, modules);
    const ws1 = await seedWorkspace(t, "user1");
    const ws2 = await seedWorkspace(t, "user2");
    const projectId = await seedProject(t, ws2);
    await seedKnowledgeBase(t, ws2, projectId, { status: "ready" });

    const { api } = await import("./_generated/api");
    const asUser1 = t.withIdentity({ subject: "user1", issuer: "test" });
    const result = await asUser1.query(
      api.knowledge.queries.getKnowledgeBase,
      { project_id: projectId },
    );

    expect(result).toBeNull();
  });

  it("returns the latest KB when multiple exist", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t, "user1");
    const projectId = await seedProject(t, workspaceId);
    await seedKnowledgeBase(t, workspaceId, projectId, { status: "error" });
    const latestKbId = await seedKnowledgeBase(t, workspaceId, projectId, {
      status: "ready",
    });

    const { api } = await import("./_generated/api");
    const asUser = t.withIdentity({ subject: "user1", issuer: "test" });
    const result = await asUser.query(api.knowledge.queries.getKnowledgeBase, {
      project_id: projectId,
    });

    expect(result).not.toBeNull();
    expect(result!._id).toBe(latestKbId);
    expect(result!.status).toBe("ready");
  });
});

describe("getModules query", () => {
  it("returns modules for valid owned KB", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t, "user1");
    const projectId = await seedProject(t, workspaceId);
    const kbId = await seedKnowledgeBase(t, workspaceId, projectId, {
      status: "ready",
    });
    const module1Id = await seedModule(t, workspaceId, kbId, {
      name: "auth",
      description: "Authentication module",
      file_count: 5,
      dependencies: ["users"],
    });
    const module2Id = await seedModule(t, workspaceId, kbId, {
      name: "billing",
      description: "Billing system",
      file_count: 12,
      dependencies: ["users", "payments"],
    });

    const { api } = await import("./_generated/api");
    const asUser = t.withIdentity({ subject: "user1", issuer: "test" });
    const result = await asUser.query(api.knowledge.queries.getModules, {
      knowledge_base_id: kbId,
    });

    expect(result).not.toBeNull();
    expect(result!).toHaveLength(2);
    const names = result!.map((m) => m.name).sort();
    expect(names).toEqual(["auth", "billing"]);

    const authModule = result!.find((m) => m._id === module1Id);
    expect(authModule).toBeDefined();
    expect(authModule!.description).toBe("Authentication module");
    expect(authModule!.file_count).toBe(5);
    expect(authModule!.dependencies).toEqual(["users"]);

    const billingModule = result!.find((m) => m._id === module2Id);
    expect(billingModule).toBeDefined();
    expect(billingModule!.file_count).toBe(12);
    expect(billingModule!.dependencies).toEqual(["users", "payments"]);
  });

  it("returns empty array for KB with no modules", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t, "user1");
    const projectId = await seedProject(t, workspaceId);
    const kbId = await seedKnowledgeBase(t, workspaceId, projectId, {
      status: "ready",
    });

    const { api } = await import("./_generated/api");
    const asUser = t.withIdentity({ subject: "user1", issuer: "test" });
    const result = await asUser.query(api.knowledge.queries.getModules, {
      knowledge_base_id: kbId,
    });

    expect(result).toEqual([]);
  });

  it("returns null for unauthenticated user", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t, "user1");
    const projectId = await seedProject(t, workspaceId);
    const kbId = await seedKnowledgeBase(t, workspaceId, projectId, {
      status: "ready",
    });
    await seedModule(t, workspaceId, kbId, { name: "auth" });

    const { api } = await import("./_generated/api");
    const result = await t.query(api.knowledge.queries.getModules, {
      knowledge_base_id: kbId,
    });

    expect(result).toBeNull();
  });

  it("returns null for KB owned by different user", async () => {
    const t = convexTest(schema, modules);
    const ws1 = await seedWorkspace(t, "user1");
    const ws2 = await seedWorkspace(t, "user2");
    const projectId = await seedProject(t, ws2);
    const kbId = await seedKnowledgeBase(t, ws2, projectId, {
      status: "ready",
    });
    await seedModule(t, ws2, kbId, { name: "auth" });

    const { api } = await import("./_generated/api");
    const asUser1 = t.withIdentity({ subject: "user1", issuer: "test" });
    const result = await asUser1.query(api.knowledge.queries.getModules, {
      knowledge_base_id: kbId,
    });

    expect(result).toBeNull();
  });

  it("returns null for non-existent KB", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t, "user1");
    const projectId = await seedProject(t, workspaceId);
    const kbId = await seedKnowledgeBase(t, workspaceId, projectId, {
      status: "ready",
    });
    await t.run(async (ctx) => ctx.db.delete(kbId));

    const { api } = await import("./_generated/api");
    const asUser = t.withIdentity({ subject: "user1", issuer: "test" });
    const result = await asUser.query(api.knowledge.queries.getModules, {
      knowledge_base_id: kbId,
    });

    expect(result).toBeNull();
  });
});

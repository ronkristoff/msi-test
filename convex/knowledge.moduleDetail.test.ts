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

describe("getModule query", () => {
  it("returns full module doc for owned workspace module", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t, "user1");
    const projectId = await seedProject(t, workspaceId);
    const kbId = await seedKnowledgeBase(t, workspaceId, projectId, {
      status: "ready",
    });
    const moduleId = await seedModule(t, workspaceId, kbId, {
      name: "auth",
      description: "Authentication module",
      file_count: 5,
      files: ["src/auth/login.ts", "src/auth/session.ts"],
      dependencies: ["users", "database"],
      apis: [
        { path: "/api/login", method: "POST", description: "Login endpoint", request_shape: "{email, password}", response_shape: "{token}" },
      ],
      data_models: [
        { name: "Session", type: "table", fields: ["id", "userId"], relationships: ["User"] },
      ],
      user_flows: [
        { name: "Login Flow", route: "/login", description: "User logs in", components: ["LoginForm"] },
      ],
    });

    const { api } = await import("./_generated/api");
    const asUser = t.withIdentity({ subject: "user1", issuer: "test" });
    const result = await asUser.query(api.knowledge.queries.getModule, {
      module_id: moduleId,
    });

    expect(result).not.toBeNull();
    expect(result!._id).toBe(moduleId);
    expect(result!.name).toBe("auth");
    expect(result!.description).toBe("Authentication module");
    expect(result!.file_count).toBe(5);
    expect(result!.files).toEqual(["src/auth/login.ts", "src/auth/session.ts"]);
    expect(result!.dependencies).toEqual(["users", "database"]);
    expect(result!.apis).toEqual([
      { path: "/api/login", method: "POST", description: "Login endpoint", request_shape: "{email, password}", response_shape: "{token}" },
    ]);
    expect(result!.data_models).toEqual([
      { name: "Session", type: "table", fields: ["id", "userId"], relationships: ["User"] },
    ]);
    expect(result!.user_flows).toEqual([
      { name: "Login Flow", route: "/login", description: "User logs in", components: ["LoginForm"] },
    ]);
  });

  it("returns module with undefined apis/data_models/user_flows when not set", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t, "user1");
    const projectId = await seedProject(t, workspaceId);
    const kbId = await seedKnowledgeBase(t, workspaceId, projectId, {
      status: "ready",
    });
    const moduleId = await seedModule(t, workspaceId, kbId, {
      name: "utils",
    });

    const { api } = await import("./_generated/api");
    const asUser = t.withIdentity({ subject: "user1", issuer: "test" });
    const result = await asUser.query(api.knowledge.queries.getModule, {
      module_id: moduleId,
    });

    expect(result).not.toBeNull();
    expect(result!.name).toBe("utils");
    expect(result!.apis).toBeUndefined();
    expect(result!.data_models).toBeUndefined();
    expect(result!.user_flows).toBeUndefined();
  });

  it("returns null for module in unowned workspace", async () => {
    const t = convexTest(schema, modules);
    const ws1 = await seedWorkspace(t, "user1");
    void ws1;
    const ws2 = await seedWorkspace(t, "user2");
    const projectId2 = await seedProject(t, ws2);
    const kbId2 = await seedKnowledgeBase(t, ws2, projectId2, {
      status: "ready",
    });
    const moduleId = await seedModule(t, ws2, kbId2, { name: "auth" });

    const { api } = await import("./_generated/api");
    const asUser1 = t.withIdentity({ subject: "user1", issuer: "test" });
    const result = await asUser1.query(api.knowledge.queries.getModule, {
      module_id: moduleId,
    });

    expect(result).toBeNull();
  });

  it("returns null for non-existent module ID", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t, "user1");
    const projectId = await seedProject(t, workspaceId);
    const kbId = await seedKnowledgeBase(t, workspaceId, projectId, {
      status: "ready",
    });
    const moduleId = await seedModule(t, workspaceId, kbId, { name: "auth" });
    await t.run(async (ctx) => ctx.db.delete(moduleId));

    const { api } = await import("./_generated/api");
    const asUser = t.withIdentity({ subject: "user1", issuer: "test" });
    const result = await asUser.query(api.knowledge.queries.getModule, {
      module_id: moduleId,
    });

    expect(result).toBeNull();
  });

  it("returns null when not authenticated", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t, "user1");
    const projectId = await seedProject(t, workspaceId);
    const kbId = await seedKnowledgeBase(t, workspaceId, projectId, {
      status: "ready",
    });
    const moduleId = await seedModule(t, workspaceId, kbId, { name: "auth" });

    const { api } = await import("./_generated/api");
    const result = await t.query(api.knowledge.queries.getModule, {
      module_id: moduleId,
    });

    expect(result).toBeNull();
  });
});

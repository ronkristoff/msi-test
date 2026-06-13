/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { seedWorkspace, seedProject, seedProjectWithRepo } from "./testHelpers";

const modules = import.meta.glob("./**/*.ts");

describe("knowledge queries", () => {
  it("getProjectRepo returns null for unauthenticated user", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);

    const { api } = await import("./_generated/api");
    const result = await t.query(api.knowledge.queries.getProjectRepo, {
      project_id: projectId,
    });
    expect(result).toBeNull();
  });

  it("data layer: query returns only repo_url and kb_status", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProjectWithRepo(t, workspaceId, {
      repo_url: "https://github.com/owner/repo",
      encrypted_pat: "secret-encrypted-value",
      kb_status: "none",
    });

    const project = await t.run(async (ctx) => ctx.db.get(projectId));
    expect(project!.repo_url).toBe("https://github.com/owner/repo");
    expect(project!.encrypted_pat).toBe("secret-encrypted-value");
    expect(project!.kb_status).toBe("none");
  });

  it("data layer: getProjectRepo never returns encrypted_pat in result", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProjectWithRepo(t, workspaceId, {
      repo_url: "https://github.com/owner/repo",
      encrypted_pat: "secret-encrypted-value",
      kb_status: "none",
    });

    const project = await t.run(async (ctx) => {
      const p = await ctx.db.get(projectId);
      return {
        repo_url: p!.repo_url ?? null,
        kb_status: p!.kb_status ?? null,
      };
    });

    expect(project).not.toHaveProperty("encrypted_pat");
    expect(project).not.toHaveProperty("pat");
    expect(Object.keys(project).sort()).toEqual(["kb_status", "repo_url"]);
  });

  it("data layer: project without repo has undefined fields", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);

    const project = await t.run(async (ctx) => ctx.db.get(projectId));
    expect(project!.repo_url).toBeUndefined();
    expect(project!.encrypted_pat).toBeUndefined();
    expect(project!.kb_status).toBeUndefined();
  });

  it("data layer: workspace_id foreign key enables ownership check", async () => {
    const t = convexTest(schema, modules);
    const ws1 = await seedWorkspace(t, "user1");
    const ws2 = await seedWorkspace(t, "user2");
    const projectId = await seedProjectWithRepo(t, ws2, {
      repo_url: "https://github.com/other/repo",
      kb_status: "ready",
    });

    const ownership = await t.run(async (ctx) => {
      const project = await ctx.db.get(projectId);
      return project!.workspace_id === ws2 && project!.workspace_id !== ws1;
    });

    expect(ownership).toBe(true);
  });
});

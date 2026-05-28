/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import { api } from "./_generated/api";
import schema from "./schema";
import { seedWorkspace } from "./testHelpers";

const modules = import.meta.glob("./**/*.ts");

describe("projects mutations", () => {
  it("createProject rejects unauthenticated user", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);

    await expect(
      t.mutation(api.projects.mutations.createProject, {
        workspace_id: workspaceId,
        name: "My App",
        app_url: "https://myapp.com",
      }),
    ).rejects.toThrow("Not authenticated");
  });

  it("updateProject rejects unauthenticated user", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);

    const projectId = await t.run(async (ctx) => {
      return ctx.db.insert("projects", {
        workspace_id: workspaceId,
        name: "Proj",
        app_url: "https://proj.com",
      });
    });

    await expect(
      t.mutation(api.projects.mutations.updateProject, {
        project_id: projectId,
        name: "Hacked",
      }),
    ).rejects.toThrow("Not authenticated");
  });

  it("validation: normalizeAppUrl prepends https://", async () => {
    const { normalizeAppUrl } = await import("./lib/validation");
    expect(normalizeAppUrl("myapp.com")).toBe("https://myapp.com");
    expect(normalizeAppUrl("https://myapp.com")).toBe("https://myapp.com");
    expect(normalizeAppUrl("http://myapp.com")).toBe("http://myapp.com");
  });

  it("validation: normalizeAppUrl rejects empty", async () => {
    const { normalizeAppUrl } = await import("./lib/validation");
    expect(() => normalizeAppUrl("")).toThrow();
    expect(() => normalizeAppUrl("  ")).toThrow();
  });

  it("validation: normalizeAppUrl rejects invalid URL", async () => {
    const { normalizeAppUrl } = await import("./lib/validation");
    expect(() => normalizeAppUrl("not a url")).toThrow();
  });

  it("validation: validateProjectName rejects empty/too long", async () => {
    const { validateProjectName } = await import("./lib/validation");
    expect(() => validateProjectName("")).toThrow();
    expect(() => validateProjectName("  ")).toThrow();
    expect(() => validateProjectName("a".repeat(101))).toThrow();
    expect(validateProjectName("Valid Name")).toBe("Valid Name");
  });

  it("data layer: projects can be inserted and queried by workspace", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);

    const p1 = await t.run(async (ctx) => {
      return ctx.db.insert("projects", {
        workspace_id: workspaceId,
        name: "Project A",
        app_url: "https://a.com",
      });
    });

    const p2 = await t.run(async (ctx) => {
      return ctx.db.insert("projects", {
        workspace_id: workspaceId,
        name: "Project B",
        app_url: "https://b.com",
        prd_text: "PRD content",
      });
    });

    const projects = await t.run(async (ctx) => {
      return ctx.db
        .query("projects")
        .withIndex("by_workspace_id", (q) => q.eq("workspace_id", workspaceId))
        .collect();
    });

    expect(projects).toHaveLength(2);
    expect(projects.find((p) => p._id === p1)!.name).toBe("Project A");
    expect(projects.find((p) => p._id === p2)!.prd_text).toBe("PRD content");
  });

  it("data layer: unique name index prevents duplicates", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);

    await t.run(async (ctx) => {
      await ctx.db.insert("projects", {
        workspace_id: workspaceId,
        name: "Unique",
        app_url: "https://unique.com",
      });
    });

    const duplicate = await t.run(async (ctx) => {
      const existing = await ctx.db
        .query("projects")
        .withIndex("by_workspace_id_and_name", (q) =>
          q.eq("workspace_id", workspaceId).eq("name", "Unique"),
        )
        .first();
      return existing !== null;
    });

    expect(duplicate).toBe(true);
  });

  it("data layer: same name allowed in different workspaces", async () => {
    const t = convexTest(schema, modules);
    const ws1 = await seedWorkspace(t, "owner1");
    const ws2 = await seedWorkspace(t, "owner2");

    await t.run(async (ctx) => {
      await ctx.db.insert("projects", {
        workspace_id: ws1,
        name: "Shared",
        app_url: "https://shared.com",
      });
      await ctx.db.insert("projects", {
        workspace_id: ws2,
        name: "Shared",
        app_url: "https://shared.com",
      });
    });

    const ws1Projects = await t.run(async (ctx) => {
      return ctx.db
        .query("projects")
        .withIndex("by_workspace_id", (q) => q.eq("workspace_id", ws1))
        .collect();
    });

    const ws2Projects = await t.run(async (ctx) => {
      return ctx.db
        .query("projects")
        .withIndex("by_workspace_id", (q) => q.eq("workspace_id", ws2))
        .collect();
    });

    expect(ws1Projects).toHaveLength(1);
    expect(ws2Projects).toHaveLength(1);
    expect(ws1Projects[0].name).toBe("Shared");
    expect(ws2Projects[0].name).toBe("Shared");
  });

  it("data layer: update via patch preserves other fields", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);

    const projectId = await t.run(async (ctx) => {
      return ctx.db.insert("projects", {
        workspace_id: workspaceId,
        name: "Original",
        app_url: "https://original.com",
        prd_text: "Keep this",
      });
    });

    await t.run(async (ctx) => {
      await ctx.db.patch(projectId, { name: "Updated" });
    });

    const project = await t.run(async (ctx) => {
      return ctx.db.get(projectId);
    });

    expect(project!.name).toBe("Updated");
    expect(project!.app_url).toBe("https://original.com");
    expect(project!.prd_text).toBe("Keep this");
  });
});

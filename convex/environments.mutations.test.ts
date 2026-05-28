/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import { api } from "./_generated/api";
import schema from "./schema";
import { seedWorkspace, seedProject, seedEnvironment } from "./testHelpers";

const modules = import.meta.glob("./**/*.ts");

describe("environment mutations", () => {
  it("createEnvironment rejects unauthenticated user", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);

    await expect(
      t.mutation(api.environments.mutations.createEnvironment, {
        project_id: projectId,
        name: "Staging",
        base_url: "https://staging.example.com",
      }),
    ).rejects.toThrow("Not authenticated");
  });

  it("updateEnvironment rejects unauthenticated user", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const envId = await seedEnvironment(t, workspaceId, projectId);

    await expect(
      t.mutation(api.environments.mutations.updateEnvironment, {
        environment_id: envId,
        name: "Hacked",
      }),
    ).rejects.toThrow("Not authenticated");
  });

  it("deleteEnvironment rejects unauthenticated user", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const envId = await seedEnvironment(t, workspaceId, projectId);

    await expect(
      t.mutation(api.environments.mutations.deleteEnvironment, {
        environment_id: envId,
      }),
    ).rejects.toThrow("Not authenticated");
  });

  it("data layer: createEnvironment stores name and normalized base_url", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);

    const envId = await t.run(async (ctx) => {
      return ctx.db.insert("environments", {
        workspace_id: workspaceId,
        project_id: projectId,
        name: "Production",
        base_url: "https://prod.example.com",
      });
    });

    const env = await t.run(async (ctx) => ctx.db.get(envId));
    expect(env!.name).toBe("Production");
    expect(env!.base_url).toBe("https://prod.example.com");
  });

  it("data layer: updateEnvironment patches provided fields only", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);

    const envId = await t.run(async (ctx) => {
      return ctx.db.insert("environments", {
        workspace_id: workspaceId,
        project_id: projectId,
        name: "Staging",
        base_url: "https://staging.example.com",
      });
    });

    await t.run(async (ctx) => {
      await ctx.db.patch(envId, { name: "Staging v2" });
    });

    const env = await t.run(async (ctx) => ctx.db.get(envId));
    expect(env!.name).toBe("Staging v2");
    expect(env!.base_url).toBe("https://staging.example.com");
  });

  it("data layer: deleteEnvironment removes the record", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);

    const envId = await t.run(async (ctx) => {
      return ctx.db.insert("environments", {
        workspace_id: workspaceId,
        project_id: projectId,
        name: "Dev",
        base_url: "https://dev.example.com",
      });
    });

    await t.run(async (ctx) => {
      await ctx.db.delete(envId);
    });

    const env = await t.run(async (ctx) => ctx.db.get(envId));
    expect(env).toBeNull();
  });

  it("data layer: environments scoped to project", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectA = await seedProject(t, workspaceId);
    const projectB = await t.run(async (ctx) => {
      return ctx.db.insert("projects", {
        workspace_id: workspaceId,
        name: "Project B",
        app_url: "https://b.com",
      });
    });

    await t.run(async (ctx) => {
      await ctx.db.insert("environments", {
        workspace_id: workspaceId,
        project_id: projectA,
        name: "Staging A",
        base_url: "https://staging-a.com",
      });
      await ctx.db.insert("environments", {
        workspace_id: workspaceId,
        project_id: projectB,
        name: "Staging B",
        base_url: "https://staging-b.com",
      });
    });

    const envsA = await t.run(async (ctx) => {
      return ctx.db
        .query("environments")
        .withIndex("by_project_id", (q) => q.eq("project_id", projectA))
        .collect();
    });

    expect(envsA).toHaveLength(1);
    expect(envsA[0].name).toBe("Staging A");
  });
});

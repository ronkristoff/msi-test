/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { seedWorkspace, seedProject, seedUserStory } from "./testHelpers";

const modules = import.meta.glob("./**/*.ts");

describe("stories: listStories", () => {
  it("returns stories ordered by generated_at desc when no status filter", async () => {
    const t = convexTest(schema, modules).withIdentity({ subject: "user1" });
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);

    await seedUserStory(t, workspaceId, projectId, "t1", {
      title: "Oldest",
      generated_at: 1000,
    });
    await seedUserStory(t, workspaceId, projectId, "t1", {
      title: "Newest",
      generated_at: 3000,
    });
    await seedUserStory(t, workspaceId, projectId, "t1", {
      title: "Middle",
      generated_at: 2000,
    });

    const { api } = await import("./_generated/api");
    const result = await t.query(api.stories.queries.listStories, {
      project_id: projectId,
    });

    expect(result).not.toBeNull();
    expect(result!).toHaveLength(3);
    expect(result![0].title).toBe("Newest");
    expect(result![1].title).toBe("Middle");
    expect(result![2].title).toBe("Oldest");
  });

  it("filters by status=draft using by_project_id_and_status index", async () => {
    const t = convexTest(schema, modules).withIdentity({ subject: "user1" });
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);

    await seedUserStory(t, workspaceId, projectId, "t1", {
      title: "Draft 1",
      status: "draft",
      generated_at: 1000,
    });
    await seedUserStory(t, workspaceId, projectId, "t1", {
      title: "Approved 1",
      status: "approved",
      generated_at: 2000,
    });
    await seedUserStory(t, workspaceId, projectId, "t1", {
      title: "Draft 2",
      status: "draft",
      generated_at: 3000,
    });
    await seedUserStory(t, workspaceId, projectId, "t1", {
      title: "Exported 1",
      status: "exported",
      generated_at: 4000,
    });

    const { api } = await import("./_generated/api");
    const result = await t.query(api.stories.queries.listStories, {
      project_id: projectId,
      status: "draft",
    });

    expect(result).not.toBeNull();
    expect(result!).toHaveLength(2);
    expect(result!.map((s: { title: string }) => s.title)).toEqual(["Draft 2", "Draft 1"]);
  });

  it("filters by status=approved", async () => {
    const t = convexTest(schema, modules).withIdentity({ subject: "user1" });
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);

    await seedUserStory(t, workspaceId, projectId, "t1", {
      title: "D",
      status: "draft",
    });
    await seedUserStory(t, workspaceId, projectId, "t1", {
      title: "A",
      status: "approved",
    });

    const { api } = await import("./_generated/api");
    const result = await t.query(api.stories.queries.listStories, {
      project_id: projectId,
      status: "approved",
    });

    expect(result!).toHaveLength(1);
    expect(result![0].title).toBe("A");
  });

  it("returns null for cross-workspace project", async () => {
    const t = convexTest(schema, modules).withIdentity({ subject: "user1" });
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    await seedUserStory(t, workspaceId, projectId, "t1", { title: "S1" });

    const otherWorkspaceId = await t.run(async (ctx) => {
      const wsId = await ctx.db.insert("workspaces", {
        name: "Other WS",
        owner_id: "user2",
        ai_config: {
          endpoint_url: "https://api.example.com",
          api_key: "key",
          model_name: "gpt-4",
        },
      });
      await ctx.db.insert("workspace_members", {
        workspace_id: wsId,
        user_id: "user2",
        role: "owner",
        invited_at: Date.now(),
        user_name: "user2",
      });
      return wsId;
    });
    const otherProjectId = await seedProject(t, otherWorkspaceId);
    await seedUserStory(t, otherWorkspaceId, otherProjectId, "other", {
      title: "Other WS story",
    });

    const { api } = await import("./_generated/api");
    const result = await t.query(api.stories.queries.listStories, {
      project_id: otherProjectId,
    });

    expect(result).toBeNull();
  });

  it("returns empty array (not null) for project with no stories", async () => {
    const t = convexTest(schema, modules).withIdentity({ subject: "user1" });
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);

    const { api } = await import("./_generated/api");
    const result = await t.query(api.stories.queries.listStories, {
      project_id: projectId,
    });

    expect(result).toEqual([]);
  });

  it("returns summary shape with content values, not just types", async () => {
    const t = convexTest(schema, modules).withIdentity({ subject: "user1" });
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);

    await seedUserStory(t, workspaceId, projectId, "t1", {
      title: "My Story",
      status: "approved",
      generated_at: 5000,
      updated_at: 9000,
      acceptance_criteria: ["AC1", "AC2", "AC3"],
      affected_components: {
        modules: ["auth", "users"],
        apis: ["POST /login"],
        data_models: [],
      },
      technical_context: "ctx",
    });

    const { api } = await import("./_generated/api");
    const result = await t.query(api.stories.queries.listStories, {
      project_id: projectId,
    });

    expect(result!).toHaveLength(1);
    const row = result![0];
    expect(row.title).toBe("My Story");
    expect(row.status).toBe("approved");
    expect(row.generated_at).toBe(5000);
    expect(row.updated_at).toBe(9000);
    expect(row.acceptance_criteria_count).toBe(3);
    expect(row.affected_components.modules).toEqual(["auth", "users"]);
    expect(row.affected_components.apis).toEqual(["POST /login"]);
    expect(row.affected_components.data_models).toEqual([]);
  });

  it("summary shape does not include the full acceptance_criteria array", async () => {
    const t = convexTest(schema, modules).withIdentity({ subject: "user1" });
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);

    await seedUserStory(t, workspaceId, projectId, "t1", {
      acceptance_criteria: ["AC1", "AC2", "AC3"],
    });

    const { api } = await import("./_generated/api");
    const result = await t.query(api.stories.queries.listStories, {
      project_id: projectId,
    });

    expect(result!).toHaveLength(1);
    const row = result![0] as Record<string, unknown>;
    expect(row.acceptance_criteria).toBeUndefined();
    expect(row.user_story).toBeUndefined();
    expect(row.technical_context).toBeUndefined();
  });

  it("is bounded to 100 rows", async () => {
    const t = convexTest(schema, modules).withIdentity({ subject: "user1" });
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);

    for (let i = 0; i < 101; i++) {
      await seedUserStory(t, workspaceId, projectId, "t1", {
        title: `Story ${i}`,
        generated_at: i,
      });
    }

    const { api } = await import("./_generated/api");
    const result = await t.query(api.stories.queries.listStories, {
      project_id: projectId,
    });

    expect(result!).toHaveLength(100);
  });
});

describe("stories: getStory", () => {
  it("returns the full story doc including acceptance_criteria and technical_context", async () => {
    const t = convexTest(schema, modules).withIdentity({ subject: "user1" });
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);

    const storyId = await seedUserStory(t, workspaceId, projectId, "t1", {
      title: "Full Story",
      acceptance_criteria: ["Given x When y Then z"],
      technical_context: "Follows convention: zod-validation",
      affected_components: {
        modules: ["m1"],
        apis: [],
        data_models: ["d1"],
      },
    });

    const { api } = await import("./_generated/api");
    const result = await t.query(api.stories.queries.getStory, {
      story_id: storyId,
    });

    expect(result).not.toBeNull();
    expect(result!.title).toBe("Full Story");
    expect(result!.acceptance_criteria).toEqual(["Given x When y Then z"]);
    expect(result!.technical_context).toBe("Follows convention: zod-validation");
    expect(result!.affected_components.modules).toEqual(["m1"]);
    expect(result!.affected_components.data_models).toEqual(["d1"]);
    expect(result!.workspace_id).toBe(workspaceId);
    expect(result!.project_id).toBe(projectId);
    expect(result!.thread_id).toBe("t1");
  });

  it("returns null for cross-workspace story", async () => {
    const t = convexTest(schema, modules).withIdentity({ subject: "user1" });
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const storyId = await seedUserStory(t, workspaceId, projectId, "t1");

    await t.run(async (ctx) => {
      const wsId = await ctx.db.insert("workspaces", {
        name: "Other WS",
        owner_id: "user2",
        ai_config: {
          endpoint_url: "https://api.example.com",
          api_key: "key",
          model_name: "gpt-4",
        },
      });
      await ctx.db.insert("workspace_members", {
        workspace_id: wsId,
        user_id: "user2",
        role: "owner",
        invited_at: Date.now(),
        user_name: "user2",
      });
    });

    const { api } = await import("./_generated/api");
    const ownResult = await t.query(api.stories.queries.getStory, {
      story_id: storyId,
    });
    expect(ownResult).not.toBeNull();

    const t2 = convexTest(schema, modules).withIdentity({ subject: "user2" });
    const otherResult = await t2.query(api.stories.queries.getStory, {
      story_id: storyId,
    });
    expect(otherResult).toBeNull();
  });

  it("returns null for non-existent story id", async () => {
    const t = convexTest(schema, modules).withIdentity({ subject: "user1" });
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const storyId = await seedUserStory(t, workspaceId, projectId, "t1");
    await t.run(async (ctx) => ctx.db.delete(storyId));

    const { api } = await import("./_generated/api");
    const result = await t.query(api.stories.queries.getStory, {
      story_id: storyId,
    });

    expect(result).toBeNull();
  });
});

describe("stories: updateStoryStatus", () => {
  it("transitions draft -> approved and sets updated_at", async () => {
    const t = convexTest(schema, modules).withIdentity({ subject: "user1" });
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const storyId = await seedUserStory(t, workspaceId, projectId, "t1", {
      status: "draft",
    });

    const before = Date.now();
    const { api } = await import("./_generated/api");
    await t.mutation(api.stories.mutations.updateStoryStatus, {
      story_id: storyId,
      status: "approved",
    });

    const story = await t.query(api.stories.queries.getStory, {
      story_id: storyId,
    });
    expect(story!.status).toBe("approved");
    expect(story!.updated_at).toBeGreaterThanOrEqual(before);
  });

  it("transitions approved -> exported and sets updated_at", async () => {
    const t = convexTest(schema, modules).withIdentity({ subject: "user1" });
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const storyId = await seedUserStory(t, workspaceId, projectId, "t1", {
      status: "approved",
    });

    const before = Date.now();
    const { api } = await import("./_generated/api");
    await t.mutation(api.stories.mutations.updateStoryStatus, {
      story_id: storyId,
      status: "exported",
    });

    const story = await t.query(api.stories.queries.getStory, {
      story_id: storyId,
    });
    expect(story!.status).toBe("exported");
    expect(story!.updated_at).toBeGreaterThanOrEqual(before);
  });

  it("rejects draft -> exported skip", async () => {
    const t = convexTest(schema, modules).withIdentity({ subject: "user1" });
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const storyId = await seedUserStory(t, workspaceId, projectId, "t1", {
      status: "draft",
    });

    const { api } = await import("./_generated/api");
    await expect(
      t.mutation(api.stories.mutations.updateStoryStatus, {
        story_id: storyId,
        status: "exported",
      }),
    ).rejects.toThrow(/Cannot change story status from draft to exported/);
  });

  it("rejects approved -> draft reversal", async () => {
    const t = convexTest(schema, modules).withIdentity({ subject: "user1" });
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const storyId = await seedUserStory(t, workspaceId, projectId, "t1", {
      status: "approved",
    });

    const { api } = await import("./_generated/api");
    await expect(
      t.mutation(api.stories.mutations.updateStoryStatus, {
        story_id: storyId,
        status: "draft",
      }),
    ).rejects.toThrow(/Cannot change story status from approved to draft/);
  });

  it("rejects exported -> approved", async () => {
    const t = convexTest(schema, modules).withIdentity({ subject: "user1" });
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const storyId = await seedUserStory(t, workspaceId, projectId, "t1", {
      status: "exported",
    });

    const { api } = await import("./_generated/api");
    await expect(
      t.mutation(api.stories.mutations.updateStoryStatus, {
        story_id: storyId,
        status: "approved",
      }),
    ).rejects.toThrow(/Cannot change story status from exported to approved/);
  });

  it("rejects exported -> draft", async () => {
    const t = convexTest(schema, modules).withIdentity({ subject: "user1" });
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const storyId = await seedUserStory(t, workspaceId, projectId, "t1", {
      status: "exported",
    });

    const { api } = await import("./_generated/api");
    await expect(
      t.mutation(api.stories.mutations.updateStoryStatus, {
        story_id: storyId,
        status: "draft",
      }),
    ).rejects.toThrow(/Cannot change story status from exported to draft/);
  });

  it("rejects same-status no-op (draft -> draft)", async () => {
    const t = convexTest(schema, modules).withIdentity({ subject: "user1" });
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const storyId = await seedUserStory(t, workspaceId, projectId, "t1", {
      status: "draft",
    });

    const { api } = await import("./_generated/api");
    await expect(
      t.mutation(api.stories.mutations.updateStoryStatus, {
        story_id: storyId,
        status: "draft",
      }),
    ).rejects.toThrow(/Story is already draft/);
  });

  it("throws Story not found for cross-workspace story", async () => {
    const t = convexTest(schema, modules).withIdentity({ subject: "user1" });
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const storyId = await seedUserStory(t, workspaceId, projectId, "t1", {
      status: "draft",
    });

    const t2 = convexTest(schema, modules).withIdentity({ subject: "user2" });
    await t2.run(async (ctx) => {
      const wsId = await ctx.db.insert("workspaces", {
        name: "Other WS",
        owner_id: "user2",
        ai_config: {
          endpoint_url: "https://api.example.com",
          api_key: "key",
          model_name: "gpt-4",
        },
      });
      await ctx.db.insert("workspace_members", {
        workspace_id: wsId,
        user_id: "user2",
        role: "owner",
        invited_at: Date.now(),
        user_name: "user2",
      });
    });

    const { api } = await import("./_generated/api");
    await expect(
      t2.mutation(api.stories.mutations.updateStoryStatus, {
        story_id: storyId,
        status: "approved",
      }),
    ).rejects.toThrow(/Story not found/);
  });

  it("throws Story not found for non-existent story", async () => {
    const t = convexTest(schema, modules).withIdentity({ subject: "user1" });
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const storyId = await seedUserStory(t, workspaceId, projectId, "t1");
    await t.run(async (ctx) => ctx.db.delete(storyId));

    const { api } = await import("./_generated/api");
    await expect(
      t.mutation(api.stories.mutations.updateStoryStatus, {
        story_id: storyId,
        status: "approved",
      }),
    ).rejects.toThrow(/Story not found/);
  });
});

describe("stories: deleteStory", () => {
  it("deletes the row", async () => {
    const t = convexTest(schema, modules).withIdentity({ subject: "user1" });
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const storyId = await seedUserStory(t, workspaceId, projectId, "t1");

    const { api } = await import("./_generated/api");
    await t.mutation(api.stories.mutations.deleteStory, {
      story_id: storyId,
    });

    const story = await t.query(api.stories.queries.getStory, {
      story_id: storyId,
    });
    expect(story).toBeNull();
  });

  it("throws Story not found for cross-workspace story", async () => {
    const t = convexTest(schema, modules).withIdentity({ subject: "user1" });
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const storyId = await seedUserStory(t, workspaceId, projectId, "t1");

    const t2 = convexTest(schema, modules).withIdentity({ subject: "user2" });
    await t2.run(async (ctx) => {
      const wsId = await ctx.db.insert("workspaces", {
        name: "Other WS",
        owner_id: "user2",
        ai_config: {
          endpoint_url: "https://api.example.com",
          api_key: "key",
          model_name: "gpt-4",
        },
      });
      await ctx.db.insert("workspace_members", {
        workspace_id: wsId,
        user_id: "user2",
        role: "owner",
        invited_at: Date.now(),
        user_name: "user2",
      });
    });

    const { api } = await import("./_generated/api");
    await expect(
      t2.mutation(api.stories.mutations.deleteStory, {
        story_id: storyId,
      }),
    ).rejects.toThrow(/Story not found/);
  });

  it("throws Story not found for non-existent story", async () => {
    const t = convexTest(schema, modules).withIdentity({ subject: "user1" });
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const storyId = await seedUserStory(t, workspaceId, projectId, "t1");
    await t.run(async (ctx) => ctx.db.delete(storyId));

    const { api } = await import("./_generated/api");
    await expect(
      t.mutation(api.stories.mutations.deleteStory, {
        story_id: storyId,
      }),
    ).rejects.toThrow(/Story not found/);
  });
});

/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import { api } from "./_generated/api";
import schema from "./schema";
import { seedWorkspace, seedTestDoc } from "./testHelpers";
import type { Id } from "./_generated/dataModel";

const modules = import.meta.glob("./**/*.ts");

async function seedList(t: ReturnType<typeof convexTest>, workspaceId: Id<"workspaces">) {
  return t.run(async (ctx) => {
    return ctx.db.insert("test_lists", {
      workspace_id: workspaceId,
      name: "Test List",
      created_by: "user1",
    });
  }) as Promise<Id<"test_lists">>;
}

async function seedMember(
  t: ReturnType<typeof convexTest>,
  args: {
    workspace_id: Id<"workspaces">;
    test_list_id: Id<"test_lists">;
    test_id: Id<"tests">;
    source_suite_id: Id<"suites">;
    source_project_id: Id<"projects">;
  },
) {
  return t.run(async (ctx) => {
    return ctx.db.insert("test_list_members", {
      ...args,
      added_at: Date.now(),
    });
  });
}

describe("test_lists auth rejection", () => {
  it("createTestList rejects unauthenticated", async () => {
    const t = convexTest(schema, modules);
    await seedWorkspace(t);
    await expect(
      t.mutation(api.test_lists.mutations.createTestList, { name: "X" }),
    ).rejects.toThrow("Not authenticated");
  });

  it("getTestLists returns empty when unauthenticated", async () => {
    const t = convexTest(schema, modules);
    const result = await t.query(api.test_lists.queries.getTestLists);
    expect(result).toEqual([]);
  });

  it("getApprovedTestsForWorkspace returns empty when unauthenticated", async () => {
    const t = convexTest(schema, modules);
    const result = await t.query(api.test_lists.queries.getApprovedTestsForWorkspace);
    expect(result).toEqual([]);
  });
});

describe("test_lists data layer", () => {
  it("test_list_members require workspace_id, source_suite_id, source_project_id", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = (await seedWorkspace(t)) as Id<"workspaces">;
    const { projectId, suiteId, testId } = await seedTestDoc(t, workspaceId, { status: "approved" });
    const listId = await seedList(t, workspaceId);

    const memberId = await seedMember(t, {
      workspace_id: workspaceId,
      test_list_id: listId,
      test_id: testId as Id<"tests">,
      source_suite_id: suiteId as Id<"suites">,
      source_project_id: projectId as Id<"projects">,
    });

    const member = await t.run(async (ctx) => ctx.db.get(memberId));
    expect(member!.workspace_id).toBe(workspaceId);
    expect(member!.source_suite_id).toBe(suiteId);
    expect(member!.source_project_id).toBe(projectId);
    expect(member!.test_list_id).toBe(listId);
    expect(member!.test_id).toBe(testId);
  });

  it("deleteTestList cascades to members", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = (await seedWorkspace(t)) as Id<"workspaces">;
    const { projectId, suiteId, testId } = await seedTestDoc(t, workspaceId, { status: "approved" });
    const listId = await seedList(t, workspaceId);

    await seedMember(t, {
      workspace_id: workspaceId,
      test_list_id: listId,
      test_id: testId as Id<"tests">,
      source_suite_id: suiteId as Id<"suites">,
      source_project_id: projectId as Id<"projects">,
    });

    await t.run(async (ctx) => {
      const members = await ctx.db
        .query("test_list_members")
        .withIndex("by_test_list_id", (q) => q.eq("test_list_id", listId))
        .collect();
      for (const m of members) await ctx.db.delete(m._id);
      await ctx.db.delete(listId);
    });

    const list = await t.run(async (ctx) => ctx.db.get(listId));
    expect(list).toBeNull();

    const members = await t.run(async (ctx) =>
      ctx.db
        .query("test_list_members")
        .withIndex("by_test_list_id", (q) => q.eq("test_list_id", listId))
        .collect(),
    );
    expect(members).toHaveLength(0);
  });

  it("removeTestFromList removes only the specified member", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = (await seedWorkspace(t)) as Id<"workspaces">;
    const { projectId, suiteId, testId: t1 } = await seedTestDoc(t, workspaceId, { name: "A", status: "approved" });
    const listId = await seedList(t, workspaceId);

    await seedMember(t, {
      workspace_id: workspaceId,
      test_list_id: listId,
      test_id: t1 as Id<"tests">,
      source_suite_id: suiteId as Id<"suites">,
      source_project_id: projectId as Id<"projects">,
    });

    const { suiteId: suiteId2, testId: t2 } = await seedTestDoc(t, workspaceId, { name: "B", status: "approved" });
    await seedMember(t, {
      workspace_id: workspaceId,
      test_list_id: listId,
      test_id: t2 as Id<"tests">,
      source_suite_id: suiteId2 as Id<"suites">,
      source_project_id: projectId as Id<"projects">,
    });

    await t.run(async (ctx) => {
      const member = await ctx.db
        .query("test_list_members")
        .withIndex("by_test_list_id", (q) => q.eq("test_list_id", listId))
        .filter((q) => q.eq(q.field("test_id"), t1))
        .first();
      await ctx.db.delete(member!._id);
    });

    const remaining = await t.run(async (ctx) =>
      ctx.db
        .query("test_list_members")
        .withIndex("by_test_list_id", (q) => q.eq("test_list_id", listId))
        .collect(),
    );
    expect(remaining).toHaveLength(1);
    expect(remaining[0].test_id).toBe(t2);
  });

  it("test_list_id on runs links run to test list", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = (await seedWorkspace(t)) as Id<"workspaces">;
    const { projectId, suiteId } = await seedTestDoc(t, workspaceId, { status: "approved" });
    const listId = await seedList(t, workspaceId);

    const runId = await t.run(async (ctx) => {
      return ctx.db.insert("runs", {
        workspace_id: workspaceId,
        project_id: projectId,
        suite_id: suiteId,
        test_list_id: listId,
        trigger_type: "manual",
        status: "running",
      });
    });

    const run = await t.run(async (ctx) => ctx.db.get(runId));
    expect(run!.test_list_id).toBe(listId);
  });

  it("list members are scoped by workspace_id", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = (await seedWorkspace(t)) as Id<"workspaces">;
    const { projectId, suiteId, testId } = await seedTestDoc(t, workspaceId, { status: "approved" });
    const listId = await seedList(t, workspaceId);

    await seedMember(t, {
      workspace_id: workspaceId,
      test_list_id: listId,
      test_id: testId as Id<"tests">,
      source_suite_id: suiteId as Id<"suites">,
      source_project_id: projectId as Id<"projects">,
    });

    const members = await t.run(async (ctx) =>
      ctx.db
        .query("test_list_members")
        .filter((q) => q.eq(q.field("workspace_id"), workspaceId))
        .collect(),
    );
    expect(members).toHaveLength(1);
    expect(members[0].test_list_id).toBe(listId);
  });
});

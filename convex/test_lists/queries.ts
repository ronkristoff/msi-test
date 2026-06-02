import { query } from "../_generated/server";
import { v } from "convex/values";
import { getOptionalOwnedEntity, getOptionalMemberWorkspace } from "../lib/requireAuth";

export const getTestLists = query({
  args: {},
  handler: async (ctx) => {
    const result = await getOptionalMemberWorkspace(ctx);
    if (!result) return [];

    const lists = await ctx.db
      .query("test_lists")
      .withIndex("by_workspace_id", (q) => q.eq("workspace_id", result.workspace._id))
      .order("desc")
      .collect();

    const allRuns = await ctx.db
      .query("runs")
      .withIndex("by_workspace_id", (q) =>
        q.eq("workspace_id", result.workspace._id),
      )
      .collect();

    return Promise.all(
      lists.map(async (list) => {
        const members = await ctx.db
          .query("test_list_members")
          .withIndex("by_test_list_id", (q) => q.eq("test_list_id", list._id))
          .collect();

        const lastRun = allRuns
          .filter((r) => r.test_list_id === list._id)
          .sort((a, b) => b._creationTime - a._creationTime)[0];

        return {
          ...list,
          member_count: members.length,
          last_run_status: lastRun?.status ?? null,
        };
      }),
    );
  },
});

export const getTestListDetail = query({
  args: { test_list_id: v.id("test_lists") },
  handler: async (ctx, args) => {
    const result = await getOptionalOwnedEntity(ctx, args.test_list_id, "test_lists");
    if (!result) return null;

    const list = result.entity;

    const members = await ctx.db
      .query("test_list_members")
      .withIndex("by_test_list_id", (q) => q.eq("test_list_id", list._id))
      .collect();

    const enrichedMembers = await Promise.all(
      members.map(async (member) => {
        const test = await ctx.db.get(member.test_id);
        const suite = await ctx.db.get(member.source_suite_id);
        const project = await ctx.db.get(member.source_project_id);

        return {
          _id: member._id,
          test_id: member.test_id,
          source_suite_id: member.source_suite_id,
          source_project_id: member.source_project_id,
          added_at: member.added_at,
          test_name: test?.name ?? null,
          test_status: test?.status ?? null,
          suite_name: suite?.name ?? null,
          project_name: project?.name ?? null,
          stale: test === null,
        };
      }),
    );

    const runs = await ctx.db
      .query("runs")
      .withIndex("by_workspace_id", (q) =>
        q.eq("workspace_id", list.workspace_id),
      )
      .collect();
    const listRuns = runs
      .filter((r) => r.test_list_id === list._id)
      .sort((a, b) => b._creationTime - a._creationTime)
      .slice(0, 10);

    const enrichedRuns = await Promise.all(
      listRuns.map(async (run) => {
        let environment = null;
        if (run.environment_id) {
          const env = await ctx.db.get(run.environment_id);
          if (env) environment = { name: env.name, base_url: env.base_url };
        }
        return {
          _id: run._id,
          status: run.status,
          trigger_type: run.trigger_type,
          started_at: run.started_at ?? null,
          finished_at: run.finished_at ?? null,
          duration_ms: run.duration_ms ?? null,
          pass_count: run.pass_count ?? null,
          fail_count: run.fail_count ?? null,
          skip_count: run.skip_count ?? null,
          environment,
          _creationTime: run._creationTime,
        };
      }),
    );

    return {
      ...list,
      members: enrichedMembers,
      runs: enrichedRuns,
    };
  },
});

export const getApprovedTestsForWorkspace = query({
  args: {
    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const result = await getOptionalMemberWorkspace(ctx);
    if (!result) return [];

    const tests = await ctx.db
      .query("tests")
      .withIndex("by_workspace_id_and_status", (q) =>
        q.eq("workspace_id", result.workspace._id).eq("status", "approved"),
      )
      .collect();

    const enriched = await Promise.all(
      tests.map(async (test) => {
        const suite = await ctx.db.get(test.suite_id);
        const project = suite ? await ctx.db.get(suite.project_id) : null;
        return {
          _id: test._id,
          name: test.name,
          suite_name: suite?.name ?? null,
          project_name: project?.name ?? null,
        };
      }),
    );

    if (args.search) {
      const term = args.search.toLowerCase();
      return enriched.filter(
        (t) =>
          t.name.toLowerCase().includes(term) ||
          (t.suite_name?.toLowerCase().includes(term) ?? false) ||
          (t.project_name?.toLowerCase().includes(term) ?? false),
      );
    }

    return enriched;
  },
});

export const getTestListsForTest = query({
  args: { test_id: v.id("tests") },
  handler: async (ctx, args) => {
    const result = await getOptionalOwnedEntity(ctx, args.test_id, "tests");
    if (!result) return [];

    const memberships = await ctx.db
      .query("test_list_members")
      .withIndex("by_test_id", (q) => q.eq("test_id", args.test_id))
      .collect();

    const listIds = new Set(memberships.map((m) => m.test_list_id));
    const workspaceLists = await ctx.db
      .query("test_lists")
      .withIndex("by_workspace_id", (q) =>
        q.eq("workspace_id", result.workspace._id),
      )
      .collect();

    return workspaceLists.map((list) => ({
      _id: list._id,
      name: list.name,
      contains_test: listIds.has(list._id),
    }));
  },
});

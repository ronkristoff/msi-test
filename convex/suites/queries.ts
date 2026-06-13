import { query } from "../_generated/server";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { getOptionalOwnedEntity, getOptionalMemberWorkspace, getUserName } from "../lib/requireAuth";

const ACTIVE_EXPLORATION_STATUSES = new Set([
  "pending", "capturing", "analyzing", "discovering", "discovered", "captured", "analyzed",
]);

export const getSuites = query({
  args: { project_id: v.id("projects") },
  handler: async (ctx, args) => {
    const result = await getOptionalOwnedEntity(ctx, args.project_id, "projects");
    if (!result) return [];

    const suites = await ctx.db
      .query("suites")
      .withIndex("by_project_id", (q) => q.eq("project_id", args.project_id))
      .order("desc")
      .collect();

    const withCounts = await Promise.all(
      suites.map(async (suite) => {
        if (suite.suite_type === "regression") {
          const members = await ctx.db
            .query("suite_members")
            .withIndex("by_regression_suite_id", (q) =>
              q.eq("regression_suite_id", suite._id),
            )
            .collect();

          const testIds = new Set<string>();
          for (const member of members) {
            if (member.member_suite_id) {
              const suiteTests = await ctx.db
                .query("tests")
                .withIndex("by_suite_id", (q) =>
                  q.eq("suite_id", member.member_suite_id!),
                )
                .collect();
              for (const t of suiteTests) testIds.add(t._id);
            }
            if (member.member_test_id) {
              testIds.add(member.member_test_id);
            }
          }

          if (suite.auto_include_all) {
            const allFunctionalSuites = await ctx.db
              .query("suites")
              .withIndex("by_project_id_and_suite_type", (q) =>
                q.eq("project_id", args.project_id).eq("suite_type", "functional"),
              )
              .collect();
            for (const fs of allFunctionalSuites) {
              const suiteTests = await ctx.db
                .query("tests")
                .withIndex("by_suite_id", (q) => q.eq("suite_id", fs._id))
                .collect();
              for (const t of suiteTests) testIds.add(t._id);
            }
          }

          return { ...suite, testCount: testIds.size, memberCount: members.length };
        }

        const testCount = (await ctx.db
          .query("tests")
          .withIndex("by_suite_id", (q) => q.eq("suite_id", suite._id))
          .collect()).length;
        return { ...suite, testCount };
      }),
    );

    return withCounts;
  },
});

export const getSuite = query({
  args: { suite_id: v.id("suites") },
  handler: async (ctx, args) => {
    const result = await getOptionalOwnedEntity(ctx, args.suite_id, "suites");
    if (!result) return null;

    const suite = result.entity;

    if (suite.suite_type === "regression") {
      const members = await ctx.db
        .query("suite_members")
        .withIndex("by_regression_suite_id", (q) =>
          q.eq("regression_suite_id", suite._id),
        )
        .collect();

      const testIds = new Set<string>();
      for (const member of members) {
        if (member.member_suite_id) {
          const suiteTests = await ctx.db
            .query("tests")
            .withIndex("by_suite_id", (q) =>
              q.eq("suite_id", member.member_suite_id!),
            )
            .collect();
          for (const t of suiteTests) testIds.add(t._id);
        }
        if (member.member_test_id) {
          testIds.add(member.member_test_id);
        }
      }

      if (suite.auto_include_all) {
        const allFunctionalSuites = await ctx.db
          .query("suites")
          .withIndex("by_project_id_and_suite_type", (q) =>
            q.eq("project_id", suite.project_id).eq("suite_type", "functional"),
          )
          .collect();
        for (const fs of allFunctionalSuites) {
          const suiteTests = await ctx.db
            .query("tests")
            .withIndex("by_suite_id", (q) => q.eq("suite_id", fs._id))
            .collect();
          for (const t of suiteTests) testIds.add(t._id);
        }
      }

      return { ...suite, testCount: testIds.size };
    }

    const testCount = (await ctx.db
      .query("tests")
      .withIndex("by_suite_id", (q) => q.eq("suite_id", suite._id))
      .collect()).length;

    return { ...suite, testCount };
  },
});

export const getRegressionMembers = query({
  args: { suite_id: v.id("suites") },
  handler: async (ctx, args) => {
    const result = await getOptionalOwnedEntity(ctx, args.suite_id, "suites");
    if (!result) return null;

    const suite = result.entity;
    if (suite.suite_type !== "regression") return null;

    const members = await ctx.db
      .query("suite_members")
      .withIndex("by_regression_suite_id", (q) =>
        q.eq("regression_suite_id", suite._id),
      )
      .collect();

    const suiteRefs: {
      suite: { _id: string; name: string; description?: string };
      tests: { _id: string; name: string; status: string }[];
    }[] = [];

    const individualTests: { _id: string; name: string; status: string; source_suite_name: string; source_suite_id: string }[] = [];

    const seenSuiteIds = new Set<string>();

    if (suite.auto_include_all) {
      const allFunctional = await ctx.db
        .query("suites")
        .withIndex("by_project_id_and_suite_type", (q) =>
          q.eq("project_id", suite.project_id).eq("suite_type", "functional"),
        )
        .collect();
      for (const fs of allFunctional) {
        seenSuiteIds.add(fs._id);
        const tests = await ctx.db
          .query("tests")
          .withIndex("by_suite_id", (q) => q.eq("suite_id", fs._id))
          .collect();
        suiteRefs.push({
          suite: { _id: fs._id, name: fs.name, description: fs.description ?? undefined },
          tests: tests.map((t) => ({ _id: t._id, name: t.name, status: t.status })),
        });
      }
    }

    for (const member of members) {
      if (member.member_suite_id) {
        if (seenSuiteIds.has(member.member_suite_id)) continue;
        seenSuiteIds.add(member.member_suite_id);
        const ms = await ctx.db.get(member.member_suite_id);
        if (!ms) continue;
        const tests = await ctx.db
          .query("tests")
          .withIndex("by_suite_id", (q) => q.eq("suite_id", ms._id))
          .collect();
        suiteRefs.push({
          suite: { _id: ms._id, name: ms.name, description: ms.description ?? undefined },
          tests: tests.map((t) => ({ _id: t._id, name: t.name, status: t.status })),
        });
      }
      if (member.member_test_id) {
        const t = await ctx.db.get(member.member_test_id);
        if (!t) continue;
        const parentSuite = await ctx.db.get(t.suite_id);
        individualTests.push({
          _id: t._id,
          name: t.name,
          status: t.status,
          source_suite_name: parentSuite?.name ?? "Unknown",
          source_suite_id: t.suite_id,
        });
      }
    }

    return { suiteRefs, individualTests };
  },
});

export const getFunctionalSuites = query({
  args: { project_id: v.id("projects") },
  handler: async (ctx, args) => {
    const result = await getOptionalOwnedEntity(ctx, args.project_id, "projects");
    if (!result) return [];

    return ctx.db
      .query("suites")
      .withIndex("by_project_id_and_suite_type", (q) =>
        q.eq("project_id", args.project_id).eq("suite_type", "functional"),
      )
      .collect();
  },
});

export const getRegressionsForMemberSuite = query({
  args: { member_suite_id: v.id("suites") },
  handler: async (ctx, args) => {
    const result = await getOptionalOwnedEntity(ctx, args.member_suite_id, "suites");
    if (!result) return [];

    const memberships = await ctx.db
      .query("suite_members")
      .withIndex("by_member_suite_id", (q) =>
        q.eq("member_suite_id", args.member_suite_id),
      )
      .collect();

    return memberships.map((m) => m.regression_suite_id);
  },
});

export const getSuitesForWorkspace = query({
  args: {},
  handler: async (ctx) => {
    const result = await getOptionalMemberWorkspace(ctx);
    if (!result) return [];

    return ctx.db
      .query("suites")
      .withIndex("by_workspace_id", (q) =>
        q.eq("workspace_id", result.workspace._id),
      )
      .collect();
  },
});

export const getActiveTasks = query({
  args: {},
  handler: async (ctx) => {
    const result = await getOptionalMemberWorkspace(ctx);
    if (!result) return [];

    const { workspace } = result;

    const workspaceSuites = await ctx.db
      .query("suites")
      .withIndex("by_workspace_id_and_status", (q) =>
        q.eq("workspace_id", workspace._id).eq("status", "generating"),
      )
      .collect();

    const workspaceRuns = await ctx.db
      .query("runs")
      .withIndex("by_workspace_id_and_status", (q) =>
        q.eq("workspace_id", workspace._id).eq("status", "running"),
      )
      .collect();

    const EXPLORING_STATUSES = ["pending", "capturing", "analyzing"] as const;
    const activeExplorations: { _id: string; url: string; project_id: string; status: string }[] = [];
    for (const status of EXPLORING_STATUSES) {
      const found = await ctx.db
        .query("explorations")
        .withIndex("by_workspace_id_and_status", (q) =>
          q.eq("workspace_id", workspace._id).eq("status", status),
        )
        .collect();
      activeExplorations.push(...found);
    }

    const healingTests = await ctx.db
      .query("tests")
      .withIndex("by_workspace_id_and_status", (q) =>
        q.eq("workspace_id", workspace._id).eq("status", "healing"),
      )
      .collect();

    const tasks: {
      type: "generating" | "running" | "exploring" | "healing";
      id: string;
      name: string;
      triggeredByName: string;
      projectId: string;
      suiteId?: string;
    }[] = [];

    for (const suite of workspaceSuites) {
      const triggeredByName = suite.triggered_by
        ? await getUserName(ctx, workspace._id, suite.triggered_by)
        : "Unknown";

      tasks.push({
        type: "generating",
        id: suite._id,
        name: suite.name,
        triggeredByName,
        projectId: suite.project_id,
        suiteId: suite._id,
      });
    }

    for (const run of workspaceRuns) {
      const triggeredByName = run.triggered_by
        ? await getUserName(ctx, workspace._id, run.triggered_by)
        : "Unknown";

      tasks.push({
        type: "running",
        id: run._id,
        name: run.suite_id ? `Suite run` : `Test run`,
        triggeredByName,
        projectId: run.project_id,
        suiteId: run.suite_id ?? undefined,
      });
    }

    for (const exploration of activeExplorations) {
      tasks.push({
        type: "exploring",
        id: exploration._id,
        name: `Exploring ${exploration.url}`,
        triggeredByName: "Unknown",
        projectId: exploration.project_id,
      });
    }

    for (const test of healingTests) {
      const suite = await ctx.db.get(test.suite_id);
      tasks.push({
        type: "healing",
        id: test._id,
        name: test.name,
        triggeredByName: "Unknown",
        projectId: suite?.project_id ?? "",
        suiteId: test.suite_id,
      });
    }

    return tasks;
  },
});

export const getTaskOutcomes = query({
  args: {
    tasks: v.array(
      v.object({
        type: v.union(
          v.literal("generating"),
          v.literal("running"),
          v.literal("exploring"),
          v.literal("healing"),
        ),
        id: v.string(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const memberWs = await getOptionalMemberWorkspace(ctx);
    if (!memberWs) return [];
    const workspaceId = memberWs.workspace._id;

    const results: {
      type: "generating" | "running" | "exploring" | "healing";
      id: string;
      outcome: "success" | "failed";
      name: string;
      projectId: string;
      suiteId?: string;
    }[] = [];

    for (const task of args.tasks) {
      try {
        if (task.type === "generating") {
          const doc = await ctx.db.get(task.id as Id<"suites">);
          if (doc && doc.workspace_id === workspaceId && doc.status !== "generating") {
            results.push({
              type: "generating",
              id: task.id,
              outcome: doc.status === "failed" ? "failed" : "success",
              name: doc.name,
              projectId: doc.project_id,
              suiteId: doc._id,
            });
          }
        } else if (task.type === "running") {
          const doc = await ctx.db.get(task.id as Id<"runs">);
          if (doc && doc.workspace_id === workspaceId && doc.status !== "running") {
            const failed =
              doc.status === "failed" ||
              doc.status === "cancelled" ||
              doc.status === "timed_out";
            results.push({
              type: "running",
              id: task.id,
              outcome: failed ? "failed" : "success",
              name: doc.suite_id ? "Suite run" : "Test run",
              projectId: doc.project_id,
              suiteId: doc.suite_id ?? undefined,
            });
          }
        } else if (task.type === "exploring") {
          const doc = await ctx.db.get(task.id as Id<"explorations">);
          if (doc && doc.workspace_id === workspaceId && !ACTIVE_EXPLORATION_STATUSES.has(doc.status)) {
            results.push({
              type: "exploring",
              id: task.id,
              outcome: doc.status === "failed" ? "failed" : "success",
              name: `Exploring ${doc.url}`,
              projectId: doc.project_id,
            });
          }
        } else if (task.type === "healing") {
          const doc = await ctx.db.get(task.id as Id<"tests">);
          if (doc && doc.workspace_id === workspaceId && doc.status !== "healing") {
            results.push({
              type: "healing",
              id: task.id,
              outcome: doc.status === "draft" ? "failed" : "success",
              name: doc.name,
              projectId: "",
              suiteId: doc.suite_id,
            });
          }
        }
      } catch {
        // Entity may have been deleted; skip silently.
      }
    }

    return results;
  },
});

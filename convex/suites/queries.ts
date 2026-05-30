import { query } from "../_generated/server";
import { v } from "convex/values";
import { getOptionalOwnedEntity } from "../lib/requireAuth";

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

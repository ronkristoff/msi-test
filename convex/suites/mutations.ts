import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { getOwnedWorkspace, getOwnedEntity } from "../lib/requireAuth";
import { validateRequiredField } from "../lib/validation";

function generateDefaultName(): string {
  const now = new Date();
  const month = now.toLocaleString("en-US", { month: "short" });
  const day = now.getDate();
  return `New Suite — ${month} ${day}`;
}

export const createSuite = mutation({
  args: {
    project_id: v.id("projects"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    source_type: v.optional(
      v.union(
        v.literal("url_exploration"),
        v.literal("prd"),
        v.literal("natural_language"),
        v.literal("manual"),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const { workspace } = await getOwnedWorkspace(ctx);
    const { entity: project } = await getOwnedEntity(ctx, args.project_id, "projects");

    const name = args.name?.trim() ? validateRequiredField(args.name, "Suite name") : generateDefaultName();

    return ctx.db.insert("suites", {
      workspace_id: workspace._id,
      project_id: project._id,
      name,
      description: args.description?.trim() || undefined,
      source_type: args.source_type ?? "manual",
    });
  },
});

export const updateSuite = mutation({
  args: {
    suite_id: v.id("suites"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await getOwnedEntity(ctx, args.suite_id, "suites");

    const updates: Record<string, unknown> = {};

    if (args.name !== undefined) {
      updates.name = validateRequiredField(args.name, "Suite name");
    }

    if (args.description !== undefined) {
      updates.description = args.description.trim() || undefined;
    }

    await ctx.db.patch(args.suite_id, updates);
  },
});

export const deleteSuite = mutation({
  args: { suite_id: v.id("suites") },
  handler: async (ctx, args) => {
    await getOwnedEntity(ctx, args.suite_id, "suites");

    const tests = await ctx.db
      .query("tests")
      .withIndex("by_suite_id", (q) => q.eq("suite_id", args.suite_id))
      .collect();

    for (const test of tests) {
      await ctx.db.delete(test._id);
    }

    await ctx.db.delete(args.suite_id);
  },
});

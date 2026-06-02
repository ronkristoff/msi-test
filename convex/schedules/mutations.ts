import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { getOwnedWorkspace, getOwnedEntity } from "../lib/requireAuth";
import { validateRequiredField } from "../lib/validation";
import { NAME_MAX } from "../lib/constraints";

export const createSchedule = mutation({
  args: {
    name: v.string(),
    suite_id: v.id("suites"),
    environment_id: v.id("environments"),
    cadence_seconds: v.number(),
  },
  handler: async (ctx, args) => {
    const { user, workspace } = await getOwnedWorkspace(ctx);
    const userId = String(user._id);

    const name = validateRequiredField(args.name, "Schedule name");
    if (name.length > NAME_MAX) {
      throw new ConvexError(`Name must be under ${NAME_MAX} characters`);
    }

    if (args.cadence_seconds < 60) {
      throw new ConvexError("Cadence must be at least 60 seconds");
    }

    await getOwnedEntity(ctx, args.environment_id, "environments");
    await getOwnedEntity(ctx, args.suite_id, "suites");

    const now = Date.now();

    return ctx.db.insert("schedules", {
      workspace_id: workspace._id,
      name,
      suite_id: args.suite_id,
      environment_id: args.environment_id,
      cadence: { seconds: args.cadence_seconds },
      enabled: true,
      next_run_at: now + args.cadence_seconds * 1000,
      created_by: userId,
    });
  },
});

export const updateSchedule = mutation({
  args: {
    schedule_id: v.id("schedules"),
    name: v.optional(v.string()),
    cadence_seconds: v.optional(v.number()),
    environment_id: v.optional(v.id("environments")),
    enabled: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { entity: schedule } = await getOwnedEntity(
      ctx,
      args.schedule_id,
      "schedules",
    );

    const updates: Record<string, unknown> = {};

    if (args.name !== undefined) {
      updates.name = validateRequiredField(args.name, "Schedule name");
      if ((updates.name as string).length > NAME_MAX) {
        throw new ConvexError(`Name must be under ${NAME_MAX} characters`);
      }
    }

    if (args.cadence_seconds !== undefined) {
      if (args.cadence_seconds < 60) {
        throw new ConvexError("Cadence must be at least 60 seconds");
      }
      updates.cadence = { seconds: args.cadence_seconds };
      const base = schedule.last_run_at ?? Date.now();
      updates.next_run_at = base + args.cadence_seconds * 1000;
    }

    if (args.environment_id !== undefined) {
      await getOwnedEntity(ctx, args.environment_id, "environments");
      updates.environment_id = args.environment_id;
    }

    if (args.enabled !== undefined) {
      updates.enabled = args.enabled;
      if (args.enabled && !schedule.next_run_at) {
        const now = Date.now();
        updates.next_run_at = now + (schedule.cadence.seconds * 1000);
      }
    }

    await ctx.db.patch(args.schedule_id, updates);
  },
});

export const deleteSchedule = mutation({
  args: { schedule_id: v.id("schedules") },
  handler: async (ctx, args) => {
    await getOwnedEntity(ctx, args.schedule_id, "schedules");
    await ctx.db.delete(args.schedule_id);
  },
});

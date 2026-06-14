import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { getOwnedEntity } from "../lib/requireAuth";

export const updateBaselineRd = mutation({
  args: {
    rd_id: v.id("baseline_rds"),
    section_updates: v.optional(
      v.array(v.object({ id: v.string(), content: v.string() })),
    ),
    status: v.optional(v.union(v.literal("draft"), v.literal("approved"))),
  },
  handler: async (ctx, args) => {
    const { entity: rd } = await getOwnedEntity(ctx, args.rd_id, "baseline_rds");

    if (rd.status === "archived" || rd.status === "failed") {
      throw new ConvexError("Cannot edit an archived or failed Baseline RD");
    }

    const patch: Record<string, unknown> = {};

    if (args.section_updates && args.section_updates.length > 0) {
      const knownIds = new Set(rd.sections.map((s) => s.id));
      for (const update of args.section_updates) {
        if (!knownIds.has(update.id)) {
          throw new ConvexError(`Unknown section id: ${update.id}`);
        }
      }
      const updateMap = new Map(args.section_updates.map((u) => [u.id, u.content]));
      patch.sections = rd.sections.map((s) =>
        updateMap.has(s.id) ? { ...s, content: updateMap.get(s.id)! } : s,
      );
      patch.updated_at = Date.now();
    }

    if (args.status !== undefined) {
      if (args.status === "approved" && rd.status !== "draft") {
        throw new ConvexError("Only a draft Baseline RD can be approved");
      }
      if (args.status === "draft" && rd.status !== "approved") {
        throw new ConvexError("Only an approved Baseline RD can be reverted to draft");
      }
      patch.status = args.status;
    }

    if (Object.keys(patch).length > 0) {
      await ctx.db.patch(args.rd_id, patch);
    }
  },
});

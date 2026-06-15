import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { getOwnedEntityMessage } from "../lib/requireAuth";

type StoryStatus = "draft" | "approved" | "exported";

const VALID_TRANSITIONS: Record<StoryStatus, StoryStatus[]> = {
  draft: ["approved"],
  approved: ["exported"],
  exported: [],
};

function assertValidTransition(current: StoryStatus, target: StoryStatus): void {
  if (target === current) {
    throw new ConvexError(`Story is already ${current}.`);
  }
  if (!VALID_TRANSITIONS[current].includes(target)) {
    throw new ConvexError(
      `Cannot change story status from ${current} to ${target}. Valid transitions: draft → approved → exported.`,
    );
  }
}

export const updateStoryStatus = mutation({
  args: {
    story_id: v.id("user_stories"),
    status: v.union(
      v.literal("draft"),
      v.literal("approved"),
      v.literal("exported"),
    ),
  },
  handler: async (ctx, args): Promise<void> => {
    const { entity: story } = await getOwnedEntityMessage(
      ctx,
      args.story_id,
      "user_stories",
      "Story not found",
    );

    assertValidTransition(story.status, args.status);

    await ctx.db.patch(args.story_id, {
      status: args.status,
      updated_at: Date.now(),
    });
  },
});

export const deleteStory = mutation({
  args: { story_id: v.id("user_stories") },
  handler: async (ctx, args): Promise<void> => {
    await getOwnedEntityMessage(
      ctx,
      args.story_id,
      "user_stories",
      "Story not found",
    );

    await ctx.db.delete(args.story_id);
  },
});

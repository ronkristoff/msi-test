import { query } from "../_generated/server";
import { v } from "convex/values";
import { getMemberWorkspace, getOptionalOwnedEntity } from "../lib/requireAuth";
import type { Doc, Id } from "../_generated/dataModel";

type StoryStatus = "draft" | "approved" | "exported";

type StorySummary = {
  _id: Id<"user_stories">;
  title: string;
  status: StoryStatus;
  generated_at: number;
  updated_at: number | undefined;
  acceptance_criteria_count: number;
  affected_components: Doc<"user_stories">["affected_components"];
};

export const listStories = query({
  args: {
    project_id: v.id("projects"),
    status: v.optional(
      v.union(
        v.literal("draft"),
        v.literal("approved"),
        v.literal("exported"),
      ),
    ),
  },
  handler: async (ctx, args): Promise<StorySummary[] | null> => {
    const result = await getOptionalOwnedEntity(
      ctx,
      args.project_id,
      "projects",
    );
    if (!result) return null;

    const status = args.status;
    const fetched =
      status === undefined
        ? await ctx.db
            .query("user_stories")
            .withIndex("by_project_id_and_generated_at", (q) =>
              q.eq("project_id", args.project_id),
            )
            .order("desc")
            .take(100)
        : await ctx.db
            .query("user_stories")
            .withIndex("by_project_id_and_status", (q) =>
              q
                .eq("project_id", args.project_id)
                .eq("status", status),
            )
            .order("desc")
            .take(100);

    const rows =
      status === undefined
        ? fetched
        : [...fetched].sort((a, b) => b.generated_at - a.generated_at);

    return rows.map((s) => ({
      _id: s._id,
      title: s.title,
      status: s.status,
      generated_at: s.generated_at,
      updated_at: s.updated_at,
      acceptance_criteria_count: s.acceptance_criteria.length,
      affected_components: s.affected_components,
    }));
  },
});

export const getStory = query({
  args: { story_id: v.id("user_stories") },
  handler: async (ctx, args): Promise<Doc<"user_stories"> | null> => {
    const result = await getOptionalOwnedEntity(
      ctx,
      args.story_id,
      "user_stories",
    );
    if (!result) return null;
    return result.entity;
  },
});

export const getStoriesByIds = query({
  args: { ids: v.array(v.id("user_stories")) },
  handler: async (ctx, args): Promise<Doc<"user_stories">[]> => {
    const memberWorkspace = await getMemberWorkspace(ctx);
    const docs = await Promise.all(args.ids.map((id) => ctx.db.get(id)));
    return docs.filter(
      (s): s is Doc<"user_stories"> =>
        s !== null && s.workspace_id === memberWorkspace.workspace._id,
    );
  },
});

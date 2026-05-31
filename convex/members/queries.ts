import { query } from "../_generated/server";
import { getMemberWorkspace } from "../lib/requireAuth";

export const getMembers = query({
  args: {},
  handler: async (ctx) => {
    const { workspace } = await getMemberWorkspace(ctx);

    return ctx.db
      .query("workspace_members")
      .withIndex("by_workspace_id", (q) => q.eq("workspace_id", workspace._id))
      .collect();
  },
});

export const getCurrentMember = query({
  args: {},
  handler: async (ctx) => {
    const { membership } = await getMemberWorkspace(ctx);
    return membership;
  },
});

import type { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { UserStory } from "./storySchema";

export async function persistUserStories(
  ctx: ActionCtx,
  args: {
    thread_id: string;
    workspace_id: Id<"workspaces">;
    project_id: Id<"projects">;
    stories: UserStory[];
  },
): Promise<void> {
  await ctx.runMutation(internal.chat.internal._storeUserStories, args);
}

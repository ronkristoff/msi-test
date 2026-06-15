import { z } from "zod";

export const userStorySchema = z.object({
  title: z.string(),
  user_story: z.object({
    as_a: z.string(),
    i_want: z.string(),
    so_that: z.string(),
  }),
  acceptance_criteria: z.array(z.string().min(1)).min(1),
  affected_components: z.object({
    modules: z.array(z.string()),
    apis: z.array(z.string()),
    data_models: z.array(z.string()),
  }),
  technical_context: z.string().optional(),
});

export const storyGenerationSchema = z.object({
  stories: z.array(userStorySchema).min(1),
  generation_note: z.string().optional(),
});

export type UserStory = z.infer<typeof userStorySchema>;
export type StoryGenerationResult = z.infer<typeof storyGenerationSchema>;
export type { BmadContext } from "./impactSchema";

import { describe, expect, it } from "vitest";
import { storyGenerationSchema } from "./storySchema";

function makeValidStory(overrides?: Record<string, unknown>) {
  return {
    title: "User can log in with OAuth",
    user_story: {
      as_a: "an authenticated user",
      i_want: "to log in via Google OAuth",
      so_that: "I do not need a new password",
    },
    acceptance_criteria: [
      "Given a valid Google account, When the user clicks Login with Google, Then they are redirected to the dashboard.",
      "Given an invalid OAuth token, When the callback fires, Then the system shows an error.",
    ],
    affected_components: {
      modules: ["auth"],
      apis: ["POST /api/auth/oauth/callback"],
      data_models: ["users.oauth_provider"],
    },
    ...overrides,
  };
}

describe("storyGenerationSchema", () => {
  it("accepts a complete well-formed StoryGenerationResult with multiple stories", () => {
    const valid = {
      stories: [makeValidStory(), makeValidStory({ title: "Second story" })],
      generation_note: "Decomposed into two stories.",
    };
    const result = storyGenerationSchema.parse(valid);
    expect(result.stories).toHaveLength(2);
    expect(result.stories[0].title).toBe("User can log in with OAuth");
    expect(result.stories[0].user_story.as_a).toBe("an authenticated user");
    expect(result.stories[0].acceptance_criteria[0]).toMatch(/Given a valid/);
    expect(result.generation_note).toBe("Decomposed into two stories.");
  });

  it("rejects an empty stories array (min 1)", () => {
    expect(() =>
      storyGenerationSchema.parse({ stories: [] }),
    ).toThrow();
  });

  it("rejects a story with empty acceptance_criteria (min 1 per story)", () => {
    expect(() =>
      storyGenerationSchema.parse({
        stories: [makeValidStory({ acceptance_criteria: [] })],
      }),
    ).toThrow();
  });

  it("rejects a story missing required title", () => {
    const { title: _title, ...rest } = makeValidStory();
    void _title;
    expect(() => storyGenerationSchema.parse({ stories: [rest] })).toThrow();
  });

  it("rejects a story missing required user_story.as_a", () => {
    const story = makeValidStory();
    delete (story.user_story as { as_a?: string }).as_a;
    expect(() => storyGenerationSchema.parse({ stories: [story] })).toThrow();
  });

  it("rejects a story missing required user_story.i_want", () => {
    const story = makeValidStory();
    delete (story.user_story as { i_want?: string }).i_want;
    expect(() => storyGenerationSchema.parse({ stories: [story] })).toThrow();
  });

  it("rejects a story missing required user_story.so_that", () => {
    const story = makeValidStory();
    delete (story.user_story as { so_that?: string }).so_that;
    expect(() => storyGenerationSchema.parse({ stories: [story] })).toThrow();
  });

  it("rejects a story missing required acceptance_criteria", () => {
    const { acceptance_criteria: _ac, ...rest } = makeValidStory();
    void _ac;
    expect(() => storyGenerationSchema.parse({ stories: [rest] })).toThrow();
  });

  it("rejects a story missing required affected_components", () => {
    const { affected_components: _ac, ...rest } = makeValidStory();
    void _ac;
    expect(() => storyGenerationSchema.parse({ stories: [rest] })).toThrow();
  });

  it("accepts empty modules / apis / data_models sub-arrays", () => {
    const story = makeValidStory({
      affected_components: { modules: [], apis: [], data_models: [] },
    });
    const result = storyGenerationSchema.parse({ stories: [story] });
    expect(result.stories[0].affected_components.modules).toEqual([]);
    expect(result.stories[0].affected_components.apis).toEqual([]);
    expect(result.stories[0].affected_components.data_models).toEqual([]);
  });

  it("accepts a story that omits optional technical_context", () => {
    const story = makeValidStory();
    const result = storyGenerationSchema.parse({ stories: [story] });
    expect(result.stories[0].technical_context).toBeUndefined();
  });

  it("accepts a story with optional technical_context populated", () => {
    const story = makeValidStory({
      technical_context:
        "Follows convention: use-zod-validation (inputs validated with zod).",
    });
    const result = storyGenerationSchema.parse({ stories: [story] });
    expect(result.stories[0].technical_context).toBe(
      "Follows convention: use-zod-validation (inputs validated with zod).",
    );
  });

  it("accepts an optional top-level generation_note", () => {
    const result = storyGenerationSchema.parse({
      stories: [makeValidStory()],
      generation_note: "Note.",
    });
    expect(result.generation_note).toBe("Note.");
  });

  it("accepts result with no top-level generation_note (optional)", () => {
    const result = storyGenerationSchema.parse({ stories: [makeValidStory()] });
    expect(result.generation_note).toBeUndefined();
  });
});

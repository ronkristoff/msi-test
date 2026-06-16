import { describe, expect, it } from "vitest";
import {
  buildStoryMarkdown,
  buildStoriesMarkdown,
  buildBmadStoryMarkdown,
  slugifyStoryTitle,
  type StoryExport,
} from "./exportFormatters";

const baseStory: StoryExport = {
  _id: "s1",
  title: "Login with Google",
  user_story: {
    as_a: "an authenticated user",
    i_want: "to log in with Google",
    so_that: "I don't need a new password",
  },
  acceptance_criteria: [
    "Given a user, When they click Login, Then they see the Google prompt.",
    "Given a returning user, When their session expires, Then they are prompted to re-authenticate.",
  ],
  affected_components: {
    modules: ["auth", "users"],
    apis: ["POST /login"],
    data_models: ["User"],
  },
  technical_context: "Follows zod-validation convention.",
  status: "draft",
  generated_at: 1718362200000,
  thread_id: "t1",
};

const noTechStory: StoryExport = {
  ...baseStory,
  technical_context: undefined,
};

const emptyAcStory: StoryExport = {
  ...baseStory,
  title: "Empty AC Story",
  acceptance_criteria: [],
};

const emptyComponentsStory: StoryExport = {
  ...baseStory,
  title: "Empty Components",
  affected_components: { modules: [], apis: [], data_models: [] },
};

describe("buildStoryMarkdown", () => {
  it("contains ## title", () => {
    const md = buildStoryMarkdown(baseStory);
    expect(md).toContain("## Login with Google");
  });

  it("contains the user-story triple lines", () => {
    const md = buildStoryMarkdown(baseStory);
    expect(md).toContain("**As a** an authenticated user");
    expect(md).toContain("**I want** to log in with Google");
    expect(md).toContain("**So that** I don't need a new password");
  });

  it("renders ACs as a numbered list", () => {
    const md = buildStoryMarkdown(baseStory);
    expect(md).toContain(
      "1. Given a user, When they click Login, Then they see the Google prompt.",
    );
    expect(md).toContain(
      "2. Given a returning user, When their session expires, Then they are prompted to re-authenticate.",
    );
  });

  it("renders affected components as comma-separated", () => {
    const md = buildStoryMarkdown(baseStory);
    expect(md).toContain("- **Modules:** auth, users");
    expect(md).toContain("- **APIs:** POST /login");
    expect(md).toContain("- **Data Models:** User");
  });

  it("renders 'None identified' for empty affected-components arrays", () => {
    const md = buildStoryMarkdown(emptyComponentsStory);
    expect(md).toContain("- **Modules:** None identified");
    expect(md).toContain("- **APIs:** None identified");
    expect(md).toContain("- **Data Models:** None identified");
  });

  it("includes Technical Context section when technical_context is present", () => {
    const md = buildStoryMarkdown(baseStory);
    expect(md).toContain("### Technical Context");
    expect(md).toContain("Follows zod-validation convention.");
  });

  it("omits Technical Context section when technical_context is absent", () => {
    const md = buildStoryMarkdown(noTechStory);
    expect(md).not.toContain("### Technical Context");
  });

  it("renders 'No acceptance criteria.' placeholder for empty AC array", () => {
    const md = buildStoryMarkdown(emptyAcStory);
    expect(md).toContain("### Acceptance Criteria");
    expect(md).toContain("_No acceptance criteria._");
  });
});

describe("buildStoriesMarkdown", () => {
  it("contains # User Stories Export top-level heading", () => {
    const md = buildStoriesMarkdown([baseStory]);
    expect(md).toContain("# User Stories Export");
  });

  it("metadata line uses '1 story' (singular) for single story", () => {
    const md = buildStoriesMarkdown([baseStory]);
    expect(md).toContain("_1 story · Exported");
  });

  it("metadata line uses 'N stories' (plural) for multiple stories", () => {
    const md = buildStoriesMarkdown([baseStory, noTechStory, emptyAcStory]);
    expect(md).toContain("_3 stories · Exported");
  });

  it("separates stories with horizontal rule", () => {
    const md = buildStoriesMarkdown([baseStory, noTechStory]);
    expect(md).toContain("\n---\n");
  });

  it("returns 'No stories selected.' for empty input", () => {
    const md = buildStoriesMarkdown([]);
    expect(md).toContain("# User Stories Export");
    expect(md).toContain("_No stories selected.");
  });

  it("preserves input ordering (first story title before second)", () => {
    const md = buildStoriesMarkdown([baseStory, emptyAcStory]);
    const firstIdx = md.indexOf("Login with Google");
    const secondIdx = md.indexOf("Empty AC Story");
    expect(firstIdx).toBeGreaterThan(-1);
    expect(secondIdx).toBeGreaterThan(firstIdx);
  });
});

describe("buildBmadStoryMarkdown", () => {
  it("contains # Story: title heading", () => {
    const md = buildBmadStoryMarkdown(baseStory, "Test Project");
    expect(md).toContain("# Story: Login with Google");
  });

  it("contains ## Context section", () => {
    const md = buildBmadStoryMarkdown(baseStory, "Test Project");
    expect(md).toContain("## Context");
  });

  it("Context section mentions project name when provided", () => {
    const md = buildBmadStoryMarkdown(baseStory, "Test Project");
    expect(md).toContain("Test Project");
  });

  it("contains ## Story section with the triple", () => {
    const md = buildBmadStoryMarkdown(baseStory, "Test Project");
    expect(md).toContain("## Story");
    expect(md).toContain("As a an authenticated user");
    expect(md).toContain("I want to log in with Google");
    expect(md).toContain("so that I don't need a new password");
  });

  it("contains ## Acceptance Criteria section (h2, not h3)", () => {
    const md = buildBmadStoryMarkdown(baseStory, "Test Project");
    expect(md.split("\n")).toContain("## Acceptance Criteria");
  });

  it("contains ## Affected Components section with 'None' for empties", () => {
    const md = buildBmadStoryMarkdown(emptyComponentsStory, "Test Project");
    expect(md).toContain("## Affected Components");
    expect(md).toContain("- **Modules:** None");
    expect(md).toContain("- **APIs:** None");
    expect(md).toContain("- **Data Models:** None");
  });

  it("includes technical_context in Context section when present", () => {
    const md = buildBmadStoryMarkdown(baseStory, "Test Project");
    expect(md).toContain("**Technical context:**");
    expect(md).toContain("Follows zod-validation convention.");
  });

  it("Context section still renders (Generated line) when technical_context absent", () => {
    const md = buildBmadStoryMarkdown(noTechStory, "Test Project");
    expect(md).toContain("## Context");
    expect(md).toContain("Generated");
    expect(md).not.toContain("**Technical context:**");
  });
});

describe("slugifyStoryTitle", () => {
  it("lowercases and hyphenates 'Add OAuth Login!'", () => {
    expect(slugifyStoryTitle("Add OAuth Login!", "s1")).toBe("add-oauth-login");
  });

  it("collapses non-alphanumeric runs into single hyphen", () => {
    expect(slugifyStoryTitle("Login  with   Google!!!", "s1")).toBe(
      "login-with-google",
    );
  });

  it("trims leading/trailing hyphens", () => {
    expect(slugifyStoryTitle("  Hello World  ", "s1")).toBe("hello-world");
  });

  it("truncates to 60 chars", () => {
    const long = "A".repeat(120);
    expect(slugifyStoryTitle(long, "s1")).toHaveLength(60);
  });

  it("does not leave a trailing hyphen after 60-char truncation", () => {
    // 59 a's + space + b slugifies to "<59 a's>-b"; truncating at 60 lands on the hyphen.
    expect(slugifyStoryTitle(`${"a".repeat(59)} b`, "s1")).toBe(
      "a".repeat(59),
    );
  });

  it("falls back to 'story-{first-8-of-id}' when title is empty", () => {
    expect(slugifyStoryTitle("", "s1234567890")).toBe("story-s1234567");
  });

  it("falls back to 'story-{first-8-of-id}' when slugifies to empty", () => {
    expect(slugifyStoryTitle("!!!", "s1234567890")).toBe("story-s1234567");
  });
});

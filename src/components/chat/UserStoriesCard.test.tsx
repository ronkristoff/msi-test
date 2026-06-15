import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { UserStoriesCard } from "./UserStoriesCard";
import type { UserStory } from "../../../convex/chat/storySchema";

const storiesWithContent: UserStory[] = [
  {
    title: "User logs in with Google OAuth",
    user_story: {
      as_a: "an authenticated user",
      i_want: "to log in via Google OAuth",
      so_that: "I do not need a new password",
    },
    acceptance_criteria: [
      "Given a valid Google account, When the user clicks Login, Then they reach the dashboard.",
      "Given an invalid OAuth token, When the callback fires, Then the system shows an error.",
    ],
    affected_components: {
      modules: ["auth"],
      apis: ["POST /api/auth/oauth/callback"],
      data_models: ["users.oauth_provider"],
    },
  },
  {
    title: "Admin revokes OAuth sessions",
    user_story: {
      as_a: "an administrator",
      i_want: "to revoke a user's OAuth session",
      so_that: "compromised accounts can be locked out",
    },
    acceptance_criteria: [
      "Given an admin, When they revoke a session, Then the user is signed out on next request.",
    ],
    affected_components: {
      modules: ["auth", "admin"],
      apis: [],
      data_models: [],
    },
    technical_context:
      "Follows convention: use-zod-validation (inputs validated with zod).",
  },
];

describe("UserStoriesCard", () => {
  it("renders each story's title", () => {
    render(<UserStoriesCard stories={storiesWithContent} />);
    expect(
      screen.getByRole("heading", { name: /User logs in with Google OAuth/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /Admin revokes OAuth sessions/i }),
    ).toBeInTheDocument();
  });

  it("renders the As-a/I-want/So-that block for each story", () => {
    render(<UserStoriesCard stories={storiesWithContent} />);
    expect(screen.getByText(/an authenticated user/i)).toBeInTheDocument();
    expect(screen.getByText(/to log in via Google OAuth/i)).toBeInTheDocument();
    expect(screen.getByText(/I do not need a new password/i)).toBeInTheDocument();
  });

  it("renders numbered acceptance criteria (ordered list)", () => {
    render(<UserStoriesCard stories={storiesWithContent} />);
    const lists = screen.getAllByRole("list");
    const firstStoryList = lists[0];
    const items = within(firstStoryList).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(
      within(firstStoryList).getByText(/Given a valid Google account/),
    ).toBeInTheDocument();
  });

  it("renders affected-components chips for modules, APIs, and data models", () => {
    render(<UserStoriesCard stories={storiesWithContent} />);
    expect(screen.getAllByText("auth").length).toBeGreaterThanOrEqual(1);
    expect(
      screen.getByText("POST /api/auth/oauth/callback"),
    ).toBeInTheDocument();
    expect(screen.getByText("users.oauth_provider")).toBeInTheDocument();
    expect(screen.getByText("admin")).toBeInTheDocument();
  });

  it("renders a placeholder for empty affected sub-arrays", () => {
    render(<UserStoriesCard stories={storiesWithContent} />);
    const placeholders = screen.getAllByText(/No affected/i);
    expect(placeholders.length).toBeGreaterThanOrEqual(2);
    expect(
      screen.getAllByText(/No affected APIs identified/i).length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      screen.getAllByText(/No affected data models identified/i).length,
    ).toBeGreaterThanOrEqual(1);
  });

  it("renders technical_context when present (BMAD path)", () => {
    render(<UserStoriesCard stories={storiesWithContent} />);
    expect(
      screen.getByText(/Follows convention: use-zod-validation/i),
    ).toBeInTheDocument();
  });

  it("does NOT render technical_context section when absent", () => {
    const singleWithoutContext: UserStory[] = [
      {
        title: "Bare story",
        user_story: {
          as_a: "user",
          i_want: "feature",
          so_that: "benefit",
        },
        acceptance_criteria: ["The system shall do X."],
        affected_components: { modules: [], apis: [], data_models: [] },
      },
    ];
    const { container } = render(
      <UserStoriesCard stories={singleWithoutContext} />,
    );
    expect(container.textContent).not.toMatch(/technical context/i);
  });

  it("renders the grounding-unavailable notice when grounded is false", () => {
    render(<UserStoriesCard stories={storiesWithContent} grounded={false} />);
    const notice = screen.getByRole("status");
    expect(notice).toHaveAttribute("aria-live", "polite");
    expect(notice.textContent).toMatch(/grounding unavailable/i);
  });

  it("does NOT render the grounding notice when grounded is true (default)", () => {
    render(<UserStoriesCard stories={storiesWithContent} />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("renders generation_note when provided", () => {
    render(
      <UserStoriesCard
        stories={storiesWithContent}
        generationNote="Decomposed into two stories."
      />,
    );
    expect(
      screen.getByText(/Decomposed into two stories/i),
    ).toBeInTheDocument();
  });

  it("does NOT render a generation_note when absent", () => {
    const { container } = render(
      <UserStoriesCard stories={storiesWithContent} />,
    );
    expect(container.textContent).not.toMatch(/Decomposed into two stories/i);
  });
});

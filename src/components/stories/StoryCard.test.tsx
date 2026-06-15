import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { StoryCard, type StoryListItem } from "./StoryCard";

vi.mock("next/link", () => ({
  __esModule: true,
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => (
    <a href={href} data-testid="link">
      {children}
    </a>
  ),
}));

vi.mock("@/lib/format", () => ({
  formatRelativeTime: (ts: number) => `relative:${ts}`,
}));

const baseStory: StoryListItem = {
  _id: "story1" as never,
  title: "Implement login",
  status: "draft",
  generated_at: 1000,
  updated_at: undefined,
  acceptance_criteria_count: 3,
  affected_components: {
    modules: ["auth", "users"],
    apis: ["POST /login"],
    data_models: [],
  },
};

describe("StoryCard", () => {
  it("renders the title", () => {
    render(<StoryCard story={baseStory} projectId="proj1" />);
    expect(screen.getByText("Implement login")).toBeInTheDocument();
  });

  it("renders the status pill with aria-label", () => {
    render(<StoryCard story={baseStory} projectId="proj1" />);
    expect(screen.getByLabelText("Status: draft")).toBeInTheDocument();
  });

  it("pluralizes AC count correctly for multiple", () => {
    render(<StoryCard story={baseStory} projectId="proj1" />);
    expect(screen.getByText("3 ACs")).toBeInTheDocument();
  });

  it("pluralizes AC count correctly for single", () => {
    render(
      <StoryCard
        story={{ ...baseStory, acceptance_criteria_count: 1 }}
        projectId="proj1"
      />,
    );
    expect(screen.getByText("1 AC")).toBeInTheDocument();
  });

  it("renders compact affected-components summary", () => {
    render(<StoryCard story={baseStory} projectId="proj1" />);
    expect(screen.getByText(/2 modules/)).toBeInTheDocument();
    expect(screen.getByText(/1 API/)).toBeInTheDocument();
    expect(screen.getByText(/0 data models/)).toBeInTheDocument();
  });

  it("renders 'No affected components' when all sub-arrays empty", () => {
    render(
      <StoryCard
        story={{
          ...baseStory,
          affected_components: { modules: [], apis: [], data_models: [] },
        }}
        projectId="proj1"
      />,
    );
    expect(screen.getByText("No affected components")).toBeInTheDocument();
  });

  it("renders relative timestamp from updated_at when present", () => {
    render(
      <StoryCard
        story={{ ...baseStory, updated_at: 9000 }}
        projectId="proj1"
      />,
    );
    expect(screen.getByText("relative:9000")).toBeInTheDocument();
  });

  it("renders relative timestamp from generated_at when updated_at is undefined", () => {
    render(<StoryCard story={baseStory} projectId="proj1" />);
    expect(screen.getByText("relative:1000")).toBeInTheDocument();
  });

  it("wraps the card in a Link to the detail page", () => {
    render(<StoryCard story={baseStory} projectId="proj1" />);
    const link = screen.getByTestId("link");
    expect(link).toHaveAttribute("href", "/projects/proj1/stories/story1");
  });
});

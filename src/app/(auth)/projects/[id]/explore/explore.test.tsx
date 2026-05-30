import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockCreateExploration = vi.fn();
const mockGenerateTests = vi.fn();
let mockQueryResults: Record<string, unknown> = {};

vi.mock("convex/react", () => ({
  useQuery: vi.fn((_queryRef: unknown, args: unknown) => {
    const key = typeof _queryRef === "string" ? _queryRef : String(_queryRef);
    if (key.includes("getProject")) return mockQueryResults.project;
    if (key.includes("getExploration") && args && typeof args === "object" && "exploration_id" in (args as Record<string, unknown>)) {
      return mockQueryResults.exploration;
    }
    return undefined;
  }),
  useMutation: vi.fn(() => mockCreateExploration),
  useAction: vi.fn(() => mockGenerateTests),
}));

vi.mock("next/navigation", () => ({
  useParams: vi.fn(() => ({ id: "proj1" })),
  useRouter: vi.fn(() => ({ push: vi.fn() })),
}));

vi.mock("@/lib/convex", () => ({
  api: {
    projects: { queries: { getProject: "projects.queries.getProject" } },
    explorations: {
      queries: {
        getExploration: "explorations.queries.getExploration",
      },
      mutations: { createExploration: "explorations.mutations.createExploration" },
    },
    ai: {
      exploreApp: { generateExplorationTests: "ai.exploreApp.generateExplorationTests" },
    },
  },
  asId: (v: string) => v,
}));

vi.mock("@/lib/error-logger", () => ({
  useErrorLogger: () => ({ logError: vi.fn() }),
}));

const projectData = {
  _id: "proj1",
  name: "Test App",
  app_url: "https://example.com",
  _creationTime: Date.now(),
};

describe("ExplorePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQueryResults = { project: undefined, exploration: undefined };
  });

  it("renders loading state while project loads", async () => {
    mockQueryResults.project = undefined;
    const { default: ExplorePage } = await import("./page");
    render(<ExplorePage />);
    expect(document.querySelector(".animate-pulse")).toBeInTheDocument();
  });

  it("renders project not found when project is null", async () => {
    mockQueryResults.project = null;
    const { default: ExplorePage } = await import("./page");
    render(<ExplorePage />);
    expect(screen.getByText("Project not found")).toBeInTheDocument();
  });

  it("renders URL display and Start Exploration button", async () => {
    mockQueryResults.project = projectData;
    const { default: ExplorePage } = await import("./page");
    render(<ExplorePage />);
    expect(screen.getByText("Explore & Generate Tests")).toBeInTheDocument();
    expect(screen.getByText("https://example.com")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /start exploration/i })).toBeInTheDocument();
  });

  it("calls createExploration on button click", async () => {
    mockQueryResults.project = projectData;
    mockCreateExploration.mockResolvedValue("exploration-1");
    const { default: ExplorePage } = await import("./page");
    render(<ExplorePage />);

    await userEvent.click(screen.getByRole("button", { name: /start exploration/i }));
    expect(mockCreateExploration).toHaveBeenCalledWith({ project_id: "proj1" });
  });

  it("shows Cancel link back to project", async () => {
    mockQueryResults.project = projectData;
    const { default: ExplorePage } = await import("./page");
    render(<ExplorePage />);
    const cancelLink = screen.getByRole("link", { name: /cancel/i });
    expect(cancelLink).toHaveAttribute("href", "/projects/proj1");
  });
});

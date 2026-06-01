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
    if (key.includes("getLatestActive")) return mockQueryResults.latestActive;
    if (key.includes("getCurrentUser")) return mockQueryResults.user;
    return undefined;
  }),
  useMutation: vi.fn((_ref: unknown) => {
    const key = String(_ref);
    if (key.includes("createExploration")) return mockCreateExploration;
    if (key.includes("createSuitesForExploration")) return vi.fn().mockResolvedValue([{ area: "Auth", suite_id: "s1" }]);
    return vi.fn();
  }),
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
        getLatestActiveExploration: "explorations.queries.getLatestActiveExploration",
      },
      mutations: { createExploration: "explorations.mutations.createExploration" },
    },
    suites: {
      mutations: {
        createSuitesForExploration: "suites.mutations.createSuitesForExploration",
      },
    },
    ai: {
      exploreApp: { generateExplorationTests: "ai.exploreApp.generateExplorationTests" },
    },
    workspaces: {
      queries: { getCurrentUser: "workspaces.queries.getCurrentUser" },
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

const analyzedWithFlows = {
  _id: "expl1",
  status: "analyzed",
  url: "https://example.com",
  captured_pages: [
    { url: "https://example.com", title: "Home", structure_text: "", screenshot_url: "https://img.example/home.png" },
    { url: "https://example.com/about", title: "About", structure_text: "", screenshot_url: null },
  ],
  discovered_flows: [
    { name: "Home → About", steps: ["Home", "About"], pages_involved: [0, 1], complexity: "low" },
    { name: "Home → Contact → Form", steps: ["Home", "Contact", "Form"], pages_involved: [0], complexity: "medium" },
  ],
  proposed_scenarios: [
    { name: "Navigate to About", description: "Verify About page loads", flow_summary: "Click About link → verify page", area: "Navigation", related_flows: ["Home → About"] },
    { name: "Contact form submit", description: "Submit contact form", flow_summary: "Navigate to contact → fill form → submit", area: "Forms", related_flows: ["Home → Contact → Form"] },
  ],
};

const analyzedNoFlows = {
  _id: "expl2",
  status: "analyzed",
  url: "https://example.com",
  captured_pages: [],
  discovered_flows: [],
  proposed_scenarios: [
    { name: "Basic test", description: "Verify homepage", flow_summary: "Load homepage", area: "Navigation" },
  ],
};

describe("ExplorePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQueryResults = { project: undefined, exploration: undefined, user: { _id: "user1", name: "Test" }, latestActive: null };
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

  it("shows flow cards with complexity badges and step counts", async () => {
    mockQueryResults.project = projectData;
    mockQueryResults.exploration = analyzedWithFlows;
    mockQueryResults.latestActive = { _id: "expl1" };

    const { default: ExplorePage } = await import("./page");
    render(<ExplorePage />);

    expect(screen.getAllByText("Home → About").length).toBeGreaterThan(0);
    expect(screen.getByText("low")).toBeInTheDocument();
    expect(screen.getByText("medium")).toBeInTheDocument();
    expect(screen.getByText("2 steps")).toBeInTheDocument();
    expect(screen.getByText("3 steps")).toBeInTheDocument();
  });

  it("shows auto-generated flow description", async () => {
    mockQueryResults.project = projectData;
    mockQueryResults.exploration = analyzedWithFlows;
    mockQueryResults.latestActive = { _id: "expl1" };

    const { default: ExplorePage } = await import("./page");
    render(<ExplorePage />);

    expect(screen.getByText(/Navigation from Home through 1 page to About/)).toBeInTheDocument();
  });

  it("defaults to flow selection mode with checkboxes", async () => {
    mockQueryResults.project = projectData;
    mockQueryResults.exploration = analyzedWithFlows;
    mockQueryResults.latestActive = { _id: "expl1" };

    const { default: ExplorePage } = await import("./page");
    render(<ExplorePage />);

    expect(screen.getAllByRole("checkbox").length).toBe(2);
  });

  it("switches to scenario selection mode", async () => {
    mockQueryResults.project = projectData;
    mockQueryResults.exploration = analyzedWithFlows;
    mockQueryResults.latestActive = { _id: "expl1" };

    const { default: ExplorePage } = await import("./page");
    render(<ExplorePage />);

    await userEvent.click(screen.getByRole("button", { name: /select scenarios/i }));

    expect(screen.getByText("Navigate to About")).toBeInTheDocument();
    expect(screen.getByText("Contact form submit")).toBeInTheDocument();
  });

  it("shows scenario-only view when no flows exist", async () => {
    mockQueryResults.project = projectData;
    mockQueryResults.exploration = analyzedNoFlows;
    mockQueryResults.latestActive = { _id: "expl2" };

    const { default: ExplorePage } = await import("./page");
    render(<ExplorePage />);

    expect(screen.queryByText("Select Flows")).not.toBeInTheDocument();
    expect(screen.getByText("Basic test")).toBeInTheDocument();
  });

  it("generate button disabled when nothing selected", async () => {
    mockQueryResults.project = projectData;
    mockQueryResults.exploration = analyzedWithFlows;
    mockQueryResults.latestActive = { _id: "expl1" };

    const { default: ExplorePage } = await import("./page");
    render(<ExplorePage />);

    expect(screen.getByRole("button", { name: /generate tests from selected/i })).toBeDisabled();
  });

  it("generate button shows matched scenario count when flows selected", async () => {
    mockQueryResults.project = projectData;
    mockQueryResults.exploration = analyzedWithFlows;
    mockQueryResults.latestActive = { _id: "expl1" };

    const { default: ExplorePage } = await import("./page");
    render(<ExplorePage />);

    await userEvent.click(screen.getAllByRole("checkbox")[0]);

    expect(screen.getByRole("button", { name: /generate tests from selected \(1\)/i })).not.toBeDisabled();
  });

  it("select all / deselect all flows works", async () => {
    mockQueryResults.project = projectData;
    mockQueryResults.exploration = analyzedWithFlows;
    mockQueryResults.latestActive = { _id: "expl1" };

    const { default: ExplorePage } = await import("./page");
    render(<ExplorePage />);

    await userEvent.click(screen.getByText("Select all"));
    expect(screen.getByRole("button", { name: /generate tests from selected \(2\)/i })).not.toBeDisabled();

    await userEvent.click(screen.getByText("Deselect all"));
    expect(screen.getByRole("button", { name: /generate tests from selected \(0\)/i })).toBeDisabled();
  });

  it("shows page thumbnails in flow cards", async () => {
    mockQueryResults.project = projectData;
    mockQueryResults.exploration = analyzedWithFlows;
    mockQueryResults.latestActive = { _id: "expl1" };

    const { default: ExplorePage } = await import("./page");
    render(<ExplorePage />);

    const thumbnailImages = screen.getAllByRole("img").filter(
      (img) => (img as HTMLImageElement).src.includes("img.example"),
    );
    expect(thumbnailImages.length).toBeGreaterThan(0);
  });

  it("shows matched scenario count in info banner", async () => {
    mockQueryResults.project = projectData;
    mockQueryResults.exploration = analyzedWithFlows;
    mockQueryResults.latestActive = { _id: "expl1" };

    const { default: ExplorePage } = await import("./page");
    render(<ExplorePage />);

    await userEvent.click(screen.getAllByRole("checkbox")[0]);

    expect(screen.getByText(/1 flow selected — 1 matching scenario/)).toBeInTheDocument();
  });
});

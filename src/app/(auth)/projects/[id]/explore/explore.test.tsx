import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockCreateExploration = vi.fn();
const mockCancelExploration = vi.fn();
const mockStartDeepExploration = vi.fn();
const mockUpdateDiscoveredPages = vi.fn();
const mockMarkGeneratedAreas = vi.fn();
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
    if (key.includes("getSuitesForExploration")) return mockQueryResults.explorationSuites ?? [];
    return undefined;
  }),
  useMutation: vi.fn((_ref: unknown) => {
    const key = String(_ref);
    if (key.includes("createExploration")) return mockCreateExploration;
    if (key.includes("cancelExploration")) return mockCancelExploration;
    if (key.includes("startDeepExploration")) return mockStartDeepExploration;
    if (key.includes("updateDiscoveredPages")) return mockUpdateDiscoveredPages;
    if (key.includes("markGeneratedAreas")) return mockMarkGeneratedAreas;
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
        getSuitesForExploration: "explorations.queries.getSuitesForExploration",
      },
      mutations: {
        createExploration: "explorations.mutations.createExploration",
        cancelExploration: "explorations.mutations.cancelExploration",
        startDeepExploration: "explorations.mutations.startDeepExploration",
        updateDiscoveredPages: "explorations.mutations.updateDiscoveredPages",
        markGeneratedAreas: "explorations.mutations.markGeneratedAreas",
      },
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

vi.mock("./PageChecklist", () => ({
  PageChecklist: ({ pages, selectedIndices, onToggle, onSelectAll, onDeselectAll, authFlags, onAuthToggle }: {
    pages: { url: string; title: string }[];
    selectedIndices: Set<number>;
    onToggle: (i: number) => void;
    onSelectAll: () => void;
    onDeselectAll: () => void;
    authFlags: Map<number, boolean>;
    onAuthToggle: (i: number) => void;
  }) => (
    <div data-testid="page-checklist">
      <span data-testid="page-count">{pages.length}</span>
      <span data-testid="selected-count">{selectedIndices.size}</span>
      {pages.map((p, i) => (
        <div key={i} data-testid={`page-${i}`}>
          <input
            type="checkbox"
            checked={selectedIndices.has(i)}
            onChange={() => onToggle(i)}
            aria-label={`Select ${p.title}`}
          />
          <span>{p.title}</span>
          <span>{p.url}</span>
          <button
            data-testid={`auth-toggle-${i}`}
            onClick={() => onAuthToggle(i)}
          >
            {(authFlags.get(i) ?? true) ? "auth-on" : "auth-off"}
          </button>
        </div>
      ))}
      <button onClick={onSelectAll} data-testid="select-all">Select All</button>
      <button onClick={onDeselectAll} data-testid="deselect-all">Deselect All</button>
    </div>
  ),
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
  generated_areas: [],
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
  generated_areas: [],
  captured_pages: [],
  discovered_flows: [],
  proposed_scenarios: [
    { name: "Basic test", description: "Verify homepage", flow_summary: "Load homepage", area: "Navigation" },
  ],
};

const discoveredExploration = {
  _id: "expl-disc",
  status: "discovered",
  url: "https://example.com",
  discovered_pages: [
    { url: "https://example.com", title: "Home" },
    { url: "https://example.com/about", title: "About" },
    { url: "https://example.com/contact", title: "Contact" },
  ],
};

describe("ExplorePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCancelExploration.mockResolvedValue(undefined);
    mockStartDeepExploration.mockResolvedValue(undefined);
    mockUpdateDiscoveredPages.mockResolvedValue(undefined);
    mockMarkGeneratedAreas.mockResolvedValue(undefined);
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

  it("renders URL display and Discover Pages button", async () => {
    mockQueryResults.project = projectData;
    const { default: ExplorePage } = await import("./page");
    render(<ExplorePage />);
    expect(screen.getByText("Explore & Generate Tests")).toBeInTheDocument();
    expect(screen.getByText("https://example.com")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /discover pages/i })).toBeInTheDocument();
  });

  it("does not render Smart/Agent mode toggle", async () => {
    mockQueryResults.project = projectData;
    const { default: ExplorePage } = await import("./page");
    render(<ExplorePage />);
    expect(screen.queryByRole("button", { name: /smart explorer/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /agent explorer/i })).not.toBeInTheDocument();
  });

  it("does not render max steps input", async () => {
    mockQueryResults.project = projectData;
    const { default: ExplorePage } = await import("./page");
    render(<ExplorePage />);
    expect(screen.queryByText(/maximum agent steps/i)).not.toBeInTheDocument();
  });

  it("calls createExploration without exploration_mode", async () => {
    mockQueryResults.project = projectData;
    mockCreateExploration.mockResolvedValue("exploration-1");
    const { default: ExplorePage } = await import("./page");
    render(<ExplorePage />);

    await userEvent.click(screen.getByRole("button", { name: /discover pages/i }));
    expect(mockCreateExploration).toHaveBeenCalledWith({ project_id: "proj1" });
  });

  it("calls createExploration with goal and additional_urls", async () => {
    mockQueryResults.project = projectData;
    mockCreateExploration.mockResolvedValue("exploration-1");
    const { default: ExplorePage } = await import("./page");
    render(<ExplorePage />);

    await userEvent.type(screen.getByPlaceholderText(/focus on checkout/i), "Focus on auth flows");
    await userEvent.type(screen.getByPlaceholderText(/one url per line/i), "https://example.com/login");
    await userEvent.click(screen.getByRole("button", { name: /discover pages/i }));

    expect(mockCreateExploration).toHaveBeenCalledWith({
      project_id: "proj1",
      goal: "Focus on auth flows",
      additional_urls: ["https://example.com/login"],
    });
  });

  it("shows spinner during discovering status", async () => {
    mockQueryResults.project = projectData;
    mockQueryResults.exploration = {
      _id: "expl-disc",
      status: "discovering",
      progress_message: "Scanning links...",
    };
    mockQueryResults.latestActive = { _id: "expl-disc" };

    const { default: ExplorePage } = await import("./page");
    render(<ExplorePage />);

    expect(screen.getByText("Scanning links...")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
  });

  it("shows spinner during capturing status with deep exploring message", async () => {
    mockQueryResults.project = projectData;
    mockQueryResults.exploration = {
      _id: "expl-active",
      status: "capturing",
      progress_message: "Deep exploring...",
      pages_captured: 3,
    };
    mockQueryResults.latestActive = { _id: "expl-active" };

    const { default: ExplorePage } = await import("./page");
    render(<ExplorePage />);

    expect(screen.getByText("Deep exploring...")).toBeInTheDocument();
    expect(screen.getByText("3 pages captured")).toBeInTheDocument();
  });

  it("shows time estimate during progress", async () => {
    mockQueryResults.project = projectData;
    mockQueryResults.exploration = {
      _id: "expl-active",
      status: "capturing",
      progress_message: "Deep exploring...",
      pages_captured: 3,
    };
    mockQueryResults.latestActive = { _id: "expl-active" };

    const { default: ExplorePage } = await import("./page");
    render(<ExplorePage />);

    expect(screen.getByText(/usually takes 30-60 seconds/i)).toBeInTheDocument();
  });

  it("calls cancelExploration on cancel click", async () => {
    mockQueryResults.project = projectData;
    mockCancelExploration.mockResolvedValue(undefined);
    mockQueryResults.exploration = {
      _id: "expl-active",
      status: "capturing",
      progress_message: "Crawling...",
      pages_captured: 2,
    };
    mockQueryResults.latestActive = { _id: "expl-active" };

    const { default: ExplorePage } = await import("./page");
    render(<ExplorePage />);

    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(mockCancelExploration).toHaveBeenCalledWith({ exploration_id: "expl-active" });
  });

  it("shows Cancel link back to project", async () => {
    mockQueryResults.project = projectData;
    const { default: ExplorePage } = await import("./page");
    render(<ExplorePage />);
    const cancelLink = screen.getByRole("link", { name: /cancel/i });
    expect(cancelLink).toHaveAttribute("href", "/projects/proj1");
  });

  it("shows PageChecklist when exploration is discovered", async () => {
    mockQueryResults.project = projectData;
    mockQueryResults.exploration = discoveredExploration;
    mockQueryResults.latestActive = { _id: "expl-disc" };

    const { default: ExplorePage } = await import("./page");
    render(<ExplorePage />);

    expect(screen.getByTestId("page-checklist")).toBeInTheDocument();
    expect(screen.getByTestId("page-count")).toHaveTextContent("3");
  });

  it("Deep Explore Selected button is disabled when no pages selected", async () => {
    mockQueryResults.project = projectData;
    mockQueryResults.exploration = discoveredExploration;
    mockQueryResults.latestActive = { _id: "expl-disc" };

    const { default: ExplorePage } = await import("./page");
    render(<ExplorePage />);

    expect(screen.getByRole("button", { name: /deep explore selected/i })).toBeDisabled();
  });

  it("Deep Explore Selected button enables when pages are selected and calls startDeepExploration", async () => {
    mockQueryResults.project = projectData;
    mockQueryResults.exploration = discoveredExploration;
    mockQueryResults.latestActive = { _id: "expl-disc" };

    const { default: ExplorePage } = await import("./page");
    render(<ExplorePage />);

    await userEvent.click(screen.getByLabelText("Select Home"));

    expect(screen.getByRole("button", { name: /deep explore selected \(1\)/i })).not.toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: /deep explore selected/i }));
    expect(mockStartDeepExploration).toHaveBeenCalledWith({
      exploration_id: "expl-disc",
      selected_pages: ["https://example.com"],
      page_auth_flags: [
        { url: "https://example.com", auth_required: true },
        { url: "https://example.com/about", auth_required: true },
        { url: "https://example.com/contact", auth_required: true },
      ],
    });
  });

  it("Add URLs button calls updateDiscoveredPages", async () => {
    mockQueryResults.project = projectData;
    mockQueryResults.exploration = discoveredExploration;
    mockQueryResults.latestActive = { _id: "expl-disc" };

    const { default: ExplorePage } = await import("./page");
    render(<ExplorePage />);

    await userEvent.type(screen.getByPlaceholderText(/extra-page/i), "https://example.com/pricing");
    await userEvent.click(screen.getByRole("button", { name: /add urls/i }));

    expect(mockUpdateDiscoveredPages).toHaveBeenCalledWith({
      exploration_id: "expl-disc",
      additional_urls: ["https://example.com/pricing"],
    });
  });

  it("Select All / Deselect All in PageChecklist works", async () => {
    mockQueryResults.project = projectData;
    mockQueryResults.exploration = discoveredExploration;
    mockQueryResults.latestActive = { _id: "expl-disc" };

    const { default: ExplorePage } = await import("./page");
    render(<ExplorePage />);

    await userEvent.click(screen.getByTestId("select-all"));
    expect(screen.getByRole("button", { name: /deep explore selected \(3\)/i })).not.toBeDisabled();

    await userEvent.click(screen.getByTestId("deselect-all"));
    expect(screen.getByRole("button", { name: /deep explore selected \(0\)/i })).toBeDisabled();
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

  it("shows flows as read-only cards", async () => {
    mockQueryResults.project = projectData;
    mockQueryResults.exploration = analyzedWithFlows;
    mockQueryResults.latestActive = { _id: "expl1" };

    const { default: ExplorePage } = await import("./page");
    render(<ExplorePage />);

    expect(screen.getByText("Discovered Flows (2)")).toBeInTheDocument();
  });

  it("shows scenario selection directly", async () => {
    mockQueryResults.project = projectData;
    mockQueryResults.exploration = analyzedWithFlows;
    mockQueryResults.latestActive = { _id: "expl1" };

    const { default: ExplorePage } = await import("./page");
    render(<ExplorePage />);

    expect(screen.getByText("Navigate to About")).toBeInTheDocument();
    expect(screen.getByText("Contact form submit")).toBeInTheDocument();
  });

  it("shows scenario-only view when no flows exist", async () => {
    mockQueryResults.project = projectData;
    mockQueryResults.exploration = analyzedNoFlows;
    mockQueryResults.latestActive = { _id: "expl2" };

    const { default: ExplorePage } = await import("./page");
    render(<ExplorePage />);

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

  it("generate button shows selected scenario count", async () => {
    mockQueryResults.project = projectData;
    mockQueryResults.exploration = analyzedWithFlows;
    mockQueryResults.latestActive = { _id: "expl1" };

    const { default: ExplorePage } = await import("./page");
    render(<ExplorePage />);

    await userEvent.click(screen.getByText("Navigate to About"));

    expect(screen.getByRole("button", { name: /generate tests from selected \(1\)/i })).not.toBeDisabled();
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

  it("shows New Exploration confirmation dialog", async () => {
    mockQueryResults.project = projectData;
    mockQueryResults.exploration = analyzedWithFlows;
    mockQueryResults.latestActive = { _id: "expl1" };

    const { default: ExplorePage } = await import("./page");
    render(<ExplorePage />);

    await userEvent.click(screen.getByRole("button", { name: /new exploration/i }));

    expect(screen.getByText("Start new exploration?")).toBeInTheDocument();
    expect(screen.getByText(/discard the current exploration/i)).toBeInTheDocument();
  });

  it("shows generated areas badge on completed exploration", async () => {
    mockQueryResults.project = projectData;
    mockQueryResults.exploration = analyzedWithFlows;
    mockQueryResults.explorationSuites = [{ area: "Navigation", status: "ready" }];
    mockQueryResults.latestActive = { _id: "expl1" };

    const { default: ExplorePage } = await import("./page");
    render(<ExplorePage />);

    expect(screen.getByText(/1 area already generated/i)).toBeInTheDocument();
  });

  it("shows completed state with suite links", async () => {
    mockQueryResults.project = projectData;
    mockQueryResults.exploration = {
      _id: "expl1",
      status: "completed",
      url: "https://example.com",
      generated_areas: ["Navigation"],
      proposed_scenarios: [],
    };
    mockQueryResults.explorationSuites = [
      { _id: "s1", name: "Exploration — Navigation", area: "Navigation" },
    ];
    mockQueryResults.latestActive = { _id: "expl1" };

    const { default: ExplorePage } = await import("./page");
    render(<ExplorePage />);

    expect(screen.getByText("All test scenarios generated.")).toBeInTheDocument();
    expect(screen.getByText("Exploration — Navigation")).toBeInTheDocument();
  });

  it("uses Deep Explore consistently in phase labels", async () => {
    mockQueryResults.project = projectData;
    const { default: ExplorePage } = await import("./page");
    render(<ExplorePage />);

    expect(screen.getByText("Deep Explore")).toBeInTheDocument();
    expect(screen.queryByText("Analyze")).not.toBeInTheDocument();
  });
});

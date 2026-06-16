import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

let mockStories: unknown = undefined;
let mockKb: unknown = { bmad_detected: false };
let mockProject: unknown = { name: "Test Project" };
let mockExportStories: unknown = undefined;

const { queryCalls } = vi.hoisted(() => ({ queryCalls: [] as unknown[] }));

const mockDownloadFile = vi.fn();

vi.mock("convex/react", () => ({
  useQuery: vi.fn((_queryRef: unknown, args: unknown) => {
    const key = typeof _queryRef === "string" ? _queryRef : String(_queryRef);
    if (key.includes("listStories")) {
      queryCalls.push(args);
      if (mockStories === null) return null;
      if (mockStories === undefined) return undefined;
      const filterStatus = (args as { status?: string } | undefined)?.status;
      if (!filterStatus) return mockStories;
      return (mockStories as Array<{ status: string }>).filter(
        (s: { status: string }) => s.status === filterStatus,
      );
    }
    if (key.includes("getKnowledgeBase")) {
      return mockKb;
    }
    if (key.includes("getProject")) {
      return mockProject;
    }
    if (key.includes("getStoriesByIds")) {
      if (args === "skip" || args === undefined) return undefined;
      return mockExportStories;
    }
    return undefined;
  }),
}));

vi.mock("next/navigation", () => ({
  useParams: vi.fn(() => ({ id: "proj1" })),
  useRouter: vi.fn(() => ({ push: vi.fn() })),
}));

vi.mock("@/lib/convex", () => ({
  api: {
    stories: {
      queries: {
        listStories: "stories.queries.listStories",
        getStory: "stories.queries.getStory",
        getStoriesByIds: "stories.queries.getStoriesByIds",
      },
      mutations: {
        updateStoryStatus: "stories.mutations.updateStoryStatus",
        deleteStory: "stories.mutations.deleteStory",
      },
    },
    knowledge: {
      queries: {
        getKnowledgeBase: "knowledge.queries.getKnowledgeBase",
      },
    },
    projects: {
      queries: {
        getProject: "projects.queries.getProject",
      },
    },
  },
  asId: (v: string) => v,
}));

vi.mock("@/lib/error-logger", () => ({
  useErrorLogger: () => ({ logError: vi.fn() }),
}));

vi.mock("./downloadFile", () => ({
  downloadFile: (...args: unknown[]) => mockDownloadFile(...args),
}));

const sampleStories = [
  {
    _id: "s1",
    title: "Login with Google",
    status: "draft",
    generated_at: 1000,
    updated_at: undefined,
    acceptance_criteria_count: 3,
    affected_components: {
      modules: ["auth"],
      apis: [],
      data_models: [],
    },
  },
  {
    _id: "s2",
    title: "Export Reports",
    status: "approved",
    generated_at: 2000,
    updated_at: 2500,
    acceptance_criteria_count: 1,
    affected_components: {
      modules: ["reports"],
      apis: ["GET /reports"],
      data_models: ["Report"],
    },
  },
];

async function setup() {
  const { default: StoriesPage } = await import("./page");
  return render(<StoriesPage />);
}

describe("StoriesPage (list)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStories = undefined;
    mockKb = { bmad_detected: false };
    mockProject = { name: "Test Project" };
    mockExportStories = undefined;
    queryCalls.length = 0;
  });

  it("renders loading skeleton when stories is undefined", async () => {
    await setup();
    const skeleton = document.querySelector('[class*="animate-pulse"]');
    expect(skeleton).not.toBeNull();
    expect(skeleton?.className).toMatch(/pulse/);
  });

  it("renders Project not found empty state when stories is null", async () => {
    mockStories = null;
    await setup();
    expect(screen.getByText("Project not found")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Back to Projects/i })).toHaveAttribute("href", "/projects");
  });

  it("renders No stories yet empty state when stories is empty", async () => {
    mockStories = [];
    await setup();
    expect(screen.getByText("No stories yet")).toBeInTheDocument();
  });

  it("does NOT render a New Story button in the empty state", async () => {
    mockStories = [];
    await setup();
    expect(screen.queryByRole("button", { name: /New Story/i })).toBeNull();
  });

  it("renders StoryCards when populated", async () => {
    mockStories = sampleStories;
    await setup();
    expect(screen.getByText("Login with Google")).toBeInTheDocument();
    expect(screen.getByText("Export Reports")).toBeInTheDocument();
  });

  it("renders status filter select with All/Draft/Approved/Exported options", async () => {
    mockStories = sampleStories;
    await setup();
    const select = screen.getByLabelText(/Filter stories by status/i);
    expect(select).toBeInTheDocument();
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(
      expect.arrayContaining(["All", "Draft", "Approved", "Exported"]),
    );
  });

  it("defaults filter to All on mount", async () => {
    mockStories = sampleStories;
    await setup();
    const select = screen.getByLabelText(/Filter stories by status/i) as HTMLSelectElement;
    expect(select.value).toBe("all");
    expect(queryCalls).toContainEqual({ project_id: "proj1" });
  });

  it("renders StoryCards wrapped in Links to the detail page", async () => {
    mockStories = sampleStories;
    await setup();
    const link1 = screen.getByRole("link", { name: /Login with Google/i });
    expect(link1).toHaveAttribute("href", "/projects/proj1/stories/s1");
    const link2 = screen.getByRole("link", { name: /Export Reports/i });
    expect(link2).toHaveAttribute("href", "/projects/proj1/stories/s2");
  });

  it("changing the filter updates useQuery args", async () => {
    const user = userEvent.setup();
    mockStories = sampleStories;
    await setup();
    const select = screen.getByLabelText(/Filter stories by status/i);
    await user.selectOptions(select, "approved");
    expect((select as HTMLSelectElement).value).toBe("approved");
    expect(queryCalls).toContainEqual({ project_id: "proj1", status: "approved" });
  });

  it("renders header with Back to Project link", async () => {
    mockStories = sampleStories;
    await setup();
    expect(screen.getByRole("link", { name: /Back to Project/i })).toHaveAttribute(
      "href",
      "/projects/proj1",
    );
  });

  it("renders a checkbox per StoryCard for selection", async () => {
    mockStories = sampleStories;
    await setup();
    const cardCheckboxes = screen.getAllByLabelText(/Select story:/i);
    expect(cardCheckboxes).toHaveLength(2);
  });

  it("renders a 'Select all visible stories' checkbox in the header when stories exist", async () => {
    mockStories = sampleStories;
    await setup();
    expect(
      screen.getByLabelText(/Select all visible stories/i),
    ).toBeInTheDocument();
  });

  it("does NOT render the 'Select all' checkbox when there are no stories", async () => {
    mockStories = [];
    await setup();
    expect(
      screen.queryByLabelText(/Select all visible stories/i),
    ).not.toBeInTheDocument();
  });

  it("checking a per-card checkbox adds it to the selection", async () => {
    const user = userEvent.setup();
    mockStories = sampleStories;
    await setup();
    const cardCheckboxes = screen.getAllByLabelText(/Select story:/i);
    await user.click(cardCheckboxes[0]);
    expect(cardCheckboxes[0]).toBeChecked();
  });

  it("Select all toggles all visible stories into selection", async () => {
    const user = userEvent.setup();
    mockStories = sampleStories;
    await setup();
    const selectAll = screen.getByLabelText(/Select all visible stories/i);
    await user.click(selectAll);
    expect(selectAll).toBeChecked();
    const cardCheckboxes = screen.getAllByLabelText(/Select story:/i);
    expect(cardCheckboxes.every((c) => (c as HTMLInputElement).checked)).toBe(true);
  });

  it("Export button is disabled when 0 stories selected", async () => {
    mockStories = sampleStories;
    await setup();
    expect(screen.getByRole("button", { name: /^Export$/i })).toBeDisabled();
  });

  it("Export button is enabled when >=1 story is selected", async () => {
    const user = userEvent.setup();
    mockStories = sampleStories;
    await setup();
    const selectAll = screen.getByLabelText(/Select all visible stories/i);
    await user.click(selectAll);
    expect(screen.getByRole("button", { name: /^Export$/i })).toBeEnabled();
  });

  it("changing the status filter clears the selection", async () => {
    const user = userEvent.setup();
    mockStories = sampleStories;
    await setup();
    await user.click(screen.getAllByLabelText(/Select story:/i)[0]);
    expect(screen.getByRole("button", { name: /^Export$/i })).toBeEnabled();
    await user.selectOptions(
      screen.getByLabelText(/Filter stories by status/i),
      "approved",
    );
    expect(screen.getByRole("button", { name: /^Export$/i })).toBeDisabled();
  });

  it("clicking Export -> Markdown calls downloadFile with stories-export-{date}.md", async () => {
    const user = userEvent.setup();
    mockStories = sampleStories;
    mockExportStories = [
      {
        _id: "s1",
        title: "Login with Google",
        user_story: { as_a: "u", i_want: "x", so_that: "y" },
        acceptance_criteria: ["AC1"],
        affected_components: { modules: [], apis: [], data_models: [] },
        status: "draft",
        generated_at: 1000,
        thread_id: "t1",
      },
    ];
    await setup();
    const selectAll = screen.getByLabelText(/Select all visible stories/i);
    await user.click(selectAll);
    await user.click(screen.getByRole("button", { name: /^Export$/i }));
    await user.click(screen.getByRole("menuitem", { name: /Markdown/i }));
    await vi.waitFor(() => expect(mockDownloadFile).toHaveBeenCalled());
    const [, filename] = mockDownloadFile.mock.calls[0];
    expect(filename).toMatch(/^stories-export-\d{8}\.md$/);
  });

  it("BMAD Story Files option is absent when bmadDetected is false", async () => {
    const user = userEvent.setup();
    mockStories = sampleStories;
    mockKb = { bmad_detected: false };
    await setup();
    const selectAll = screen.getByLabelText(/Select all visible stories/i);
    await user.click(selectAll);
    await user.click(screen.getByRole("button", { name: /^Export$/i }));
    expect(
      screen.queryByRole("menuitem", { name: /BMAD Story Files/i }),
    ).not.toBeInTheDocument();
  });

  it("BMAD Story Files option is present when bmadDetected is true", async () => {
    const user = userEvent.setup();
    mockStories = sampleStories;
    mockKb = { bmad_detected: true };
    await setup();
    const selectAll = screen.getByLabelText(/Select all visible stories/i);
    await user.click(selectAll);
    await user.click(screen.getByRole("button", { name: /^Export$/i }));
    expect(
      screen.getByRole("menuitem", { name: /BMAD Story Files/i }),
    ).toBeInTheDocument();
  });

  it("clicking a per-card checkbox does NOT navigate (Link click suppressed)", async () => {
    const user = userEvent.setup();
    mockStories = sampleStories;
    await setup();
    const cardCheckboxes = screen.getAllByLabelText(/Select story:/i);
    expect(
      screen.getByRole("link", { name: /Login with Google/i }),
    ).toHaveAttribute("href", "/projects/proj1/stories/s1");
    await user.click(cardCheckboxes[0]);
    expect(cardCheckboxes[0]).toBeChecked();
    expect(
      screen.getByRole("link", { name: /Login with Google/i }),
    ).toHaveAttribute("href", "/projects/proj1/stories/s1");
  });
});

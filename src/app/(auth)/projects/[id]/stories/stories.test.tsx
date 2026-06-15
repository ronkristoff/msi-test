import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

let mockStories: unknown = undefined;

const { queryCalls } = vi.hoisted(() => ({ queryCalls: [] as unknown[] }));

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
      },
      mutations: {
        updateStoryStatus: "stories.mutations.updateStoryStatus",
        deleteStory: "stories.mutations.deleteStory",
      },
    },
  },
  asId: (v: string) => v,
}));

vi.mock("@/lib/error-logger", () => ({
  useErrorLogger: () => ({ logError: vi.fn() }),
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
});

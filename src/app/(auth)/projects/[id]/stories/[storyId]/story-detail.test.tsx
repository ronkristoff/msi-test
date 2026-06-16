import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { mockLogError } = vi.hoisted(() => ({
  mockLogError: vi.fn(),
}));

const mockDownloadFile = vi.fn();
let mockStory: unknown = undefined;
const mockUpdateStoryStatus = vi.fn();
const mockDeleteStory = vi.fn();
const mockRouterPush = vi.fn();
const mockRouterReplace = vi.fn();
let mockKb: unknown = { bmad_detected: false };
let mockProject: unknown = { name: "Test Project" };

vi.mock("convex/react", () => ({
  useQuery: vi.fn((_queryRef: unknown) => {
    const key = typeof _queryRef === "string" ? _queryRef : String(_queryRef);
    if (key.includes("getStory")) return mockStory;
    if (key.includes("getKnowledgeBase")) return mockKb;
    if (key.includes("getProject")) return mockProject;
    return undefined;
  }),
  useMutation: vi.fn((_mutationRef: unknown) => {
    const key = typeof _mutationRef === "string" ? _mutationRef : String(_mutationRef);
    if (key.includes("updateStoryStatus")) return mockUpdateStoryStatus;
    if (key.includes("deleteStory")) return mockDeleteStory;
    return vi.fn();
  }),
}));

vi.mock("next/navigation", () => ({
  useParams: vi.fn(() => ({ id: "proj1", storyId: "s1" })),
  useRouter: vi.fn(() => ({ push: mockRouterPush, replace: mockRouterReplace })),
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
  useErrorLogger: () => ({ logError: mockLogError }),
}));

vi.mock("@/lib/format", () => ({
  formatRelativeTime: (ts: number) => `relative:${ts}`,
  formatDate: (ts: number) => `date:${ts}`,
}));

vi.mock("../downloadFile", () => ({
  downloadFile: (...args: unknown[]) => mockDownloadFile(...args),
}));

const draftStory = {
  _id: "s1",
  workspace_id: "ws1",
  project_id: "proj1",
  thread_id: "t1",
  title: "Login with Google",
  user_story: {
    as_a: "an authenticated user",
    i_want: "to log in with Google",
    so_that: "I don't need a new password",
  },
  acceptance_criteria: ["Given x When y Then z", "Given a When b Then c"],
  affected_components: {
    modules: ["auth"],
    apis: ["POST /login"],
    data_models: [],
  },
  technical_context: "Follows zod-validation convention",
  status: "draft",
  generated_at: 1000,
  updated_at: undefined,
};

const approvedStory = { ...draftStory, status: "approved", updated_at: 2000 };
const exportedStory = { ...draftStory, status: "exported", updated_at: 3000 };
const noTechContextStory = { ...draftStory, technical_context: undefined };

async function setup() {
  const { default: StoryDetailPage } = await import("./page");
  return render(<StoryDetailPage />);
}

describe("StoryDetailPage", () => {
  let writeTextMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockStory = undefined;
    mockKb = { bmad_detected: false };
    mockProject = { name: "Test Project" };
    mockUpdateStoryStatus.mockResolvedValue(undefined);
    mockDeleteStory.mockResolvedValue(undefined);
    writeTextMock = vi.fn().mockResolvedValue(undefined);
    if (navigator.clipboard) {
      vi.spyOn(navigator.clipboard, "writeText").mockImplementation(
        (...args: Parameters<typeof writeTextMock>) => writeTextMock(...args),
      );
    } else {
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText: writeTextMock },
        configurable: true,
        writable: true,
      });
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders loading skeleton when story is undefined", async () => {
    await setup();
    const skeleton = document.querySelector('[class*="animate-pulse"]');
    expect(skeleton).not.toBeNull();
    expect(skeleton?.className).toMatch(/pulse/);
  });

  it("renders Story not found empty state when story is null", async () => {
    mockStory = null;
    await setup();
    expect(screen.getByText("Story not found")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Back to Stories/i }),
    ).toHaveAttribute("href", "/projects/proj1/stories");
  });

  it("renders draft story with title, user_story dl, numbered ACs, chips, status pill", async () => {
    mockStory = draftStory;
    await setup();
    expect(screen.getByText("Login with Google")).toBeInTheDocument();
    expect(screen.getByText("an authenticated user")).toBeInTheDocument();
    expect(screen.getByText("to log in with Google")).toBeInTheDocument();
    expect(screen.getByText("I don't need a new password")).toBeInTheDocument();
    expect(screen.getByText("Given x When y Then z")).toBeInTheDocument();
    expect(screen.getByText("Given a When b Then c")).toBeInTheDocument();
    expect(screen.getByText("auth")).toBeInTheDocument();
    expect(screen.getByText("POST /login")).toBeInTheDocument();
    expect(screen.getByLabelText("Status: draft")).toBeInTheDocument();
  });

  it("renders Approve button when story is draft", async () => {
    mockStory = draftStory;
    await setup();
    expect(
      screen.getByRole("button", { name: /Approve/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Mark as Exported/i }),
    ).toBeNull();
  });

  it("renders Mark as Exported button when story is approved", async () => {
    mockStory = approvedStory;
    await setup();
    expect(
      screen.getByRole("button", { name: /Mark as Exported/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Approve/i }),
    ).toBeNull();
  });

  it("renders no transition buttons when story is exported", async () => {
    mockStory = exportedStory;
    await setup();
    expect(
      screen.queryByRole("button", { name: /Approve/i }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: /Mark as Exported/i }),
    ).toBeNull();
    expect(
      screen.getByText(/Exported — no further transitions/i),
    ).toBeInTheDocument();
  });

  it("renders technical_context section when present", async () => {
    mockStory = draftStory;
    await setup();
    expect(
      screen.getByText("Follows zod-validation convention"),
    ).toBeInTheDocument();
  });

  it("omits technical_context section when absent", async () => {
    mockStory = noTechContextStory;
    await setup();
    expect(
      screen.queryByText(/Follows zod-validation/i),
    ).toBeNull();
  });

  it("renders View originating thread link to chat", async () => {
    mockStory = draftStory;
    await setup();
    expect(
      screen.getByRole("link", { name: /View originating thread/i }),
    ).toHaveAttribute("href", "/projects/proj1/chat/t1");
  });

  it("clicking Approve calls updateStoryStatus with approved", async () => {
    const user = userEvent.setup();
    mockStory = draftStory;
    await setup();
    await user.click(screen.getByRole("button", { name: /Approve/i }));
    expect(mockUpdateStoryStatus).toHaveBeenCalledWith({
      story_id: "s1",
      status: "approved",
    });
  });

  it("clicking Mark as Exported calls updateStoryStatus with exported", async () => {
    const user = userEvent.setup();
    mockStory = approvedStory;
    await setup();
    await user.click(screen.getByRole("button", { name: /Mark as Exported/i }));
    expect(mockUpdateStoryStatus).toHaveBeenCalledWith({
      story_id: "s1",
      status: "exported",
    });
  });

  it("disables the transition button while the mutation is pending", async () => {
    const user = userEvent.setup();
    mockStory = draftStory;
    mockUpdateStoryStatus.mockReturnValueOnce(new Promise(() => {}));
    await setup();
    const button = screen.getByRole("button", { name: /Approve/i });
    await user.click(button);
    expect(button).toBeDisabled();
  });

  it("error path: updateStoryStatus rejects -> Alert + logError", async () => {
    const user = userEvent.setup();
    mockStory = draftStory;
    mockUpdateStoryStatus.mockRejectedValueOnce(new Error("Cannot change story status from draft to approved"));
    await setup();
    await user.click(screen.getByRole("button", { name: /Approve/i }));
    await screen.findByRole("alert");
    expect(mockLogError).toHaveBeenCalled();
  });

  it("clicking Delete Story opens confirm dialog", async () => {
    const user = userEvent.setup();
    mockStory = draftStory;
    await setup();
    await user.click(screen.getByRole("button", { name: /Delete Story/i }));
    expect(
      screen.getByRole("heading", { name: /Delete story/i }),
    ).toBeInTheDocument();
  });

  it("confirming delete calls deleteStory and navigates back to list", async () => {
    const user = userEvent.setup();
    mockStory = draftStory;
    await setup();
    await user.click(screen.getByRole("button", { name: /Delete Story/i }));
    await user.click(screen.getByRole("button", { name: /^Delete$/i }));
    expect(mockDeleteStory).toHaveBeenCalledWith({ story_id: "s1" });
    await waitFor(() =>
      expect(mockRouterReplace).toHaveBeenCalledWith("/projects/proj1/stories"),
    );
  });

  it("delete error path: rejects -> Alert + logError", async () => {
    const user = userEvent.setup();
    mockStory = draftStory;
    mockDeleteStory.mockRejectedValueOnce(new Error("Story not found"));
    await setup();
    await user.click(screen.getByRole("button", { name: /Delete Story/i }));
    await user.click(screen.getByRole("button", { name: /^Delete$/i }));
    await screen.findByRole("alert");
    expect(mockLogError).toHaveBeenCalled();
  });

  it("renders Export dropdown in the action row", async () => {
    mockStory = draftStory;
    await setup();
    expect(screen.getByRole("button", { name: /^Export$/i })).toBeInTheDocument();
  });

  it("renders Copy to Clipboard button in the action row", async () => {
    mockStory = draftStory;
    await setup();
    expect(
      screen.getByRole("button", { name: /Copy to Clipboard/i }),
    ).toBeInTheDocument();
  });

  it("clicking Export -> Markdown calls downloadFile with story-{slug}.md", async () => {
    const user = userEvent.setup();
    mockStory = draftStory;
    await setup();
    await user.click(screen.getByRole("button", { name: /^Export$/i }));
    await user.click(screen.getByRole("menuitem", { name: /Markdown/i }));
    expect(mockDownloadFile).toHaveBeenCalledTimes(1);
    const [, filename] = mockDownloadFile.mock.calls[0];
    expect(filename).toBe("story-login-with-google.md");
  });

  it("clicking Copy to Clipboard calls navigator.clipboard.writeText", async () => {
    const user = userEvent.setup();
    mockStory = draftStory;
    await setup();
    await user.click(screen.getByRole("button", { name: /Copy to Clipboard/i }));
    await screen.findByRole("button", { name: /Copied!/i });
    expect(writeTextMock).toHaveBeenCalledTimes(1);
    const arg = writeTextMock.mock.calls[0][0] as string;
    expect(arg).toContain("## Login with Google");
  });

  it("BMAD Story File option present when bmadDetected is true", async () => {
    const user = userEvent.setup();
    mockStory = draftStory;
    mockKb = { bmad_detected: true };
    await setup();
    await user.click(screen.getByRole("button", { name: /^Export$/i }));
    expect(
      screen.getByRole("menuitem", { name: /BMAD Story File/i }),
    ).toBeInTheDocument();
  });

  it("BMAD Story File option absent when bmadDetected=false AND no technical_context", async () => {
    const user = userEvent.setup();
    mockStory = noTechContextStory;
    mockKb = { bmad_detected: false };
    await setup();
    await user.click(screen.getByRole("button", { name: /^Export$/i }));
    expect(
      screen.queryByRole("menuitem", { name: /BMAD Story File/i }),
    ).not.toBeInTheDocument();
  });
});

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockDownloadFile = vi.fn();

const { mockLogError } = vi.hoisted(() => ({
  mockLogError: vi.fn(),
}));

let mockStories: unknown = undefined;

vi.mock("./downloadFile", () => ({
  downloadFile: (...args: unknown[]) => mockDownloadFile(...args),
}));

const { mockUseQuery } = vi.hoisted(() => ({ mockUseQuery: vi.fn() }));

vi.mock("convex/react", () => ({
  useQuery: mockUseQuery,
}));

mockUseQuery.mockImplementation((_queryRef: unknown, args: unknown) => {
  const key = typeof _queryRef === "string" ? _queryRef : String(_queryRef);
  if (key.includes("getStoriesByIds")) {
    if (args === "skip" || args === undefined) return undefined;
    return mockStories;
  }
  return undefined;
});

vi.mock("@/lib/convex", () => ({
  api: {
    stories: {
      queries: {
        getStoriesByIds: "stories.queries.getStoriesByIds",
      },
    },
  },
}));

vi.mock("@/lib/error-logger", () => ({
  useErrorLogger: () => ({ logError: mockLogError }),
}));

const sampleStories = [
  {
    _id: "s1",
    title: "Login with Google",
    user_story: {
      as_a: "an authenticated user",
      i_want: "to log in with Google",
      so_that: "I don't need a new password",
    },
    acceptance_criteria: ["Given x When y Then z"],
    affected_components: {
      modules: ["auth"],
      apis: [],
      data_models: [],
    },
    status: "approved",
    generated_at: 1000,
    thread_id: "t1",
  },
  {
    _id: "s2",
    title: "Add OAuth Login!",
    user_story: {
      as_a: "a user",
      i_want: "an action",
      so_that: "a goal",
    },
    acceptance_criteria: ["AC1"],
    affected_components: {
      modules: [],
      apis: [],
      data_models: [],
    },
    status: "approved",
    generated_at: 2000,
    thread_id: "t2",
  },
];

async function setup(props: {
  selectedIds?: Set<string>;
  bmadDetected?: boolean;
  projectName?: string;
}) {
  const { ExportStories } = await import("./ExportStories");
  return render(
    <ExportStories
      selectedIds={props.selectedIds ?? new Set()}
      projectId="proj1"
      bmadDetected={props.bmadDetected ?? false}
      projectName={props.projectName ?? "Test Project"}
    />,
  );
}

describe("ExportStories", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStories = undefined;
    vi.useRealTimers();
  });

  it("Export trigger button is disabled when selectedIds is empty", async () => {
    await setup({ selectedIds: new Set() });
    expect(screen.getByRole("button", { name: /Export/i })).toBeDisabled();
  });

  it("Export trigger button is enabled when selectedIds has >=1 entry", async () => {
    await setup({ selectedIds: new Set(["s1"]) });
    expect(screen.getByRole("button", { name: /Export/i })).toBeEnabled();
  });

  it("Clicking Export opens menu with Markdown option", async () => {
    const user = userEvent.setup();
    await setup({ selectedIds: new Set(["s1"]) });
    await user.click(screen.getByRole("button", { name: /Export/i }));
    expect(screen.getByRole("menuitem", { name: /Markdown/i })).toBeInTheDocument();
  });

  it("BMAD Story Files option absent when bmadDetected is false", async () => {
    const user = userEvent.setup();
    await setup({ selectedIds: new Set(["s1"]), bmadDetected: false });
    await user.click(screen.getByRole("button", { name: /Export/i }));
    expect(
      screen.queryByRole("menuitem", { name: /BMAD Story Files/i }),
    ).not.toBeInTheDocument();
  });

  it("BMAD Story Files option present when bmadDetected is true", async () => {
    const user = userEvent.setup();
    await setup({ selectedIds: new Set(["s1"]), bmadDetected: true });
    await user.click(screen.getByRole("button", { name: /Export/i }));
    expect(
      screen.getByRole("menuitem", { name: /BMAD Story Files/i }),
    ).toBeInTheDocument();
  });

  it("Clicking Markdown calls downloadFile once with stories-export-{date}.md filename", async () => {
    const user = userEvent.setup();
    mockStories = sampleStories;
    await setup({ selectedIds: new Set(["s1", "s2"]) });
    await user.click(screen.getByRole("button", { name: /Export/i }));
    await user.click(screen.getByRole("menuitem", { name: /Markdown/i }));

    await vi.waitFor(() => {
      expect(mockDownloadFile).toHaveBeenCalledTimes(1);
    });
    const [, filename, mimeType] = mockDownloadFile.mock.calls[0];
    expect(filename).toMatch(/^stories-export-\d{8}\.md$/);
    expect(mimeType).toContain("markdown");
  });

  it("Clicking BMAD Story Files calls downloadFile N times (one per story)", async () => {
    const user = userEvent.setup();
    mockStories = sampleStories;
    await setup({
      selectedIds: new Set(["s1", "s2"]),
      bmadDetected: true,
    });
    await user.click(screen.getByRole("button", { name: /Export/i }));
    await user.click(screen.getByRole("menuitem", { name: /BMAD Story Files/i }));

    await vi.waitFor(() => {
      expect(mockDownloadFile).toHaveBeenCalledTimes(2);
    });
    const filenames = mockDownloadFile.mock.calls.map((c) => c[1]);
    expect(filenames).toContain("story-login-with-google.md");
    expect(filenames).toContain("story-add-oauth-login.md");
  });

  it("does not pass real ids to getStoriesByIds until a format is clicked (skip pattern)", async () => {
    mockStories = sampleStories;
    await setup({ selectedIds: new Set(["s1", "s2"]) });
    const preCalls = mockUseQuery.mock.calls;
    expect(preCalls.length).toBeGreaterThan(0);
    expect(preCalls[preCalls.length - 1][1]).toBe("skip");

    mockUseQuery.mockClear();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Export/i }));
    await user.click(screen.getByRole("menuitem", { name: /Markdown/i }));
    await vi.waitFor(() => expect(mockDownloadFile).toHaveBeenCalled());
    const realCall = mockUseQuery.mock.calls.find(
      (c) => c[1] !== "skip" && c[1] !== undefined,
    );
    expect(realCall).toBeDefined();
  });

  it("Menu closes after Markdown selection", async () => {
    const user = userEvent.setup();
    mockStories = sampleStories;
    await setup({ selectedIds: new Set(["s1"]) });
    await user.click(screen.getByRole("button", { name: /Export/i }));
    await user.click(screen.getByRole("menuitem", { name: /Markdown/i }));
    expect(
      screen.queryByRole("menuitem", { name: /Markdown/i }),
    ).not.toBeInTheDocument();
  });

  it("Menu closes on Escape and returns focus to trigger", async () => {
    const user = userEvent.setup();
    await setup({ selectedIds: new Set(["s1"]) });
    const trigger = screen.getByRole("button", { name: /Export/i });
    await user.click(trigger);
    expect(screen.getByRole("menu")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { useUIMessages } from "@convex-dev/agent/react";

let mockMessages: unknown[] = [];
let mockStatus = "Loaded";
let mockThread: unknown = undefined;

vi.mock("@convex-dev/agent/react", () => ({
  useUIMessages: vi.fn(() => ({
    results: mockMessages as never[],
    status: mockStatus,
    loadMore: vi.fn(),
  })),
}));

vi.mock("convex/react", () => ({
  useQuery: vi.fn((_queryRef: unknown) => {
    const key = typeof _queryRef === "string" ? _queryRef : String(_queryRef);
    if (key.includes("getThread")) return mockThread;
    return undefined;
  }),
}));

vi.mock("next/navigation", () => ({
  useParams: vi.fn(() => ({ id: "proj1", threadId: "thread-abc" })),
}));

vi.mock("@/lib/convex", () => ({
  api: {
    chat: {
      queries: {
        listThreadMessages: "chat.queries.listThreadMessages",
        getThread: "chat.queries.getThread",
      },
    },
  },
}));

vi.mock("@/lib/error-logger", () => ({
  useErrorLogger: () => ({ logError: vi.fn() }),
}));

async function setup() {
  const { default: ThreadViewPage } = await import("./page");
  return render(<ThreadViewPage />);
}

describe("ThreadViewPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMessages = [];
    mockStatus = "Loaded";
    mockThread = { title: "Auth Module Question", last_message_at: 5000 };
  });

  it("renders thread title from getThread query in the header", async () => {
    await setup();
    expect(screen.getByText("Auth Module Question")).toBeInTheDocument();
  });

  it("renders Back to Chat link", async () => {
    await setup();
    const backLink = screen.getByRole("link", { name: /back to chat/i });
    expect(backLink).toHaveAttribute("href", "/projects/proj1/chat");
  });

  it("renders messages with text content", async () => {
    mockMessages = [
      {
        role: "user",
        order: 0,
        stepOrder: 0,
        status: "success",
        parts: [{ type: "text", text: "What does the auth module do?" }],
      },
      {
        role: "assistant",
        order: 1,
        stepOrder: 0,
        status: "success",
        parts: [{ type: "text", text: "It handles JWT validation." }],
      },
    ];
    await setup();
    expect(screen.getByText("What does the auth module do?")).toBeInTheDocument();
    expect(screen.getByText("It handles JWT validation.")).toBeInTheDocument();
  });

  it("renders role indicators (You / Assistant)", async () => {
    mockMessages = [
      {
        role: "user",
        order: 0,
        stepOrder: 0,
        status: "success",
        parts: [{ type: "text", text: "Hello" }],
      },
      {
        role: "assistant",
        order: 1,
        stepOrder: 0,
        status: "success",
        parts: [{ type: "text", text: "Hi there" }],
      },
    ];
    await setup();
    expect(screen.getAllByText("You").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Assistant").length).toBeGreaterThan(0);
  });

  it("renders messages oldest-first", async () => {
    mockMessages = [
      {
        role: "assistant",
        order: 1,
        stepOrder: 0,
        status: "success",
        parts: [{ type: "text", text: "Second message" }],
      },
      {
        role: "user",
        order: 0,
        stepOrder: 0,
        status: "success",
        parts: [{ type: "text", text: "First message" }],
      },
    ];
    await setup();
    const all = screen.getAllByText(/message/);
    expect(all[0].textContent).toContain("First message");
    expect(all[1].textContent).toContain("Second message");
  });

  it("renders empty state when there are no messages", async () => {
    mockMessages = [];
    await setup();
    expect(
      screen.getByText("This conversation has no messages yet."),
    ).toBeInTheDocument();
  });

  it("renders loading skeleton on first page load", async () => {
    mockStatus = "LoadingFirstPage";
    mockMessages = [];
    await setup();
    expect(document.querySelector(".animate-pulse")).toBeTruthy();
  });

  it("renders Thread not found when getThread returns null", async () => {
    mockThread = null;
    mockMessages = [];
    await setup();
    expect(screen.getByText("Thread not found")).toBeInTheDocument();
    const backLink = screen.getByRole("link", { name: /back to chat/i });
    expect(backLink).toHaveAttribute("href", "/projects/proj1/chat");
  });

  it("skips listThreadMessages when getThread returns null (no throwing fetch)", async () => {
    mockThread = null;
    mockMessages = [];
    await setup();
    expect(vi.mocked(useUIMessages)).toHaveBeenCalledWith(
      "chat.queries.listThreadMessages",
      "skip",
      expect.anything(),
    );
  });

  it("fetches listThreadMessages once getThread resolves to an owned thread", async () => {
    mockThread = { title: "Owned Thread", last_message_at: 5000 };
    mockMessages = [];
    await setup();
    expect(vi.mocked(useUIMessages)).toHaveBeenCalledWith(
      "chat.queries.listThreadMessages",
      { threadId: "thread-abc" },
      expect.anything(),
    );
  });
});

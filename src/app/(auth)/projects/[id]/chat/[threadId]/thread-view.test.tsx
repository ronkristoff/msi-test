import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { useUIMessages } from "@convex-dev/agent/react";

const { mockStreamMessage } = vi.hoisted(() => ({
  mockStreamMessage: vi.fn(),
}));

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
  useAction: vi.fn(() => mockStreamMessage),
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
      chatActions: {
        streamMessage: "chat.chatActions.streamMessage",
      },
      impactActions: {
        analyzeImpact: "chat.impactActions.analyzeImpact",
      },
      storyActions: {
        generateStories: "chat.storyActions.generateStories",
      },
    },
  },
}));

vi.mock("@/lib/error-logger", () => ({
  useErrorLogger: () => ({ logError: vi.fn() }),
}));

async function setup() {
  const { default: ThreadViewPage } = await import("./page");
  const utils = render(<ThreadViewPage />);
  return { ...utils, ThreadViewPage };
}

describe("ThreadViewPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMessages = [];
    mockStatus = "Loaded";
    mockThread = { title: "Auth Module Question", last_message_at: 5000 };
    mockStreamMessage.mockReset();
    mockStreamMessage.mockResolvedValue(undefined);
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

  it("enables streaming via { stream: true } option in useUIMessages", async () => {
    await setup();
    expect(vi.mocked(useUIMessages)).toHaveBeenCalledWith(
      "chat.queries.listThreadMessages",
      { threadId: "thread-abc" },
      expect.objectContaining({ stream: true, initialNumItems: 50 }),
    );
  });

  it("renders the composer (ChatComposer) when thread is owned", async () => {
    await setup();
    expect(
      screen.getByPlaceholderText(/Ask about this project/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /send/i })).toBeInTheDocument();
  });

  it("does NOT render the composer when thread is null (not found)", async () => {
    mockThread = null;
    await setup();
    expect(
      screen.queryByPlaceholderText(/Ask about this project/i),
    ).not.toBeInTheDocument();
  });

  it("does NOT render the composer while thread is still loading (undefined)", async () => {
    mockThread = undefined;
    await setup();
    expect(
      screen.queryByPlaceholderText(/Ask about this project/i),
    ).not.toBeInTheDocument();
  });

  it("renders the empty state WITH the composer (first-message UX)", async () => {
    mockMessages = [];
    await setup();
    expect(
      screen.getByText("This conversation has no messages yet."),
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText(/Ask about this project/i),
    ).toBeInTheDocument();
  });

  it("renders typing indicator when an assistant message is streaming", async () => {
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
        status: "streaming",
        parts: [{ type: "text", text: "Hi" }],
      },
    ];
    await setup();
    expect(
      screen.getByLabelText("Assistant is typing"),
    ).toBeInTheDocument();
  });

  it("does NOT render typing indicator when no message is streaming", async () => {
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
    expect(
      screen.queryByLabelText("Assistant is typing"),
    ).not.toBeInTheDocument();
  });

  it("optimistically renders the user's message after submit, before subscription delivers", async () => {
    let _resolve: (v: unknown) => void = () => {};
    mockStreamMessage.mockReturnValue(
      new Promise((res) => {
        _resolve = res;
      }),
    );
    mockMessages = [];
    await setup();
    const textarea = screen.getByPlaceholderText(/Ask about this project/i);
    fireEvent.change(textarea, { target: { value: "What about docs?" } });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));
    await waitFor(() =>
      expect(screen.getByText("What about docs?")).toBeInTheDocument(),
    );
    _resolve(undefined);
  });

  it("clears the optimistic pending message once the subscription delivers the matching user message (no duplicate)", async () => {
    mockMessages = [];
    let _resolve: (v: unknown) => void = () => {};
    mockStreamMessage.mockReturnValue(
      new Promise((res) => {
        _resolve = res;
      }),
    );
    const { rerender, ThreadViewPage } = await setup();
    const textarea = screen.getByPlaceholderText(/Ask about this project/i);
    fireEvent.change(textarea, { target: { value: "dedup check" } });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));
    await waitFor(() =>
      expect(screen.getByText("dedup check")).toBeInTheDocument(),
    );
    // Subscription delivers the real user message while the action is still pending.
    mockMessages = [
      {
        role: "user",
        order: 0,
        stepOrder: 0,
        status: "success",
        parts: [{ type: "text", text: "dedup check" }],
      },
    ];
    rerender(<ThreadViewPage />);
    // After the dedup effect runs, exactly one copy of the message remains.
    await waitFor(() =>
      expect(screen.getAllByText("dedup check").length).toBe(1),
    );
    _resolve(undefined);
  });
});

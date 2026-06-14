import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { mockLogError } = vi.hoisted(() => ({
  mockLogError: vi.fn(),
}));

let mockThreads: unknown = undefined;
const mockCreateThread = vi.fn();
const mockRouterPush = vi.fn();

vi.mock("convex/react", () => ({
  useQuery: vi.fn((_queryRef: unknown) => {
    const key = typeof _queryRef === "string" ? _queryRef : String(_queryRef);
    if (key.includes("listThreads")) return mockThreads;
    return undefined;
  }),
  useMutation: vi.fn((_mutationRef: unknown) => {
    const key = typeof _mutationRef === "string" ? _mutationRef : String(_mutationRef);
    if (key.includes("createThread")) return mockCreateThread;
    return vi.fn();
  }),
}));

vi.mock("next/navigation", () => ({
  useParams: vi.fn(() => ({ id: "proj1" })),
  useRouter: vi.fn(() => ({ push: mockRouterPush })),
}));

vi.mock("@/lib/convex", () => ({
  api: {
    chat: {
      queries: {
        listThreads: "chat.queries.listThreads",
        listThreadMessages: "chat.queries.listThreadMessages",
      },
      mutations: {
        createThread: "chat.mutations.createThread",
      },
    },
  },
  asId: (v: string) => v,
}));

vi.mock("@/lib/error-logger", () => ({
  useErrorLogger: () => ({ logError: mockLogError }),
}));

const sampleThreads = [
  {
    thread_id: "thread-1",
    title: "Auth Module Question",
    last_message_preview: "The auth module handles JWT validation.",
    last_message_at: Date.now() - 60_000,
    _creationTime: Date.now() - 120_000,
  },
  {
    thread_id: "thread-2",
    title: "Billing Flow",
    last_message_preview: null,
    last_message_at: null,
    _creationTime: Date.now() - 200_000,
  },
];

async function setup() {
  const { default: ChatPage } = await import("./page");
  return render(<ChatPage />);
}

describe("ChatPage (thread list)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockThreads = undefined;
    mockCreateThread.mockResolvedValue({ threadId: "new-thread-123" });
  });

  it("renders loading skeleton when threads is undefined", async () => {
    await setup();
    expect(document.querySelector(".animate-pulse")).toBeTruthy();
  });

  it("renders empty state when no threads exist", async () => {
    mockThreads = [];
    await setup();
    expect(screen.getByText("No conversations yet")).toBeInTheDocument();
  });

  it("renders New Chat button in empty state", async () => {
    mockThreads = [];
    await setup();
    expect(screen.getByRole("button", { name: /new chat/i })).toBeInTheDocument();
  });

  it("renders thread cards when threads are populated", async () => {
    mockThreads = sampleThreads;
    await setup();
    expect(screen.getByText("Auth Module Question")).toBeInTheDocument();
    expect(screen.getByText("Billing Flow")).toBeInTheDocument();
  });

  it("renders preview text for threads with a message", async () => {
    mockThreads = sampleThreads;
    await setup();
    expect(
      screen.getByText("The auth module handles JWT validation."),
    ).toBeInTheDocument();
  });

  it("renders placeholder for threads without a preview", async () => {
    mockThreads = sampleThreads;
    await setup();
    expect(screen.getByText("No messages yet")).toBeInTheDocument();
  });

  it("links each thread card to the thread view route", async () => {
    mockThreads = sampleThreads;
    await setup();
    const card1 = screen.getByText("Auth Module Question").closest("a");
    expect(card1).toHaveAttribute(
      "href",
      "/projects/proj1/chat/thread-1",
    );
    const card2 = screen.getByText("Billing Flow").closest("a");
    expect(card2).toHaveAttribute(
      "href",
      "/projects/proj1/chat/thread-2",
    );
  });

  it("renders Back to Project link", async () => {
    mockThreads = sampleThreads;
    await setup();
    const backLink = screen.getByRole("link", { name: /back to project/i });
    expect(backLink).toHaveAttribute("href", "/projects/proj1");
  });

  it("calls createThread and navigates when New Chat is clicked", async () => {
    const user = userEvent.setup();
    mockThreads = sampleThreads;
    await setup();
    await user.click(screen.getByRole("button", { name: /new chat/i }));
    expect(mockCreateThread).toHaveBeenCalledWith({ project_id: "proj1" });
    expect(mockRouterPush).toHaveBeenCalledWith(
      "/projects/proj1/chat/new-thread-123",
    );
  });

  it("renders Project not found state when threads is null (cross-workspace)", async () => {
    mockThreads = null;
    await setup();
    expect(screen.getByText("Project not found")).toBeInTheDocument();
    const projectsLink = screen.getByRole("link", { name: /projects/i });
    expect(projectsLink).toHaveAttribute("href", "/projects");
  });

  it("logs error when createThread fails and shows alert", async () => {
    const user = userEvent.setup();
    mockThreads = sampleThreads;
    mockCreateThread.mockRejectedValue(
      new Error("Uncaught ConvexError: Chat failed: workspace AI config not found."),
    );
    await setup();
    await user.click(screen.getByRole("button", { name: /new chat/i }));
    expect(mockLogError).toHaveBeenCalled();
    expect(
      screen.getByText(/workspace AI config not found/i),
    ).toBeInTheDocument();
  });
});

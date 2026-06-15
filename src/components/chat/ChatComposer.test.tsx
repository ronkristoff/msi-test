import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { mockStreamMessage, mockAnalyzeImpact, mockGenerateStories, mockLogError } = vi.hoisted(() => ({
  mockStreamMessage: vi.fn(),
  mockAnalyzeImpact: vi.fn(),
  mockGenerateStories: vi.fn(),
  mockLogError: vi.fn(),
}));

vi.mock("convex/react", () => ({
  useAction: vi.fn((ref: string) => {
    if (ref === "chat.impactActions.analyzeImpact") return mockAnalyzeImpact;
    if (ref === "chat.storyActions.generateStories") return mockGenerateStories;
    return mockStreamMessage;
  }),
}));

vi.mock("@/lib/convex", () => ({
  api: {
    chat: {
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
  useErrorLogger: () => ({ logError: mockLogError }),
}));

import { ChatComposer, type PendingMessage } from "./ChatComposer";

const THREAD_ID = "thread-abc";
const onPending = vi.fn<(msg: PendingMessage) => void>();
const onSent = vi.fn();
const onError = vi.fn<(msg: string) => void>();
const onRollback = vi.fn<(pendingId: string) => void>();
const onSendingChange = vi.fn<(sending: boolean) => void>();
const onImpactResult = vi.fn<(analysis: import("../../../convex/chat/impactSchema").ImpactAnalysis, grounded: boolean) => void>();
const onStoriesResult = vi.fn<(stories: import("../../../convex/chat/storySchema").UserStory[], grounded: boolean) => void>();

function setup() {
  return render(
    <ChatComposer
      threadId={THREAD_ID}
      onPending={onPending}
      onSent={onSent}
      onError={onError}
      onRollback={onRollback}
      onSendingChange={onSendingChange}
      onImpactResult={onImpactResult}
      onStoriesResult={onStoriesResult}
    />,
  );
}

describe("ChatComposer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStreamMessage.mockReset();
    mockStreamMessage.mockResolvedValue(undefined);
    mockAnalyzeImpact.mockReset();
    mockAnalyzeImpact.mockResolvedValue(undefined);
  });

  it("renders the textarea with the project placeholder", () => {
    setup();
    expect(
      screen.getByPlaceholderText(/Ask about this project/i),
    ).toBeInTheDocument();
  });

  it("renders a Send button", () => {
    setup();
    expect(screen.getByRole("button", { name: /send/i })).toBeInTheDocument();
  });

  it("disables Send when the prompt is empty", () => {
    setup();
    expect(screen.getByRole("button", { name: /send/i })).toBeDisabled();
  });

  it("disables Send when the prompt is only whitespace", async () => {
    const user = userEvent.setup();
    setup();
    await user.type(screen.getByPlaceholderText(/ask about/i), "   ");
    expect(screen.getByRole("button", { name: /send/i })).toBeDisabled();
  });

  it("calls streamMessage with threadId + prompt, clears textarea, fires onPending on submit", async () => {
    const user = userEvent.setup();
    setup();
    const textarea = screen.getByPlaceholderText(/ask about/i);
    await user.type(textarea, "What does the auth module do?");
    await user.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => {
      expect(mockStreamMessage).toHaveBeenCalledWith({
        threadId: THREAD_ID,
        prompt: "What does the auth module do?",
      });
    });
    expect(onPending).toHaveBeenCalledTimes(1);
    const pending = onPending.mock.calls[0][0] as PendingMessage;
    expect(pending.role).toBe("user");
    expect(pending.parts[0].type).toBe("text");
    expect(pending.parts[0].text).toBe("What does the auth module do?");
    expect(pending.status).toBe("success");
    expect(pending.pendingId).toBeTruthy();
    await waitFor(() => {
      expect(textarea).toHaveValue("");
    });
  });

  it("fires onSent after the action resolves and toggles onSendingChange", async () => {
    const user = userEvent.setup();
    setup();
    await user.type(screen.getByPlaceholderText(/ask about/i), "hi");
    await user.click(screen.getByRole("button", { name: /send/i }));
    expect(onSendingChange).toHaveBeenCalledWith(true);
    await waitFor(() => expect(onSent).toHaveBeenCalled());
    expect(onSendingChange).toHaveBeenCalledWith(false);
  });

  it("disables Send while the action is pending and re-enables the sending state after resolve", async () => {
    let _resolve: (v: unknown) => void = () => {};
    mockStreamMessage.mockReturnValue(
      new Promise((res) => {
        _resolve = res;
      }),
    );
    const user = userEvent.setup();
    setup();
    await user.type(screen.getByPlaceholderText(/ask about/i), "hello");
    await user.click(screen.getByRole("button", { name: /send/i }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /sending/i })).toBeDisabled(),
    );
    _resolve(undefined);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^send$/i })).toBeInTheDocument(),
    );
    expect(mockStreamMessage).toHaveBeenCalledTimes(1);
  });

  it("submits on Enter key (no shift)", async () => {
    const user = userEvent.setup();
    setup();
    const textarea = screen.getByPlaceholderText(/ask about/i);
    await user.type(textarea, "hello");
    await user.keyboard("{Enter}");
    await waitFor(() =>
      expect(mockStreamMessage).toHaveBeenCalledWith({
        threadId: THREAD_ID,
        prompt: "hello",
      }),
    );
  });

  it("does NOT submit on Shift+Enter (newline inserted)", async () => {
    const user = userEvent.setup();
    setup();
    await user.type(screen.getByPlaceholderText(/ask about/i), "hello");
    await user.keyboard("{Shift>}{Enter}{/Shift}");
    expect(mockStreamMessage).not.toHaveBeenCalled();
  });

  it("on rejection: shows Alert, restores prompt, re-enables button, logs error, rolls back pending, skips onSent", async () => {
    const user = userEvent.setup();
    mockStreamMessage.mockRejectedValue(
      new Error("Uncaught ConvexError: Thread not found"),
    );
    setup();
    const textarea = screen.getByPlaceholderText(/ask about/i);
    await user.type(textarea, "my question");
    await user.click(screen.getByRole("button", { name: /send/i }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/Thread not found/),
    );
    expect(textarea).toHaveValue("my question");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /send/i })).toBeEnabled(),
    );
    expect(mockLogError).toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith("Thread not found");
    expect(onSent).not.toHaveBeenCalled();
    expect(onRollback).toHaveBeenCalledWith(expect.any(String));
  });
});

describe("ChatComposer: mode toggle (impact analysis)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStreamMessage.mockReset();
    mockStreamMessage.mockResolvedValue(undefined);
    mockAnalyzeImpact.mockReset();
    mockAnalyzeImpact.mockResolvedValue({
      threadId: THREAD_ID,
      analysis: {
        summary: "Test summary",
        affected_modules: [],
        affected_apis: [],
        affected_data_models: [],
        affected_user_flows: [],
        hidden_dependencies: [],
      },
      grounded: true,
    });
  });

  it("renders mode toggle with Chat and Analyze Impact options", () => {
    setup();
    expect(screen.getByRole("button", { name: /chat/i })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /analyze impact/i }),
    ).toBeInTheDocument();
  });

  it("defaults to Chat mode with project placeholder", () => {
    setup();
    expect(
      screen.getByPlaceholderText(/Ask about this project/i),
    ).toBeInTheDocument();
  });

  it("changes placeholder when Analyze Impact mode is activated", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole("button", { name: /analyze impact/i }));
    expect(
      screen.getByPlaceholderText(/paste a feature request/i),
    ).toBeInTheDocument();
  });

  it("calls analyzeImpact (not streamMessage) in impact mode", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole("button", { name: /analyze impact/i }));
    const textarea = screen.getByPlaceholderText(/paste a feature request/i);
    await user.type(textarea, "Add OAuth login");
    await user.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => {
      expect(mockAnalyzeImpact).toHaveBeenCalledWith({
        threadId: THREAD_ID,
        featureRequest: "Add OAuth login",
      });
    });
    expect(mockStreamMessage).not.toHaveBeenCalled();
  });

  it("fires onImpactResult with the analysis after impact mode send", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole("button", { name: /analyze impact/i }));
    await user.type(
      screen.getByPlaceholderText(/paste a feature request/i),
      "Add dark mode",
    );
    await user.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => {
      expect(onImpactResult).toHaveBeenCalledWith(
        expect.objectContaining({
          summary: "Test summary",
        }),
        true,
      );
    });
  });

  it("resets mode to Chat after successful impact analysis", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole("button", { name: /analyze impact/i }));
    await user.type(
      screen.getByPlaceholderText(/paste a feature request/i),
      "Add feature X",
    );
    await user.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => {
      expect(
        screen.getByPlaceholderText(/Ask about this project/i),
      ).toBeInTheDocument();
    });
  });

  it("restores prompt and resets mode on impact mode error", async () => {
    const user = userEvent.setup();
    mockAnalyzeImpact.mockRejectedValue(
      new Error("Uncaught ConvexError: Knowledge Base is not ready"),
    );
    setup();
    await user.click(screen.getByRole("button", { name: /analyze impact/i }));
    const textarea = screen.getByPlaceholderText(/paste a feature request/i);
    await user.type(textarea, "Add OAuth");
    await user.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        /Knowledge Base is not ready/,
      );
    });
    expect(textarea).toHaveValue("Add OAuth");
    await waitFor(() => {
      expect(
        screen.getByPlaceholderText(/Ask about this project/i),
      ).toBeInTheDocument();
    });
    expect(mockLogError).toHaveBeenCalledTimes(1);
  });
});

describe("ChatComposer: mode toggle (generate stories)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStreamMessage.mockReset();
    mockStreamMessage.mockResolvedValue(undefined);
    mockAnalyzeImpact.mockReset();
    mockGenerateStories.mockReset();
    mockGenerateStories.mockResolvedValue({
      threadId: THREAD_ID,
      stories: [
        {
          title: "User logs in with OAuth",
          user_story: {
            as_a: "an authenticated user",
            i_want: "to log in via Google OAuth",
            so_that: "I do not need a new password",
          },
          acceptance_criteria: [
            "Given a valid account, When the user clicks Login, Then they reach the dashboard.",
          ],
          affected_components: {
            modules: ["auth"],
            apis: [],
            data_models: [],
          },
        },
      ],
      generationNote: "Decomposed into one story.",
      grounded: true,
    });
  });

  it("renders mode toggle with Chat, Analyze Impact, AND Generate Stories options", () => {
    setup();
    expect(screen.getByRole("button", { name: /chat/i })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /analyze impact/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /generate stories/i }),
    ).toBeInTheDocument();
  });

  it("changes placeholder when Generate Stories mode is activated", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole("button", { name: /generate stories/i }));
    expect(
      screen.getByPlaceholderText(/Describe a feature to generate user stories/i),
    ).toBeInTheDocument();
  });

  it("calls generateStories (not streamMessage or analyzeImpact) in stories mode", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole("button", { name: /generate stories/i }));
    await user.type(
      screen.getByPlaceholderText(/Describe a feature to generate user stories/i),
      "Add OAuth login",
    );
    await user.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => {
      expect(mockGenerateStories).toHaveBeenCalledWith({
        threadId: THREAD_ID,
        featureRequest: "Add OAuth login",
      });
    });
    expect(mockStreamMessage).not.toHaveBeenCalled();
    expect(mockAnalyzeImpact).not.toHaveBeenCalled();
  });

  it("fires onStoriesResult with stories + grounded after stories mode send", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole("button", { name: /generate stories/i }));
    await user.type(
      screen.getByPlaceholderText(/Describe a feature to generate user stories/i),
      "Add dark mode",
    );
    await user.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => {
      expect(onStoriesResult).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ title: "User logs in with OAuth" }),
        ]),
        true,
        "Decomposed into one story.",
      );
    });
  });

  it("resets mode to Chat after successful stories generation", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole("button", { name: /generate stories/i }));
    await user.type(
      screen.getByPlaceholderText(/Describe a feature to generate user stories/i),
      "Add feature X",
    );
    await user.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => {
      expect(
        screen.getByPlaceholderText(/Ask about this project/i),
      ).toBeInTheDocument();
    });
  });

  it("restores prompt, resets mode to chat, and logs error on stories mode error", async () => {
    const user = userEvent.setup();
    mockGenerateStories.mockRejectedValue(
      new Error("Uncaught ConvexError: Story generation failed: model not available."),
    );
    setup();
    await user.click(screen.getByRole("button", { name: /generate stories/i }));
    const textarea = screen.getByPlaceholderText(
      /Describe a feature to generate user stories/i,
    );
    await user.type(textarea, "Add OAuth");
    await user.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        /Story generation failed/,
      );
    });
    expect(textarea).toHaveValue("Add OAuth");
    await waitFor(() => {
      expect(
        screen.getByPlaceholderText(/Ask about this project/i),
      ).toBeInTheDocument();
    });
    expect(mockLogError).toHaveBeenCalledTimes(1);
  });
});

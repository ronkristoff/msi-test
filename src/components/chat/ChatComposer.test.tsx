import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { mockStreamMessage, mockLogError } = vi.hoisted(() => ({
  mockStreamMessage: vi.fn(),
  mockLogError: vi.fn(),
}));

vi.mock("convex/react", () => ({
  useAction: vi.fn(() => mockStreamMessage),
}));

vi.mock("@/lib/convex", () => ({
  api: {
    chat: {
      chatActions: {
        streamMessage: "chat.chatActions.streamMessage",
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

function setup() {
  return render(
    <ChatComposer
      threadId={THREAD_ID}
      onPending={onPending}
      onSent={onSent}
      onError={onError}
      onRollback={onRollback}
      onSendingChange={onSendingChange}
    />,
  );
}

describe("ChatComposer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStreamMessage.mockReset();
    mockStreamMessage.mockResolvedValue(undefined);
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

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MessageBubble, MessageList } from "./MessageBubble";

describe("MessageBubble", () => {
  it("renders the text content for a user message", () => {
    render(
      <MessageBubble
        role="user"
        parts={[{ type: "text", text: "Hello world" }]}
      />,
    );
    expect(screen.getByText("Hello world")).toBeInTheDocument();
    expect(screen.getAllByText("You").length).toBeGreaterThan(0);
  });

  it("renders assistant label for assistant role", () => {
    render(
      <MessageBubble
        role="assistant"
        parts={[{ type: "text", text: "Hi there" }]}
      />,
    );
    expect(screen.getAllByText("Assistant").length).toBeGreaterThan(0);
  });

  it("renders [non-text content] when there are no text parts and not streaming", () => {
    render(
      <MessageBubble role="assistant" parts={[{ type: "tool-call" }]} />,
    );
    expect(screen.getByText(/\[non-text content\]/)).toBeInTheDocument();
  });

  it("skips empty text parts and shows [non-text content] when no real text", () => {
    render(
      <MessageBubble
        role="assistant"
        parts={[{ type: "text", text: "" }]}
      />,
    );
    expect(screen.getByText(/\[non-text content\]/)).toBeInTheDocument();
  });

  it("renders inline TypingIndicator when isStreaming and no text deltas yet", () => {
    const { container } = render(
      <MessageBubble
        role="assistant"
        parts={[{ type: "text", text: "" }]}
        isStreaming
      />,
    );
    expect(
      container.querySelectorAll("span.animate-bounce").length,
    ).toBe(3);
    expect(
      screen.queryByText(/\[non-text content\]/),
    ).not.toBeInTheDocument();
  });

  it("renders the streaming text when deltas have arrived (isStreaming=true with text)", () => {
    render(
      <MessageBubble
        role="assistant"
        parts={[{ type: "text", text: "Partial respons" }]}
        isStreaming
      />,
    );
    expect(screen.getByText("Partial respons")).toBeInTheDocument();
  });
});

describe("MessageList", () => {
  it("renders its children", () => {
    render(
      <MessageList>
        <span data-testid="child">x</span>
      </MessageList>,
    );
    expect(screen.getByTestId("child")).toBeInTheDocument();
  });
});

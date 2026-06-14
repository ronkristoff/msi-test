import { describe, expect, it } from "vitest";
import { extractMessageText, truncatePreview } from "./preview";

describe("truncatePreview", () => {
  it("returns short text unchanged", () => {
    expect(truncatePreview("Hello")).toBe("Hello");
  });

  it("returns empty string for empty input", () => {
    expect(truncatePreview("")).toBe("");
  });

  it("does not truncate text exactly 120 chars", () => {
    const exact = "a".repeat(120);
    expect(truncatePreview(exact)).toBe(exact);
  });

  it("truncates text longer than 120 chars to 120 + ellipsis (<=121 total)", () => {
    const long = "a".repeat(200);
    const result = truncatePreview(long);
    expect(result.length).toBe(121);
    expect(result.endsWith("…")).toBe(true);
    expect(result.slice(0, -1)).toBe("a".repeat(120));
  });

  it("truncates 121-char text to 120 + ellipsis", () => {
    const justOver = "a".repeat(121);
    const result = truncatePreview(justOver);
    expect(result.length).toBe(121);
    expect(result.endsWith("…")).toBe(true);
  });

  it("is code-point safe (does not split surrogate pairs)", () => {
    const emoji = "😀".repeat(121);
    const result = truncatePreview(emoji);
    expect(result.endsWith("…")).toBe(true);
    const beforeEllipsis = result.slice(0, -1);
    const graphemes = Array.from(beforeEllipsis);
    expect(graphemes.length).toBe(120);
    expect(graphemes.every((g) => g === "😀")).toBe(true);
  });
});

describe("extractMessageText", () => {
  it("extracts from string content", () => {
    const msg = {
      message: { role: "user" as const, content: "Hello world" },
    };
    expect(extractMessageText(msg)).toBe("Hello world");
  });

  it("extracts from array content with a text part", () => {
    const msg = {
      message: {
        role: "assistant" as const,
        content: [{ type: "text" as const, text: "Hi there" }],
      },
    };
    expect(extractMessageText(msg)).toBe("Hi there");
  });

  it("returns null when content array has no text part", () => {
    const msg = {
      message: {
        role: "assistant" as const,
        content: [{ type: "image" as const, image: "data" }],
      },
    };
    expect(extractMessageText(msg)).toBeNull();
  });

  it("returns null when message field is absent", () => {
    expect(extractMessageText({})).toBeNull();
  });

  it("returns null when message has no content", () => {
    const msg = { message: { role: "user" as const, content: undefined } };
    expect(extractMessageText(msg)).toBeNull();
  });

  it("finds the first text part among multiple parts", () => {
    const msg = {
      message: {
        role: "assistant" as const,
        content: [
          {
            type: "tool-call" as const,
            toolCallId: "1",
            toolName: "foo",
            input: {},
          },
          { type: "text" as const, text: "Result" },
        ],
      },
    };
    expect(extractMessageText(msg)).toBe("Result");
  });

  it("prefers the top-level text field over message.content", () => {
    const msg = {
      text: "Top-level text wins",
      message: {
        role: "assistant" as const,
        content: [{ type: "text" as const, text: "Should be ignored" }],
      },
    };
    expect(extractMessageText(msg)).toBe("Top-level text wins");
  });

  it("falls back to message.content when the text field is empty", () => {
    const msg = {
      text: "",
      message: {
        role: "user" as const,
        content: "Fallback content",
      },
    };
    expect(extractMessageText(msg)).toBe("Fallback content");
  });

  it("returns the top-level text field when message is absent", () => {
    const msg = { text: "Only text field" };
    expect(extractMessageText(msg)).toBe("Only text field");
  });

  it("returns null for empty-string content (no blank preview)", () => {
    const msg = { message: { role: "user" as const, content: "" } };
    expect(extractMessageText(msg)).toBeNull();
  });

  it("returns null for whitespace-only content", () => {
    const msg = { message: { role: "user" as const, content: "   \n\t  " } };
    expect(extractMessageText(msg)).toBeNull();
  });
});

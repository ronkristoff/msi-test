import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { TypingIndicator } from "./TypingIndicator";

describe("TypingIndicator", () => {
  it("renders exactly three dot spans", () => {
    const { container } = render(<TypingIndicator />);
    const dots = container.querySelectorAll("span.animate-bounce");
    expect(dots.length).toBe(3);
  });

  it("stagger animation delays across the three dots", () => {
    const { container } = render(<TypingIndicator />);
    const dots = Array.from(
      container.querySelectorAll("span.animate-bounce"),
    ) as HTMLElement[];
    const delays = dots.map((d) => d.style.animationDelay);
    expect(delays).toEqual(["0ms", "150ms", "300ms"]);
  });

  it('exposes aria-label="Assistant is typing" for screen readers', () => {
    render(<TypingIndicator />);
    expect(
      screen.getByLabelText("Assistant is typing"),
    ).toBeInTheDocument();
  });

  it('has role="status" so screen readers announce changes', () => {
    render(<TypingIndicator />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });
});

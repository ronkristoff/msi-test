import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { RecentFailures } from "./RecentFailures";

describe("RecentFailures", () => {
  it("shows empty state when no failures", () => {
    render(<RecentFailures failures={[]} />);

    expect(screen.getByText("No recent test failures. Nice work!")).toBeInTheDocument();
  });

  it("renders failure cards with test name and error", () => {
    const failures = [
      {
        testId: "t1",
        testName: "Login test",
        errorSummary: "Button not found",
        rootCause: "Element hidden by CSS animation",
        suggestedFix: "Add explicit wait",
        confidenceScore: 0.85,
        runId: "r1",
        createdAt: Date.now(),
      },
    ];

    render(<RecentFailures failures={failures} />);

    expect(screen.getByText("Login test")).toBeInTheDocument();
    expect(screen.getByText("Button not found")).toBeInTheDocument();
    expect(screen.getByText("Element hidden by CSS animation")).toBeInTheDocument();
    expect(screen.getByText("Add explicit wait")).toBeInTheDocument();
    expect(screen.getByText("85% confidence")).toBeInTheDocument();
  });

  it("renders multiple failure cards", () => {
    const failures = [
      {
        testId: "t1",
        testName: "Test 1",
        errorSummary: "Error 1",
        rootCause: null,
        suggestedFix: null,
        confidenceScore: null,
        runId: "r1",
        createdAt: Date.now(),
      },
      {
        testId: "t2",
        testName: "Test 2",
        errorSummary: "Error 2",
        rootCause: null,
        suggestedFix: null,
        confidenceScore: null,
        runId: "r2",
        createdAt: Date.now(),
      },
    ];

    render(<RecentFailures failures={failures} />);

    expect(screen.getByText("Test 1")).toBeInTheDocument();
    expect(screen.getByText("Test 2")).toBeInTheDocument();
  });

  it("renders without AI insights when null", () => {
    const failures = [
      {
        testId: "t1",
        testName: "Test without insight",
        errorSummary: "Timeout exceeded",
        rootCause: null,
        suggestedFix: null,
        confidenceScore: null,
        runId: "r1",
        createdAt: Date.now(),
      },
    ];

    render(<RecentFailures failures={failures} />);

    expect(screen.getByText("Test without insight")).toBeInTheDocument();
    expect(screen.getByText("Timeout exceeded")).toBeInTheDocument();
    expect(screen.queryByText(/Root cause/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Suggested fix/)).not.toBeInTheDocument();
  });
});

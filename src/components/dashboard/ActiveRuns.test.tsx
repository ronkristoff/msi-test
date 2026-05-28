import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ActiveRuns } from "./ActiveRuns";

describe("ActiveRuns", () => {
  it("shows empty state when no active runs", () => {
    render(<ActiveRuns runs={[]} />);

    expect(screen.getByText("No tests currently running.")).toBeInTheDocument();
  });

  it("renders active run with progress", () => {
    const runs = [
      {
        runId: "r1",
        suiteName: "Login Suite",
        totalTests: 5,
        completedTests: 2,
        startedAt: Date.now() - 30000,
        projectName: "My App",
      },
    ];

    render(<ActiveRuns runs={runs} />);

    expect(screen.getByText("Login Suite")).toBeInTheDocument();
    expect(screen.getByText("My App")).toBeInTheDocument();
    expect(screen.getByText("2/5 tests")).toBeInTheDocument();
  });

  it("shows single test run when no suite name", () => {
    const runs = [
      {
        runId: "r1",
        suiteName: null,
        totalTests: 1,
        completedTests: 0,
        startedAt: Date.now() - 5000,
        projectName: "Project X",
      },
    ];

    render(<ActiveRuns runs={runs} />);

    expect(screen.getByText("Single test run")).toBeInTheDocument();
  });

  it("renders multiple active runs", () => {
    const runs = [
      {
        runId: "r1",
        suiteName: "Suite A",
        totalTests: 3,
        completedTests: 1,
        startedAt: Date.now() - 10000,
        projectName: "App 1",
      },
      {
        runId: "r2",
        suiteName: "Suite B",
        totalTests: 7,
        completedTests: 4,
        startedAt: Date.now() - 60000,
        projectName: "App 2",
      },
    ];

    render(<ActiveRuns runs={runs} />);

    expect(screen.getByText("Suite A")).toBeInTheDocument();
    expect(screen.getByText("Suite B")).toBeInTheDocument();
  });
});

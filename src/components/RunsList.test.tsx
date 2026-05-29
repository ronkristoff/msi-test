import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RunsList, type RunItem } from "./RunsList";

const makeRun = (overrides: Partial<RunItem> = {}): RunItem => ({
  _id: "run1",
  _creationTime: Date.now() - 60000,
  status: "passed",
  trigger_type: "manual",
  duration_ms: 1500,
  pass_count: 5,
  fail_count: 0,
  skip_count: 0,
  suite_name: "Login Suite",
  environment_name: "Staging",
  project_name: "My App",
  branch: undefined,
  started_at: undefined,
  ...overrides,
});

describe("RunsList", () => {
  const defaultProps = {
    statusCounts: { all: 3, passed: 2, failed: 1, running: 0, cancelled: 0 },
    activeTab: "all" as const,
    onTabChange: vi.fn(),
    branches: ["main", "develop"],
    environments: [{ _id: "env1", name: "Staging" }],
    selectedBranch: "",
    selectedEnvironment: "",
    onBranchChange: vi.fn(),
    onEnvironmentChange: vi.fn(),
  };

  it("renders empty state when no runs", () => {
    render(<RunsList {...defaultProps} runs={[]} />);
    expect(screen.getByText("No runs yet")).toBeInTheDocument();
  });

  it("renders table with runs", () => {
    const runs = [
      makeRun({ _id: "r1", suite_name: "Suite A" }),
      makeRun({ _id: "r2", suite_name: "Suite B" }),
    ];
    render(<RunsList {...defaultProps} runs={runs} />);
    expect(screen.getByText("Suite A")).toBeInTheDocument();
    expect(screen.getByText("Suite B")).toBeInTheDocument();
  });

  it("renders status tabs", () => {
    render(<RunsList {...defaultProps} runs={[]} />);
    expect(screen.getByText("All")).toBeInTheDocument();
    expect(screen.getByText("Running")).toBeInTheDocument();
    expect(screen.getByText("Passed")).toBeInTheDocument();
    expect(screen.getByText("Failed")).toBeInTheDocument();
    expect(screen.getByText("Cancelled")).toBeInTheDocument();
  });

  it("calls onTabChange when tab clicked", async () => {
    const onTabChange = vi.fn();
    render(<RunsList {...defaultProps} runs={[]} onTabChange={onTabChange} />);

    await userEvent.click(screen.getByText("Failed"));
    expect(onTabChange).toHaveBeenCalledWith("failed");
  });

  it("renders filter dropdowns", () => {
    render(<RunsList {...defaultProps} runs={[]} />);
    expect(screen.getByText("All branches")).toBeInTheDocument();
    expect(screen.getByText("All environments")).toBeInTheDocument();
  });

  it("hides filter bar when no branches or environments", () => {
    render(
      <RunsList
        {...defaultProps}
        runs={[]}
        branches={[]}
        environments={[]}
      />,
    );
    expect(screen.queryByText("All branches")).not.toBeInTheDocument();
    expect(screen.queryByText("All environments")).not.toBeInTheDocument();
  });

  it("renders status pill with correct variant", () => {
    const runs = [
      makeRun({ _id: "r1", status: "passed" }),
      makeRun({ _id: "r2", status: "failed" }),
      makeRun({ _id: "r3", status: "running" }),
    ];
    render(<RunsList {...defaultProps} runs={runs} />);
    expect(screen.getByText("passed")).toBeInTheDocument();
    expect(screen.getByText("failed")).toBeInTheDocument();
    expect(screen.getByText("running")).toBeInTheDocument();
  });

  it("shows 'Single test run' when no suite name", () => {
    render(
      <RunsList
        {...defaultProps}
        runs={[makeRun({ suite_name: null })]}
      />,
    );
    expect(screen.getByText("Single test run")).toBeInTheDocument();
  });

  it("formats duration correctly", () => {
    render(
      <RunsList
        {...defaultProps}
        runs={[
          makeRun({ _id: "r1", duration_ms: 500 }),
          makeRun({ _id: "r2", duration_ms: 2500 }),
          makeRun({ _id: "r3", duration_ms: undefined }),
        ]}
      />,
    );
    expect(screen.getByText("500ms")).toBeInTheDocument();
    expect(screen.getByText("2.5s")).toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(1);
  });

  it("renders run rows as links to run detail", () => {
    render(
      <RunsList {...defaultProps} runs={[makeRun({ _id: "r123" })]} />,
    );
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/runs/r123");
  });

  it("shows pass/fail counts", () => {
    render(
      <RunsList
        {...defaultProps}
        runs={[makeRun({ pass_count: 3, fail_count: 2 })]}
      />,
    );
    expect(screen.getByText("3✓ 2✗")).toBeInTheDocument();
  });

  it("shows status count badges on tabs", () => {
    render(
      <RunsList
        {...defaultProps}
        runs={[]}
        statusCounts={{ all: 10, passed: 5, failed: 3, running: 2, cancelled: 0 }}
      />,
    );
    expect(screen.getByText("10")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });
});

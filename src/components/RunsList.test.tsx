import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RunsList, type RunItem, type SortField, type SortOrder } from "./RunsList";

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

const defaultProps = {
  statusCounts: { all: 3, passed: 2, failed: 1, running: 0, flaky: 0, cancelled: 0 },
  activeTab: "all" as const,
  onTabChange: vi.fn(),
  branches: ["main", "develop"],
  environments: [{ _id: "env1", name: "Staging" }],
  selectedBranch: "",
  selectedEnvironment: "",
  onBranchChange: vi.fn(),
  onEnvironmentChange: vi.fn(),
  searchTerm: "",
  onSearchChange: vi.fn(),
  sortField: "recency" as SortField,
  sortOrder: "desc" as SortOrder,
  onSort: vi.fn(),
};

describe("RunsList", () => {
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

  it("renders status tabs including flaky", () => {
    render(<RunsList {...defaultProps} runs={[]} />);
    expect(screen.getByText("All")).toBeInTheDocument();
    expect(screen.getByText("Running")).toBeInTheDocument();
    expect(screen.getByText("Passed")).toBeInTheDocument();
    expect(screen.getByText("Failed")).toBeInTheDocument();
    expect(screen.getByText("Flaky")).toBeInTheDocument();
    expect(screen.getByText("Cancelled")).toBeInTheDocument();
  });

  it("calls onTabChange when tab clicked", async () => {
    const onTabChange = vi.fn();
    render(<RunsList {...defaultProps} runs={[]} onTabChange={onTabChange} />);

    await userEvent.click(screen.getByText("Failed"));
    expect(onTabChange).toHaveBeenCalledWith("failed");
  });

  it("calls onTabChange when flaky tab clicked", async () => {
    const onTabChange = vi.fn();
    render(<RunsList {...defaultProps} runs={[]} onTabChange={onTabChange} />);

    await userEvent.click(screen.getByText("Flaky"));
    expect(onTabChange).toHaveBeenCalledWith("flaky");
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
        statusCounts={{ all: 10, passed: 5, failed: 3, running: 2, flaky: 1, cancelled: 0 }}
      />,
    );
    expect(screen.getByText("10")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("renders search input", () => {
    render(<RunsList {...defaultProps} runs={[]} />);
    expect(screen.getByPlaceholderText("Search by name, ID...")).toBeInTheDocument();
  });

  it("calls onSearchChange when typing in search input", async () => {
    const onSearchChange = vi.fn();
    render(<RunsList {...defaultProps} runs={[]} onSearchChange={onSearchChange} />);

    await userEvent.type(screen.getByPlaceholderText("Search by name, ID..."), "login");
    expect(onSearchChange).toHaveBeenCalled();
  });

  it("shows search input with current value", () => {
    render(<RunsList {...defaultProps} runs={[]} searchTerm="login" />);
    expect(screen.getByPlaceholderText("Search by name, ID...")).toHaveValue("login");
  });

  it("calls onSort when clicking sortable column header", async () => {
    const onSort = vi.fn();
    render(<RunsList {...defaultProps} runs={[makeRun()]} onSort={onSort} />);

    const headers = screen.getAllByText((content, el) => {
      return el?.tagName === "SPAN" && content.startsWith("Duration");
    });
    await userEvent.click(headers[0]);
    expect(onSort).toHaveBeenCalledWith("duration");
  });

  it("renders load more button when runs exceed page size", () => {
    const manyRuns = Array.from({ length: 25 }, (_, i) =>
      makeRun({ _id: `r${i}`, suite_name: `Suite ${i}` })
    );
    render(<RunsList {...defaultProps} runs={manyRuns} />);
    expect(screen.getByText("Load more")).toBeInTheDocument();
  });

  it("does not render load more when runs fit in one page", () => {
    const fewRuns = Array.from({ length: 5 }, (_, i) =>
      makeRun({ _id: `r${i}`, suite_name: `Suite ${i}` })
    );
    render(<RunsList {...defaultProps} runs={fewRuns} />);
    expect(screen.queryByText("Load more")).not.toBeInTheDocument();
  });

  it("loads more runs when clicking load more", async () => {
    const manyRuns = Array.from({ length: 25 }, (_, i) =>
      makeRun({ _id: `r${i}`, suite_name: `Suite ${i}` })
    );
    render(<RunsList {...defaultProps} runs={manyRuns} />);

    expect(screen.getByText("Suite 19")).toBeInTheDocument();
    expect(screen.queryByText("Suite 20")).not.toBeInTheDocument();

    await userEvent.click(screen.getByText("Load more"));

    expect(screen.getByText("Suite 20")).toBeInTheDocument();
  });
});

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  HeatmapGrid,
  getFlakinessLevel,
  type HeatmapTestRow,
  type HeatmapRun,
} from "./HeatmapGrid";
import { buildCsvContent } from "./ExportCsv";

const makeRuns = (count: number): HeatmapRun[] =>
  Array.from({ length: count }, (_, i) => ({
    runId: `run${i + 1}`,
    createdAt: Date.now() - (count - i) * 60000,
    label: `Run ${i + 1}`,
  }));

const makeTest = (overrides: Partial<HeatmapTestRow> = {}): HeatmapTestRow => ({
  testId: "test1",
  testName: "Login Test",
  flakinessPct: 0,
  results: [
    { runId: "run1", status: "passed", createdAt: Date.now() - 60000 },
  ],
  ...overrides,
});

describe("HeatmapGrid", () => {
  it("renders empty message when no tests", () => {
    render(
      <HeatmapGrid
        tests={[]}
        runs={makeRuns(3)}
        selectedTestId={null}
        onSelectTest={vi.fn()}
      />,
    );
    expect(screen.getByText(/no test data available/i)).toBeInTheDocument();
  });

  it("renders test names in rows", () => {
    const tests = [
      makeTest({ testId: "t1", testName: "Login Test" }),
      makeTest({ testId: "t2", testName: "Checkout Test" }),
    ];
    const runs = makeRuns(1);

    render(
      <HeatmapGrid
        tests={tests}
        runs={runs}
        selectedTestId={null}
        onSelectTest={vi.fn()}
      />,
    );

    expect(screen.getByText("Login Test")).toBeInTheDocument();
    expect(screen.getByText("Checkout Test")).toBeInTheDocument();
  });

  it("renders flakiness percentage per test", () => {
    const tests = [
      makeTest({ testId: "t1", testName: "Login Test", flakinessPct: 50 }),
    ];
    const runs = makeRuns(2);

    render(
      <HeatmapGrid
        tests={tests}
        runs={runs}
        selectedTestId={null}
        onSelectTest={vi.fn()}
      />,
    );

    expect(screen.getByText("50%")).toBeInTheDocument();
  });

  it("calls onSelectTest when a row is clicked", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const tests = [makeTest({ testId: "t1", testName: "Login Test" })];
    const runs = makeRuns(1);

    render(
      <HeatmapGrid
        tests={tests}
        runs={runs}
        selectedTestId={null}
        onSelectTest={onSelect}
      />,
    );

    await user.click(screen.getByText("Login Test"));
    expect(onSelect).toHaveBeenCalledWith("t1");
  });

  it("renders run column headers", () => {
    const tests = [makeTest()];
    const runs = makeRuns(3);

    render(
      <HeatmapGrid
        tests={tests}
        runs={runs}
        selectedTestId={null}
        onSelectTest={vi.fn()}
      />,
    );

    expect(screen.getByText("R1")).toBeInTheDocument();
    expect(screen.getByText("R2")).toBeInTheDocument();
    expect(screen.getByText("R3")).toBeInTheDocument();
  });
});

describe("getFlakinessLevel", () => {
  it("returns Stable for 0-10%", () => {
    expect(getFlakinessLevel(0).label).toBe("Stable");
    expect(getFlakinessLevel(10).label).toBe("Stable");
  });

  it("returns Low for 11-25%", () => {
    expect(getFlakinessLevel(15).label).toBe("Low");
    expect(getFlakinessLevel(25).label).toBe("Low");
  });

  it("returns Moderate for 26-50%", () => {
    expect(getFlakinessLevel(30).label).toBe("Moderate");
    expect(getFlakinessLevel(50).label).toBe("Moderate");
  });

  it("returns High for 51-75%", () => {
    expect(getFlakinessLevel(60).label).toBe("High");
    expect(getFlakinessLevel(75).label).toBe("High");
  });

  it("returns Critical for 76-100%", () => {
    expect(getFlakinessLevel(80).label).toBe("Critical");
    expect(getFlakinessLevel(100).label).toBe("Critical");
  });
});

describe("buildCsvContent", () => {
  it("generates valid CSV with headers and data", () => {
    const runs = makeRuns(2);
    const tests: HeatmapTestRow[] = [
      {
        testId: "t1",
        testName: "Login Test",
        flakinessPct: 50,
        results: [
          { runId: "run1", status: "passed", createdAt: 0 },
          { runId: "run2", status: "failed", createdAt: 0 },
        ],
      },
    ];

    const csv = buildCsvContent(tests, runs);
    const lines = csv.split("\n");

    expect(lines[0]).toBe("Test Name,Flakiness %,Run 1,Run 2");
    expect(lines[1]).toBe("Login Test,50,passed,failed");
  });

  it("escapes commas in test names", () => {
    const runs = makeRuns(1);
    const tests: HeatmapTestRow[] = [
      {
        testId: "t1",
        testName: 'Test "with, special" chars',
        flakinessPct: 0,
        results: [{ runId: "run1", status: "passed", createdAt: 0 }],
      },
    ];

    const csv = buildCsvContent(tests, runs);
    const lines = csv.split("\n");

    expect(lines[1]).toContain('"Test ""with, special"" chars"');
  });
});

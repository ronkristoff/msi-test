import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatsGrid } from "./StatsGrid";

describe("StatsGrid", () => {
  it("renders all four stat cards", () => {
    render(
      <StatsGrid
        passRate={85.5}
        passRateTrend={5.2}
        failedCount={3}
        failedTrend={-1}
        flakyCount={2}
        testsRun={20}
      />,
    );

    expect(screen.getByText("85.5%")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("20")).toBeInTheDocument();
  });

  it("shows trend arrows when trend is non-zero", () => {
    render(
      <StatsGrid
        passRate={90}
        passRateTrend={10}
        failedCount={1}
        failedTrend={2}
        flakyCount={0}
        testsRun={10}
      />,
    );

    expect(screen.getByText(/↑.*\+10/)).toBeInTheDocument();
    expect(screen.getByText(/↑.*\+2/)).toBeInTheDocument();
  });

  it("hides trend arrows when trend is zero", () => {
    const { container } = render(
      <StatsGrid
        passRate={100}
        passRateTrend={0}
        failedCount={0}
        failedTrend={0}
        flakyCount={0}
        testsRun={5}
      />,
    );

    const trendElements = container.querySelectorAll("[class*='text-green'], [class*='text-red']");
    expect(trendElements).toHaveLength(0);
  });

  it("shows negative trend with down arrow", () => {
    render(
      <StatsGrid
        passRate={60}
        passRateTrend={-15}
        failedCount={5}
        failedTrend={-3}
        flakyCount={1}
        testsRun={10}
      />,
    );

    expect(screen.getByText(/↓.*-15/)).toBeInTheDocument();
  });
});

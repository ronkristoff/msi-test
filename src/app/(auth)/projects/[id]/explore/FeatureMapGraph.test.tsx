import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FeatureMapGraph } from "./FeatureMapGraph";
import type { Scenario } from "./types";

const noop = () => {};

const scenarios: Scenario[] = [
  { name: "Login success", description: "Verify user can log in with valid credentials", flow_summary: "Enter credentials → submit → dashboard", area: "Auth", related_flows: ["Login flow"] },
  { name: "Login failure", description: "Verify error on invalid credentials", flow_summary: "Enter bad creds → submit → error shown", area: "Auth", related_flows: ["Login flow"] },
  { name: "Add to cart", description: "Verify adding item to cart", flow_summary: "Click add → cart updates", area: "Cart", related_flows: ["Cart flow"] },
  { name: "Remove from cart", description: "Verify removing item from cart", flow_summary: "Click remove → cart updates", area: "Cart" },
  { name: "View dashboard", description: "Dashboard loads correctly", flow_summary: "Navigate → verify data", area: "Dashboard" },
];

const emptyAreas = ["Checkout", "Settings"];

describe("FeatureMapGraph", () => {
  it("groups scenarios by area", () => {
    render(
      <FeatureMapGraph
        scenarios={scenarios}
        emptyAreas={emptyAreas}
        selectedIndices={new Set()}
        onToggleScenario={noop}
        onToggleArea={noop}
      />
    );

    expect(screen.getByText("Auth")).toBeInTheDocument();
    expect(screen.getByText("Cart")).toBeInTheDocument();
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
  });

  it("shows count badges on area nodes with selected/total", () => {
    const selected = new Set([0, 1]);
    render(
      <FeatureMapGraph
        scenarios={scenarios}
        emptyAreas={[]}
        selectedIndices={selected}
        onToggleScenario={noop}
        onToggleArea={noop}
      />
    );

    expect(screen.getByText("2/2")).toBeInTheDocument();
    expect(screen.getByText("0/2")).toBeInTheDocument();
    expect(screen.getByText("0/1")).toBeInTheDocument();
  });

  it("renders scenario names and truncated descriptions", () => {
    render(
      <FeatureMapGraph
        scenarios={scenarios}
        emptyAreas={[]}
        selectedIndices={new Set()}
        onToggleScenario={noop}
        onToggleArea={noop}
      />
    );

    expect(screen.getByText("Login success")).toBeInTheDocument();
    expect(screen.getByText("Login failure")).toBeInTheDocument();
    expect(screen.getByText("Add to cart")).toBeInTheDocument();
  });

  it("calls onToggleScenario when clicking a scenario node", async () => {
    const onToggleScenario = vi.fn();
    render(
      <FeatureMapGraph
        scenarios={scenarios}
        emptyAreas={[]}
        selectedIndices={new Set()}
        onToggleScenario={onToggleScenario}
        onToggleArea={noop}
      />
    );

    await userEvent.click(screen.getByText("Login success"));
    expect(onToggleScenario).toHaveBeenCalledWith(0);
  });

  it("calls onToggleArea when clicking an area header to select all in area", async () => {
    const onToggleArea = vi.fn();
    render(
      <FeatureMapGraph
        scenarios={scenarios}
        emptyAreas={[]}
        selectedIndices={new Set()}
        onToggleScenario={noop}
        onToggleArea={onToggleArea}
      />
    );

    await userEvent.click(screen.getByText("Auth"));
    expect(onToggleArea).toHaveBeenCalledWith("Auth");
  });

  it("calls onToggleArea when clicking a fully-selected area header (deselect)", async () => {
    const onToggleArea = vi.fn();
    render(
      <FeatureMapGraph
        scenarios={scenarios}
        emptyAreas={[]}
        selectedIndices={new Set([0, 1])}
        onToggleScenario={noop}
        onToggleArea={onToggleArea}
      />
    );

    await userEvent.click(screen.getByText("Auth"));
    expect(onToggleArea).toHaveBeenCalledWith("Auth");
  });

  it("shows empty area branches with No scenarios found label", () => {
    render(
      <FeatureMapGraph
        scenarios={scenarios}
        emptyAreas={emptyAreas}
        selectedIndices={new Set()}
        onToggleScenario={noop}
        onToggleArea={noop}
      />
    );

    expect(screen.getByText("Checkout")).toBeInTheDocument();
    expect(screen.getByText("Settings")).toBeInTheDocument();
    const noScenariosLabels = screen.getAllByText("No scenarios found");
    expect(noScenariosLabels).toHaveLength(2);
  });

  it("applies accent border styling to selected scenario nodes", () => {
    const selected = new Set([2]);
    render(
      <FeatureMapGraph
        scenarios={scenarios}
        emptyAreas={[]}
        selectedIndices={selected}
        onToggleScenario={noop}
        onToggleArea={noop}
      />
    );

    const addNode = screen.getByText("Add to cart").closest("[data-scenario-node]");
    expect(addNode?.className).toContain("border-l-[var(--accent)]");
  });

  it("applies border styling to unselected scenario nodes", () => {
    render(
      <FeatureMapGraph
        scenarios={scenarios}
        emptyAreas={[]}
        selectedIndices={new Set()}
        onToggleScenario={noop}
        onToggleArea={noop}
      />
    );

    const addNode = screen.getByText("Add to cart").closest("[data-scenario-node]");
    expect(addNode?.className).toContain("border-l-[var(--border)]");
  });

  it("applies green styling to fully covered area nodes", () => {
    const selected = new Set([0, 1]);
    render(
      <FeatureMapGraph
        scenarios={scenarios}
        emptyAreas={[]}
        selectedIndices={selected}
        onToggleScenario={noop}
        onToggleArea={noop}
      />
    );

    const authArea = screen.getByText("Auth").closest("[data-area-node]");
    expect(authArea?.className).toContain("border-green-500");
  });

  it("renders areas in alphabetical order", () => {
    render(
      <FeatureMapGraph
        scenarios={scenarios}
        emptyAreas={["Checkout"]}
        selectedIndices={new Set()}
        onToggleScenario={noop}
        onToggleArea={noop}
      />
    );

    const areaElements = screen.getAllByTestId("area-section");
    const areaNames = areaElements.map((el) => el.getAttribute("data-area-name"));
    expect(areaNames).toEqual(["Auth", "Cart", "Checkout", "Dashboard"]);
  });

  it("renders scenario description with line-clamp", () => {
    render(
      <FeatureMapGraph
        scenarios={scenarios}
        emptyAreas={[]}
        selectedIndices={new Set()}
        onToggleScenario={noop}
        onToggleArea={noop}
      />
    );

    const desc = screen.getByText("Verify user can log in with valid credentials");
    expect(desc.className).toContain("line-clamp");
  });
});

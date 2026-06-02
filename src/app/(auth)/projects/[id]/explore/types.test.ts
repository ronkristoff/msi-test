import { describe, expect, it, vi } from "vitest";
import { matchScenariosToFlows, indicesForArea, toggleArea, areasWithoutScenarios } from "./types";
import type { Scenario } from "./types";

const scenarios: Scenario[] = [
  { name: "Login flow", description: "Test login", flow_summary: "Navigate to login → enter credentials → submit", area: "Auth", related_flows: ["Home → Login → Dashboard"] },
  { name: "Browse products", description: "Test browsing", flow_summary: "Navigate to products → filter → select item", area: "Shopping", related_flows: ["Home → Products"] },
  { name: "Checkout", description: "Test checkout", flow_summary: "Add to cart → go to checkout → pay", area: "Shopping" },
  { name: "View about page", description: "Test about page", flow_summary: "Click about link → verify content", area: "Navigation", related_flows: ["Home → About"] },
];

describe("matchScenariosToFlows", () => {
  it("returns all scenarios when no flows selected", () => {
    const result = matchScenariosToFlows([], scenarios);
    expect(result).toEqual(scenarios);
  });

  it("returns only scenarios tagged with selected flow names", () => {
    const result = matchScenariosToFlows(["Home → Login → Dashboard"], scenarios);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Login flow");
  });

  it("matches multiple flows", () => {
    const result = matchScenariosToFlows(["Home → Products", "Home → About"], scenarios);
    expect(result).toHaveLength(2);
    expect(result.map((s) => s.name)).toEqual(["Browse products", "View about page"]);
  });

  it("returns all scenarios as fallback when no matches found", () => {
    const result = matchScenariosToFlows(["Nonexistent Flow"], scenarios);
    expect(result).toEqual(scenarios);
  });

  it("excludes scenarios without related_flows when other matches exist", () => {
    const result = matchScenariosToFlows(["Home → Login → Dashboard"], scenarios);
    const names = result.map((s) => s.name);
    expect(names).not.toContain("Checkout");
  });

  it("handles scenarios with empty related_flows array", () => {
    const result = matchScenariosToFlows(["Home → Login → Dashboard"], [
      { name: "A", description: "", flow_summary: "", area: "Test", related_flows: ["Home → Login → Dashboard"] },
      { name: "B", description: "", flow_summary: "", area: "Test", related_flows: [] },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("A");
  });
});

describe("indicesForArea", () => {
  it("returns indices for scenarios in the given area", () => {
    const result = indicesForArea(scenarios, "Shopping");
    expect(result).toEqual([1, 2]);
  });

  it("returns empty array for area with no scenarios", () => {
    const result = indicesForArea(scenarios, "Checkout");
    expect(result).toEqual([]);
  });

  it("returns single index for area with one scenario", () => {
    const result = indicesForArea(scenarios, "Auth");
    expect(result).toEqual([0]);
  });
});

describe("toggleArea", () => {
  it("selects all scenarios in an area when none selected", () => {
    const setter = vi.fn();
    toggleArea(setter, scenarios, "Shopping");
    expect(setter).toHaveBeenCalled();
    const updater = setter.mock.calls[0][0];
    const result = updater(new Set());
    expect(result).toEqual(new Set([1, 2]));
  });

  it("deselects all scenarios in an area when all selected", () => {
    const setter = vi.fn();
    toggleArea(setter, scenarios, "Shopping");
    const updater = setter.mock.calls[0][0];
    const result = updater(new Set([1, 2]));
    expect(result).toEqual(new Set());
  });

  it("selects remaining scenarios when some already selected", () => {
    const setter = vi.fn();
    toggleArea(setter, scenarios, "Shopping");
    const updater = setter.mock.calls[0][0];
    const result = updater(new Set([1]));
    expect(result).toEqual(new Set([1, 2]));
  });

  it("does nothing for area with no scenarios", () => {
    const setter = vi.fn();
    toggleArea(setter, scenarios, "Checkout");
    const updater = setter.mock.calls[0][0];
    const result = updater(new Set([0]));
    expect(result).toEqual(new Set([0]));
  });
});

describe("areasWithoutScenarios", () => {
  it("returns gap features that have no matching scenario area", () => {
    const prdGaps = ["Checkout", "Payments"];
    const result = areasWithoutScenarios(scenarios, prdGaps);
    expect(result).toEqual(["Checkout", "Payments"]);
  });

  it("excludes gap features that already have scenarios", () => {
    const prdGaps = ["Auth", "Checkout"];
    const result = areasWithoutScenarios(scenarios, prdGaps);
    expect(result).toEqual(["Checkout"]);
  });

  it("returns empty array when no gaps", () => {
    const result = areasWithoutScenarios(scenarios, []);
    expect(result).toEqual([]);
  });
});

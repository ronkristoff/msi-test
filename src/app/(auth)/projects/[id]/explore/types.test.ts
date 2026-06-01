import { describe, expect, it } from "vitest";
import { matchScenariosToFlows } from "./types";
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

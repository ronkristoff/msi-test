import { describe, it, expect, vi } from "vitest";
import {
  buildInstruction,
  buildVariables,
  extractFlowsFromActions,
} from "./autonomous-explorer";
import type { ExplorationWorkItem, CapturedPage } from "./types";

vi.mock("./stagehand", () => ({
  initStagehand: vi.fn(),
}));

function createBaseWork(overrides?: Partial<ExplorationWorkItem>): ExplorationWorkItem {
  return {
    exploration_id: "exp-auto-1",
    url: "https://example.com",
    workspace_id: "ws-1",
    auth_mode: "none",
    interactive: false,
    exploration_mode: "autonomous",
    ...overrides,
  };
}

describe("buildInstruction", () => {
  it("uses goal when provided", () => {
    const work = createBaseWork({ goal: "Focus on checkout flows" });
    const instruction = buildInstruction(work);
    expect(instruction).toContain("Focus on checkout flows");
    expect(instruction).toContain("https://example.com");
    expect(instruction).toContain("stay on origin");
  });

  it("uses default instruction when no goal", () => {
    const work = createBaseWork();
    const instruction = buildInstruction(work);
    expect(instruction).toContain("Thoroughly explore this web application");
    expect(instruction).toContain("https://example.com");
    expect(instruction).toContain("Stay within the same origin");
  });

  it("includes origin constraint", () => {
    const work = createBaseWork({ url: "https://app.mysite.com/dashboard" });
    const instruction = buildInstruction(work);
    expect(instruction).toContain("https://app.mysite.com");
  });
});

describe("buildVariables", () => {
  it("returns variables when username and password provided", () => {
    const work = createBaseWork({
      auth_mode: "form",
      username: "user@test.com",
      password: "pass123",
    });
    const vars = buildVariables(work);
    expect(vars).toEqual({
      username: "user@test.com",
      password: "pass123",
    });
  });

  it("returns undefined when no auth credentials", () => {
    const work = createBaseWork({ auth_mode: "none" });
    const vars = buildVariables(work);
    expect(vars).toBeUndefined();
  });

  it("returns partial variables when only username provided", () => {
    const work = createBaseWork({
      auth_mode: "form",
      username: "user@test.com",
    });
    const vars = buildVariables(work);
    expect(vars).toEqual({ username: "user@test.com" });
  });
});

describe("extractFlowsFromActions", () => {
  it("returns empty array for no actions", () => {
    const result = extractFlowsFromActions([], []);
    expect(result).toEqual([]);
  });

  it("returns empty array for single URL", () => {
    const actions = [
      { type: "navigate", pageUrl: "https://example.com" },
    ];
    const result = extractFlowsFromActions(actions, []);
    expect(result).toEqual([]);
  });

  it("creates flow from multi-page action sequence", () => {
    const capturedPages: CapturedPage[] = [
      { url: "https://example.com", title: "Home", structure_text: "" },
      { url: "https://example.com/products", title: "Products", structure_text: "" },
      { url: "https://example.com/cart", title: "Cart", structure_text: "" },
    ];

    const actions = [
      { type: "navigate", pageUrl: "https://example.com" },
      { type: "click", pageUrl: "https://example.com" },
      { type: "navigate", pageUrl: "https://example.com/products" },
      { type: "click", pageUrl: "https://example.com/products" },
      { type: "navigate", pageUrl: "https://example.com/cart" },
    ];

    const flows = extractFlowsFromActions(actions, capturedPages);
    expect(flows).toHaveLength(1);
    expect(flows[0].steps).toEqual(["Home", "Products", "Cart"]);
    expect(flows[0].pages_involved).toEqual([0, 1, 2]);
    expect(flows[0].complexity).toBe("low");
  });

  it("classifies complexity correctly", () => {
    const pages: CapturedPage[] = Array.from({ length: 8 }, (_, i) => ({
      url: `https://example.com/page${i}`,
      title: `Page ${i}`,
      structure_text: "",
    }));

    const actions = pages.map((p) => ({ type: "navigate", pageUrl: p.url }));

    const flows = extractFlowsFromActions(actions, pages);
    expect(flows[0].complexity).toBe("high");
  });

  it("handles actions without pageUrl", () => {
    const actions = [
      { type: "click" },
      { type: "type" },
    ];
    const result = extractFlowsFromActions(actions, []);
    expect(result).toEqual([]);
  });

  it("maps captured page indices for matched URLs", () => {
    const capturedPages: CapturedPage[] = [
      { url: "https://example.com", title: "Home", structure_text: "" },
      { url: "https://example.com/about", title: "About", structure_text: "" },
    ];

    const actions = [
      { type: "navigate", pageUrl: "https://example.com" },
      { type: "navigate", pageUrl: "https://example.com/about" },
    ];

    const flows = extractFlowsFromActions(actions, capturedPages);
    expect(flows[0].pages_involved).toEqual([0, 1]);
  });
});

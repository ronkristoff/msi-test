import { describe, it, expect, vi } from "vitest";
import {
  buildInstruction,
  buildVariables,
  extractFlowsFromActions,
  buildSuggestedLocator,
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

  it("includes PRD section when prd_text is provided", () => {
    const work = createBaseWork({ prd_text: "Feature: User checkout with credit card and PayPal" });
    const instruction = buildInstruction(work);
    expect(instruction).toContain("PRD / Product Requirements");
    expect(instruction).toContain("User checkout with credit card and PayPal");
    expect(instruction).toContain("guide your exploration");
  });

  it("does not include PRD section when prd_text is absent", () => {
    const work = createBaseWork();
    const instruction = buildInstruction(work);
    expect(instruction).not.toContain("PRD / Product Requirements");
  });

  it("truncates long PRD text to 3000 chars", () => {
    const longPrd = "x".repeat(5000);
    const work = createBaseWork({ prd_text: longPrd });
    const instruction = buildInstruction(work);
    const prdMatch = instruction.match(/PRD \/ Product Requirements:\n([\s\S]*?)\n\nIMPORTANT/);
    expect(prdMatch).toBeTruthy();
    expect(prdMatch![1].length).toBeLessThanOrEqual(3000);
  });

  it("includes both goal and PRD when both provided", () => {
    const work = createBaseWork({
      goal: "Focus on checkout",
      prd_text: "Checkout feature with tax withholding",
    });
    const instruction = buildInstruction(work);
    expect(instruction).toContain("Focus on checkout");
    expect(instruction).toContain("PRD / Product Requirements");
    expect(instruction).toContain("tax withholding");
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

describe("buildSuggestedLocator", () => {
  it("returns getByTestId when data-testid exists", () => {
    const result = buildSuggestedLocator({ dataTestid: "cta-btn", elementType: "button" });
    expect(result).toBe("page.getByTestId('cta-btn')");
  });

  it("returns locator by id when element id exists", () => {
    const result = buildSuggestedLocator({ id: "hero-cta", elementType: "button" });
    expect(result).toBe("page.locator('#hero-cta')");
  });

  it("returns unscoped getByRole for non-duplicate elements", () => {
    const result = buildSuggestedLocator({
      role: "button",
      text: "Login",
      elementType: "button",
    });
    expect(result).toBe("page.getByRole('button', { name: 'Login' })");
  });

  it("scopes to parent id when scopeId is provided", () => {
    const result = buildSuggestedLocator(
      { role: "button", text: "Sign up", elementType: "button" },
      { scopeId: "features" },
    );
    expect(result).toBe("page.locator('#features').getByRole('button', { name: 'Sign up' })");
  });

  it("scopes to unique landmark when landmark is unique", () => {
    const result = buildSuggestedLocator(
      { role: "button", text: "Sign up", elementType: "button" },
      { landmarkRole: "banner", isLandmarkUnique: true },
    );
    expect(result).toBe("page.getByRole('banner').getByRole('button', { name: 'Sign up' })");
  });

  it("scopes to labeled unique landmark", () => {
    const result = buildSuggestedLocator(
      { role: "button", text: "Sign up", elementType: "button" },
      { landmarkRole: "region", landmarkLabel: "Features", isLandmarkUnique: true },
    );
    expect(result).toBe("page.getByRole('region', { name: 'Features' }).getByRole('button', { name: 'Sign up' })");
  });

  it("prefers scopeId over landmark when both are available", () => {
    const result = buildSuggestedLocator(
      { role: "button", text: "Sign up", elementType: "button" },
      { scopeId: "features", landmarkRole: "banner", isLandmarkUnique: true },
    );
    expect(result).toBe("page.locator('#features').getByRole('button', { name: 'Sign up' })");
  });

  it("falls back to nth when duplicate with no unique scope", () => {
    const result = buildSuggestedLocator(
      { role: "button", text: "Sign up", elementType: "button" },
      { isDuplicate: true, duplicateIndex: 2 },
    );
    expect(result).toBe("page.getByRole('button', { name: 'Sign up' }).nth(2)");
  });

  it("falls back to nth when landmark is not unique", () => {
    const result = buildSuggestedLocator(
      { role: "button", text: "Sign up", elementType: "button" },
      { landmarkRole: "navigation", isLandmarkUnique: false, isDuplicate: true, duplicateIndex: 0 },
    );
    expect(result).toBe("page.getByRole('button', { name: 'Sign up' }).nth(0)");
  });

  it("uses nth(0) for first duplicate element", () => {
    const result = buildSuggestedLocator(
      { role: "button", text: "CTA", elementType: "button" },
      { isDuplicate: true, duplicateIndex: 0 },
    );
    expect(result).toBe("page.getByRole('button', { name: 'CTA' }).nth(0)");
  });

  it("handles text with single quotes", () => {
    const result = buildSuggestedLocator(
      { role: "button", text: "It's a test", elementType: "button" },
    );
    expect(result).toBe("page.getByRole('button', { name: 'It\\'s a test' })");
  });

  it("uses getByLabel when labelText is provided", () => {
    const result = buildSuggestedLocator({
      labelText: "Email address",
      elementType: "input",
    });
    expect(result).toBe("page.getByLabel('Email address')");
  });

  it("uses getByPlaceholder when placeholder is provided", () => {
    const result = buildSuggestedLocator({
      placeholder: "Enter your email",
      elementType: "input",
    });
    expect(result).toBe("page.getByPlaceholder('Enter your email')");
  });

  it("uses getByText for button with text but no role", () => {
    const result = buildSuggestedLocator({
      text: "Click me",
      elementType: "button",
    });
    expect(result).toBe("page.getByText('Click me')");
  });

  it("uses name locator as fallback", () => {
    const result = buildSuggestedLocator({
      name: "email",
      elementType: "input",
    });
    expect(result).toBe("page.locator('[name=\"email\"]')");
  });

  it("falls through data-testid when isDuplicate is true", () => {
    const result = buildSuggestedLocator(
      { dataTestid: "cta-btn", role: "button", text: "CTA", elementType: "button" },
      { isDuplicate: true, duplicateIndex: 0 },
    );
    expect(result).toBe("page.getByRole('button', { name: 'CTA' }).nth(0)");
  });

  it("falls through id when isDuplicate is true", () => {
    const result = buildSuggestedLocator(
      { id: "hero-cta", role: "button", text: "Sign up", elementType: "button" },
      { isDuplicate: true, duplicateIndex: 1 },
    );
    expect(result).toBe("page.getByRole('button', { name: 'Sign up' }).nth(1)");
  });

  it("uses data-testid when not duplicate", () => {
    const result = buildSuggestedLocator(
      { dataTestid: "cta-btn", role: "button", text: "CTA", elementType: "button" },
    );
    expect(result).toBe("page.getByTestId('cta-btn')");
  });

  it("uses id when not duplicate", () => {
    const result = buildSuggestedLocator(
      { id: "hero-cta", role: "button", text: "Sign up", elementType: "button" },
    );
    expect(result).toBe("page.locator('#hero-cta')");
  });
});

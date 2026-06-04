import { describe, it, expect } from "vitest";
import { formatFeedbackForPrompt } from "./feedback-discovery";
import type { FeedbackDiscoveryResult, DiscoveredFeedback } from "./feedback-discovery";

describe("formatFeedbackForPrompt", () => {
  it("returns no-feedback message when result has empty feedback array", () => {
    const result: FeedbackDiscoveryResult = {
      feedback: [],
      before_url: "https://example.com/sign-in",
      after_url: "https://example.com/sign-in",
      url_changed: false,
    };

    const output = formatFeedbackForPrompt(result, "submit login form");
    expect(output).toContain("No visible feedback elements detected");
    expect(output).toContain("submit login form");
  });

  it("formats ARIA alert feedback with high confidence", () => {
    const result: FeedbackDiscoveryResult = {
      feedback: [
        {
          type: "error",
          message: "Invalid email or password",
          detection_strategy: "aria",
          confidence: "high",
          selector: '[role="alert"]',
          suggested_locator: 'page.getByRole(\'alert\')',
          suggested_assertion: 'await expect(page.getByRole(\'alert\')).toBeVisible();',
          element_html: '<div role="alert">Invalid email or password</div>',
        },
      ],
      before_url: "https://example.com/sign-in",
      after_url: "https://example.com/sign-in",
      url_changed: false,
    };

    const output = formatFeedbackForPrompt(result, "sign in with wrong password");
    expect(output).toContain("error");
    expect(output).toContain("aria");
    expect(output).toContain("high");
    expect(output).toContain("Invalid email or password");
    expect(output).toContain("getByRole('alert')");
    expect(output).toContain("stayed the same");
  });

  it("formats toast feedback with detection strategy", () => {
    const result: FeedbackDiscoveryResult = {
      feedback: [
        {
          type: "success",
          message: "Account created successfully",
          detection_strategy: "toast",
          confidence: "high",
          selector: "[data-sonner-toast]",
          suggested_locator: 'page.locator(\'[data-sonner-toast]\')',
          suggested_assertion: 'await expect(page.locator(\'[data-sonner-toast]\')).toBeVisible();',
          element_html: '<div data-sonner-toast>Account created successfully</div>',
        },
      ],
      before_url: "https://example.com/sign-up",
      after_url: "https://example.com/dashboard",
      url_changed: true,
    };

    const output = formatFeedbackForPrompt(result, "sign up with valid data");
    expect(output).toContain("success");
    expect(output).toContain("toast");
    expect(output).toContain("changed to https://example.com/dashboard");
    expect(output).toContain("Account created successfully");
  });

  it("formats visual styling feedback with medium confidence", () => {
    const result: FeedbackDiscoveryResult = {
      feedback: [
        {
          type: "error",
          message: "Invalid email or password",
          detection_strategy: "visual",
          confidence: "medium",
          selector: "div.bg-red-50.border-red-200.rounded-xl",
          suggested_locator: 'page.locator(\'div.bg-red-50.border-red-200.rounded-xl\')',
          suggested_assertion: 'await expect(page.locator(\'div.bg-red-50.border-red-200.rounded-xl\')).toContainText(\'Invalid email or password\');',
          element_html: '<div class="bg-red-50 border-red-200 rounded-xl">Invalid email or password</div>',
        },
      ],
      before_url: "https://example.com/sign-in",
      after_url: "https://example.com/sign-in",
      url_changed: false,
    };

    const output = formatFeedbackForPrompt(result, "submit login form");
    expect(output).toContain("visual");
    expect(output).toContain("medium");
    expect(output).toContain("bg-red-50");
  });

  it("includes redirect feedback", () => {
    const result: FeedbackDiscoveryResult = {
      feedback: [
        {
          type: "redirect",
          message: "Page redirected from /sign-up to /dashboard",
          detection_strategy: "url_change",
          confidence: "low",
          selector: "",
          suggested_locator: "",
          suggested_assertion: 'await expect(page).toHaveURL(/dashboard/);',
          element_html: "",
        },
      ],
      before_url: "https://example.com/sign-up",
      after_url: "https://example.com/dashboard",
      url_changed: true,
    };

    const output = formatFeedbackForPrompt(result, "submit sign-up form");
    expect(output).toContain("redirect");
    expect(output).toContain("url_change");
    expect(output).toContain("low");
    expect(output).toContain("toHaveURL");
  });

  it("formats multiple feedback items", () => {
    const result: FeedbackDiscoveryResult = {
      feedback: [
        {
          type: "error",
          message: "Email is required",
          detection_strategy: "text",
          confidence: "medium",
          selector: 'span.field-error',
          suggested_locator: 'page.locator(\'span.field-error\')',
          suggested_assertion: 'await expect(page.locator(\'span.field-error\')).toContainText(\'Email is required\');',
          element_html: '<span class="field-error">Email is required</span>',
        },
        {
          type: "error",
          message: "Password is required",
          detection_strategy: "text",
          confidence: "medium",
          selector: 'span.field-error',
          suggested_locator: 'page.locator(\'span.field-error\')',
          suggested_assertion: 'await expect(page.locator(\'span.field-error\')).toContainText(\'Password is required\');',
          element_html: '<span class="field-error">Password is required</span>',
        },
      ],
      before_url: "https://example.com/sign-in",
      after_url: "https://example.com/sign-in",
      url_changed: false,
    };

    const output = formatFeedbackForPrompt(result, "submit empty form");
    expect(output).toContain("Email is required");
    expect(output).toContain("Password is required");
  });
});

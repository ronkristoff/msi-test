import { describe, it, expect } from "vitest";
import {
  shouldDiscoverFeedback,
  buildFeedbackActionFromSnapshot,
  buildSemanticFallbackAction,
  buildFeedbackPromptContext,
} from "./feedbackDiscovery";
import type { FormattableElement } from "./formatElements";

describe("shouldDiscoverFeedback", () => {
  it("returns true for error scenarios", () => {
    expect(shouldDiscoverFeedback({ name: "Login shows error" })).toBe(true);
  });

  it("returns true for invalid scenarios", () => {
    expect(shouldDiscoverFeedback({ name: "Invalid credentials test" })).toBe(true);
  });

  it("returns true for success scenarios", () => {
    expect(shouldDiscoverFeedback({ name: "Successful registration" })).toBe(true);
  });

  it("returns true for warning scenarios", () => {
    expect(shouldDiscoverFeedback({ name: "Warning displayed on delete" })).toBe(true);
  });

  it("returns true for failure scenarios", () => {
    expect(shouldDiscoverFeedback({ name: "Form submission fails" })).toBe(true);
  });

  it("returns true when description contains trigger keyword", () => {
    expect(
      shouldDiscoverFeedback({ name: "Navigation test", description: "Shows error message on failure" }),
    ).toBe(true);
  });

  it("returns true when flow_summary contains trigger keyword", () => {
    expect(
      shouldDiscoverFeedback({ name: "Form test", flow_summary: "Submit and verify error appears" }),
    ).toBe(true);
  });

  it("returns false for neutral scenarios", () => {
    expect(shouldDiscoverFeedback({ name: "Dashboard renders correctly" })).toBe(false);
  });

  it("returns false for navigation scenarios", () => {
    expect(shouldDiscoverFeedback({ name: "Navigate to settings page" })).toBe(false);
  });
});

describe("buildFeedbackActionFromSnapshot", () => {
  const signInElements: FormattableElement[] = [
    { element_type: "input", type: "email", label_text: "Email Address", selector: "#email" },
    { element_type: "input", type: "password", label_text: "Password", selector: "#password" },
    { element_type: "button", label_text: "Log In", selector: 'button[type="submit"]' },
  ];

  const signUpElements: FormattableElement[] = [
    { element_type: "input", label_text: "First Name", selector: "#firstName" },
    { element_type: "input", label_text: "Last Name", selector: "#lastName" },
    { element_type: "input", type: "email", label_text: "Work Email", selector: "#email" },
    { element_type: "input", type: "password", label_text: "Password", selector: "#password" },
    { element_type: "button", label_text: "Start free trial — Free/mo", selector: 'button[type="submit"]' },
  ];

  const genericFormElements: FormattableElement[] = [
    { element_type: "input", label_text: "Email", placeholder: "Enter your email", selector: "#email" },
    { element_type: "button", label_text: "Submit", selector: 'button[type="submit"]' },
  ];

  it("uses real field labels from snapshot for sign-in", () => {
    const action = buildFeedbackActionFromSnapshot(
      { name: "Sign-in with wrong password" },
      signInElements,
    );
    expect(action).not.toBeNull();
    expect(action!.type).toBe("fill_and_submit");
    expect(action!.fields).toHaveLength(2);
    expect(action!.fields[0].label).toBe("Email Address");
    expect(action!.fields[0].value).toBe("invalid@example.com");
    expect(action!.fields[1].label).toBe("Password");
    expect(action!.fields[1].value).toBe("WrongPassword123!");
    expect(action!.submit_label).toBe("Log In");
  });

  it("uses real field labels from snapshot for sign-up", () => {
    const action = buildFeedbackActionFromSnapshot(
      { name: "Sign-up form validation" },
      signUpElements,
    );
    expect(action).not.toBeNull();
    expect(action!.type).toBe("fill_and_submit");
    expect(action!.fields.length).toBeGreaterThanOrEqual(4);
    expect(action!.fields.find((f) => f.label === "Work Email")).toBeDefined();
    expect(action!.fields.find((f) => f.label === "Password")!.value).toBe("short");
    expect(action!.submit_label).toBe("Start free trial — Free/mo");
  });

  it("uses real field labels for generic form scenarios", () => {
    const action = buildFeedbackActionFromSnapshot(
      { name: "Form submission test" },
      genericFormElements,
    );
    expect(action).not.toBeNull();
    expect(action!.submit_label).toBe("Submit");
  });

  it("uses label_text over placeholder for field identification", () => {
    const action = buildFeedbackActionFromSnapshot(
      { name: "Login with invalid credentials" },
      genericFormElements,
    );
    expect(action).not.toBeNull();
    expect(action!.fields[0].label).toBe("Email");
  });

  it("returns null for non-form scenarios", () => {
    const action = buildFeedbackActionFromSnapshot(
      { name: "Dashboard loads data" },
      signInElements,
    );
    expect(action).toBeNull();
  });

  it("falls back to semantic action when no elements provided", () => {
    const action = buildFeedbackActionFromSnapshot(
      { name: "Sign-in with wrong password" },
      undefined,
    );
    expect(action).not.toBeNull();
    expect(action!.type).toBe("trigger_error");
    expect((action as { intent: string }).intent).toBe("sign_in_error");
  });

  it("falls back to semantic action when elements array is empty", () => {
    const action = buildFeedbackActionFromSnapshot(
      { name: "Sign-up form validation" },
      [],
    );
    expect(action).not.toBeNull();
    expect(action!.type).toBe("trigger_error");
  });

  it("falls back to semantic action when no form fields found in elements", () => {
    const buttonOnly: FormattableElement[] = [
      { element_type: "button", label_text: "Click me", selector: "#btn" },
    ];
    const action = buildFeedbackActionFromSnapshot(
      { name: "Form submission test" },
      buttonOnly,
    );
    expect(action).not.toBeNull();
    expect(action!.type).toBe("trigger_error");
  });

  it("handles fields with only placeholder text", () => {
    const elementsWithPlaceholders: FormattableElement[] = [
      { element_type: "input", name: "email", placeholder: "you@example.com", selector: "#email" },
      { element_type: "input", type: "password", placeholder: "Enter password", selector: "#pass" },
      { element_type: "button", label_text: "Continue", selector: "#submit" },
    ];
    const action = buildFeedbackActionFromSnapshot(
      { name: "Sign-in error test" },
      elementsWithPlaceholders,
    );
    expect(action).not.toBeNull();
    expect(action!.type).toBe("fill_and_submit");
    expect(action!.fields[0].label).toBe("you@example.com");
    expect(action!.fields[1].label).toBe("Enter password");
    expect(action!.submit_label).toBe("Continue");
  });

  it("uses name attr as last resort for field label", () => {
    const elementsWithNameOnly: FormattableElement[] = [
      { element_type: "input", name: "username", selector: "#username" },
      { element_type: "button", label_text: "Go", selector: "#go" },
    ];
    const action = buildFeedbackActionFromSnapshot(
      { name: "Form fill test" },
      elementsWithNameOnly,
    );
    expect(action).not.toBeNull();
    expect(action!.fields[0].label).toBe("username");
  });

  it("provides bad values based on field type, not hardcoded labels", () => {
    const customFields: FormattableElement[] = [
      { element_type: "input", type: "email", label_text: "Username or Email", selector: "#user" },
      { element_type: "input", type: "password", label_text: "Passphrase", selector: "#pass" },
      { element_type: "button", label_text: "Authenticate", selector: "#auth" },
    ];
    const action = buildFeedbackActionFromSnapshot(
      { name: "Login error test" },
      customFields,
    );
    expect(action).not.toBeNull();
    expect(action!.fields[0].value).toBe("invalid@example.com");
    expect(action!.fields[1].value).toBe("WrongPassword123!");
    expect(action!.submit_label).toBe("Authenticate");
  });
});

describe("buildSemanticFallbackAction", () => {
  it("returns trigger_error for sign-in scenarios", () => {
    const action = buildSemanticFallbackAction({ name: "Sign-in with wrong password" });
    expect(action).not.toBeNull();
    expect(action!.type).toBe("trigger_error");
    expect(action!.intent).toBe("sign_in_error");
  });

  it("returns trigger_error for sign-up scenarios", () => {
    const action = buildSemanticFallbackAction({ name: "Sign-up form validation" });
    expect(action).not.toBeNull();
    expect(action!.type).toBe("trigger_error");
    expect(action!.intent).toBe("sign_up_error");
  });

  it("returns null for non-form scenarios", () => {
    const action = buildSemanticFallbackAction({ name: "Dashboard loads data" });
    expect(action).toBeNull();
  });

  it("returns form_error for generic form scenarios", () => {
    const action = buildSemanticFallbackAction({ name: "Form submission test" });
    expect(action).not.toBeNull();
    expect(action!.type).toBe("trigger_error");
    expect(action!.intent).toBe("form_error");
  });
});

describe("buildFeedbackPromptContext", () => {
  it("returns empty string for null result", () => {
    expect(buildFeedbackPromptContext(null, "test")).toBe("");
  });

  it("includes FEEDBACK DISCOVERY header", () => {
    const result = {
      feedback: [
        {
          type: "error",
          message: "Invalid credentials",
          detection_strategy: "visual",
          confidence: "medium",
          selector: "div.error",
          suggested_locator: 'page.locator(\'div.error\')',
          suggested_assertion: 'await expect(page.locator(\'div.error\')).toBeVisible();',
          element_html: "<div class='error'>Invalid credentials</div>",
        },
      ],
      before_url: "https://example.com/sign-in",
      after_url: "https://example.com/sign-in",
      url_changed: false,
    };

    const output = buildFeedbackPromptContext(result, "sign in");
    expect(output).toContain("FEEDBACK DISCOVERY");
    expect(output).toContain("Invalid credentials");
    expect(output).toContain("stayed the same");
    expect(output).toContain("visual");
    expect(output).toContain("medium");
  });

  it("shows URL change when redirect detected", () => {
    const result = {
      feedback: [],
      before_url: "https://example.com/sign-up",
      after_url: "https://example.com/dashboard",
      url_changed: true,
    };

    const output = buildFeedbackPromptContext(result, "sign up");
    expect(output).toContain("FEEDBACK DISCOVERY");
    expect(output).toContain("changed to https://example.com/dashboard");
  });
});

"use node";

import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { components } from "../_generated/api";
import { RateLimiter, MINUTE } from "@convex-dev/rate-limiter";
import { feedbackDiscoveryFetch, getRunnerUrl, type FeedbackActionRequest } from "./browserClient";
import type { FormattableElement } from "./formatElements";

interface PlainDiscoveredFeedback {
  type: string;
  message: string;
  detection_strategy: string;
  confidence: string;
  selector: string;
  suggested_locator: string;
  suggested_assertion: string;
  element_html: string;
}

interface PlainFeedbackResult {
  feedback: PlainDiscoveredFeedback[];
  before_url: string;
  after_url: string;
  url_changed: boolean;
}

type FeedbackActionPayload =
  | { type: "fill_and_submit"; fields: Array<{ label: string; value: string }>; submit_label: string }
  | { type: "click"; click_label: string }
  | { type: "trigger_error"; intent: string };

const RATE_LIMIT_PER_MINUTE = 10;

const rateLimiter = new RateLimiter(components.rateLimiter, {
  feedbackPerWorkspace: {
    kind: "fixed window",
    rate: RATE_LIMIT_PER_MINUTE,
    period: MINUTE,
  },
});

export const discoverFeedbackAction = internalAction({
  args: {
    url: v.string(),
    project_id: v.string(),
    workspace_id: v.string(),
    action: v.object({
      type: v.union(v.literal("fill_and_submit"), v.literal("click"), v.literal("trigger_error")),
      fields: v.optional(v.array(v.object({ label: v.string(), value: v.string() }))),
      submit_label: v.optional(v.string()),
      click_label: v.optional(v.string()),
      intent: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    const runnerUrl = getRunnerUrl(process.env.RUNNER_URL);
    if (!runnerUrl) return null;

    const rateResult = await rateLimiter.limit(ctx, "feedbackPerWorkspace", {
      key: args.workspace_id,
      throws: false,
    });
    if (!rateResult.ok) {
      console.log(`[feedbackDiscovery] Rate limited for workspace ${args.workspace_id}`);
      return null;
    }

    const runnerSecret = process.env.RUNNER_SECRET ?? "";

    try {
      const result = await feedbackDiscoveryFetch(runnerUrl, runnerSecret, {
        url: args.url,
        project_id: args.project_id,
        workspace_id: args.workspace_id,
        action: args.action as FeedbackActionRequest,
      });

      return result;
    } catch (err) {
      console.error(`[feedbackDiscovery] Failed for ${args.url}:`, err);
      return null;
    }
  },
});

export function buildFeedbackPromptContext(
  result: PlainFeedbackResult | null,
  actionLabel: string,
): string {
  if (!result) return "";

  const lines: string[] = [];
  lines.push(
    `Feedback discovered after performing "${actionLabel}" (URL ${result.url_changed ? `changed to ${result.after_url}` : "stayed the same"}):`,
  );

  for (const fb of result.feedback) {
    lines.push("");
    lines.push(`  Type: ${fb.type} (detected via: ${fb.detection_strategy}, confidence: ${fb.confidence})`);
    lines.push(`  Message: "${fb.message.slice(0, 200)}"`);
    lines.push(`  Recommended assertion: ${fb.suggested_assertion}`);
    if (fb.element_html) {
      lines.push(`  Element HTML: ${fb.element_html.slice(0, 300)}`);
    }
  }

  return `\n\nFEEDBACK DISCOVERY — how the page renders feedback after actions:\n${lines.join("\n")}\n`;
}

const FEEDBACK_TRIGGER_KEYWORDS = [
  /\berror\b/i,
  /\binvalid\b/i,
  /\bincorrect\b/i,
  /\bfail(ed|ure)?\b/i,
  /\bwrong\b/i,
  /\bwarning\b/i,
  /\bsuccess(ful)?\b/i,
  /\bconfirm(ation|ed)?\b/i,
  /\bmessage\b/i,
  /\bdisplay(s|ed)?\b.*\b(show|appear|visible)\b/i,
  /\bshows?\b.*\b(error|message|alert|notification|feedback)\b/i,
  /\bfail(s|ed|ure)?\b/i,
];

export function shouldDiscoverFeedback(scenario: {
  name: string;
  description?: string;
  flow_summary?: string;
}): boolean {
  const texts = [scenario.name, scenario.description, scenario.flow_summary].filter(
    (t): t is string => typeof t === "string" && t.length > 0,
  );

  return texts.some((text) =>
    FEEDBACK_TRIGGER_KEYWORDS.some((pattern) => pattern.test(text)),
  );
}

type FormIntent =
  | { kind: "sign_in" }
  | { kind: "sign_up" }
  | { kind: "form" }
  | null;

function classifyFormScenario(scenario: { name: string; flow_summary?: string }): FormIntent {
  const text = `${scenario.name} ${scenario.flow_summary ?? ""}`.toLowerCase();

  if (/sign.?in|log.?in|login/.test(text)) return { kind: "sign_in" };
  if (/sign.?up|register|create.?account/.test(text)) return { kind: "sign_up" };
  if (/form|submit|fill|sign.?in|sign.?up|login|log.?in|register/.test(text)) return { kind: "form" };

  return null;
}

const BAD_EMAIL = "invalid@example.com";
const BAD_PASSWORD = "WrongPassword123!";
const SHORT_PASSWORD = "short";

function badValueForFieldType(
  fieldType: string | undefined,
  labelText: string | undefined,
  placeholder: string | undefined,
): string {
  const combined = `${fieldType ?? ""} ${labelText ?? ""} ${placeholder ?? ""}`.toLowerCase();

  if (combined.includes("password") || fieldType === "password") return SHORT_PASSWORD;
  if (combined.includes("email") || fieldType === "email") return BAD_EMAIL;
  if (combined.includes("phone") || combined.includes("tel")) return "0000000000";
  if (combined.includes("name")) return "Test";
  if (combined.includes("url") || combined.includes("website") || combined.includes("domain")) return "https://invalid.example";
  if (combined.includes("company") || combined.includes("organization")) return "FakeCompany";
  return "invalid_test_value";
}

function findEmailField(elements: FormattableElement[]): FormattableElement | undefined {
  return elements.find((el) => {
    if (el.type === "email") return true;
    if ((el.name ?? "").toLowerCase().includes("email")) return true;
    const combined = `${el.label_text ?? ""} ${el.placeholder ?? ""}`.toLowerCase();
    return combined.includes("email");
  });
}

function findPasswordField(elements: FormattableElement[]): FormattableElement | undefined {
  return elements.find((el) => {
    if (el.type === "password") return true;
    const combined = `${el.label_text ?? ""} ${el.placeholder ?? ""} ${el.name ?? ""}`.toLowerCase();
    return combined.includes("password");
  });
}

function findSubmitButton(elements: FormattableElement[]): FormattableElement | undefined {
  const typeSubmit = elements.find((el) =>
    (el.element_type === "button" || el.role === "button") && el.type === "submit",
  );
  if (typeSubmit) return typeSubmit;

  const submitPatterns = /sign.?in|log.?in|submit|register|sign.?up|create|continue|start|join|get started|authenticate|access|confirm|send/i;
  return elements.find((el) => {
    if (el.element_type !== "button" && el.role !== "button") return false;
    const text = `${el.label_text ?? ""} ${el.aria_label ?? ""} ${el.placeholder ?? ""}`;
    return submitPatterns.test(text);
  });
}

function findFormFields(elements: FormattableElement[]): FormattableElement[] {
  return elements.filter((el) => {
    if (el.element_type === "button" || el.role === "button") return false;
    const inputTypes = ["input", "textarea", "select"];
    return inputTypes.includes(el.element_type) || (el.type != null && el.type !== "");
  });
}

export function buildFeedbackActionFromSnapshot(
  scenario: { name: string; flow_summary?: string },
  elements: FormattableElement[] | undefined,
): FeedbackActionPayload | null {
  const formIntent = classifyFormScenario(scenario);
  if (!formIntent) return null;

  if (!elements || elements.length === 0) {
    return { type: "trigger_error", intent: formIntent.kind === "form" ? "form_error" : `${formIntent.kind}_error` };
  }

  const fields = findFormFields(elements);
  const submitButton = findSubmitButton(elements);

  if (fields.length === 0) {
    return { type: "trigger_error", intent: formIntent.kind === "form" ? "form_error" : `${formIntent.kind}_error` };
  }

  const fieldsToFill: Array<{ label: string; value: string }> = [];

  if (formIntent.kind === "sign_in") {
    const emailField = findEmailField(fields);
    const passwordField = findPasswordField(fields);

    if (emailField) {
      fieldsToFill.push({
        label: emailField.label_text ?? emailField.placeholder ?? emailField.name ?? "email",
        value: BAD_EMAIL,
      });
    }
    if (passwordField) {
      fieldsToFill.push({
        label: passwordField.label_text ?? passwordField.placeholder ?? passwordField.name ?? "password",
        value: BAD_PASSWORD,
      });
    }

    if (fieldsToFill.length === 0) {
      for (const field of fields.slice(0, 3)) {
        fieldsToFill.push({
          label: field.label_text ?? field.placeholder ?? field.name ?? "field",
          value: badValueForFieldType(field.type, field.label_text, field.placeholder),
        });
      }
    }
  } else {
    for (const field of fields) {
      fieldsToFill.push({
        label: field.label_text ?? field.placeholder ?? field.name ?? "field",
        value: badValueForFieldType(field.type, field.label_text, field.placeholder),
      });
    }
  }

  const submitLabel = submitButton
    ? submitButton.label_text ?? submitButton.aria_label ?? "submit"
    : "submit";

  return {
    type: "fill_and_submit",
    fields: fieldsToFill,
    submit_label: submitLabel,
  };
}

export function buildSemanticFallbackAction(
  scenario: { name: string; flow_summary?: string },
): FeedbackActionPayload | null {
  const formIntent = classifyFormScenario(scenario);
  if (!formIntent) return null;

  const intentMap: Record<string, string> = {
    sign_in: "sign_in_error",
    sign_up: "sign_up_error",
    form: "form_error",
  };

  return {
    type: "trigger_error",
    intent: intentMap[formIntent.kind] ?? "generic_error",
  };
}

import type { Page, Locator } from "playwright";

export type FeedbackType =
  | "error"
  | "success"
  | "warning"
  | "info"
  | "loading"
  | "redirect"
  | "unknown";

export type DetectionStrategy =
  | "aria"
  | "toast"
  | "visual"
  | "text"
  | "dialog"
  | "url_change"
  | "field_validation";

export interface DiscoveredFeedback {
  type: FeedbackType;
  message: string;
  detection_strategy: DetectionStrategy;
  confidence: "high" | "medium" | "low";
  selector: string;
  suggested_locator: string;
  suggested_assertion: string;
  element_html: string;
}

export interface FeedbackDiscoveryResult {
  feedback: DiscoveredFeedback[];
  before_url: string;
  after_url: string;
  url_changed: boolean;
}

export interface FillAndSubmitAction {
  type: "fill_and_submit";
  fields: Array<{ label: string; value: string }>;
  submit_label: string;
}

export interface ClickAction {
  type: "click";
  click_label: string;
}

export interface TriggerErrorAction {
  type: "trigger_error";
  intent: string;
}

export type FeedbackAction = FillAndSubmitAction | ClickAction | TriggerErrorAction;

const SETTLE_TIMEOUT_MS = 8_000;
const SETTLE_POLL_MS = 500;
const SETTLE_ROUNDS = 2;

const ERROR_TEXT_PATTERNS = [
  /invalid/i,
  /incorrect/i,
  /error/i,
  /failed/i,
  /wrong/i,
  /unauthorized/i,
  /not found/i,
  /does not match/i,
  /required/i,
  /cannot be empty/i,
  /already (exist|taken|registered|in use)/i,
  /too (many|few|short|long)/i,
  /must be/i,
  /not (valid|allowed|available|permitted)/i,
];

const SUCCESS_TEXT_PATTERNS = [
  /success/i,
  /created/i,
  /saved/i,
  /submitted/i,
  /confirmed/i,
  /complete/i,
  /thank/i,
  /welcome/i,
  /verification.*sent/i,
  /check your email/i,
];

const WARNING_TEXT_PATTERNS = [/warning/i, /caution/i, /note:?/i, /attention/i];

const INFO_TEXT_PATTERNS = [/info/i, /tip/i, /notice/i];

const TOAST_SELECTORS = [
  '[data-sonner-toaster]',
  '[data-sonner-toast]',
  '.Toastify__toast',
  '[data-radix-toast]',
  '[role="status"]',
  '.toast',
  '.notification',
  '#toaster',
  '.alert',
  '[class*="toast"]',
  '[class*="snackbar"]',
  '[class*="notification"]',
];

const VISUAL_CLASS_PATTERNS: Array<{
  pattern: RegExp;
  type: FeedbackType;
}> = [
  { pattern: /\berror\b/i, type: "error" },
  { pattern: /\bdanger\b/i, type: "error" },
  { pattern: /\bdestructive\b/i, type: "error" },
  { pattern: /\bred\b/i, type: "error" },
  { pattern: /\bsuccess\b/i, type: "success" },
  { pattern: /\bgreen\b/i, type: "success" },
  { pattern: /\bconfirm\b/i, type: "success" },
  { pattern: /\bwarning\b/i, type: "warning" },
  { pattern: /\bamber\b/i, type: "warning" },
  { pattern: /\byellow\b/i, type: "warning" },
  { pattern: /\binfo\b/i, type: "info" },
  { pattern: /\bblue\b/i, type: "info" },
  { pattern: /\bloading\b/i, type: "loading" },
  { pattern: /\bspinner\b/i, type: "loading" },
  { pattern: /\bprogress\b/i, type: "loading" },
];

interface DomFingerprint {
  elements: Array<{
    tag: string;
    classes: string;
    textHash: string;
    role: string | null;
  }>;
  url: string;
}

function hashText(text: string): string {
  const trimmed = text.trim().slice(0, 200);
  let hash = 0;
  for (let i = 0; i < trimmed.length; i++) {
    const chr = trimmed.charCodeAt(i);
    hash = (hash << 5) - hash + chr;
    hash |= 0;
  }
  return hash.toString(36);
}

async function captureDomFingerprint(page: Page): Promise<DomFingerprint> {
  const elements = await page.$$eval(
    "body *",
    (els) =>
      els
        .filter((el) => {
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        })
        .slice(0, 500)
        .map((el) => ({
          tag: el.tagName.toLowerCase(),
          classes: (el.className && typeof el.className === "string"
            ? el.className
            : ""
          ).slice(0, 300),
          textHash: "",
          text: (el.textContent ?? "").trim().slice(0, 200),
          role: el.getAttribute("role"),
        })),
  );

  return {
    elements: elements.map((el) => ({
      tag: el.tag,
      classes: el.classes,
      textHash: hashText(el.text),
      role: el.role,
    })),
    url: page.url(),
  };
}

async function waitForSettle(page: Page): Promise<void> {
  await page.waitForTimeout(1_000);

  let lastMutationCount = Infinity;
  let settleCount = 0;

  for (let i = 0; i < Math.ceil(SETTLE_TIMEOUT_MS / SETTLE_POLL_MS); i++) {
    await page.waitForTimeout(SETTLE_POLL_MS);

    const mutationCount = await page.evaluate(() => {
      return document.querySelectorAll("body *").length;
    });

    if (mutationCount === lastMutationCount) {
      settleCount++;
      if (settleCount >= SETTLE_ROUNDS) return;
    } else {
      settleCount = 0;
    }
    lastMutationCount = mutationCount;
  }
}

async function performAction(page: Page, action: FeedbackAction): Promise<void> {
  if (action.type === "trigger_error") {
    await performSemanticErrorAction(page, action.intent);
    return;
  }

  if (action.type === "fill_and_submit") {
    for (const field of action.fields) {
      const locator = await findFieldByLabel(page, field.label);
      if (locator && (await locator.count()) > 0) {
        await locator.first().fill(field.value);
      }
    }

    const submitLocator = findButtonByLabel(page, action.submit_label);
    if (submitLocator && (await submitLocator.count()) > 0) {
      await submitLocator.first().click();
    }
  } else if (action.type === "click") {
    const locator = findButtonByLabel(page, action.click_label);
    if (locator && (await locator.count()) > 0) {
      await locator.first().click();
    }
  }
}

const BAD_EMAIL = "invalid@example.com";
const BAD_PASSWORD = "WrongPassword123!";
const SHORT_PASSWORD = "short";

const EMAIL_SELECTORS = [
  'input[type="email"]',
  'input[autocomplete="email"]',
  'input[name*="email" i]',
  'input[placeholder*="email" i]',
];

const PASSWORD_SELECTORS = [
  'input[type="password"]',
  'input[autocomplete="current-password"]',
  'input[autocomplete="new-password"]',
  'input[name*="password" i]',
];

const TEXT_INPUT_SELECTOR =
  'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="submit"]):not([type="password"])';

async function performSemanticErrorAction(page: Page, intent: string): Promise<void> {
  const form = page.locator("form").first();
  const scope = (await form.count()) > 0 ? form : page;

  if (intent === "sign_in_error") {
    const emailField = await findFirstVisible(scope, EMAIL_SELECTORS);
    if (emailField) await emailField.fill(BAD_EMAIL);

    const passwordField = await findFirstVisible(scope, PASSWORD_SELECTORS);
    if (passwordField) await passwordField.fill(BAD_PASSWORD);

    await clickSubmit(scope);
  } else if (intent === "sign_up_error") {
    const passwordField = await findFirstVisible(scope, PASSWORD_SELECTORS);
    if (passwordField) await passwordField.fill(SHORT_PASSWORD);

    await fillTextInputs(scope, 8, badValueForRunnerInput);

    await clickSubmit(scope);
  } else {
    const emailField = await findFirstVisible(scope, EMAIL_SELECTORS);
    if (emailField) await emailField.fill(BAD_EMAIL);

    await fillTextInputs(scope, 5, () => "test");

    await clickSubmit(scope);
  }
}

function badValueForRunnerInput(inputType: string, inputName: string, inputPlaceholder: string): string {
  const combined = `${inputType} ${inputName} ${inputPlaceholder}`.toLowerCase();
  if (combined.includes("email")) return BAD_EMAIL;
  if (combined.includes("phone") || combined.includes("tel")) return "0000000000";
  if (combined.includes("url") || combined.includes("website") || combined.includes("domain")) return "https://invalid.example";
  return "Test";
}

async function fillTextInputs(
  scope: Locator,
  maxFields: number,
  valueFn: (inputType: string, inputName: string, inputPlaceholder: string) => string,
): Promise<void> {
  const textInputs = scope.locator(TEXT_INPUT_SELECTOR);
  const inputCount = await textInputs.count();
  for (let i = 0; i < Math.min(inputCount, maxFields); i++) {
    const input = textInputs.nth(i);
    if (await input.isVisible()) {
      const inputType = await input.getAttribute("type") ?? "text";
      const inputName = (await input.getAttribute("name")) ?? "";
      const inputPlaceholder = (await input.getAttribute("placeholder")) ?? "";
      await input.fill(valueFn(inputType, inputName, inputPlaceholder));
    }
  }
}

async function findFirstVisible(
  scope: Locator,
  selectors: string[],
): Promise<Locator | null> {
  for (const sel of selectors) {
    try {
      const loc = scope.locator(sel).first();
      if ((await loc.count()) > 0 && (await loc.isVisible())) {
        return loc;
      }
    } catch {
      continue;
    }
  }
  return null;
}

async function clickSubmit(scope: Locator): Promise<void> {
  const typeSubmit = scope.locator('button[type="submit"], input[type="submit"]').first();
  if ((await typeSubmit.count()) > 0 && (await typeSubmit.isVisible())) {
    await typeSubmit.click();
    return;
  }

  const submitSelectors = [
    "button:has-text('sign in')",
    "button:has-text('log in')",
    "button:has-text('submit')",
    "button:has-text('continue')",
    "button:has-text('create')",
    "button:has-text('register')",
    "button:has-text('sign up')",
    "button:has-text('start')",
    "button:has-text('get started')",
    "button:has-text('authenticate')",
    "button:has-text('confirm')",
    "button:has-text('send')",
    "button:has-text('join')",
  ];

  for (const sel of submitSelectors) {
    try {
      const loc = scope.locator(sel).first();
      if ((await loc.count()) > 0 && (await loc.isVisible())) {
        await loc.click();
        return;
      }
    } catch {
      continue;
    }
  }
}

async function findFieldByLabel(page: Page, label: string): Promise<Locator | null> {
  const normalizedLabel = label.toLowerCase();

  const selectors = [
    `input[aria-label="${label}"]`,
    `input[placeholder="${label}"]`,
    `input[name="${normalizedLabel}"]`,
    `textarea[aria-label="${label}"]`,
    `select[aria-label="${label}"]`,
  ];

  for (const sel of selectors) {
    const loc = page.locator(sel).first();
    if ((await loc.count()) > 0) return loc;
  }

  return page.getByLabel(label, { exact: false });
}

function findButtonByLabel(page: Page, label: string): Locator | null {
  return page.getByRole("button", { name: new RegExp(escapeRegex(label), "i") });
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function diffFingerprints(
  before: DomFingerprint,
  after: DomFingerprint,
): Set<string> {
  const beforeSet = new Set(before.elements.map((e) => `${e.tag}|${e.classes}|${e.textHash}|${e.role ?? ""}`));
  const afterIds = new Set<string>();

  for (const el of after.elements) {
    const key = `${el.tag}|${el.classes}|${el.textHash}|${el.role ?? ""}`;
    if (!beforeSet.has(key)) {
      afterIds.add(key);
    }
  }

  return afterIds;
}

async function detectAriaFeedback(
  page: Page,
): Promise<DiscoveredFeedback[]> {
  const results: DiscoveredFeedback[] = [];

  const ariaElements = await page.$$eval(
    '[role="alert"], [aria-live="polite"], [aria-live="assertive"], [role="status"]',
    (els) =>
      els
        .filter((el) => {
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        })
        .map((el) => ({
          tag: el.tagName.toLowerCase(),
          text: (el.textContent ?? "").trim().slice(0, 500),
          role: el.getAttribute("role"),
          ariaLive: el.getAttribute("aria-live"),
          classes: (typeof el.className === "string" ? el.className : "").slice(0, 200),
          outerHTML: el.outerHTML.slice(0, 500),
        })),
  );

  for (const el of ariaElements) {
    if (!el.text || el.text.length < 2) continue;

    const type = classifyText(el.text);
    const selector = el.role ? `[role="${el.role}"]` : `[aria-live="${el.ariaLive}"]`;

    results.push({
      type,
      message: el.text.slice(0, 200),
      detection_strategy: "aria",
      confidence: "high",
      selector,
      suggested_locator: el.role
        ? `page.getByRole('${el.role}')`
        : `page.locator('${selector}')`,
      suggested_assertion: el.role
        ? `await expect(page.getByRole('${el.role}')).toBeVisible();`
        : `await expect(page.locator('${selector}')).toBeVisible();`,
      element_html: el.outerHTML,
    });
  }

  return results;
}

async function detectToastFeedback(
  page: Page,
): Promise<DiscoveredFeedback[]> {
  const results: DiscoveredFeedback[] = [];

  for (const toastSelector of TOAST_SELECTORS) {
    const toasts = await page.$$eval(
      toastSelector,
      (els, sel) =>
        els
          .filter((el) => {
            const rect = el.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
          })
          .map((el) => ({
            tag: el.tagName.toLowerCase(),
            text: (el.textContent ?? "").trim().slice(0, 500),
            classes: (typeof el.className === "string" ? el.className : "").slice(0, 200),
            outerHTML: el.outerHTML.slice(0, 500),
            selector: sel,
          })),
      toastSelector,
    );

    for (const toast of toasts) {
      if (!toast.text || toast.text.length < 2) continue;

      const type = classifyText(toast.text);

      results.push({
        type,
        message: toast.text.slice(0, 200),
        detection_strategy: "toast",
        confidence: "high",
        selector: toast.selector,
        suggested_locator: `page.locator('${toast.selector}')`,
        suggested_assertion: `await expect(page.locator('${toast.selector}')).toBeVisible();`,
        element_html: toast.outerHTML,
      });
    }
  }

  return results;
}

async function detectVisualFeedback(
  page: Page,
  newElementKeys: Set<string>,
): Promise<DiscoveredFeedback[]> {
  const results: DiscoveredFeedback[] = [];
  if (newElementKeys.size === 0) return results;

  const allVisible = await page.$$eval(
    "body *",
    (els) =>
      els
        .filter((el) => {
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        })
        .map((el) => ({
          tag: el.tagName.toLowerCase(),
          classes: (typeof el.className === "string" ? el.className : "").slice(0, 300),
          text: (el.textContent ?? "").trim().slice(0, 500),
          role: el.getAttribute("role"),
          id: el.id,
          outerHTML: el.outerHTML.slice(0, 500),
        }))
        .filter((el) => el.text.length >= 2 && el.text.length <= 500),
  );

  const seen = new Set<string>();
  for (const el of allVisible) {
    const matchedPattern = VISUAL_CLASS_PATTERNS.find((vp) =>
      vp.pattern.test(el.classes),
    );
    if (!matchedPattern) continue;

    const key = `${el.tag}|${el.text.slice(0, 100)}`;
    if (seen.has(key)) continue;
    seen.add(key);

    let selector = el.tag;
    if (el.id) {
      selector = `#${el.id}`;
    } else {
      const classTokens = el.classes
        .split(/\s+/)
        .filter((c) => c.length > 0)
        .slice(0, 3);
      if (classTokens.length > 0) {
        selector = `${el.tag}.${classTokens.join(".")}`;
      }
    }

    results.push({
      type: matchedPattern.type,
      message: el.text.slice(0, 200),
      detection_strategy: "visual",
      confidence: "medium",
      selector,
      suggested_locator: `page.locator('${selector}')`,
      suggested_assertion: `await expect(page.locator('${selector}')).toContainText('${el.text.split("\n")[0].trim().slice(0, 60).replace(/'/g, "\\'")}');`,
      element_html: el.outerHTML,
    });
  }

  return results;
}

async function detectTextFeedback(
  page: Page,
  beforeTexts: Set<string>,
): Promise<DiscoveredFeedback[]> {
  const results: DiscoveredFeedback[] = [];

  const allText = await page.$$eval(
    "div, span, p, h1, h2, h3, h4, h5, h6, aside, section, li, td, label",
    (els) =>
      els
        .filter((el) => {
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        })
        .map((el) => ({
          tag: el.tagName.toLowerCase(),
          text: (el.textContent ?? "").trim().slice(0, 500),
          classes: (typeof el.className === "string" ? el.className : "").slice(0, 200),
          id: el.id,
          outerHTML: el.outerHTML.slice(0, 500),
        }))
        .filter((el) => el.text.length >= 3 && el.text.length <= 500),
  );

  const seen = new Set<string>();
  for (const el of allText) {
    const normalizedText = el.text.toLowerCase();
    if (beforeTexts.has(normalizedText)) continue;

    const type = classifyText(el.text);
    if (type === "unknown") continue;

    const key = `${el.tag}|${el.text.slice(0, 100)}`;
    if (seen.has(key)) continue;
    seen.add(key);

    let selector = el.tag;
    if (el.id) {
      selector = `#${el.id}`;
    } else {
      const classTokens = el.classes
        .split(/\s+/)
        .filter((c) => c.length > 0 && c.length < 40)
        .slice(0, 3);
      if (classTokens.length > 0) {
        selector = `${el.tag}.${classTokens.join(".")}`;
      }
    }

    const shortText = el.text.split("\n")[0].trim().slice(0, 60);

    results.push({
      type,
      message: el.text.slice(0, 200),
      detection_strategy: "text",
      confidence: "medium",
      selector,
      suggested_locator: `page.locator('${selector}')`,
      suggested_assertion: `await expect(page.locator('${selector}')).toContainText('${shortText.replace(/'/g, "\\'")}');`,
      element_html: el.outerHTML,
    });
  }

  return results;
}

async function detectDialogFeedback(
  page: Page,
): Promise<DiscoveredFeedback[]> {
  const results: DiscoveredFeedback[] = [];

  const dialogs = await page.$$eval(
    '[role="dialog"], [role="alertdialog"], [aria-modal="true"]',
    (els) =>
      els
        .filter((el) => {
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        })
        .map((el) => ({
          tag: el.tagName.toLowerCase(),
          text: (el.textContent ?? "").trim().slice(0, 500),
          role: el.getAttribute("role") ?? "dialog",
          classes: (typeof el.className === "string" ? el.className : "").slice(0, 200),
          outerHTML: el.outerHTML.slice(0, 500),
        })),
  );

  for (const dialog of dialogs) {
    const type = classifyText(dialog.text);

    results.push({
      type,
      message: dialog.text.slice(0, 200),
      detection_strategy: "dialog",
      confidence: "high",
      selector: `[role="${dialog.role}"]`,
      suggested_locator: `page.getByRole('${dialog.role}')`,
      suggested_assertion: `await expect(page.getByRole('${dialog.role}')).toBeVisible();`,
      element_html: dialog.outerHTML,
    });
  }

  return results;
}

function classifyText(text: string): FeedbackType {
  const lower = text.toLowerCase();

  if (ERROR_TEXT_PATTERNS.some((p) => p.test(lower))) return "error";
  if (SUCCESS_TEXT_PATTERNS.some((p) => p.test(lower))) return "success";
  if (WARNING_TEXT_PATTERNS.some((p) => p.test(lower))) return "warning";
  if (INFO_TEXT_PATTERNS.some((p) => p.test(lower))) return "info";

  return "unknown";
}

function detectUrlChange(
  beforeUrl: string,
  afterUrl: string,
): DiscoveredFeedback | null {
  if (beforeUrl === afterUrl) return null;

  return {
    type: "redirect",
    message: `Page redirected from ${beforeUrl} to ${afterUrl}`,
    detection_strategy: "url_change",
    confidence: "low",
    selector: "",
    suggested_locator: "",
    suggested_assertion: `await expect(page).toHaveURL(/${escapeRegex(afterUrl.split("/").pop() ?? "")}/);`,
    element_html: "",
  };
}

function deduplicateFeedback(
  feedback: DiscoveredFeedback[],
): DiscoveredFeedback[] {
  const seen = new Set<string>();
  return feedback.filter((f) => {
    const key = `${f.type}|${f.message.slice(0, 80)}|${f.detection_strategy}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function discoverFeedback(
  page: Page,
  action: FeedbackAction,
  _options?: { timeout_ms?: number },
): Promise<FeedbackDiscoveryResult> {
  const beforeFingerprint = await captureDomFingerprint(page);
  const beforeUrl = page.url();

  const beforeTexts = new Set(
    (
      await page.$$eval(
        "div, span, p, h1, h2, h3, h4, h5, h6, aside, section, li, td, label",
        (els) =>
          els
            .filter((el) => {
              const rect = el.getBoundingClientRect();
              return rect.width > 0 && rect.height > 0;
            })
            .map((el) => ((el.textContent ?? "").trim().slice(0, 500).toLowerCase())),
      )
    ).filter((t) => t.length >= 3),
  );

  let nativeDialogText: string | null = null;
  const dialogHandler = (dialog: import("playwright").Dialog) => {
    nativeDialogText = dialog.message();
    dialog.accept().catch(() => {});
  };
  page.on("dialog", dialogHandler);

  try {
    await performAction(page, action);
  } catch {
    page.off("dialog", dialogHandler);
  }

  await waitForSettle(page);

  page.off("dialog", dialogHandler);

  const afterFingerprint = await captureDomFingerprint(page);
  const afterUrl = page.url();

  const newElementKeys = diffFingerprints(beforeFingerprint, afterFingerprint);

  const feedback: DiscoveredFeedback[] = [];

  const ariaResults = await detectAriaFeedback(page);
  feedback.push(...ariaResults);

  const toastResults = await detectToastFeedback(page);
  feedback.push(...toastResults);

  if (newElementKeys.size > 0) {
    const visualResults = await detectVisualFeedback(page, newElementKeys);
    feedback.push(...visualResults);
  }

  const textResults = await detectTextFeedback(page, beforeTexts);
  feedback.push(...textResults);

  const dialogResults = await detectDialogFeedback(page);
  feedback.push(...dialogResults);

  if (nativeDialogText) {
    const type = classifyText(nativeDialogText);
    feedback.push({
      type: type === "unknown" ? "info" : type,
      message: nativeDialogText.slice(0, 200),
      detection_strategy: "dialog",
      confidence: "high",
      selector: "",
      suggested_locator: `page.on('dialog', ...)`,
      suggested_assertion: `page.on('dialog', async (dialog) => { expect(dialog.message()).toContain('${nativeDialogText.slice(0, 60).replace(/'/g, "\\'")}'); await dialog.accept(); });`,
      element_html: `<dialog>${nativeDialogText}</dialog>`,
    });
  }

  const urlChange = detectUrlChange(beforeUrl, afterUrl);
  if (urlChange) {
    feedback.push(urlChange);
  }

  const deduplicated = deduplicateFeedback(feedback);

  return {
    feedback: deduplicated,
    before_url: beforeUrl,
    after_url: afterUrl,
    url_changed: beforeUrl !== afterUrl,
  };
}

export function formatFeedbackForPrompt(
  result: FeedbackDiscoveryResult,
  actionLabel: string,
): string {
  if (result.feedback.length === 0) {
    return `After performing action "${actionLabel}": No visible feedback elements detected on the page.`;
  }

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

  return lines.join("\n");
}

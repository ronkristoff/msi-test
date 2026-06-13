import { ConvexError } from "convex/values";
import { v } from "convex/values";
import { NAME_MIN, NAME_MAX, prependScheme, parseUrlOrNull, REPO_URL_MAX_LENGTH, PAT_MIN_LENGTH, PAT_MAX_LENGTH } from "./constraints";

function validateName(name: string, label: string) {
  const trimmed = name.trim();
  if (trimmed.length < NAME_MIN || trimmed.length > NAME_MAX) {
    throw new ConvexError(`${label} must be ${NAME_MIN}-${NAME_MAX} characters`);
  }
  return trimmed;
}

export const validateWorkspaceName = (name: string) => validateName(name, "Workspace name");
export const validateProjectName = (name: string) => validateName(name, "Project name");

export function validateEndpointUrl(url: string) {
  if (!parseUrlOrNull(url)) {
    throw new ConvexError("Invalid endpoint URL");
  }
  return url;
}

export function validateRequiredField(value: string, fieldName: string) {
  if (value.trim().length === 0) {
    throw new ConvexError(`${fieldName} is required`);
  }
  return value.trim();
}

export function normalizeAppUrl(url: string): string {
  const trimmed = url.trim();
  if (trimmed.length === 0) {
    throw new ConvexError("App URL is required");
  }
  const withScheme = prependScheme(trimmed);
  if (!parseUrlOrNull(withScheme)) {
    throw new ConvexError("Invalid app URL");
  }
  return withScheme;
}

export function maskApiKey(apiKey: string): string {
  if (apiKey.length < 7) return "••••••••";
  return apiKey.slice(0, 3) + "••••••••" + apiKey.slice(-4);
}

export function maskPat(pat: string): string {
  if (pat.length < 7) return "••••••••";
  return pat.slice(0, 3) + "••••••••" + pat.slice(-4);
}

export function validateRepoUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) {
    throw new ConvexError("Repository URL is required");
  }
  if (trimmed.length > REPO_URL_MAX_LENGTH) {
    throw new ConvexError(`Repository URL must be at most ${REPO_URL_MAX_LENGTH} characters`);
  }
  const parsed = parseUrlOrNull(trimmed);
  if (!parsed) {
    throw new ConvexError("Invalid repository URL");
  }
  if (parsed.hostname !== "github.com") {
    throw new ConvexError("Only GitHub repositories are supported");
  }
  const parts = parsed.pathname.replace(/^\/|\/$/g, "").split("/");
  if (parts.length < 2 || !parts[0] || !parts[1]) {
    throw new ConvexError("Repository URL must be in the format https://github.com/owner/repo");
  }
  return `https://github.com/${parts[0]}/${parts[1]}`;
}

export function validatePatLength(pat: string): void {
  if (pat.length < PAT_MIN_LENGTH) {
    throw new ConvexError(`Personal access token must be at least ${PAT_MIN_LENGTH} characters`);
  }
  if (pat.length > PAT_MAX_LENGTH) {
    throw new ConvexError(`Personal access token must be at most ${PAT_MAX_LENGTH} characters`);
  }
}

export const interactiveElementValidator = v.object({
  selector: v.string(),
  description: v.string(),
  element_type: v.string(),
  role: v.optional(v.string()),
  aria_label: v.optional(v.string()),
  label_text: v.optional(v.string()),
  placeholder: v.optional(v.string()),
  name: v.optional(v.string()),
  id: v.optional(v.string()),
  type: v.optional(v.string()),
  href: v.optional(v.string()),
  data_testid: v.optional(v.string()),
  suggested_locator: v.optional(v.string()),
});

export const capturedPageValidator = v.object({
  url: v.string(),
  title: v.string(),
  screenshot_storage_id: v.optional(v.id("_storage")),
  structure_text: v.string(),
  semantic_description: v.optional(v.string()),
  interactive_elements: v.optional(v.array(interactiveElementValidator)),
});

export const authCookieValidator = v.object({
  name: v.string(),
  value: v.string(),
  domain: v.string(),
  path: v.string(),
});

export const discoveredPageValidator = v.object({
  url: v.string(),
  title: v.string(),
  auth_required: v.optional(v.boolean()),
});

export const testStepValidator = v.object({
  instruction: v.string(),
  assertion_code: v.optional(v.string()),
  expected_outcome: v.optional(v.string()),
  learned_selector: v.optional(v.string()),
  learned_description: v.optional(v.string()),
});

export const discoveredFlowValidator = v.object({
  name: v.string(),
  description: v.optional(v.string()),
  steps: v.array(v.string()),
  pages_involved: v.array(v.number()),
  complexity: v.union(
    v.literal("low"),
    v.literal("medium"),
    v.literal("high"),
  ),
});

export const prdCoverageItemValidator = v.object({
  feature: v.string(),
  found: v.boolean(),
  evidence: v.optional(v.string()),
});

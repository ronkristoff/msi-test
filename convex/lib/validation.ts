import { ConvexError } from "convex/values";
import { NAME_MIN, NAME_MAX, prependScheme, parseUrlOrNull } from "./constraints";

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

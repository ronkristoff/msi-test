import { ConvexError } from "convex/values";

function validateName(name: string, label: string) {
  const trimmed = name.trim();
  if (trimmed.length === 0 || trimmed.length > 100) {
    throw new ConvexError(`${label} must be 1-100 characters`);
  }
  return trimmed;
}

export const validateWorkspaceName = (name: string) => validateName(name, "Workspace name");
export const validateProjectName = (name: string) => validateName(name, "Project name");

export function validateEndpointUrl(url: string) {
  try {
    new URL(url);
  } catch {
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
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    new URL(withScheme);
  } catch {
    throw new ConvexError("Invalid app URL");
  }
  return withScheme;
}

export function maskApiKey(apiKey: string): string {
  if (apiKey.length < 7) return "••••••••";
  return apiKey.slice(0, 3) + "••••••••" + apiKey.slice(-4);
}

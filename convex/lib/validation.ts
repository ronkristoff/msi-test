import { ConvexError } from "convex/values";

export function validateWorkspaceName(name: string) {
  const trimmed = name.trim();
  if (trimmed.length === 0 || trimmed.length > 100) {
    throw new ConvexError("Workspace name must be 1-100 characters");
  }
  return trimmed;
}

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

export function maskApiKey(apiKey: string): string {
  if (apiKey.length < 7) return "••••••••";
  return apiKey.slice(0, 3) + "••••••••" + apiKey.slice(-4);
}

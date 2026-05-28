import { ConvexError } from "convex/values";

export type AiErrorCode =
  | "invalid_api_key"
  | "rate_limit"
  | "timeout"
  | "malformed_response";

export type AiErrorData = {
  type: "ai_error";
  code: AiErrorCode;
  message: string;
};

export function createAiError(code: AiErrorCode, message: string): never {
  throw new ConvexError<AiErrorData>({
    type: "ai_error",
    code,
    message,
  });
}

export function classifyAiError(err: unknown): never {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("401") || msg.includes("Unauthorized")) {
    throw createAiError("invalid_api_key", "Invalid API key. Check your workspace AI settings.");
  }
  if (msg.includes("429") || msg.includes("rate")) {
    throw createAiError("rate_limit", "Rate limit exceeded. Please wait and try again.");
  }
  if (msg.includes("timeout") || msg.includes("Timed out")) {
    throw createAiError("timeout", "AI request timed out. Please try again.");
  }
  throw createAiError("malformed_response", msg);
}

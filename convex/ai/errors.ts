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

import { ConvexError } from "convex/values";

export function validateRunnerSecret(secret: string) {
  const expected = process.env.RUNNER_SECRET;
  if (!expected) throw new ConvexError("RUNNER_SECRET not configured");
  if (secret !== expected) throw new ConvexError("Invalid runner secret");
}

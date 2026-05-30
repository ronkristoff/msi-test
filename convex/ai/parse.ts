import { z } from "zod/v3";

export function extractJsonFromAiResponse<T>(text: string, schema: z.ZodSchema<T>): T | null {
  const codeFenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  const jsonSource = codeFenceMatch?.[1]?.trim() ?? text.trim();

  try {
    const parsed = JSON.parse(jsonSource);
    return schema.parse(parsed);
  } catch {
    // not pure JSON, try to extract embedded object
  }

  const jsonMatch = jsonSource.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    return schema.parse(parsed);
  } catch {
    return null;
  }
}

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

  const start = jsonSource.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let end = -1;
  for (let i = start; i < jsonSource.length; i++) {
    if (jsonSource[i] === "{") depth++;
    if (jsonSource[i] === "}") depth--;
    if (depth === 0) { end = i; break; }
  }
  if (end === -1) return null;

  try {
    const parsed = JSON.parse(jsonSource.slice(start, end + 1));
    return schema.parse(parsed);
  } catch {
    return null;
  }
}

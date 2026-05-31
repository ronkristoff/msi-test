export function computeDiff(oldCode: string, newCode: string): string {
  const oldLines = oldCode.split("\n");
  const newLines = newCode.split("\n");
  const result: string[] = [];

  const maxLen = Math.max(oldLines.length, newLines.length);
  let changeCount = 0;

  for (let i = 0; i < maxLen; i++) {
    const oldLine = oldLines[i];
    const newLine = newLines[i];

    if (oldLine === undefined) {
      result.push(`+ ${newLine}`);
      changeCount++;
    } else if (newLine === undefined) {
      result.push(`- ${oldLine}`);
      changeCount++;
    } else if (oldLine !== newLine) {
      result.push(`- ${oldLine}`);
      result.push(`+ ${newLine}`);
      changeCount++;
    } else {
      result.push(`  ${oldLine}`);
    }
  }

  if (changeCount === 0) return "";

  const changed = result
    .map((line, idx) => ({ line, idx }))
    .filter(({ line }) => line.startsWith("+") || line.startsWith("-"));

  const contextLines: string[] = [];
  const contextPad = 3;
  const included = new Set<number>();

  for (const { idx } of changed) {
    for (let j = Math.max(0, idx - contextPad); j <= Math.min(result.length - 1, idx + contextPad); j++) {
      included.add(j);
    }
  }

  const sorted = [...included].sort((a, b) => a - b);
  let prev = -2;
  for (const idx of sorted) {
    if (idx > prev + 1) {
      if (contextLines.length > 0) contextLines.push("  ...");
    }
    contextLines.push(result[idx]);
    prev = idx;
  }

  return contextLines.join("\n");
}

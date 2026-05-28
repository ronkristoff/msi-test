import { prependScheme, parseUrlOrNull } from "../../convex/lib/constraints";

export function normalizeAppUrl(url: string): string {
  const withScheme = prependScheme(url);
  if (!withScheme) return "";
  return parseUrlOrNull(withScheme) ? withScheme : url.trim();
}

export function isValidAppUrl(url: string): boolean {
  const withScheme = prependScheme(url);
  if (!withScheme) return false;
  return parseUrlOrNull(withScheme) !== null;
}

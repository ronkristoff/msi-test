export function normalizeAppUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return "";
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    new URL(withScheme);
  } catch {
    return trimmed;
  }
  return withScheme;
}

export function isValidAppUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    new URL(withScheme);
    return true;
  } catch {
    return false;
  }
}

export const NAME_MIN = 1;
export const NAME_MAX = 100;
export const PASSWORD_MIN = 8;

export function prependScheme(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function parseUrlOrNull(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

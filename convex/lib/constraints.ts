export const NAME_MIN = 1;
export const NAME_MAX = 100;
export const PASSWORD_MIN = 8;

export const TEST_DATA_MAX_KEYS = 50;
export const TEST_DATA_MAX_KEY_LEN = 100;
export const TEST_DATA_MAX_VALUE_LEN = 1000;

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

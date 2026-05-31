export interface LiveSnapshot {
  snapshot: string;
  url: string;
  title: string;
}

export interface AuthConfigPayload {
  auth_mode: string;
  login_url?: string;
  username?: string;
  password?: string;
  cookie_name?: string;
  cookie_value?: string;
  app_url: string;
}

const RUNNER_TIMEOUT_MS = 30_000;

export async function getLiveSnapshot(params: {
  projectId: string;
  url: string;
  authConfig: AuthConfigPayload;
}): Promise<LiveSnapshot | null> {
  const runnerUrl = process.env.RUNNER_URL;
  if (!runnerUrl) return null;

  const secret = process.env.RUNNER_SECRET;
  if (!secret) return null;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), RUNNER_TIMEOUT_MS);

    const response = await fetch(`${runnerUrl}/browser/navigate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${secret}`,
      },
      body: JSON.stringify({
        project_id: params.projectId,
        url: params.url,
        ...params.authConfig,
      }),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!response.ok) {
      return null;
    }

    const data = await response.json() as LiveSnapshot;
    if (!data.snapshot) return null;

    return data;
  } catch {
    return null;
  }
}

export function extractTargetUrl(testCode: string, fallbackUrl: string): string {
  const gotoMatch = testCode.match(/page\.goto\(\s*['"`]([^'"`]+)['"`]/);
  if (gotoMatch) {
    const extracted = gotoMatch[1];
    if (extracted.startsWith("http")) return extracted;
    try {
      const base = new URL(fallbackUrl);
      return new URL(extracted, base.origin).toString();
    } catch {
      return fallbackUrl;
    }
  }
  return fallbackUrl;
}

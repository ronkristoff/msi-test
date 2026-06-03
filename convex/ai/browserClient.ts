import type { SnapshotData } from "./snapshotFormatter";

export type SnapshotRequest = {
  url: string;
  project_id: string;
  workspace_id: string;
};

export type ValidateTestRequest = {
  url: string;
  project_id: string;
  workspace_id: string;
  playwright_code: string;
};

export type ValidateTestResult = {
  passed: boolean;
  error_message?: string;
  snapshot_at_failure?: string;
};

const TIMEOUT_MS = 30_000;

export function getRunnerUrl(envVar: string | undefined): string | null {
  if (!envVar) return null;
  const trimmed = envVar.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function runnerFetch<T>(
  runnerUrl: string,
  runnerSecret: string,
  path: string,
  body: unknown,
): Promise<T | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const response = await fetch(`${runnerUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${runnerSecret}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export const snapshotFetch = (
  runnerUrl: string,
  runnerSecret: string,
  req: SnapshotRequest,
) => runnerFetch<SnapshotData>(runnerUrl, runnerSecret, "/snapshot", req);

export const validateTestFetch = (
  runnerUrl: string,
  runnerSecret: string,
  req: ValidateTestRequest,
) => runnerFetch<ValidateTestResult>(runnerUrl, runnerSecret, "/validate-test", req);

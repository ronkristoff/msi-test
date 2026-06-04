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

export type FillAndSubmitRequest = {
  type: "fill_and_submit";
  fields: Array<{ label: string; value: string }>;
  submit_label: string;
};

export type ClickRequest = {
  type: "click";
  click_label: string;
};

export type TriggerErrorRequest = {
  type: "trigger_error";
  intent: string;
};

export type FeedbackActionRequest = FillAndSubmitRequest | ClickRequest | TriggerErrorRequest;

export type FeedbackDiscoveryRequest = {
  url: string;
  project_id: string;
  workspace_id: string;
  action: FeedbackActionRequest;
};

export type FeedbackDiscoveryResult = {
  feedback: Array<{
    type: string;
    message: string;
    detection_strategy: string;
    confidence: string;
    selector: string;
    suggested_locator: string;
    suggested_assertion: string;
    element_html: string;
  }>;
  before_url: string;
  after_url: string;
  url_changed: boolean;
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

export const feedbackDiscoveryFetch = (
  runnerUrl: string,
  runnerSecret: string,
  req: FeedbackDiscoveryRequest,
) => runnerFetch<FeedbackDiscoveryResult>(runnerUrl, runnerSecret, "/discover-feedback", req);

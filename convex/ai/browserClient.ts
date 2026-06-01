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

export interface InteractionStep {
  action: string;
  role?: string;
  name?: string;
  value?: string;
}

const RUNNER_TIMEOUT_MS = 30_000;
const INTERACT_TIMEOUT_MS = 60_000;

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
  const matches = [...testCode.matchAll(/page\.goto\(\s*['"`]([^'"`]+)['"`]/g)];
  if (matches.length === 0) return fallbackUrl;

  const lastGoto = matches[matches.length - 1][1];
  if (lastGoto.startsWith("http")) return lastGoto;
  try {
    const base = new URL(fallbackUrl);
    return new URL(lastGoto, base.origin).toString();
  } catch {
    return fallbackUrl;
  }
}

export async function interactAndCapture(params: {
  projectId: string;
  url: string;
  authConfig: AuthConfigPayload;
  actions: InteractionStep[];
}): Promise<LiveSnapshot[] | null> {
  const runnerUrl = process.env.RUNNER_URL;
  if (!runnerUrl) return null;

  const secret = process.env.RUNNER_SECRET;
  if (!secret) return null;

  if (params.actions.length === 0) return null;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), INTERACT_TIMEOUT_MS);

    const response = await fetch(`${runnerUrl}/browser/interact`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${secret}`,
      },
      body: JSON.stringify({
        project_id: params.projectId,
        url: params.url,
        actions: params.actions,
        ...params.authConfig,
      }),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!response.ok) return null;

    const data = await response.json() as { steps: LiveSnapshot[] };
    if (!data.steps || data.steps.length === 0) return null;

    return data.steps;
  } catch {
    return null;
  }
}

interface SnapshotElement {
  role: string;
  name: string;
}

function parseSnapshotLine(line: string): SnapshotElement | null {
  const roleMatch = line.match(/^\s*-\s*(\w+)/);
  if (!roleMatch) return null;

  const role = roleMatch[1].toLowerCase();

  const textMatch = line.match(/["']([^"']+)["']/);
  if (!textMatch) return null;

  const name = textMatch[1];

  if (["generic", "separator", "insertion", "deletion"].includes(role)) return null;

  return { role, name };
}

function buildSnapshotMap(snapshot: string): Map<string, SnapshotElement> {
  const map = new Map<string, SnapshotElement>();
  const lines = snapshot.split("\n");

  for (const line of lines) {
    const el = parseSnapshotLine(line);
    if (!el) continue;

    const key = `${el.role}:${el.name.toLowerCase()}`;
    if (!map.has(key)) {
      map.set(key, el);
    }

    if (!map.has(el.name.toLowerCase())) {
      map.set(el.name.toLowerCase(), el);
    }
  }

  return map;
}

function matchTestLineToElement(line: string, snapshotMap: Map<string, SnapshotElement>): SnapshotElement | undefined {
  const getByRolePattern = /getByRole\(['"](\w+)['"]\s*,\s*\{\s*name:\s*[/'"`]([^'"`/)]+)/;
  let match = line.match(getByRolePattern);
  if (match) {
    const role = match[1].toLowerCase();
    const name = match[2].replace(/[/'"`]/g, "").trim().toLowerCase();
    return snapshotMap.get(`${role}:${name}`) ?? snapshotMap.get(name);
  }

  const textPatterns = [
    /getByText\(['"`]([^'"`]+)['"`]\)/,
    /getByLabel\(['"`]([^'"`]+)['"`]\)/,
    /getByPlaceholder\(['"`]([^'"`]+)['"`]\)/,
  ];

  for (const pattern of textPatterns) {
    match = line.match(pattern);
    if (match) {
      const name = match[1].toLowerCase();
      const el = snapshotMap.get(name);
      if (el) return el;
    }
  }

  return undefined;
}

export function extractInteractionsFromTestCode(testCode: string, snapshot: string): InteractionStep[] {
  const actions: InteractionStep[] = [];
  const snapshotMap = buildSnapshotMap(snapshot);
  const lines = testCode.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("*")) continue;

    const isFill = /\.fill\(/.test(trimmed);
    const isClick = /\.click\(/.test(trimmed);

    if (!isFill && !isClick) continue;

    const el = matchTestLineToElement(trimmed, snapshotMap);
    if (!el) continue;

    if (isClick) {
      actions.push({ action: "click", role: el.role, name: el.name });
    } else if (isFill) {
      const fillMatch = trimmed.match(/\.fill\(\s*['"`]([^'"`]*)['"`]\s*\)/);
      if (fillMatch) {
        actions.push({ action: "fill", role: el.role, name: el.name, value: fillMatch[1] });
      }
    }
  }

  return actions.slice(0, 8);
}

export function extractClickableRefs(snapshot: string): InteractionStep[] {
  const refs: InteractionStep[] = [];
  const lines = snapshot.split("\n");

  for (const line of lines) {
    const el = parseSnapshotLine(line);
    if (!el) continue;

    const isButton = el.role === "button";
    const isLink = el.role === "link";
    if ((isButton || isLink) && !el.name.toLowerCase().includes("logout") && !el.name.toLowerCase().includes("sign out")) {
      refs.push({ action: "click", role: el.role, name: el.name });
    }
  }

  return refs;
}

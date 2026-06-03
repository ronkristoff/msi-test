import * as http from "http";
import * as path from "path";
import * as fs from "fs/promises";
import { z } from "zod";
import { spawnPlaywright } from "./playwright-spawn";
import { createTempRunDir, cleanupDir } from "./config";
import type { StagehandInstance } from "./stagehand";
import type { AiConfig } from "../../convex/ai/model";

export interface SnapshotApiDeps {
  runnerSecret: string;
  getAiConfig: (workspaceId: string) => Promise<AiConfig>;
  initStagehand: (
    config: AiConfig,
    log: (msg: string) => void,
    cacheDir?: string,
  ) => Promise<StagehandInstance>;
  runPlaywrightTest?: (
    baseUrl: string,
    code: string,
    log: (msg: string) => void,
  ) => Promise<{ exitCode: number; stdout: string; stderr: string }>;
  log: (msg: string) => void;
  sessionIdleMs?: number;
}

const snapshotRequestSchema = z.object({
  project_id: z.string().min(1),
  url: z.string().min(1),
  workspace_id: z.string().min(1),
});

const validateTestRequestSchema = z.object({
  project_id: z.string().min(1),
  url: z.string().min(1),
  workspace_id: z.string().min(1),
  playwright_code: z.string().min(1),
});

class SessionManager {
  private sessions = new Map<string, { stagehand: StagehandInstance; timeout: ReturnType<typeof setTimeout> }>();

  constructor(
    private idleMs: number,
    private log: (msg: string) => void,
  ) {}

  async getOrCreate(
    projectId: string,
    workspaceId: string,
    deps: SnapshotApiDeps,
  ): Promise<StagehandInstance> {
    const existing = this.sessions.get(projectId);
    if (existing) {
      this.refresh(projectId);
      return existing.stagehand;
    }

    const aiConfig = await deps.getAiConfig(workspaceId);
    const stagehand = await deps.initStagehand(aiConfig, this.log);
    const timeout = setTimeout(() => this.cleanup(projectId), this.idleMs);
    this.sessions.set(projectId, { stagehand, timeout });
    this.log(`Snapshot API: created session for project ${projectId}`);
    return stagehand;
  }

  private refresh(projectId: string) {
    const entry = this.sessions.get(projectId);
    if (!entry) return;
    clearTimeout(entry.timeout);
    entry.timeout = setTimeout(() => this.cleanup(projectId), this.idleMs);
  }

  private cleanup(projectId: string) {
    const entry = this.sessions.get(projectId);
    if (!entry) return;
    clearTimeout(entry.timeout);
    this.sessions.delete(projectId);
    entry.stagehand.close().catch(() => {});
    this.log(`Snapshot API: cleaned up session for project ${projectId}`);
  }
}

export function createSnapshotApiServer(deps: SnapshotApiDeps): http.Server {
  const sessionManager = new SessionManager(
    deps.sessionIdleMs ?? 10 * 60 * 1000,
    deps.log,
  );

  const routes: Record<string, (res: http.ServerResponse, body: unknown) => Promise<void>> = {
    "/snapshot": (res, body) => handleSnapshot(res, body, deps, sessionManager),
    "/validate-test": (res, body) => handleValidateTest(res, body, deps),
  };

  const server = http.createServer(async (req, res) => {
    if (!isAuthorized(req, deps.runnerSecret)) {
      sendJson(res, 401, { error: "Unauthorized" });
      return;
    }

    if (req.method !== "POST") {
      sendJson(res, 405, { error: "Method not allowed" });
      return;
    }

    const pathname = parsePathname(req.url);
    const handler = routes[pathname];
    if (!handler) {
      sendJson(res, 404, { error: "Not found" });
      return;
    }

    const body = await readBody(req);
    await handler(res, body);
  });

  return server;
}

function isAuthorized(req: http.IncomingMessage, secret: string): boolean {
  return req.headers.authorization === `Bearer ${secret}`;
}

function parsePathname(rawUrl: string | undefined): string {
  if (!rawUrl) return "";
  try {
    return new URL(rawUrl, "http://localhost").pathname;
  } catch {
    return rawUrl.split("?")[0];
  }
}

async function handleSnapshot(
  res: http.ServerResponse,
  rawBody: unknown,
  deps: SnapshotApiDeps,
  sessionManager: SessionManager,
) {
  const parsed = snapshotRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    sendJson(res, 400, { error: "Invalid request body", details: parsed.error.issues });
    return;
  }

  const { project_id, url, workspace_id } = parsed.data;

  try {
    const stagehand = await sessionManager.getOrCreate(project_id, workspace_id, deps);
    const page = stagehand.context.activePage() ?? (await stagehand.context.newPage());

    await page.goto(url, { timeoutMs: 30000 });

    const ariaSnapshot = (await page.accessibility?.snapshot?.().then(JSON.stringify).catch(() => "")) ?? "";
    const pageTitle = await page.title();
    const pageUrl = page.url();

    sendJson(res, 200, {
      aria_snapshot: ariaSnapshot,
      page_title: pageTitle,
      url: pageUrl,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    sendJson(res, 502, { error: `Navigation failed: ${message}` });
  }
}

async function handleValidateTest(
  res: http.ServerResponse,
  rawBody: unknown,
  deps: SnapshotApiDeps,
) {
  const parsed = validateTestRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    sendJson(res, 400, { error: "Invalid request body", details: parsed.error.issues });
    return;
  }

  const { url, playwright_code } = parsed.data;

  try {
    const runner = deps.runPlaywrightTest ?? runPlaywrightValidation;
    const result = await runner(url, playwright_code, deps.log);

    if (result.exitCode === 0) {
      sendJson(res, 200, { passed: true });
    } else {
      const errorMsg = [result.stdout, result.stderr].join("\n").trim().slice(-2000);
      sendJson(res, 200, { passed: false, error_message: errorMsg || "Test failed" });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    sendJson(res, 500, { error: `Validation failed: ${message}` });
  }
}

async function runPlaywrightValidation(
  baseUrl: string,
  code: string,
  log: (msg: string) => void,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const tmpDir = await createTempRunDir();

  try {
    await fs.writeFile(path.join(tmpDir, "test.spec.ts"), code, "utf-8");
    await fs.writeFile(
      path.join(tmpDir, "playwright.config.ts"),
      VALIDATION_CONFIG.replace("{{BASE_URL}}", baseUrl),
      "utf-8",
    );

    return await spawnPlaywright(tmpDir, log);
  } finally {
    await cleanupDir(tmpDir);
  }
}

const VALIDATION_CONFIG = `import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'line',
  use: {
    baseURL: '{{BASE_URL}}',
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
    actionTimeout: 10000,
    navigationTimeout: 30000,
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
`;

function sendJson(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function readBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk: Buffer) => { data += chunk.toString(); });
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        resolve({});
      }
    });
    req.on("error", reject);
  });
}

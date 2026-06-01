import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

export interface AuthConfig {
  auth_mode: "none" | "form" | "cookie";
  login_url?: string;
  username?: string;
  password?: string;
  cookie_name?: string;
  cookie_value?: string;
  app_url: string;
}

export interface BrowserSession {
  context: BrowserContext;
  page: Page;
  lastActivity: number;
  authed: boolean;
  authConfig: AuthConfig;
}

export interface SnapshotResult {
  snapshot: string;
  url: string;
  title: string;
}

const IDLE_TIMEOUT_MS = 10 * 60 * 1000;
const NAVIGATION_TIMEOUT_MS = 30_000;
const HYDRATION_WAIT_MS = 2_000;
const LOGIN_TIMEOUT_MS = 15_000;

export class BrowserSessionManager {
  private browser: Browser | null = null;
  private sessions = new Map<string, BrowserSession>();
  private queues = new Map<string, Promise<unknown>>();
  private idleSweepTimer: ReturnType<typeof setInterval> | null = null;
  private log: (msg: string) => void;

  constructor(log: (msg: string) => void) {
    this.log = log;
  }

  async ensureBrowser(): Promise<Browser> {
    if (!this.browser || !this.browser.isConnected()) {
      this.log("Launching shared Chromium instance");
      this.browser = await chromium.launch({ headless: true });
    }
    return this.browser;
  }

  async getOrCreateSession(projectId: string, authConfig: AuthConfig): Promise<BrowserSession> {
    const existing = this.sessions.get(projectId);
    if (existing) {
      try {
        await existing.page.evaluate(() => true).catch(() => false);
        existing.lastActivity = Date.now();
        return existing;
      } catch {
        await this.closeSession(projectId);
      }
    }

    const browser = await this.ensureBrowser();
    const context = await browser.newContext();
    const page = await context.newPage();

    const session: BrowserSession = {
      context,
      page,
      lastActivity: Date.now(),
      authed: false,
      authConfig,
    };

    this.sessions.set(projectId, session);

    if (authConfig.auth_mode !== "none") {
      await this.performLogin(session, authConfig);
    }

    return session;
  }

  async performLogin(session: BrowserSession, authConfig: AuthConfig): Promise<boolean> {
    if (authConfig.auth_mode === "cookie" && authConfig.cookie_name && authConfig.cookie_value) {
      const baseUrl = new URL(authConfig.app_url);
      await session.context.addCookies([{
        name: authConfig.cookie_name,
        value: authConfig.cookie_value,
        domain: baseUrl.hostname,
        path: "/",
      }]);
      session.authed = true;
      return true;
    }

    if (authConfig.auth_mode === "form" && authConfig.username && authConfig.password) {
      const loginUrl = authConfig.login_url || authConfig.app_url;
      const loginPage = await session.context.newPage();
      try {
        await loginPage.goto(loginUrl, { waitUntil: "networkidle", timeout: NAVIGATION_TIMEOUT_MS });
        await loginPage.waitForTimeout(HYDRATION_WAIT_MS);

        const emailInput = loginPage.locator(
          'input[type="email"], input[name="email"], input[name="username"], input[autocomplete="email"], input[autocomplete="username"], input[placeholder*="email" i], input[placeholder*="user" i]'
        ).first();
        const passwordInput = loginPage.locator('input[type="password"]').first();

        if (!(await emailInput.count()) || !(await passwordInput.count())) {
          this.log("  Could not find email/password fields on login page");
          return false;
        }

        await emailInput.fill(authConfig.username);
        await passwordInput.fill(authConfig.password);

        const submitButton = loginPage.locator(
          'button[type="submit"], input[type="submit"], button:has-text("Sign in"), button:has-text("Log in"), button:has-text("Login"), button:has-text("Sign up")'
        ).first();

        if (await submitButton.count()) {
          await submitButton.click();
        } else {
          await passwordInput.press("Enter");
        }

        await loginPage.waitForURL(
          (url) => url.toString() !== loginUrl,
          { timeout: LOGIN_TIMEOUT_MS }
        ).catch(() => {});

        await loginPage.waitForTimeout(HYDRATION_WAIT_MS);
        session.authed = true;
        return true;
      } catch (err) {
        this.log(`  Form login error: ${err}`);
        return false;
      } finally {
        await loginPage.close().catch(() => {});
      }
    }

    return false;
  }

  async navigateAndSnapshot(projectId: string, url: string, authConfig: AuthConfig): Promise<SnapshotResult> {
    return this.enqueue(projectId, async () => {
      const session = await this.getOrCreateSession(projectId, authConfig);

      await session.page.goto(url, { waitUntil: "networkidle", timeout: NAVIGATION_TIMEOUT_MS })
        .catch(async () => {
          await session.page.goto(url, { waitUntil: "domcontentloaded", timeout: NAVIGATION_TIMEOUT_MS });
        });

      await session.page.waitForTimeout(HYDRATION_WAIT_MS);

      const snapshot = await (session.page as Page & { ariaSnapshot(opts?: { mode?: string; timeout?: number }): Promise<string> }).ariaSnapshot({ mode: "ai", timeout: 5_000 });
      const currentUrl = session.page.url();
      const title = await session.page.title();

      session.lastActivity = Date.now();

      return { snapshot, url: currentUrl, title };
    });
  }

  async getSnapshot(projectId: string, authConfig: AuthConfig): Promise<SnapshotResult> {
    return this.enqueue(projectId, async () => {
      const session = await this.getOrCreateSession(projectId, authConfig);

      const snapshot = await (session.page as Page & { ariaSnapshot(opts?: { mode?: string; timeout?: number }): Promise<string> }).ariaSnapshot({ mode: "ai", timeout: 5_000 });
      const currentUrl = session.page.url();
      const title = await session.page.title();

      session.lastActivity = Date.now();

      return { snapshot, url: currentUrl, title };
    });
  }

  async login(projectId: string, authConfig: AuthConfig): Promise<{ success: boolean }> {
    return this.enqueue(projectId, async () => {
      const session = await this.getOrCreateSession(projectId, authConfig);
      if (session.authed) return { success: true };
      const success = await this.performLogin(session, authConfig);
      return { success };
    });
  }

  async closeSession(projectId: string): Promise<void> {
    const session = this.sessions.get(projectId);
    if (!session) return;
    this.sessions.delete(projectId);
    this.queues.delete(projectId);
    try {
      await session.context.close();
    } catch {
      // best effort
    }
  }

  async interactAndCapture(
    projectId: string,
    url: string,
    authConfig: AuthConfig,
    actions: Array<{ action: string; role?: string; name?: string; value?: string }>,
  ): Promise<SnapshotResult[]> {
    return this.enqueue(projectId, async () => {
      const session = await this.getOrCreateSession(projectId, authConfig);

      await session.page.goto(url, { waitUntil: "networkidle", timeout: NAVIGATION_TIMEOUT_MS })
        .catch(async () => {
          await session.page.goto(url, { waitUntil: "domcontentloaded", timeout: NAVIGATION_TIMEOUT_MS });
        });

      await session.page.waitForTimeout(HYDRATION_WAIT_MS);

      const results: SnapshotResult[] = [];

      const initialSnapshot = await (session.page as Page & { ariaSnapshot(opts?: { mode?: string; timeout?: number }): Promise<string> }).ariaSnapshot({ mode: "ai", timeout: 5_000 });
      results.push({
        snapshot: initialSnapshot,
        url: session.page.url(),
        title: await session.page.title(),
      });

      for (const step of actions) {
        try {
          if (step.role && step.name) {
            const locator = session.page.getByRole(step.role as "button" | "link" | "textbox" | "combobox" | "spinbutton" | "checkbox" | "radio" | "switch" | "tab" | "menuitem" | "option" | "heading" | "dialog" | "alert" | "article" | "banner" | "cell" | "columnheader" | "row" | "rowheader" | "table" | "grid" | "listbox" | "menu" | "navigation" | "search", { exact: false, name: step.name }).first();

            if (step.action === "click") {
              if (await locator.count() > 0) {
                await locator.click({ timeout: 5_000 });
                await session.page.waitForTimeout(1_000);
              }
            } else if (step.action === "fill" && step.value !== undefined) {
              if (await locator.count() > 0) {
                await locator.fill(step.value, { timeout: 5_000 });
              }
            }
          }

          const stepSnapshot = await (session.page as Page & { ariaSnapshot(opts?: { mode?: string; timeout?: number }): Promise<string> }).ariaSnapshot({ mode: "ai", timeout: 5_000 });
          results.push({
            snapshot: stepSnapshot,
            url: session.page.url(),
            title: await session.page.title(),
          });
        } catch (err) {
          this.log(`  interactAndCapture step error: ${err}`);
          try {
            const errorSnapshot = await (session.page as Page & { ariaSnapshot(opts?: { mode?: string; timeout?: number }): Promise<string> }).ariaSnapshot({ mode: "ai", timeout: 5_000 });
            results.push({
              snapshot: errorSnapshot,
              url: session.page.url(),
              title: await session.page.title(),
            });
          } catch {
            // skip this step
          }
        }
      }

      session.lastActivity = Date.now();
      return results;
    });
  }

  startIdleSweep(intervalMs: number = 60_000): void {
    this.idleSweepTimer = setInterval(() => {
      const now = Date.now();
      for (const [projectId, session] of this.sessions) {
        if (now - session.lastActivity > IDLE_TIMEOUT_MS) {
          this.log(`Closing idle session for project ${projectId}`);
          this.closeSession(projectId).catch((err) => {
            this.log(`Error closing idle session ${projectId}: ${err}`);
          });
        }
      }
    }, intervalMs);
  }

  stopIdleSweep(): void {
    if (this.idleSweepTimer) {
      clearInterval(this.idleSweepTimer);
      this.idleSweepTimer = null;
    }
  }

  async closeAll(): Promise<void> {
    this.stopIdleSweep();
    const projectIds = [...this.sessions.keys()];
    await Promise.all(projectIds.map((id) => this.closeSession(id)));
    if (this.browser) {
      await this.browser.close().catch(() => {});
      this.browser = null;
    }
  }

  getSessionCount(): number {
    return this.sessions.size;
  }

  hasSession(projectId: string): boolean {
    return this.sessions.has(projectId);
  }

  isSessionAuthed(projectId: string): boolean {
    return this.sessions.get(projectId)?.authed ?? false;
  }

  private async enqueue<T>(projectId: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.queues.get(projectId) ?? Promise.resolve();
    const next = prev.then(() => fn());
    this.queues.set(projectId, next as Promise<unknown>);
    return next;
  }
}

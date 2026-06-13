interface AuthFields {
  explore_auth_mode?: string;
  explore_login_url?: string;
  explore_username?: string;
  explore_password?: string;
}

interface ScenarioHint {
  name?: string;
  description?: string;
  flow_summary?: string;
  relevant_page_urls?: string[];
}

interface PageAuthInfo {
  url: string;
  title?: string;
  auth_required?: boolean;
}

interface CapturedPageForAuth {
  url: string;
  title?: string;
}

const PUBLIC_PAGE_PATTERNS = [
  /sign[\s-]?up/i,
  /register/i,
  /create.?account/i,
  /forgot.?password/i,
  /reset.?password/i,
  /verify.?email/i,
  /confirm.?email/i,
  /invite\/accept/i,
  /unauth/i,
];

function isPublicScenario(scenario?: ScenarioHint): boolean {
  if (!scenario) return false;
  const text = `${scenario.name ?? ""} ${scenario.description ?? ""} ${scenario.flow_summary ?? ""}`;
  return PUBLIC_PAGE_PATTERNS.some((p) => p.test(text));
}

function isPublicByPageAuth(scenario?: ScenarioHint, pages?: PageAuthInfo[]): boolean | null {
  if (!scenario || !pages || !scenario.relevant_page_urls) return null;
  const urls = scenario.relevant_page_urls;
  const matching = pages.filter((p) => urls.some((u) => p.url.includes(new URL(u).pathname)));
  if (matching.length === 0) return null;
  return matching.every((p) => p.auth_required === false);
}

function normalizeUrlKey(url: string): string {
  try {
    return new URL(url).pathname.replace(/\/+$/, "") || "/";
  } catch {
    return url.replace(/\/+$/, "");
  }
}

export function buildAuthPromptContext(
  project: AuthFields | null,
  scenario?: ScenarioHint,
  pages?: PageAuthInfo[],
  _capturedPages?: CapturedPageForAuth[],
): string {
  if (!project) {
    return "";
  }

  if (project.explore_auth_mode === "none" || !project.explore_auth_mode) {
    return "";
  }

  if (project.explore_auth_mode === "form") {
    if (!project.explore_username) {
      return "\nNote: The application requires form-based login but no credentials are configured. Generate tests for public pages only unless the test description mentions login.";
    }

    const pageAuthResult = isPublicByPageAuth(scenario, pages);
    if (pageAuthResult === true) {
      return `

Note: This application requires authentication for most pages, but THIS scenario tests a page marked as public (no auth required). Do NOT perform login steps — navigate directly to the target URL. Authentication is not needed and would interfere with the test.`;
    }

    if (isPublicScenario(scenario)) {
      return `

Note: This application requires authentication for most pages, but THIS scenario tests a public page (sign-up, registration, or password reset). Do NOT perform login steps — navigate directly to the target URL. Authentication is not needed and would interfere with the test.`;
    }

    const loginUrl = project.explore_login_url
      ? `Login page URL: ${project.explore_login_url}`
      : "Login page URL: same as the application URL (navigate there to find the login form)";

    return `

CRITICAL — This application requires authentication. This test MUST perform login before interacting with the app.

Authentication details:
${loginUrl}
Username/Email: "${project.explore_username}"
Password: "${project.explore_password ?? ""}"

IMPORTANT — Post-login URL rules:
- Do NOT assume a post-login URL path. A page titled "Dashboard" may live at /, /home, /app, or any other path.
- Do NOT add any toHaveURL assertion after login. The not.toHaveURL check below is sufficient to confirm successful login.
- Do NOT use toHaveURL(/\/dashboard/) or any other assumed path.

You MUST include these login steps at the beginning of this test, right after page.goto():

  await page.locator('input[type="email"], input[type="text"][name*="email" i], input[name*="user" i], input[autocomplete="email"]').first().fill("${project.explore_username}");
  await page.locator('input[type="password"]').first().fill("${project.explore_password ?? ""}");
  await page.getByRole("button", { name: /sign.?in|log.?in|submit/i }).click();
  await expect(page).not.toHaveURL(/\\/(login|sign-in|signin)/, { timeout: 15000 });

Do NOT add any toHaveURL assertion after the not.toHaveURL check. The not.toHaveURL assertion is sufficient to confirm successful login. After login, verify page content using headings, visible elements, or text assertions — NOT URL paths.

After login, navigate to internal pages by clicking navigation links (sidebar, menu items) — do NOT use page.goto() for internal SPA routes. Use page.goto() only for the initial page load.

NEVER derive URL paths from page titles.

Use the EXACT credentials shown above. Do NOT use placeholder values like admin@example.com or process.env.ADMIN_EMAIL. The credentials above are the real ones.`;
  }

  if (project.explore_auth_mode === "cookie") {
    return `

Authentication: cookie-based (the test runner handles this automatically).
Tests do not need to perform login — the runner injects authentication cookies.`;
  }

  return "";
}

export function buildNavMenuContext(navMenu: { text: string; href: string }[] | undefined): string {
  if (!navMenu || navMenu.length === 0) return "";
  const items = navMenu.map((item) => `  - "${item.text}" → ${item.href}`).join("\n");
  return `\nApplication navigation menu (use these link names when navigating):\n${items}\n`;
}

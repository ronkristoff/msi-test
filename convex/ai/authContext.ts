interface AuthFields {
  explore_auth_mode?: string;
  explore_login_url?: string;
  explore_username?: string;
  explore_password?: string;
}

export function buildAuthPromptContext(project: AuthFields | null): string {
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

    const loginUrl = project.explore_login_url
      ? `Login page URL: ${project.explore_login_url}`
      : "Login page URL: same as the application URL (navigate there to find the login form)";

    return `

CRITICAL — This application requires authentication. EVERY test MUST perform login before interacting with the app.

Authentication details:
${loginUrl}
Username/Email: "${project.explore_username}"
Password: "${project.explore_password ?? ""}"

You MUST include these login steps at the beginning of EVERY test, right after page.goto():

  await page.getByLabel(/email|username/i).fill("${project.explore_username}");
  await page.getByLabel(/password/i).fill("${project.explore_password ?? ""}");
  await page.getByRole("button", { name: /sign.?in|log.?in|submit/i }).click();
  await page.waitForURL("**/dashboard**", { timeout: 10000 }).catch(() => {});

Use the EXACT credentials shown above. Do NOT use placeholder values like admin@example.com or process.env.ADMIN_EMAIL. The credentials above are the real ones.`;
  }

  if (project.explore_auth_mode === "cookie") {
    return `

Authentication: cookie-based (the test runner handles this automatically).
Tests do not need to perform login — the runner injects authentication cookies.`;
  }

  return "";
}

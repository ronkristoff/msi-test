/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { extractTargetUrl } from "./resolveContext";

describe("extractTargetUrl", () => {
  it("extracts URL from single-quoted page.goto", () => {
    const code = `await page.goto('https://example.com/login');`;
    expect(extractTargetUrl(code)).toBe("https://example.com/login");
  });

  it("extracts URL from double-quoted page.goto", () => {
    const code = `await page.goto("https://example.com/dashboard");`;
    expect(extractTargetUrl(code)).toBe("https://example.com/dashboard");
  });

  it("extracts URL from template literal page.goto", () => {
    const code = "await page.goto(`https://example.com/settings`);";
    expect(extractTargetUrl(code)).toBe("https://example.com/settings");
  });

  it("extracts relative URL from page.goto", () => {
    const code = `await page.goto('/login');`;
    expect(extractTargetUrl(code)).toBe("/login");
  });

  it("returns first match when multiple page.goto calls exist", () => {
    const code = `
      await page.goto('https://example.com/login');
      await page.goto('https://example.com/dashboard');
    `;
    expect(extractTargetUrl(code)).toBe("https://example.com/login");
  });

  it("returns null when no page.goto call", () => {
    const code = `await page.click('button');`;
    expect(extractTargetUrl(code)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(extractTargetUrl("")).toBeNull();
  });

  it("extracts URL from full test code with surrounding context", () => {
    const code = `import { test, expect } from '@playwright/test';
test('login works', async ({ page }) => {
  await page.goto('https://myapp.com/auth');
  await page.getByLabel('Email').fill('user@test.com');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/.*dashboard/);
});`;
    expect(extractTargetUrl(code)).toBe("https://myapp.com/auth");
  });
});

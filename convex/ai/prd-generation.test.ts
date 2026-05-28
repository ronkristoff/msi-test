/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { extractPlaywrightCode, extractMultipleTests, deriveTestName } from "./agents";

describe("PRD generation parsing", () => {
  describe("extractPlaywrightCode", () => {
    it("extracts TypeScript code from markdown fence", () => {
      const response = `Here are the tests:

\`\`\`typescript
import { test, expect } from '@playwright/test';

test('login works', async ({ page }) => {
  await page.goto('/login');
  await page.fill('[data-testid="email"]', 'user@example.com');
  await page.click('[data-testid="submit"]');
  await expect(page).toHaveURL('/dashboard');
});
\`\`\`

These tests cover the login flow.`;

      const code = extractPlaywrightCode(response);
      expect(code).toContain("import { test, expect } from '@playwright/test'");
      expect(code).toContain("test('login works'");
      expect(code).not.toContain("```");
    });

    it("extracts JavaScript code from markdown fence", () => {
      const response = `\`\`\`javascript
import { test } from '@playwright/test';
test('basic', async ({ page }) => {});
\`\`\``;

      const code = extractPlaywrightCode(response);
      expect(code).toContain("import { test } from '@playwright/test'");
    });

    it("extracts ts code from markdown fence", () => {
      const response = `\`\`\`ts
import { test } from '@playwright/test';
test('ts test', async ({ page }) => {});
\`\`\``;

      const code = extractPlaywrightCode(response);
      expect(code).toContain("test('ts test'");
    });

    it("returns null when no code fence found", () => {
      const response = "No code here, just text about testing.";
      expect(extractPlaywrightCode(response)).toBeNull();
    });

    it("returns null for non-JS/TS code fences", () => {
      const response = "```python\nprint('hello')\n```";
      expect(extractPlaywrightCode(response)).toBeNull();
    });
  });

  describe("extractMultipleTests", () => {
    it("extracts multiple test blocks from response", () => {
      const response = `Here are the generated tests:

\`\`\`typescript
import { test, expect } from '@playwright/test';

test('user can sign up', async ({ page }) => {
  await page.goto('/signup');
  await page.fill('[data-testid="name"]', 'John');
  await page.click('[data-testid="submit"]');
  await expect(page.locator('.welcome')).toBeVisible();
});
\`\`\`

\`\`\`typescript
import { test, expect } from '@playwright/test';

test('user can log in', async ({ page }) => {
  await page.goto('/login');
  await page.fill('[data-testid="email"]', 'john@example.com');
  await page.click('[data-testid="submit"]');
  await expect(page).toHaveURL('/dashboard');
});
\`\`\``;

      const tests = extractMultipleTests(response);
      expect(tests).toHaveLength(2);
      expect(tests[0]).toContain("user can sign up");
      expect(tests[1]).toContain("user can log in");
    });

    it("returns empty array when no code fences found", () => {
      expect(extractMultipleTests("just text")).toEqual([]);
    });

    it("returns empty array for non-JS/TS fences", () => {
      expect(extractMultipleTests("```python\nprint('hi')\n```")).toEqual([]);
    });

    it("handles single test block", () => {
      const response = `\`\`\`typescript
import { test } from '@playwright/test';
test('solo', async ({ page }) => {});
\`\`\``;

      const tests = extractMultipleTests(response);
      expect(tests).toHaveLength(1);
      expect(tests[0]).toContain("test('solo'");
    });
  });

  describe("deriveTestName", () => {
    it("extracts name from test() call", () => {
      const code = `import { test } from '@playwright/test';
test('user login flow', async ({ page }) => {});`;
      expect(deriveTestName(code)).toBe("user login flow");
    });

    it("extracts name from test.describe() > test()", () => {
      const code = `test.describe('Auth', () => {
  test('signs in', async ({ page }) => {});
});`;
      expect(deriveTestName(code)).toBe("signs in");
    });

    it("returns fallback for code without test() call", () => {
      const code = `const x = 1;`;
      expect(deriveTestName(code)).toBe("Generated Test");
    });

    it("returns indexed fallback when index provided", () => {
      const code = `const x = 1;`;
      expect(deriveTestName(code, 2)).toBe("Generated Test 3");
    });

    it("handles backtick template literals", () => {
      const code = "test(`checkout flow`, async ({ page }) => {});";
      expect(deriveTestName(code)).toBe("checkout flow");
    });

    it("handles empty code", () => {
      expect(deriveTestName("")).toBe("Generated Test");
    });
  });
});

```typescript
import { test, expect } from '@playwright/test';

test('user can log in', async ({ page }) => {
  await page.goto('https://example.com/login');
  await page.fill('[data-testid="email"]', 'user@example.com');
  await page.fill('[data-testid="password"]', 'password123');
  await page.click('[data-testid="submit"]');
  await expect(page.locator('[data-testid="dashboard"]')).toBeVisible();
});
```

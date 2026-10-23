import { expect, test } from '@playwright/test';

test('app opens on its setup or authentication screen without crashing', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('body')).toContainText(/Supabase is not configured yet|Good to see you\./);
});

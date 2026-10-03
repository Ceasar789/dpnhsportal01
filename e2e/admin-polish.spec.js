// Phase 6 batch D polish — the small things a screenshot review caught.
//
// Each of these is one rule or one helper, and each one is the kind of
// thing that quietly comes back, so each gets the smallest check that
// would notice.
import { test, expect } from '@playwright/test';
import { ADMIN_SKIP_REASON, hasAdminCredentials, loginAsAdmin, openAdminTab } from './helpers.js';

// P1 — an unset dropdown is showing a prompt, not a value.
test.describe('placeholder dropdowns', () => {
  test.skip(!hasAdminCredentials, ADMIN_SKIP_REASON);

  test('read as muted until something is chosen', async ({ page }) => {
    await loginAsAdmin(page);
    await openAdminTab(page, 'News Management');

    const select = page.locator('.toolbar select').first();
    await expect(select).toHaveValue('');
    const muted = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--text-muted').trim());
    const asRgb = await page.evaluate((c) => {
      const d = document.createElement('div');
      d.style.color = c; document.body.appendChild(d);
      const v = getComputedStyle(d).color; d.remove(); return v;
    }, muted);

    expect(await select.evaluate((el) => getComputedStyle(el).color),
      'the placeholder looks like a chosen value').toBe(asRgb);

    // Choosing something makes it a value, and it reads like one.
    await select.selectOption({ index: 1 });
    expect(await select.evaluate((el) => getComputedStyle(el).color)).not.toBe(asRgb);
  });
});

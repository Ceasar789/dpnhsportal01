// RC2 — a memo refresh keeps the memo the administrator selected.
//
// Saving is the user-visible path that calls fetchMemos. The PATCH and audit
// INSERT are fulfilled in the browser, so this exercises the real selection
// and refetch path without writing to the live project.
import { test, expect } from '@playwright/test';
import { ADMIN_SKIP_REASON, hasAdminCredentials, loginAsAdmin, openAdminTab } from './helpers.js';

test.describe('memo selection stability', () => {
  test.skip(!hasAdminCredentials, ADMIN_SKIP_REASON);

  test('keeps the selected memo after its list refreshes', async ({ page }) => {
    const interceptedWrites = [];
    await page.route('**/rest/v1/memos*', async (route) => {
      if (route.request().method() !== 'PATCH') return route.continue();
      interceptedWrites.push('memos PATCH');
      await route.fulfill({ status: 204, body: '' });
    });
    await page.route('**/rest/v1/activity_logs*', async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      interceptedWrites.push('activity_logs POST');
      await route.fulfill({ status: 201, contentType: 'application/json', body: '[]' });
    });

    await loginAsAdmin(page);
    await openAdminTab(page, 'Memos');

    const rows = page.locator('.memo-list-item');
    await expect(rows.nth(1)).toBeVisible();
    const selectedSubject = await rows.nth(1).locator('.memo-title-item').innerText();
    await rows.nth(1).click();
    await expect(rows.nth(1)).toHaveAttribute('aria-current', 'true');

    await page.locator('.memo-preview').getByRole('button', { name: 'Edit' }).click();
    await expect(page.getByRole('dialog', { name: 'Edit Memo' })).toBeVisible();
    await page.getByRole('button', { name: 'Update', exact: true }).click();

    await expect(page.getByRole('dialog', { name: 'Edit Memo' })).toHaveCount(0);
    await expect(page.locator('.memo-list-item.active .memo-title-item')).toHaveText(selectedSubject);
    expect(interceptedWrites).toEqual(['memos PATCH', 'activity_logs POST']);
  });
});

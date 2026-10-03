// Phase 7A — the audit trail actually records things.
//
// For two phases this looked like it worked. Every write to activity_logs
// was rejected — the app sent a `details` column the live table does not
// have — and a localStorage mirror put the row on screen anyway, so the
// panel showed the action while the database recorded nothing. Each
// browser had its own private "history" and the real table was empty.
//
// So this test deliberately does NOT trust the panel alone. It performs a
// real action, then checks the SERVER row exists, then checks both panels
// render it. Any one of the three on its own would have passed during the
// whole period the feature was broken.
import { test, expect } from '@playwright/test';
import { ADMIN_SKIP_REASON, hasAdminCredentials, loginAsAdmin, openAdminTab } from './helpers.js';

const URL = process.env.VITE_SUPABASE_URL;
const ANON = process.env.VITE_SUPABASE_ANON_KEY;

// Read activity_logs over REST as the same admin the browser is signed in
// as, so the SELECT policy is exercised exactly as the app exercises it.
//
// The token is obtained here rather than lifted out of the page: this app
// does not persist its Supabase session to localStorage, and digging for
// it would couple the test to an implementation detail that is not the
// thing under test.
async function adminToken(request) {
  const res = await request.post(`${URL}/auth/v1/token?grant_type=password`, {
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    data: { email: process.env.E2E_ADMIN_EMAIL, password: process.env.E2E_ADMIN_PASSWORD },
  });
  expect(res.ok(), `could not sign in to read the log: ${res.status()}`).toBe(true);
  const body = await res.json();
  expect(body.access_token, 'no access token came back').toBeTruthy();
  return body.access_token;
}

async function serverRows(request, token, limit = 10) {
  const res = await request.get(
    `${URL}/rest/v1/activity_logs`
    + `?select=id,action,description,user_id,created_at&order=created_at.desc&limit=${limit}`,
    { headers: { apikey: ANON, Authorization: `Bearer ${token}` } },
  );
  expect(res.ok(), `reading activity_logs failed: ${res.status()} ${await res.text()}`).toBe(true);
  return res.json();
}

test.describe('the activity log records what happened', () => {
  test.skip(!hasAdminCredentials, ADMIN_SKIP_REASON);

  test('an action reaches the database and both panels', async ({ page, request }) => {
    test.setTimeout(180_000);
    await loginAsAdmin(page);
    const token = await adminToken(request);

    const before = await serverRows(request, token);

    // A real action, through the real UI: save Settings. Academic Year is
    // put back at the end, so the only lasting change is the audit row —
    // which is the thing being tested.
    await openAdminTab(page, 'System Settings');
    const year = page.locator('#settings-academic-year');
    const original = await year.inputValue();
    const marker = `E2E audit probe ${Date.now()}`;

    try {
      await year.fill('2099-2100');
      await page.locator('.settings-savebar').getByRole('button', { name: 'Save Changes' }).click();
      await expect(page.locator('.settings-savebar')).toHaveCount(0, { timeout: 15_000 });

      // 1. The server has a new row, attributed to this user.
      await expect.poll(async () => (await serverRows(request, token)).length, {
        message: 'no activity row reached the database',
        timeout: 20_000,
      }).toBeGreaterThan(before.length);

      const after = await serverRows(request, token);
      const fresh = after[0];
      expect(fresh.action, 'the newest row is not the save we just made').toBe('Updated settings');
      expect(fresh.user_id, 'the row is not attributed to the signed-in admin').toBeTruthy();

      // 2. Overview renders it, with an actor and a time.
      await openAdminTab(page, 'Overview');
      const recent = page.locator('.recent-item').first();
      await expect(recent).toBeVisible();
      await expect(recent.locator('.recent-title')).toHaveText('Updated settings');
      const byline = await recent.locator('.recent-time').textContent();
      expect(byline.trim(), 'the actor is blank').not.toBe('');
      expect(byline, 'the byline has no date').toMatch(/20\d\d/);

      // 3. Settings' own history renders it too. Scoped by heading:
      // Backup History is a sibling block using the same classes, and an
      // unscoped .settings-history-item matches a backup row first.
      await openAdminTab(page, 'System Settings');
      const activityBlock = page.locator('.settings-history')
        .filter({ hasText: 'Activity Log History' });
      const history = activityBlock.locator('.settings-history-item').first();
      await expect(history).toBeVisible();
      await expect(history).toContainText('Updated settings');
      await expect(activityBlock.getByText('No activity logs yet.')).toHaveCount(0);
    } finally {
      // Put the school's real year back whatever happened above.
      await openAdminTab(page, 'System Settings');
      await page.locator('#settings-academic-year').fill(original);
      const bar = page.locator('.settings-savebar');
      if (await bar.count()) {
        await bar.getByRole('button', { name: 'Save Changes' }).click();
        await expect(bar).toHaveCount(0, { timeout: 15_000 });
      }
      await expect(page.locator('#settings-academic-year')).toHaveValue(original);
    }
    expect(marker).toBeTruthy();
  });

  test('nothing is invented when the server has nothing', async ({ page }) => {
    await loginAsAdmin(page);
    // The panel used to fill itself from a localStorage mirror, so an
    // empty table still looked busy. With the read failing, the only
    // honest output is the empty state.
    await page.route('**/rest/v1/activity_logs**', (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"forced"}' }));

    await openAdminTab(page, 'Overview');
    await expect(page.getByText('No recent activity')).toBeVisible();
    await expect(page.locator('.recent-item')).toHaveCount(0);
  });
});

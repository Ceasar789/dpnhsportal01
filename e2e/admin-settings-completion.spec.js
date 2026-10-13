import { test, expect } from '@playwright/test';
import { appReady, loginAsStudent, openAdminTab } from './helpers.js';

const WIDTHS = [360, 390, 768, 1024, 1440];

const settingsRow = {
  id: 1,
  school_name: 'EduScribe Portal',
  school_year: '2026-2027',
  current_semester: 1,
  session_timeout: '15 min',
  email_notifications: false,
  auto_backup: true,
  backup_frequency: 'daily',
  backup_time: '00:00',
  activity_logs_retention: '90 days',
};

const backupRows = [
  { id: 'backup-1', status: 'completed', started_at: '2026-10-07T21:27:29.000Z' },
  { id: 'backup-2', status: 'failed', started_at: '2026-10-06T16:30:00.000Z' },
];

const activityRows = [{
  id: 'activity-1',
  action: 'Updated system settings with a deliberately long readable action label',
  description: 'Changed the academic year used by the Admin overview.',
  created_at: '2026-10-08T09:55:17.853Z',
  user_id: 'fixture-admin',
  profiles: { name: 'Admin User', status: 'active' },
}];

async function openReadOnlySettings(page) {
  await loginAsStudent(page);

  await page.route('**/rest/v1/profiles**', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fulfill({ status: 204, body: '' });
      return;
    }
    const response = await route.fetch();
    const text = await response.text();
    if (!text) {
      await route.fulfill({ response });
      return;
    }
    const body = JSON.parse(text);
    const asAdmin = (profile) => ({ ...profile, role: 'main_admin', status: 'active' });
    await route.fulfill({
      response,
      json: Array.isArray(body) ? body.map(asAdmin) : asAdmin(body),
    });
  });

  await page.route('**/rest/v1/school_settings**', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fulfill({ status: 204, body: '' });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(settingsRow) });
  });
  await page.route('**/rest/v1/backup_history**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(backupRows) });
  });
  await page.route('**/rest/v1/activity_logs**', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fulfill({ status: 204, body: '' });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(activityRows) });
  });

  await page.goto('/admin-dashboard');
  await page.waitForURL('**/admin-dashboard**', { timeout: 30_000 });
  await appReady(page);
  await openAdminTab(page, 'System Settings');
  await expect(page.getByRole('list', { name: 'Backup History' })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Recent Admin Activity' })).toBeVisible();
}

async function verifySettingsLayout(page, width, theme) {
  await page.setViewportSize({ width, height: 900 });
  await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(width);

  await expect(page.getByText('Portal Email Notifications')).toBeVisible();
  await expect(page.getByText(/does not send announcement, memo, calendar, or activity email notifications/)).toBeVisible();
  await expect(page.getByText(/GitHub Actions backs up the database and uploaded storage files/)).toBeVisible();
  await expect(page.getByText(/retained for 7 days/)).toBeVisible();
  await expect(page.getByText(/No automated retention policy is implemented/)).toBeVisible();
  await expect(page.getByText(/not available|coming soon/i)).toHaveCount(0);
  await expect(page.getByRole('switch')).toHaveCount(0);

  const layout = await page.evaluate(() => ({
    pageOverflow: document.documentElement.scrollWidth - window.innerWidth,
    overflowingCards: [...document.querySelectorAll('.settings-card')]
      .filter((card) => card.scrollWidth > card.clientWidth + 1).length,
    overflowingItems: [...document.querySelectorAll('.settings-history-item')]
      .filter((item) => item.scrollWidth > item.clientWidth + 1).length,
  }));
  expect(layout.pageOverflow, `${theme} ${width}: page overflow`).toBeLessThanOrEqual(0);
  expect(layout.overflowingCards, `${theme} ${width}: settings card overflow`).toBe(0);
  expect(layout.overflowingItems, `${theme} ${width}: history item overflow`).toBe(0);
}

test('completed Settings stay truthful, readable, and responsive', async ({ page }, testInfo) => {
  await page.addInitScript(() => localStorage.setItem('smartedu-theme', 'light'));
  await page.setViewportSize({ width: 1440, height: 900 });
  await openReadOnlySettings(page);

  await page.getByRole('button', { name: 'Backup & Logs' }).click();
  await expect(page.locator('#sec-backup')).toBeInViewport();

  for (const width of WIDTHS) await verifySettingsLayout(page, width, 'light');
  await verifySettingsLayout(page, 360, 'light');
  await testInfo.attach('settings-light-360', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });

  await page.getByRole('button', { name: 'Switch to Dark Mode' }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  for (const width of WIDTHS) await verifySettingsLayout(page, width, 'dark');
  await verifySettingsLayout(page, 1440, 'dark');
  await testInfo.attach('settings-dark-1440', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });

  await page.setViewportSize({ width: 360, height: 900 });
  await page.getByRole('button', { name: 'Open navigation' }).click();
  const drawer = page.getByRole('dialog', { name: 'Navigation' });
  await drawer.getByRole('button', { name: 'Notifications', exact: true }).click();
  await expect(page.locator('#sec-notifications')).toBeInViewport();
  await expect(drawer).toHaveCount(0);
});

import { test, expect } from '@playwright/test';
import { appReady, loginAsStudent } from './helpers.js';

const WIDTHS = [360, 390, 768, 1024, 1440];

// The live Admin fixture is currently rejected. This read-only visual fixture
// authenticates with the seeded Student account, then changes only the
// browser's profile response so the real Admin shell can render. No database
// role or row is changed. Admin data reads may return empty under Student RLS;
// the header under test does not depend on those rows.
async function openReadOnlyAdminShell(page) {
  // Establish a real, read-only Supabase session before changing any profile
  // response. This keeps authentication itself out of the fixture.
  await loginAsStudent(page);

  await page.route('**/rest/v1/profiles**', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
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

  await page.route('**/rest/v1/notifications**', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fulfill({ status: 204, body: '' });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{
        id: 'sprint-c-visual-fixture',
        user_id: 'read-only-fixture',
        title: 'Visual verification',
        message: 'Unread badge layout fixture',
        notification_type: 'announcement',
        is_read: false,
        created_at: '2026-10-08T00:00:00.000Z',
      }]),
    });
  });

  await page.goto('/admin-dashboard');
  await page.waitForURL('**/admin-dashboard**', { timeout: 30_000 });
  await appReady(page);
  await expect(page.locator('.notification-badge')).toBeVisible();
}

async function verifyHeader(page, width, theme) {
  await page.setViewportSize({ width, height: 900 });
  await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(width);

  const logo = page.locator('.nav-logo > img');
  const brand = page.locator('.nav-logo');
  const actions = page.locator('.nav-actions');
  const nav = page.locator('.dashboard-shell nav');
  const menu = page.getByRole('button', { name: 'Open navigation' });
  const bell = page.getByRole('button', { name: 'Notifications' });
  const bellIcon = bell.locator('svg');
  const badge = bell.locator('.notification-badge');
  const themeButton = page.getByRole('button', { name: /Switch to (Light|Dark) Mode/ });

  await expect(logo).toHaveAttribute('src', '/EduScribeLogoIcon.png');
  await expect(page.locator('.nav-logo .eduscribe-flip')).toHaveCount(0);
  await expect(bell).toBeVisible();
  await expect(badge).toBeVisible();
  if (width < 1024) {
    await expect(menu).toBeVisible();
    await expect.poll(() => page.locator('#admin-sidebar').evaluate((el) =>
      Math.round(el.getBoundingClientRect().right))).toBeLessThanOrEqual(0);
  } else {
    await expect(menu).toBeHidden();
  }

  const boxes = await Promise.all([
    nav.boundingBox(),
    brand.boundingBox(),
    actions.boundingBox(),
    logo.boundingBox(),
    bell.boundingBox(),
    bellIcon.boundingBox(),
    badge.boundingBox(),
    themeButton.boundingBox(),
  ]);
  const [navBox, brandBox, actionsBox, logoBox, bellBox, iconBox, badgeBox, themeBox] = boxes;

  expect(Math.round(navBox.height), `${theme} ${width}: header height`).toBe(76);
  expect(brandBox.x + brandBox.width, `${theme} ${width}: brand overlaps actions`).toBeLessThanOrEqual(actionsBox.x);
  expect(actionsBox.height, `${theme} ${width}: header actions wrapped`).toBeLessThanOrEqual(44);
  expect(Math.round(logoBox.width), `${theme} ${width}: static logo width`).toBe(64);
  expect(Math.round(logoBox.height), `${theme} ${width}: static logo height`).toBe(64);
  expect(bellBox.width, `${theme} ${width}: notification target width`).toBeGreaterThanOrEqual(44);
  expect(bellBox.height, `${theme} ${width}: notification target height`).toBeGreaterThanOrEqual(44);
  expect(badgeBox.x, `${theme} ${width}: badge overlaps bell glyph`).toBeGreaterThanOrEqual(iconBox.x + iconBox.width);
  expect(badgeBox.x + badgeBox.width, `${theme} ${width}: badge overlaps theme control`).toBeLessThanOrEqual(themeBox.x);
  expect(badgeBox.x, `${theme} ${width}: badge is clipped left`).toBeGreaterThanOrEqual(0);
  expect(badgeBox.x + badgeBox.width, `${theme} ${width}: badge is clipped right`).toBeLessThanOrEqual(width);

  const overflow = await page.evaluate(() => ({
    body: document.documentElement.scrollWidth - window.innerWidth,
    nav: document.querySelector('.dashboard-shell nav').scrollWidth
      - document.querySelector('.dashboard-shell nav').clientWidth,
  }));
  expect(overflow.body, `${theme} ${width}: body overflow`).toBeLessThanOrEqual(0);
  expect(overflow.nav, `${theme} ${width}: header overflow`).toBeLessThanOrEqual(0);
}

test('Admin header stays aligned with a static logo and separated unread badge', async ({ page }, testInfo) => {
  await page.addInitScript(() => localStorage.setItem('smartedu-theme', 'light'));
  await openReadOnlyAdminShell(page);

  for (const width of WIDTHS) await verifyHeader(page, width, 'light');
  await testInfo.attach('light-1440', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  await verifyHeader(page, 360, 'light');
  await testInfo.attach('light-360', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });

  await page.getByRole('button', { name: 'Switch to Dark Mode' }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  for (const width of WIDTHS) await verifyHeader(page, width, 'dark');
  await testInfo.attach('dark-1440', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  await verifyHeader(page, 360, 'dark');
  await testInfo.attach('dark-360', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });

  // The dropdown remains inside the narrow viewport; notification behavior
  // itself is unchanged and its PATCH is intercepted above to keep this test
  // read-only.
  await page.getByRole('button', { name: 'Notifications' }).click();
  const panel = page.locator('.admin-notification-bell > div.absolute');
  await expect(panel).toBeVisible();
  await testInfo.attach('dark-360-notifications', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
  const panelBox = await panel.boundingBox();
  expect(panelBox.x).toBeGreaterThanOrEqual(0);
  expect(panelBox.x + panelBox.width).toBeLessThanOrEqual(360);
  expect(await page.evaluate(() => window.scrollX), 'opening notifications shifted the viewport').toBe(0);
  expect(await page.locator('.dashboard-shell nav').evaluate((el) => el.scrollWidth - el.clientWidth),
    'opening notifications overflowed the header').toBeLessThanOrEqual(0);
  const [openMenu, openBrand, openActions] = await Promise.all([
    page.getByRole('button', { name: 'Open navigation' }).boundingBox(),
    page.locator('.nav-logo').boundingBox(),
    page.locator('.nav-actions').boundingBox(),
  ]);
  expect(openMenu.x, 'opening notifications clipped the menu').toBeGreaterThanOrEqual(0);
  expect(openBrand.x, 'opening notifications clipped the brand').toBeGreaterThanOrEqual(openMenu.x + openMenu.width);
  expect(openBrand.x + openBrand.width, 'opening notifications overlapped header actions').toBeLessThanOrEqual(openActions.x);
  expect(openActions.x + openActions.width, 'opening notifications clipped header actions').toBeLessThanOrEqual(360);
});

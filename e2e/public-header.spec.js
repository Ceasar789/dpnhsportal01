// The four public pages share one header component.
//
// It used to be copy-pasted into each of them, which is why the same fix kept
// being applied four times — and why rebuilding it on Home alone left News,
// Calendar and Login with a hamburger and a 90px bar while Home had neither.
import { test, expect } from '@playwright/test';

const PAGES = [['/', 'Home'], ['/news', 'News'], ['/calendar', 'Calendar'], ['/login', null]];

for (const [path, active] of PAGES) {
  test(`${path} carries the shared header on a phone`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(path);
    await page.waitForLoadState('networkidle');

    // No hamburger: the destinations stay on screen.
    await expect(page.getByRole('button', { name: 'Toggle navigation menu' })).toHaveCount(0);

    // The brand says what site this is, which a seal alone did not.
    await expect(page.getByRole('button', { name: 'EduScribe home' })).toHaveCount(1);

    for (const name of ['Home', 'News', 'Calendar']) {
      await expect(page.locator('nav').getByRole('button', { name, exact: true })).toHaveCount(1);
    }

    // Login is offered everywhere except the login page, where it would
    // point at the page the visitor is already reading.
    await expect(page.locator('nav').getByRole('button', { name: 'Login', exact: true }))
      .toHaveCount(path === '/login' ? 0 : 1);

    const nav = await page.locator('nav').boundingBox();
    expect(Math.round(nav.height), 'every page must use the same header height').toBe(124);

    const current = page.locator('nav [aria-current="page"]');
    if (active) await expect(current).toHaveText(active);
    else await expect(current).toHaveCount(0);
  });
}

test('the header is one component, not four copies', async ({ page }) => {
  // Desktop keeps its own height, and it must be the same on every page too.
  for (const [path] of PAGES) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    const nav = await page.locator('nav').boundingBox();
    expect(Math.round(nav.height), `${path} desktop header height`).toBe(90);
  }
});

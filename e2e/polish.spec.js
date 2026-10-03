// Navigation polish on the public pages.
//
// The route fade already existed; what did not was a transition on the pages'
// own surfaces, and a scroll reset. Leaving a scrolled /news for /calendar
// opened the calendar halfway down itself.
import { test, expect } from '@playwright/test';
import { appReady } from './helpers.js';

const PUBLIC = ['/', '/news', '/calendar', '/login'];

test.describe('public navigation', () => {
  for (const path of PUBLIC) {
    test(`${path} animates its surfaces instead of snapping`, async ({ page }) => {
      await page.goto(path);
      await appReady(page);

      const shell = page.locator('.public-shell');
      await expect(shell).toHaveCount(1);

      const duration = await shell.evaluate((el) => getComputedStyle(el).transitionDuration);
      expect(duration, `${path} has no transition on its shell`).not.toBe('0s');
    });
  }

  test('a route change starts the new page at the top', async ({ page }) => {
    await page.goto('/news');
    await appReady(page);

    await page.evaluate(() => window.scrollTo(0, 1200));
    // Only meaningful if the page is actually long enough to scroll.
    const scrolled = await page.evaluate(() => window.scrollY);
    test.skip(scrolled === 0, 'the news page is shorter than the viewport here');

    await page.getByRole('link', { name: 'Calendar' }).first().click();
    await expect(page).toHaveURL(/\/calendar/);
    await appReady(page);

    expect(await page.evaluate(() => window.scrollY), 'the calendar opened mid-page').toBe(0);
  });

  test('the footer no longer repeats the header navigation', async ({ page }) => {
    await page.goto('/');
    await appReady(page);

    const footer = page.locator('footer');
    await expect(footer.getByText('NAVIGATION')).toHaveCount(0);
    for (const label of ['Home', 'News', 'Calendar']) {
      await expect(footer.getByRole('link', { name: label, exact: true }),
        `the footer still links to ${label}`).toHaveCount(0);
    }
    // The header is where navigation lives, and it still does.
    const header = page.getByRole('navigation');
    for (const label of ['Home', 'News', 'Calendar']) {
      await expect(header.getByRole('link', { name: label, exact: true })).toHaveCount(1);
    }
    // Faculty Portal is a shortcut, not navigation, and it is a real link now.
    await expect(footer.getByRole('link', { name: 'Faculty Portal' }))
      .toHaveAttribute('href', '/faculty-login');
  });
});

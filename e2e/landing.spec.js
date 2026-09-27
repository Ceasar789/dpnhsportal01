// The public landing pages: Home, News, Calendar and the portal chooser.
//
// These guard the accessibility pass - named carousel controls, a pausable
// slideshow, real footer navigation and no emoji standing in for icons. The
// carousel z-index fix came out of this file: the controls were being
// swallowed by the hero overlay and no one had noticed.
import { test, expect } from '@playwright/test';

const PAGES = [['/', 'Home'], ['/news', 'News'], ['/calendar', 'Calendar'], ['/login', 'Login']];

for (const [path, name] of PAGES) {
  test(`${name} renders with no console error and no dead nav`, async ({ page }) => {
    const errors = [];
    page.on('console', m => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', e => errors.push(String(e)));

    await page.goto(path);
    await page.waitForLoadState('networkidle');

    // The page actually painted something.
    await expect(page.locator('footer')).toBeVisible();

    // Every emoji-as-icon is gone.
    const body = await page.locator('body').innerText();
    for (const glyph of ['📍', '📞', '✉']) {
      expect(body, `${name} still renders ${glyph}`).not.toContain(glyph);
    }

    // Faculty Portal is a real link, not a <p> tag and not a button that
    // cannot be opened in a new tab.
    await expect(page.getByRole('link', { name: 'Faculty Portal' })).toBeVisible();

    expect(errors, `${name} console errors:\n${errors.join('\n')}`).toEqual([]);
  });
}

test('Home carousel controls are named and pausable', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: /Show slide 1 of/ })).toBeVisible();
  const pause = page.getByRole('button', { name: /Pause the slideshow/ });
  await expect(pause).toBeVisible();
  await pause.click();
  await expect(page.getByRole('button', { name: /Resume the slideshow/ })).toBeVisible();
});

test('Calendar month controls have accessible names', async ({ page }) => {
  await page.goto('/calendar');
  await expect(page.getByRole('button', { name: 'Previous month' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Next month' })).toBeVisible();
});

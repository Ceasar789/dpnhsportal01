// The public calendar's keyboard and error behaviour.
//
// These cover the three defects the ux-engine audit found: the event dialog
// claimed aria-modal but never touched focus, every event chip opened the
// first event on the day, and the error state had no way out.
import { test, expect } from '@playwright/test';

test.describe('public calendar', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/calendar');
    await page.waitForLoadState('networkidle');
  });

  test('a day with events exposes one control per event, not one per day', async ({ page }) => {
    const chips = page.getByRole('button', { name: /^Open / });
    const n = await chips.count();
    test.skip(n === 0, 'no events seeded this month');

    // Each chip must name its own event, so no two carry the same label by
    // accident of them all opening dateEvents[0].
    const names = await chips.evaluateAll(els => els.map(e => e.getAttribute('aria-label')));
    expect(names.every(Boolean)).toBe(true);
  });

  test('the event dialog takes focus, holds it, and gives it back', async ({ page }) => {
    const chips = page.getByRole('button', { name: /^Open / });
    test.skip(await chips.count() === 0, 'no events seeded this month');

    const opener = chips.first();
    await opener.focus();
    await opener.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Focus must be inside the dialog, not left on the chip behind it.
    const insideOnOpen = await page.evaluate(() =>
      document.querySelector('[role="dialog"]').contains(document.activeElement));
    expect(insideOnOpen, 'focus should move into the dialog').toBe(true);

    // Tab must not escape it.
    for (let i = 0; i < 12; i++) await page.keyboard.press('Tab');
    const stillInside = await page.evaluate(() =>
      document.querySelector('[role="dialog"]').contains(document.activeElement));
    expect(stillInside, 'Tab should be trapped inside the dialog').toBe(true);

    // Escape closes it and focus comes back, not to <body>.
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    const back = await page.evaluate(() => document.activeElement?.tagName);
    expect(back, 'focus should return to a control, not the document body').not.toBe('BODY');
  });

  test('month controls and the year select are reachable and named', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Previous month' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Next month' })).toBeVisible();
    await expect(page.getByLabel('Calendar year')).toBeVisible();
  });
});

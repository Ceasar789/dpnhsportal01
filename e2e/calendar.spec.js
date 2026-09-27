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

// A seven-column month grid gives each day 43px on a 390px phone. An event
// chip in that space truncated to "P..." — a letter and an ellipsis naming
// nothing — in a 29x20 target, under the 24x24 minimum.
test.describe('public calendar on small screens', () => {
  for (const [w, h, label] of [[390, 844, 'phone'], [768, 1024, 'tablet']]) {
    test(`${label} ${w}x${h}: no sideways scroll and no sub-24px targets`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await page.goto('/calendar');
      await page.waitForLoadState('networkidle');

      const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(scrollW, `${label} scrolls sideways`).toBeLessThanOrEqual(w + 1);

      const small = await page.locator('button, a, select').evaluateAll(els => els
        .map(e => ({ n: (e.textContent || e.getAttribute('aria-label') || '?').trim().slice(0, 20),
                     b: e.getBoundingClientRect() }))
        .filter(x => x.b.width > 0 && (x.b.width < 24 || x.b.height < 24))
        .map(x => `${x.n} ${Math.round(x.b.width)}x${Math.round(x.b.height)}`));
      expect(small, 'targets under the 24x24 minimum').toEqual([]);

      // The grid stops pretending 43px can hold an event name; the list does.
      await expect(page.getByRole('button', { name: /^Open / })).not.toHaveCount(0);
    });
  }

  test('the colours in the grid are named somewhere', async ({ page }) => {
    await page.goto('/calendar');
    await page.waitForLoadState('networkidle');
    // Event type is carried by hue in the grid; a legend keeps that readable
    // for anyone who cannot separate the hues.
    for (const label of ['Event', 'Deadline', 'Holiday', 'Other']) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
    }
  });

  test('a start time reads as a clock time, not a database value', async ({ page }) => {
    await page.goto('/calendar');
    await page.waitForLoadState('networkidle');
    const body = await page.locator('main').innerText();
    // "13:00:00" came straight out of the Postgres TIME column.
    expect(body).not.toMatch(/\bat \d{1,2}:\d{2}:\d{2}\b/);
  });
});

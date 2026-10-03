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

// P2 — one focus ring per field, not two concentric ones.
test.describe('focused fields', () => {
  test.skip(!hasAdminCredentials, ADMIN_SKIP_REASON);

  test('wear a single ring', async ({ page }) => {
    await loginAsAdmin(page);
    await openAdminTab(page, 'Sections');
    await page.getByRole('button', { name: /Add Section/ }).first().click();

    const field = page.locator('[role=dialog] input').first();
    await field.focus();
    const ring = await field.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { offset: cs.outlineOffset, width: cs.outlineWidth, border: cs.borderTopColor };
    });
    // The offset is what separated the outline from the accent border.
    expect(ring.offset, 'the ring is still floating off the field').toBe('0px');
    expect(parseFloat(ring.width), 'the ring went away entirely').toBeGreaterThan(0);
  });
});

// P3 — a multi-day event says which span it belongs to.
test.describe('the agenda', () => {
  test.skip(!hasAdminCredentials, ADMIN_SKIP_REASON);

  test('names the span on every day a multi-day event covers', async ({ page }) => {
    await loginAsAdmin(page);
    await page.setViewportSize({ width: 360, height: 780 });
    await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(360);
    await openAdminTab(page, 'Calendar');
    await expect(page.locator('.cal-agenda')).toBeVisible();

    const ranges = page.locator('.cal-agenda-range');
    const n = await ranges.count();
    test.skip(n === 0, 'no multi-day events this month — nothing to span');

    // Whatever the locale renders, a span is two dates with a dash.
    for (let i = 0; i < Math.min(n, 4); i++) {
      await expect(ranges.nth(i)).toContainText('–');
    }

    // A single-day entry says nothing, because there is nothing to say.
    const single = await page.locator('.cal-agenda-item').evaluateAll((els) =>
      els.filter((el) => !el.querySelector('.cal-agenda-range')).length);
    expect(single + n, 'some entries are neither').toBe(await page.locator('.cal-agenda-item').count());

    // And it never pushes the entry past the edge of the phone.
    for (let i = 0; i < Math.min(n, 4); i++) {
      const b = await ranges.nth(i).boundingBox();
      expect(Math.round(b.x + b.width)).toBeLessThanOrEqual(360);
    }
  });
});

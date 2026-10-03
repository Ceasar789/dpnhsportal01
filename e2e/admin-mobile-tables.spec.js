// A table wider than a phone must be reachable, not merely present.
//
// Phase 4d's spacing rounding widened two tables that were already too
// wide at 360, and the review spotted that the Sections Actions column had
// gone entirely off screen. The measurement behind this test is why that
// mattered: `.table-card` was `overflow: hidden`, so the row actions were
// not scrolled off — they were CLIPPED, and no amount of swiping brought
// them back.
//
// The e2e suite had not noticed because Playwright's
// scrollIntoViewIfNeeded() scrolls an overflow:hidden box perfectly well.
// Programmatic scrolling is not the thing a person does with a thumb, so
// this test asserts the property a person depends on: that the container
// can actually be scrolled, and that the control lands inside the viewport
// and takes a real click.
import { test, expect } from '@playwright/test';
import { ADMIN_SKIP_REASON, hasAdminCredentials, loginAsAdmin, openAdminTab } from './helpers.js';

const PHONE = { width: 360, height: 780 };

test.describe('wide tables on a phone', () => {
  test.skip(!hasAdminCredentials, ADMIN_SKIP_REASON);

  for (const tab of ['Sections', 'Subjects', 'User Management']) {
    test(`${tab}: the row actions can be scrolled to and clicked`, async ({ page }) => {
      await loginAsAdmin(page);
      await page.setViewportSize(PHONE);
      await openAdminTab(page, tab);

      const card = page.locator('.table-card').first();
      await expect(card).toBeVisible();

      const geometry = await card.evaluate((el) => ({
        overflowX: getComputedStyle(el).overflowX,
        clientWidth: el.clientWidth,
        scrollWidth: el.scrollWidth,
      }));

      // Only meaningful where the table really is wider than the card.
      test.skip(geometry.scrollWidth <= geometry.clientWidth + 1,
        `${tab} fits at 360 — nothing to scroll`);

      // The property a thumb depends on. `hidden` would fail here.
      expect(geometry.overflowX, 'the card clips instead of scrolling').toBe('auto');

      const action = page.locator('.table-card .icon-action').last();
      await expect(action).toBeVisible();

      // Scroll the way a person does — the container, not the element.
      await card.evaluate((el) => { el.scrollLeft = el.scrollWidth; });
      await expect.poll(async () => {
        const box = await action.boundingBox();
        return box ? Math.round(box.x + box.width) : 0;
      }, { message: 'the action never came inside the viewport' })
        .toBeLessThanOrEqual(PHONE.width);

      // And it is a real target once it is there, not an overlapped one.
      const box = await action.boundingBox();
      expect(box.x, 'the action sits off the left edge instead').toBeGreaterThanOrEqual(0);
      expect(box.width).toBeGreaterThanOrEqual(24);
      expect(box.height).toBeGreaterThanOrEqual(24);

      // A click that lands without force is the whole point.
      await action.click({ trial: true });
    });
  }
});

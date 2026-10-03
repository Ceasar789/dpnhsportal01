// Rules X4, X6, X7, RD4, CAL4 — forms, modals and the calendar on a phone.
//
// Same discipline as batch B: measure rectangles and ask the browser what
// is on top, rather than trusting that the right class is present.
import { test, expect } from '@playwright/test';
import { ADMIN_SKIP_REASON, hasAdminCredentials, loginAsAdmin, openAdminTab } from './helpers.js';

const PHONE = { width: 360, height: 780 };

async function phone(page) {
  await page.setViewportSize(PHONE);
  await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(PHONE.width);
}

test.describe('modals on a phone', () => {
  test.skip(!hasAdminCredentials, ADMIN_SKIP_REASON);

  const FORMS = [
    ['Subjects', /Add Subject/],
    ['Sections', /Add Section/],
    ['News Management', /New Post/],
    ['Calendar', /Add Event/],
    ['Memos', /Compose/],
  ];

  for (const [tab, opener] of FORMS) {
    test(`${tab}: the form is a sheet, its footer stays put, its body scrolls`, async ({ page }) => {
      await loginAsAdmin(page);
      await phone(page);
      await openAdminTab(page, tab);
      await page.getByRole('button', { name: opener }).first().click();

      const card = page.locator('.ux-modal').first();
      await expect(card).toBeVisible();

      // X6/RD4: it sits on the bottom edge, full width, and only the top
      // corners are rounded — an edge touching the screen has no radius.
      const box = await card.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return {
          left: Math.round(r.left), right: Math.round(r.right),
          bottom: Math.round(r.bottom), top: Math.round(r.top),
          topLeft: cs.borderTopLeftRadius, bottomLeft: cs.borderBottomLeftRadius,
        };
      });
      expect(box.left, 'the sheet is inset from the left').toBe(0);
      expect(box.right, 'the sheet does not reach the right edge').toBe(PHONE.width);
      expect(box.bottom, 'the sheet does not sit on the bottom edge').toBe(PHONE.height);
      expect(box.top, 'the sheet starts above the screen').toBeGreaterThanOrEqual(0);
      expect(parseFloat(box.topLeft), 'the top corners are square').toBeGreaterThan(0);
      expect(parseFloat(box.bottomLeft), 'a corner on the screen edge is rounded').toBe(0);

      // The body is what scrolls, not the card.
      const body = page.locator('.ux-modal-body').first();
      expect(await body.evaluate((el) => getComputedStyle(el).overflowY)).toBe('auto');

      // And the footer is reachable without hunting for it: scroll the
      // body to the end and the actions are still on screen.
      const footer = page.locator('.ux-modal-footer').first();
      await body.evaluate((el) => { el.scrollTop = el.scrollHeight; });
      await page.waitForTimeout(200);
      const fb = await footer.boundingBox();
      expect(Math.round(fb.y + fb.height),
        'the action footer scrolled off the bottom').toBeLessThanOrEqual(PHONE.height + 1);

      // Unobstructed: the browser agrees the primary action is on top.
      const primary = footer.locator('.btn-primary').first();
      if (await primary.count()) {
        const pb = await primary.boundingBox();
        const at = await page.evaluate(([x, y]) => {
          const el = document.elementFromPoint(x, y);
          return el?.tagName + '.' + String(el?.className || '').slice(0, 40);
        }, [pb.x + pb.width / 2, pb.y + pb.height / 2]);
        expect(at, 'the primary action is covered').toContain('BUTTON');
      }
    });
  }
});

test.describe('the calendar on a phone', () => {
  test.skip(!hasAdminCredentials, ADMIN_SKIP_REASON);

  test('CAL4: the month is an agenda below 768 and a grid above it', async ({ page }) => {
    await loginAsAdmin(page);

    await phone(page);
    await openAdminTab(page, 'Calendar');
    await expect(page.locator('.cal-agenda')).toBeVisible();
    await expect(page.locator('.cal-grid')).toBeHidden();

    const days = page.locator('.cal-agenda-day');
    const n = await days.count();
    test.skip(n === 0, 'no events this month — nothing to group');

    // Grouped by day, and only days that have something.
    for (let i = 0; i < Math.min(n, 4); i++) {
      await expect(days.nth(i).locator('.cal-agenda-date')).toBeVisible();
      expect(await days.nth(i).locator('.cal-agenda-item').count(),
        'a day heading with no events under it').toBeGreaterThan(0);
    }

    // Every entry is a real target, fully on screen.
    const items = page.locator('.cal-agenda-item');
    for (let i = 0; i < Math.min(await items.count(), 5); i++) {
      const b = await items.nth(i).boundingBox();
      expect(b.height, 'an agenda entry is too short to tap').toBeGreaterThanOrEqual(44);
      expect(Math.round(b.x + b.width)).toBeLessThanOrEqual(PHONE.width + 1);
      expect(b.x).toBeGreaterThanOrEqual(0);
    }

    // Tapping one opens its event.
    await items.first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');

    // Above the breakpoint the grid is back.
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(1440);
    await expect(page.locator('.cal-grid')).toBeVisible();
    await expect(page.locator('.cal-agenda')).toBeHidden();
  });
});

test.describe('settings and long text on a phone', () => {
  test.skip(!hasAdminCredentials, ADMIN_SKIP_REASON);

  test('X4: the label sits above its control', async ({ page }) => {
    await loginAsAdmin(page);
    await phone(page);
    await openAdminTab(page, 'System Settings');

    const row = page.locator('.settings-input-row').first();
    expect(await row.evaluate((el) => getComputedStyle(el).flexDirection)).toBe('column');

    // Above, not beside: the label's bottom is at or above the control's top.
    const geom = await row.evaluate((el) => {
      const label = el.querySelector('.settings-input-label').getBoundingClientRect();
      const field = el.querySelector('input, select').getBoundingClientRect();
      return { labelBottom: label.bottom, fieldTop: field.top, fieldWidth: field.width };
    });
    expect(geom.labelBottom).toBeLessThanOrEqual(geom.fieldTop + 1);
    // And the field uses the width the label is no longer taking.
    expect(geom.fieldWidth).toBeGreaterThan(PHONE.width * 0.7);
  });

  test('X7: clipped text still says what it is', async ({ page }) => {
    await loginAsAdmin(page);
    await phone(page);
    await openAdminTab(page, 'Calendar');

    const clipped = await page.locator('.truncate-1').evaluateAll((els) => els
      .filter((e) => e.offsetParent !== null && e.scrollWidth > e.clientWidth + 1)
      .map((e) => ({ text: e.textContent.trim().slice(0, 20), title: e.getAttribute('title') })));

    // Nothing that is cut off may be cut off silently.
    expect(clipped.filter((c) => !c.title), 'text clipped with no title to reveal it').toEqual([]);
  });
});

// D3 — the app behind a sheet is not just hidden, it is gone.
//
// At 360 the section form is a bottom sheet with a scrim over the rest of
// the page. Sampling the pixels proved the scrim really does cover and dim
// the app header (navy #003b7a became #001831, exactly 40% of it), so this
// was never a paint-order bug. It was an interaction bug: the header sits
// in its own stacking context, so `elementFromPoint` over it returned the
// header's own button, and a tap there went to the app, not the scrim.
//
// `inert` is what removes a subtree from hit-testing, from focus and from
// the accessibility tree at once — a focus trap alone only covers Tab.
test.describe('the page behind a modal', () => {
  test.skip(!hasAdminCredentials, ADMIN_SKIP_REASON);

  test('is inert while the sheet is open, and live again after', async ({ page }) => {
    await loginAsAdmin(page);
    await phone(page);
    await openAdminTab(page, 'Sections');

    const header = page.locator('.dashboard-shell nav').first();
    expect(await header.evaluate((el) => el.inert), 'inert before anything opened').toBeFalsy();

    await page.getByRole('button', { name: /Add Section/ }).first().click();
    await expect(page.locator('.ux-modal').first()).toBeVisible();

    // The shell around the dialog is out of reach.
    expect(await header.evaluate((el) => el.inert), 'the header is still live').toBe(true);
    expect(await page.locator('.sidebar').evaluate((el) => el.inert)).toBe(true);

    // Including to the pointer: a tap on the header lands on the scrim.
    const hb = await header.boundingBox();
    const hit = await page.evaluate(([x, y]) => {
      const el = document.elementFromPoint(x, y);
      return el?.closest('.modal-overlay') ? 'overlay' : `${el?.tagName}.${String(el?.className || '').slice(0, 30)}`;
    }, [hb.x + hb.width / 2, hb.y + hb.height / 2]);
    expect(hit, 'a tap over the header reaches the app behind the sheet').toBe('overlay');

    // And nothing outside the dialog can be tabbed to.
    const outside = await page.evaluate(() => {
      const dialog = document.querySelector('[role=dialog]');
      return [...document.querySelectorAll('button, a[href], input, select, textarea')]
        .filter((el) => !dialog.contains(el) && el.offsetParent !== null)
        .filter((el) => !el.closest('[inert]')).length;
    });
    expect(outside, 'focusable controls are still reachable behind the sheet').toBe(0);

    await page.keyboard.press('Escape');
    await expect(page.locator('.ux-modal')).toHaveCount(0);
    expect(await header.evaluate((el) => el.inert), 'the page stayed inert after closing').toBeFalsy();
  });
});

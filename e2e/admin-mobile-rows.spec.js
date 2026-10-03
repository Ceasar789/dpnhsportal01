// Rules R1, R2, R5, R6 — tables on a phone.
//
// Written against the lesson from batch A, where eight behavioural tests
// passed on a drawer whose first 76px was painted behind the header: these
// assert that things are ON SCREEN AND UNOBSTRUCTED, not merely that the
// right handlers fire. Every check below either measures a rectangle
// against the viewport or asks the browser what element is actually at a
// point.
import { test, expect } from '@playwright/test';
import { ADMIN_SKIP_REASON, hasAdminCredentials, loginAsAdmin, openAdminTab } from './helpers.js';

const PHONE = { width: 360, height: 780 };
const DESKTOP = { width: 1440, height: 900 };

const TABLES = [
  { tab: 'User Management', identity: 'E2E Test Admin' },
  { tab: 'Subjects', identity: null },
  { tab: 'Sections', identity: null },
];

async function phone(page) {
  await page.setViewportSize(PHONE);
  await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(PHONE.width);
}

/** What the browser says is actually at the centre of this element. */
async function topmostAt(page, locator) {
  const box = await locator.boundingBox();
  if (!box) return { covered: true, why: 'no box' };
  const x = box.x + box.width / 2;
  const y = box.y + Math.min(box.height / 2, 20);
  return page.evaluate(([px, py]) => {
    const el = document.elementFromPoint(px, py);
    return { tag: el?.tagName, cls: String(el?.className || '').slice(0, 60) };
  }, [x, y]);
}

test.describe('tables on a phone', () => {
  test.skip(!hasAdminCredentials, ADMIN_SKIP_REASON);

  for (const { tab } of TABLES) {
    test(`${tab}: rows fit the screen and nothing is clipped`, async ({ page }) => {
      await loginAsAdmin(page);
      await phone(page);
      await openAdminTab(page, tab);

      const card = page.locator('.table-card').first();
      await expect(card).toBeVisible();

      const rows = page.locator('.table-card tbody tr');
      await expect(rows.first()).toBeVisible();

      // 1. The card itself no longer needs to scroll sideways. The
      //    overflow-x stopgap stays as a fallback, but it must not be the
      //    layout: before this batch the Actions column sat entirely
      //    outside the card at 360.
      const geom = await card.evaluate((el) => ({
        client: el.clientWidth, scroll: el.scrollWidth,
      }));
      expect(geom.scroll - geom.client,
        `${tab} still needs horizontal scrolling to show a row`).toBeLessThanOrEqual(1);

      // 2. Every visible cell sits inside the viewport.
      const outside = await page.locator('.table-card tbody td').evaluateAll((els, vw) => els
        .filter((e) => e.offsetParent !== null)
        .map((e) => ({ r: e.getBoundingClientRect(), t: (e.textContent || '').trim().slice(0, 24) }))
        .filter((x) => x.r.width > 0 && (x.r.right > vw + 1 || x.r.left < -1))
        .map((x) => `${x.t} @${Math.round(x.r.left)}..${Math.round(x.r.right)}`), PHONE.width);
      expect(outside, `${tab} cells painted outside the viewport`).toEqual([]);

      // 3. Two lines, not five columns: the header is gone and the row is
      //    a grid rather than a table-row.
      await expect(page.locator('.table-card thead')).toBeHidden();
      const display = await rows.first().evaluate((el) => getComputedStyle(el).display);
      expect(display, 'the row did not restack').toBe('grid');
    });
  }

  test('a row opens a sheet holding the columns it dropped, and its actions', async ({ page }) => {
    await loginAsAdmin(page);
    await phone(page);
    await openAdminTab(page, 'Sections');

    const row = page.locator('.table-card tbody tr').first();
    await expect(row).toHaveAttribute('role', 'button');
    const name = (await row.locator('td[data-cell="identity"]').innerText()).trim();

    // The adviser and capacity cells are hidden on the row...
    await expect(row.locator('td[data-cell="detail"]').first()).toBeHidden();
    // ...and so are the actions, which is why the sheet has to exist.
    await expect(row.locator('td[data-cell="actions"]')).toBeHidden();

    await row.click();
    const sheet = page.getByRole('dialog');
    await expect(sheet).toBeVisible();
    await expect(sheet).toContainText(name);

    // The dropped columns are here, by label.
    for (const label of ['Adviser', 'Capacity', 'Grade level']) {
      await expect(sheet.getByText(label, { exact: true })).toBeVisible();
    }

    // And the row's actions are reachable, as real targets.
    for (const action of ['Class list', 'Edit', 'Delete']) {
      const button = sheet.getByRole('button', { name: action, exact: true });
      await expect(button).toBeVisible();
      const box = await button.boundingBox();
      expect(box.width, `${action} is too narrow to tap`).toBeGreaterThanOrEqual(44);
      expect(box.height, `${action} is too short to tap`).toBeGreaterThanOrEqual(24);
      // Unobstructed: the browser agrees this button is what is on top.
      const at = await topmostAt(page, button);
      expect(at.tag, `${action} is covered by ${at.tag}.${at.cls}`).toBe('BUTTON');
    }

    // The sheet is on screen, not half off the bottom.
    const card = page.locator('.ux-modal, .modal').first();
    const box = await card.boundingBox();
    expect(box.y, 'the sheet starts above the viewport').toBeGreaterThanOrEqual(0);
    expect(Math.round(box.y + box.height),
      'the sheet runs past the bottom of the screen').toBeLessThanOrEqual(PHONE.height + 1);
  });

  test('keyboard reaches the sheet too, and Escape comes back', async ({ page }) => {
    await loginAsAdmin(page);
    await phone(page);
    await openAdminTab(page, 'Subjects');

    const row = page.locator('.table-card tbody tr').first();
    await row.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(row).toBeFocused();
  });

  test('on desktop the table is still a table', async ({ page }) => {
    await loginAsAdmin(page);
    await page.setViewportSize(DESKTOP);
    await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(DESKTOP.width);
    await openAdminTab(page, 'Sections');

    await expect(page.locator('.table-card thead')).toBeVisible();
    const row = page.locator('.table-card tbody tr').first();
    expect(await row.evaluate((el) => getComputedStyle(el).display)).toBe('table-row');
    // No role=button: a desktop row is not a control.
    await expect(row).not.toHaveAttribute('role', 'button');
    // The actions are back on the row where there is space for them.
    await expect(row.locator('td[data-cell="actions"]')).toBeVisible();
  });
});

test.describe('pickers on a phone', () => {
  test.skip(!hasAdminCredentials, ADMIN_SKIP_REASON);

  test('Teaching Load: the builder stacks and nothing leaves the screen', async ({ page }) => {
    await loginAsAdmin(page);
    await phone(page);
    await openAdminTab(page, 'Teaching Load');

    const grid = page.locator('.bulk-grid');
    await expect(grid).toBeVisible();
    expect(await grid.evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length),
      'the builder is still two columns').toBe(1);

    const outside = await page.locator('.bulk-grid *, .grade-tabs, .toolbar *').evaluateAll((els, vw) => els
      .filter((e) => e.offsetParent !== null)
      .map((e) => ({ r: e.getBoundingClientRect(), n: e.className || e.tagName }))
      .filter((x) => x.r.width > 0 && x.r.right > vw + 1)
      .map((x) => `${String(x.n).slice(0, 30)} +${Math.round(x.r.right - vw)}px`), PHONE.width);
    expect([...new Set(outside)], 'parts of the builder are off the right edge').toEqual([]);
  });

  test('Schedules: the grade strip and section picker are usable at 360', async ({ page }) => {
    await loginAsAdmin(page);
    await phone(page);
    await openAdminTab(page, 'Schedules');

    // The strip scrolls itself rather than widening the page.
    const strip = page.locator('.grade-tabs');
    await expect(strip).toBeVisible();
    const s = await strip.evaluate((el) => ({
      overflowX: getComputedStyle(el).overflowX,
      scrollable: el.scrollWidth > el.clientWidth,
      right: Math.round(el.getBoundingClientRect().right),
    }));
    expect(s.right, 'the grade strip itself overflows the screen').toBeLessThanOrEqual(PHONE.width + 1);
    if (s.scrollable) expect(s.overflowX, 'the strip clips its own tabs').toBe('auto');

    // Every grade is reachable by scrolling the strip, and tappable.
    const last = page.locator('.grade-tab').last();
    await last.scrollIntoViewIfNeeded();
    const box = await last.boundingBox();
    expect(box.x, 'the last grade never comes on screen').toBeGreaterThanOrEqual(-1);
    expect(Math.round(box.x + box.width)).toBeLessThanOrEqual(PHONE.width + 1);

    await expect(page.locator('.page-title')).toContainText('Schedules');
  });
});

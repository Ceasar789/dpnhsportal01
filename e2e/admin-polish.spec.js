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

// P4 — the calendar's own controls are targets you can hit.
test.describe('calendar controls', () => {
  test.skip(!hasAdminCredentials, ADMIN_SKIP_REASON);

  for (const width of [360, 768, 1440]) {
    test(`${width}: the month arrows and the Upcoming actions are 44x44`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(width);
      await loginAsAdmin(page);
      await openAdminTab(page, 'Calendar');

      const small = await page.evaluate(() => [...document.querySelectorAll('.cal-nav, .news-action')]
        .filter((el) => el.offsetParent !== null)
        .map((el) => ({ el, r: el.getBoundingClientRect() }))
        .filter(({ r }) => r.width < 44 || r.height < 44)
        .map(({ el, r }) => `${el.className.split(' ')[0]} "${el.textContent.trim().slice(0, 10)}" ${Math.round(r.width)}x${Math.round(r.height)}`));

      expect(small, 'a control smaller than a thumb').toEqual([]);
    });
  }
});

// P5 — on a phone a search field uses the row it is given.
test.describe('the News toolbar', () => {
  test.skip(!hasAdminCredentials, ADMIN_SKIP_REASON);

  test('360: search fills the row', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(360);
    await loginAsAdmin(page);
    await openAdminTab(page, 'News Management');

    const search = page.getByPlaceholder('Search articles...');
    const row = await page.locator('.toolbar').first().boundingBox();
    const box = await search.boundingBox();
    expect(Math.round(box.width), 'search is still capped on a phone')
      .toBeGreaterThanOrEqual(Math.round(row.width) - 2);
  });

  test('1440: search is still capped, not stretched across the page', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(1440);
    await loginAsAdmin(page);
    await openAdminTab(page, 'News Management');

    const box = await page.getByPlaceholder('Search articles...').boundingBox();
    expect(box.width).toBeLessThanOrEqual(281);
  });
});

// P6 — the Settings dropdowns use the row on a phone.
test.describe('Settings dropdowns', () => {
  test.skip(!hasAdminCredentials, ADMIN_SKIP_REASON);

  test('360: Theme and Session Timeout fill their row', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(360);
    await loginAsAdmin(page);
    await openAdminTab(page, 'System Settings');

    for (const label of ['Theme', 'Session Timeout']) {
      const select = page.getByLabel(label);
      const row = await select.evaluate((el) => el.parentElement.getBoundingClientRect().width);
      const box = await select.boundingBox();
      expect(Math.round(box.width), `${label} is still shrink-to-fit on a phone`)
        .toBeGreaterThanOrEqual(Math.round(row) - 2);
    }
  });

  test('1440: they stay their own size', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(1440);
    await loginAsAdmin(page);
    await openAdminTab(page, 'System Settings');

    const box = await page.getByLabel('Theme').boundingBox();
    const row = await page.getByLabel('Theme').evaluate((el) => el.parentElement.getBoundingClientRect().width);
    expect(box.width, 'the dropdown stretched across the card').toBeLessThan(row / 2);
  });
});

// P7 — a legend a reader can add up.
test.describe('Role Distribution', () => {
  test.skip(!hasAdminCredentials, ADMIN_SKIP_REASON);

  test('the percentages total 100', async ({ page }) => {
    await loginAsAdmin(page);
    await openAdminTab(page, 'Overview');

    // The pie renders a grey placeholder while the counts are in flight,
    // and an empty legend adds up to 0 without anything being wrong.
    await expect(page.locator('.role-legend-item').first()).toBeVisible();
    const shown = await page.locator('.role-legend-item strong').allTextContents();
    const total = shown.reduce((sum, t) => sum + Number(t.replace('%', '')), 0);
    expect(total, `the legend reads ${shown.join(' ')}`).toBe(100);
  });

  test('the bars and the pie use the same numbers as the legend', async ({ page }) => {
    await loginAsAdmin(page);
    await openAdminTab(page, 'Overview');

    await expect(page.locator('.role-legend-item').first()).toBeVisible();
    const legend = (await page.locator('.role-legend-item strong').allTextContents())
      .map((t) => Number(t.replace('%', '')));
    const bars = await page.locator('.role-fill').evaluateAll((els) =>
      els.map((el) => Number(el.style.width.replace('%', ''))));
    expect(bars).toEqual(legend);

    // The pie's last stop closes the circle rather than stopping at 98%.
    const stops = await page.locator('.role-pie').evaluate((el) => el.style.background);
    expect(stops, `pie: ${stops}`).toContain('100%');
  });
});

// D1/D2 again — the month grid must actually show a month.
//
// The first pass at this was wrong, and the content-overflow test agreed
// with it: .cal-grid is overflow-x: auto, so a grid 1109px wide inside a
// 562px column is a scrollable box, not a clipped one, and the test lets
// scrollable boxes hold more than they show. It was 1109px at EVERY width,
// so Thursday to Saturday were off screen on a 1440px monitor too.
//
// The cause was `repeat(7, 1fr)`, which is minmax(auto, 1fr): the tracks
// could not shrink below their content. A month view has nowhere to scroll
// to — all seven days have to be on screen — so this asserts that, rather
// than asserting that scrolling works.
test.describe('the month grid', () => {
  test.skip(!hasAdminCredentials, ADMIN_SKIP_REASON);

  for (const width of [768, 1024, 1280, 1440]) {
    test(`${width}: all seven days are on screen`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(width);
      await loginAsAdmin(page);
      await openAdminTab(page, 'Calendar');
      await expect(page.locator('.cal-grid')).toBeVisible();

      const geom = await page.evaluate(() => {
        const grid = document.querySelector('.cal-grid');
        const heads = [...document.querySelectorAll('.cal-head')];
        const right = grid.getBoundingClientRect().right;
        return {
          overflow: grid.scrollWidth - grid.clientWidth,
          headings: heads.length,
          offScreen: heads.filter((h) => h.getBoundingClientRect().right > right + 1).map((h) => h.textContent),
          narrowest: Math.min(...heads.map((h) => h.getBoundingClientRect().width)),
        };
      });

      expect(geom.headings, 'a week is seven days').toBe(7);
      expect(geom.overflow, 'the grid is wider than the space it has').toBeLessThanOrEqual(1);
      expect(geom.offScreen, 'days past the right edge of the grid').toEqual([]);
      // Narrow enough and a column cannot hold a date, which is the point
      // at which the agenda should have taken over instead.
      expect(geom.narrowest, 'a day column is too narrow to read').toBeGreaterThanOrEqual(60);
    });
  }

  // D2: the rail sits beside the grid only where there is room for both,
  // measured from the content area rather than the window — at 1024 the
  // nav sidebar returns and the area is narrower than it is at 768.
  for (const [width, beside] of [[768, false], [1024, false], [1440, true]]) {
    test(`${width}: the Upcoming rail is ${beside ? 'beside' : 'below'} the month`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(width);
      await loginAsAdmin(page);
      await openAdminTab(page, 'Calendar');

      const side = await page.evaluate(() => {
        const main = document.querySelector('.cal-main').getBoundingClientRect();
        const rail = document.querySelector('.cal-sidebar').getBoundingClientRect();
        return rail.left >= main.right - 1;
      });
      expect(side).toBe(beside);
    });
  }
});

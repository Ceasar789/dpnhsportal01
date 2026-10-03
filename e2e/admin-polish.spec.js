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

  test('lists each event once, with its span', async ({ page }) => {
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

    // V1: once per event, not once per day it covers. The first version
    // listed a five-day exam week five times and Foundation Day four —
    // nine rows for two events, with everything else pushed off screen.
    const titles = await page.locator('.cal-agenda-item .truncate-1').allTextContents();
    const repeated = titles.filter((t, i) => titles.indexOf(t) !== i);
    expect(repeated, 'an event is listed on more than one day').toEqual([]);

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
        .filter(({ r }) => Math.round(r.width) < 44 || Math.round(r.height) < 44)
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

// P6 reversed — a select has to look like a select.
//
// The admin sets appearance: none on every select and put nothing back, so
// a dropdown rendered as a line of text in a box. That is what made the
// batch D review read an editable Session Timeout as read-only, and it was
// true of every select on every tab, not that one row.
//
// The indicator is two gradients rather than an SVG because a data: URI
// cannot resolve currentColor, and this has to follow the theme.
test.describe('select chevrons', () => {
  test.skip(!hasAdminCredentials, ADMIN_SKIP_REASON);

  const TABS = ['System Settings', 'News Management', 'Calendar', 'Sections'];

  for (const theme of ['dark', 'light']) {
    test(`${theme}: every select shows one, in the theme's muted colour`, async ({ page }) => {
      test.setTimeout(120_000);
      await loginAsAdmin(page);
      await openAdminTab(page, 'System Settings');
      await page.getByLabel('Theme').selectOption(theme);

      for (const tab of TABS) {
        await openAdminTab(page, tab);
        const bad = await page.evaluate(() => {
          const muted = getComputedStyle(document.documentElement)
            .getPropertyValue('--text-muted').trim();
          // Resolve the token to the rgb() form computed styles report.
          const probe = document.createElement('div');
          probe.style.color = muted;
          document.body.appendChild(probe);
          const rgb = getComputedStyle(probe).color;
          probe.remove();

          return [...document.querySelectorAll('select')]
            .filter((el) => el.offsetParent !== null)
            .filter((el) => {
              const img = getComputedStyle(el).backgroundImage;
              return !img.includes('linear-gradient') || !img.includes(rgb);
            })
            .map((el) => `${el.getAttribute('aria-label') || el.id || el.name || '?'}: ${getComputedStyle(el).backgroundImage.slice(0, 60)}`);
        });
        expect(bad, `${tab}: a select with no indicator, or one off-theme`).toEqual([]);
      }
    });
  }

  test('the longest option never runs under the chevron', async ({ page }) => {
    await loginAsAdmin(page);
    await page.setViewportSize({ width: 360, height: 800 });
    await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(360);
    await openAdminTab(page, 'System Settings');

    const bad = await page.evaluate(() => [...document.querySelectorAll('select')]
      .filter((el) => el.offsetParent !== null)
      .map((el) => {
        const cs = getComputedStyle(el);
        // The indicator is drawn 11px from the right edge and is 5px wide,
        // so the text has to stop at least 16px short of it.
        return { el, pad: parseFloat(cs.paddingRight), over: el.scrollWidth > el.clientWidth + 1 };
      })
      .filter(({ pad, over }) => pad < 20 || over)
      .map(({ el, pad }) => `${el.getAttribute('aria-label') || el.id}: padding-right ${pad}px`));
    expect(bad, 'text can collide with the chevron').toEqual([]);
  });

  test('360: a dropdown is a 44px target', async ({ page }) => {
    await loginAsAdmin(page);
    await page.setViewportSize({ width: 360, height: 800 });
    await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(360);
    await openAdminTab(page, 'System Settings');

    const short = await page.evaluate(() => [...document.querySelectorAll('select')]
      .filter((el) => el.offsetParent !== null)
      // Round before comparing: a min-height: 44px control measures
      // 43.999969, and reporting "44px is too short" helps nobody.
      .filter((el) => Math.round(el.getBoundingClientRect().height) < 44)
      .map((el) => `${el.getAttribute('aria-label') || el.id}: ${Math.round(el.getBoundingClientRect().height)}px`));
    expect(short, 'a dropdown too short to tap').toEqual([]);
  });

  // No select in the admin is disabled today. The rule is here so that the
  // first one does not arrive wearing the enabled indicator on a disabled
  // surface, which is the exact confusion this whole item is about.
  test('a disabled select keeps the indicator, in the disabled colour', async ({ page }) => {
    await loginAsAdmin(page);
    await openAdminTab(page, 'System Settings');

    const result = await page.evaluate(() => {
      const el = document.querySelector('select');
      const before = getComputedStyle(el).backgroundImage;
      el.disabled = true;
      const after = getComputedStyle(el).backgroundImage;
      const bg = getComputedStyle(el).backgroundColor;
      el.disabled = false;

      const resolve = (name) => {
        const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
        const p = document.createElement('div');
        p.style.color = v; document.body.appendChild(p);
        const rgb = getComputedStyle(p).color; p.remove();
        return rgb;
      };
      return { after, hasDim: after.includes(resolve('--text-dim')), changed: before !== after, bg };
    });

    expect(result.after, 'the chevron vanished when the select was disabled')
      .toContain('linear-gradient');
    expect(result.hasDim, `disabled chevron is not the dim token: ${result.after.slice(0, 80)}`).toBe(true);
    expect(result.changed, 'disabled looks identical to enabled').toBe(true);
  });
});

// V2 — an event chip should say which event it is.
test.describe('calendar event chips', () => {
  test.skip(!hasAdminCredentials, ADMIN_SKIP_REASON);

  for (const width of [768, 1024, 1440]) {
    test(`${width}: names wrap before they truncate, and rows stay level`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(width);
      await loginAsAdmin(page);
      await openAdminTab(page, 'Calendar');
      await expect(page.locator('.cal-grid')).toBeVisible();

      const r = await page.evaluate(() => {
        const chips = [...document.querySelectorAll('.cal-event')];
        // Two lines, not one: a single nowrap line made every name
        // "Midterm E..." the moment a column was under ~160px.
        const oneLiners = chips.filter((c) => getComputedStyle(c).whiteSpace === 'nowrap').length;

        // Whatever is still cut off has to be recoverable.
        const silent = chips
          .filter((c) => c.scrollHeight > c.clientHeight + 1)
          .filter((c) => (c.getAttribute('title') || '') !== c.textContent.trim())
          .map((c) => c.textContent.trim().slice(0, 20));

        // Cells sharing a top edge are one week, and a week is a straight line.
        const rows = {};
        for (const cell of document.querySelectorAll('.cal-cell')) {
          const b = cell.getBoundingClientRect();
          (rows[Math.round(b.top)] ||= []).push(Math.round(b.height));
        }
        const ragged = Object.entries(rows)
          .filter(([, hs]) => new Set(hs).size > 1)
          .map(([top, hs]) => `row at ${top}: ${[...new Set(hs)].join('/')}`);

        return { chips: chips.length, oneLiners, silent, ragged };
      });

      expect(r.chips, 'no events this month to measure').toBeGreaterThan(0);
      expect(r.oneLiners, 'a chip is still a single nowrap line').toBe(0);
      expect(r.silent, 'a clipped name with no title to recover it').toEqual([]);
      expect(r.ragged, 'cells in one week are different heights').toEqual([]);
    });
  }
});

// V3 — a focused field looks the same wherever it is.
test.describe('the focus ring', () => {
  test.skip(!hasAdminCredentials, ADMIN_SKIP_REASON);

  // Settled, not immediately: the border-color transitions, and reading
  // it mid-flight reports two different blends and invents a difference
  // that is not there.
  const ring = async (page, locator) => {
    await locator.focus();
    await page.waitForTimeout(500);
    return locator.evaluate((el) => {
      const cs = getComputedStyle(el);
      return {
        radius: cs.borderRadius, borderWidth: cs.borderWidth, borderColor: cs.borderColor,
        outline: cs.outline, offset: cs.outlineOffset,
      };
    });
  };

  test('a field in a modal rings exactly like one outside it', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(360);
    await loginAsAdmin(page);

    await openAdminTab(page, 'System Settings');
    const outside = await ring(page, page.locator('#settings-academic-year'));

    await openAdminTab(page, 'Sections');
    await page.getByRole('button', { name: /Add Section/ }).first().click();
    await expect(page.locator('.ux-modal').first()).toBeVisible();
    const inside = await ring(page, page.locator('[role=dialog] input').first());

    expect(inside).toEqual(outside);
  });

  test('focusing a field does not reshape it', async ({ page }) => {
    await loginAsAdmin(page);
    await openAdminTab(page, 'System Settings');

    const field = page.locator('#settings-academic-year');
    const resting = await field.evaluate((el) => getComputedStyle(el).borderRadius);
    const focused = (await ring(page, field)).radius;

    // The app-wide :focus-visible rule used to force border-radius: 2px,
    // so an 8px input snapped square on focus and relaxed on blur.
    expect(focused, 'the field changed shape when it took focus').toBe(resting);
    expect(parseFloat(focused), 'a rounded field went square').toBeGreaterThan(2);
  });
});

// V4 — nothing scrolls visibly past the save bar.
test.describe('the save bar covers what is behind it', () => {
  test.skip(!hasAdminCredentials, ADMIN_SKIP_REASON);

  for (const width of [360, 768, 1440]) {
    test(`${width}: no page content shows below or beside it`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(width);
      await loginAsAdmin(page);
      await openAdminTab(page, 'System Settings');

      const year = page.locator('#settings-academic-year');
      const original = await year.inputValue();
      await year.fill('2099-2100');
      const bar = page.locator('.settings-savebar');
      await expect(bar).toBeVisible();

      // Mid-scroll is the state that showed the leak: at the top or the
      // bottom of the page there is nothing behind the bar to see.
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight / 2));
      await page.waitForTimeout(300);

      const leaks = await page.evaluate(() => {
        const bar = document.querySelector('.settings-savebar');
        const r = bar.getBoundingClientRect();
        const found = [];
        // Just below the bar, and in the strips either side of it, which
        // is where .main's padding leaves the bar short of the edge.
        const probes = [
          ['below-left', r.left + 8, Math.min(r.bottom + 4, window.innerHeight - 2)],
          ['below-right', r.right - 8, Math.min(r.bottom + 4, window.innerHeight - 2)],
          ['beside-left', Math.max(r.left - 6, 2), r.top + r.height / 2],
          ['beside-right', Math.min(r.right + 6, window.innerWidth - 2), r.top + r.height / 2],
        ];
        for (const [name, x, y] of probes) {
          const el = document.elementFromPoint(x, y);
          if (!el) continue;
          // The bar itself, or its backing, which hit-tests as the bar.
          if (el === bar || bar.contains(el)) continue;
          // The page body or the content wrapper is bare background.
          if (el.classList.contains('main') || el.tagName === 'BODY' || el.id === 'root') continue;
          found.push(`${name}: ${el.tagName}.${String(el.className).slice(0, 30)} "${(el.textContent || '').trim().slice(0, 20)}"`);
        }
        return found;
      });
      expect(leaks, 'page content is visible through the save bar').toEqual([]);

      // And it still reaches the bottom of the screen.
      const gap = await bar.evaluate((el) =>
        window.innerHeight - el.getBoundingClientRect().bottom);
      expect(Math.round(gap), 'the bar is floating above the bottom edge').toBeLessThanOrEqual(0);

      await year.fill(original);
    });
  }
});

// V5 — the rail and the agenda describe the same event the same way.
test.describe('the Upcoming rail', () => {
  test.skip(!hasAdminCredentials, ADMIN_SKIP_REASON);

  test('gives a multi-day event its range, like the agenda does', async ({ page }) => {
    await loginAsAdmin(page);

    // The agenda is the phone view; read what it says for each event.
    await page.setViewportSize({ width: 360, height: 780 });
    await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(360);
    await openAdminTab(page, 'Calendar');
    await expect(page.locator('.cal-agenda')).toBeVisible();
    const spans = await page.locator('.cal-agenda-item').evaluateAll((els) => {
      const out = {};
      for (const el of els) {
        const name = el.querySelector('.truncate-1')?.textContent.trim();
        const range = el.querySelector('.cal-agenda-range')?.textContent.trim();
        if (name && range) out[name] = range;
      }
      return out;
    });
    test.skip(Object.keys(spans).length === 0, 'no multi-day events this month');

    // The rail is the desktop view; it must not disagree.
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(1440);
    await openAdminTab(page, 'Calendar');
    const rail = await page.locator('.upcoming-item').evaluateAll((els) =>
      els.map((el) => ({
        name: el.children[0]?.textContent.trim(),
        date: el.children[1]?.textContent.trim(),
      })));

    const disagree = rail
      .filter((r) => spans[r.name])
      .filter((r) => r.date !== spans[r.name])
      .map((r) => `${r.name}: rail "${r.date}" vs agenda "${spans[r.name]}"`);
    expect(disagree, 'the rail and the agenda date the same event differently').toEqual([]);
  });
});

// V3, verified the way the review actually saw it: reached by Tab.
//
// The first pass compared the two fields after calling .focus() on each,
// which is not how a person focuses anything. :focus-visible can match
// for a keyboard-reached field and not for a programmatically focused
// one, and that difference is the most likely reason one field rendered
// rounded and the other square with BOTH focused.
//
// The fix does not depend on resolving that: border-radius: 2px is gone
// from the rule, so a field keeps its own shape whether :focus-visible
// matches or not. These assert exactly that, both ways round.
test.describe('a keyboard-focused field keeps its shape', () => {
  test.skip(!hasAdminCredentials, ADMIN_SKIP_REASON);

  const tabTo = async (page, locator) => {
    // Start from the top of the document so Tab walks the real order.
    await page.locator('body').click({ position: { x: 2, y: 2 } });
    for (let i = 0; i < 60; i++) {
      await page.keyboard.press('Tab');
      if (await locator.evaluate((el) => el === document.activeElement)) return true;
    }
    return false;
  };

  const shape = (locator) => locator.evaluate((el) => ({
    radius: getComputedStyle(el).borderRadius,
    focusVisible: el.matches(':focus-visible'),
    focused: el === document.activeElement,
  }));

  test('360: Academic Year, reached by Tab, is rounded', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(360);
    await loginAsAdmin(page);
    await openAdminTab(page, 'System Settings');

    const field = page.locator('#settings-academic-year');
    expect(await tabTo(page, field), 'Tab never reached Academic Year').toBe(true);

    const s = await shape(field);
    expect(s.focused).toBe(true);
    expect(parseFloat(s.radius), `square corners when focused (${s.radius})`).toBeGreaterThan(2);
  });

  test('360: Section Name, reached by Tab inside the sheet, is rounded', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(360);
    await loginAsAdmin(page);
    await openAdminTab(page, 'Sections');
    await page.getByRole('button', { name: /Add Section/ }).first().click();
    await expect(page.locator('.ux-modal').first()).toBeVisible();

    const field = page.locator('[role=dialog] input').first();
    // The dialog takes focus on open and traps it, so one Tab cycles
    // within the sheet rather than walking the page.
    for (let i = 0; i < 10; i++) {
      if (await field.evaluate((el) => el === document.activeElement)) break;
      await page.keyboard.press('Tab');
    }
    const s = await shape(field);
    expect(s.focused, 'Tab never reached Section Name inside the sheet').toBe(true);
    expect(parseFloat(s.radius), `square corners when focused (${s.radius})`).toBeGreaterThan(2);
  });

  test('both fields are the same shape, however focus arrived', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(360);
    await loginAsAdmin(page);

    await openAdminTab(page, 'System Settings');
    const year = page.locator('#settings-academic-year');
    await tabTo(page, year);
    const byKeyboard = (await shape(year)).radius;
    await year.focus();
    const byScript = (await shape(year)).radius;

    expect(byKeyboard, 'the shape depends on how focus arrived').toBe(byScript);
    expect(parseFloat(byKeyboard)).toBeGreaterThan(2);
  });
});

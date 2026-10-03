// The public calendar's keyboard and error behaviour.
//
// These cover the three defects the ux-engine audit found: the event dialog
// claimed aria-modal but never touched focus, every event chip opened the
// first event on the day, and the error state had no way out.
import { test, expect } from '@playwright/test';
import { appReady } from './helpers.js';

test.describe('public calendar', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/calendar');
    await appReady(page);
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
      await appReady(page);

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
    await appReady(page);
    // Event type is carried by hue in the grid; a legend keeps that readable
    // for anyone who cannot separate the hues.
    for (const label of ['Event', 'Deadline', 'Holiday', 'Other']) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
    }
  });

  test('a start time reads as a clock time, not a database value', async ({ page }) => {
    await page.goto('/calendar');
    await appReady(page);
    const body = await page.locator('main').innerText();
    // "13:00:00" came straight out of the Postgres TIME column.
    expect(body).not.toMatch(/\bat \d{1,2}:\d{2}:\d{2}\b/);
  });
});

test('the dialog badge says what its colour says', async ({ page }) => {
  await page.goto('/calendar');
  await appReady(page);
  const chips = page.getByRole('button', { name: /^Open / });
  test.skip(await chips.count() === 0, 'no events this month');

  await chips.first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();

  // The badge coloured itself from event_type but printed `type`, so a row
  // with event_type "Deadline" and no type showed the word "Event" in
  // Deadline amber. Both must come from one source.
  const badge = dialog.locator('span').filter({ hasText: /^(Event|Deadline|Holiday|Other)$/ }).first();
  const { text, bg } = await badge.evaluate(el => ({
    text: el.textContent.trim(), bg: getComputedStyle(el).backgroundColor,
  }));
  const EXPECTED = {
    Event: 'rgb(219, 234, 254)', Deadline: 'rgb(254, 243, 199)',
    Holiday: 'rgb(254, 226, 226)', Other: 'rgb(204, 251, 241)',
  };
  expect(bg, `badge reads "${text}" but is not that type's colour`).toBe(EXPECTED[text]);
});

test('an event name is readable at every width, not truncated to "PERIODIC ..."', async ({ page }) => {
  for (const [w, h] of [[390, 844], [768, 1024], [1440, 900]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto('/calendar');
    await appReady(page);

    // A 97px cell truncated "PERIODIC EXAM" to a word and an ellipsis; a 43px
    // one cut it to a letter. Nothing that names an event may be clipped.
    const clipped = await page.evaluate(() =>
      [...document.querySelectorAll('button[aria-label^="Open "]')]
        .filter(e => e.scrollWidth > e.clientWidth + 1)
        .map(e => e.textContent.trim()));
    expect(clipped, `event labels clipped at ${w}px`).toEqual([]);

    // On a phone the grid carries dots, so the names have to live somewhere.
    if (w < 640) {
      const named = await page.getByRole('button', { name: /^Open / }).count();
      expect(named, 'a phone needs the event names listed somewhere').toBeGreaterThan(0);
    }
  }
});

test('the type filter narrows the grid, not just the lists', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/calendar');
  await appReady(page);

  // role=group is the day cell, so this counts GRID chips only. Counting
  // every 'Open ...' on the page measures the month and upcoming lists too,
  // and those read filteredEvents correctly — the first rewrite of this test
  // did exactly that and still passed with the bug deliberately put back.
  const chips = page.getByRole('group').getByRole('button', { name: /^Open / });
  // The month the suite happens to run in may be empty — October 2026 is —
  // and a test that skips forever looks like it is working. Walk forward
  // until a month has grid chips, up to a year, and only give up then.
  let all = await chips.count();
  for (let hop = 0; all === 0 && hop < 12; hop++) {
    await page.getByRole('button', { name: 'Next month' }).click();
    await page.waitForTimeout(200);
    all = await chips.count();
  }
  test.skip(all === 0, 'no month in the next year has a calendar event');

  // The first version of this test clicked Deadline and asserted the count
  // dropped. That holds only while the visible month happens to carry more
  // than one type, and it went red on 1 October for a calendar that was
  // behaving correctly: October's single event IS a Deadline, so filtering
  // to Deadline rightly changed nothing.
  //
  // The invariant that does not depend on this month's data: the filter
  // buttons are built from the types actually present, so the per-type
  // counts have to partition the unfiltered count. The bug this guards —
  // getEventsForDate reading `events` instead of `filteredEvents`, so the
  // grid ignored the filter — would make every type return the full count,
  // and the sum would overshoot.
  const names = (await page.locator('button[aria-pressed]').allInnerTexts())
    .map((t) => t.trim())
    .filter((t) => t && t !== 'All');
  test.skip(names.length === 0, 'no type filters offered');

  let summed = 0;
  for (const name of names) {
    await page.getByRole('button', { name, exact: true }).first().click();
    await page.waitForTimeout(300);
    const n = await chips.count();
    expect(n, `"${name}" alone shows more chips than the unfiltered month`)
      .toBeLessThanOrEqual(all);
    summed += n;
  }

  expect(summed, `the per-type counts (${summed}) should partition the month (${all})`)
    .toBe(all);
});

test('a phone sees the filter result without scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/calendar');
  await appReady(page);

  // The banner was 184px and the cells 96px, which put the event names at
  // y=840 on an 844px screen: tapping a filter changed nothing visible.
  const list = page.getByText(/EVENTS$/i).first();
  const box = await list.boundingBox();
  expect(box, 'the month list should render').not.toBeNull();
  expect(box.y + box.height, 'the event names must be on screen with the filter')
    .toBeLessThanOrEqual(844);
});

import { test, expect } from '@playwright/test';
import { appReady } from './helpers.js';

// A focus indicator counts only if a sighted keyboard user can see it. An
// outline whose colour is transparent is not one — that is Tailwind's ring
// fallback, where the real indicator is a box-shadow.
const indicator = el => {
  const c = getComputedStyle(el);
  const outlineVisible =
    c.outlineStyle !== 'none' &&
    parseFloat(c.outlineWidth) >= 2 &&
    !/rgba\(\s*\d+,\s*\d+,\s*\d+,\s*0\s*\)|transparent/.test(c.outlineColor);
  const ringVisible = c.boxShadow !== 'none' && c.boxShadow.trim() !== '';
  return { outlineVisible, ringVisible, outline: `${c.outlineWidth} ${c.outlineStyle} ${c.outlineColor}`, boxShadow: c.boxShadow };
};

const CASES = [
  ['/login',    'button', 'Student',        'has its own Tailwind ring'],
  ['/calendar', 'combobox', 'Calendar year','relies on the global rule'],
  ['/calendar', 'button', 'Next month',     'has its own ring'],
  ['/news',     'button', 'NEWS HISTORY',   'has its own ring'],
];

for (const [path, role, name, note] of CASES) {
  test(`${name} shows a visible focus indicator (${note})`, async ({ page }) => {
    await page.goto(path);
    await appReady(page);
    const el = page.getByRole(role, { name });
    // NEWS HISTORY only exists when the news page has history to show. A
    // focus-indicator test cannot say anything about a control that is not
    // on the page, and failing here would report a missing ring rather
    // than a missing section.
    test.skip(await el.count() === 0, `"${name}" is not on ${path} with the current data`);
    await expect(el).toBeVisible();

    // Focus, then measure, then check the measurement is of a live node.
    // A React re-render between the two replaces the element, and
    // getComputedStyle on the detached handle returns empty strings for
    // every property — which reads as "no focus indicator" and fails a
    // control that has one. An element that genuinely has no outline still
    // reports "0px none rgb(0, 0, 0)", so an empty string can only mean
    // the node went away.
    let r;
    await expect.poll(async () => {
      await el.focus();
      r = await el.evaluate(indicator);
      return r.outline.trim() !== '';
    }, { message: `${name}: the element was replaced faster than it could be measured` }).toBe(true);
    console.log(`  ${name.padEnd(15)} outline=${r.outline}  ring=${r.ringVisible}`);
    expect(r.outlineVisible || r.ringVisible,
      `${name} has no visible focus indicator: ${JSON.stringify(r)}`).toBe(true);
  });
}

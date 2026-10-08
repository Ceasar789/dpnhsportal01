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
  return { focused: el.isConnected && document.activeElement === el, outlineVisible, ringVisible, outline: `${c.outlineWidth} ${c.outlineStyle} ${c.outlineColor}`, boxShadow: c.boxShadow };
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

    // A data-loading render can replace the button between focus and
    // measurement. The replacement has nonempty styles but is unfocused;
    // checking only for empty styles misses that race. Measure an actually
    // focused node and allow its focus transition to paint. A persistently
    // missing indicator still fails, with the last measurement attached.
    await page.keyboard.press('Tab');
    let r;
    await expect.poll(async () => {
      await el.focus();
      r = await el.evaluate(indicator);
      return r.focused && (r.outlineVisible || r.ringVisible);
    }, { message: `${name}: no visible indicator on the focused control` }).toBe(true);
    console.log(`  ${name.padEnd(15)} outline=${r.outline}  ring=${r.ringVisible}`);
    expect(r.outlineVisible || r.ringVisible,
      `${name} has no visible focus indicator: ${JSON.stringify(r)}`).toBe(true);
  });
}

import { test, expect } from '@playwright/test';

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
    await page.waitForLoadState('networkidle');
    const el = page.getByRole(role, { name });
    await el.focus();
    const r = await el.evaluate(indicator);
    console.log(`  ${name.padEnd(15)} outline=${r.outline}  ring=${r.ringVisible}`);
    expect(r.outlineVisible || r.ringVisible,
      `${name} has no visible focus indicator: ${JSON.stringify(r)}`).toBe(true);
  });
}

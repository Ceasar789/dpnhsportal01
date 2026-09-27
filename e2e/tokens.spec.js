// Design tokens, measured in the browser rather than assumed from the source.
//
// They used to be declared inside dashboardTheme.jsx's injected <style>, which
// only mounts inside a dashboard. On every public and auth page --accent,
// --text and --card-bg resolved to nothing, which is why four separate
// mechanical restyles could only ever report "0 substitutions". This spec is
// the guard: it fails if the declaration moves back into a component.
import { test, expect } from '@playwright/test';
import { login, STUDENT, STUDENT_LOGIN } from './helpers.js';

const PUBLIC_PAGES = ['/', '/news', '/calendar', '/login', '/student-login', '/faculty-login'];

// One per group, so a whole group going missing is caught.
const TOKENS = ['--accent', '--text', '--card-bg', '--border', '--text-muted', '--green', '--banner-text', '--nav-bg'];

const read = (names) =>
  Object.fromEntries(names.map((n) => [n, getComputedStyle(document.documentElement).getPropertyValue(n).trim()]));

test.describe('design tokens', () => {
  for (const path of PUBLIC_PAGES) {
    test(`${path} resolves every token`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState('networkidle');

      const values = await page.evaluate(read, TOKENS);
      for (const name of TOKENS) {
        expect(values[name], `${name} is empty on ${path}`).not.toBe('');
      }
      // Light is the default, and it has to be, because these pages are light.
      expect(values['--text'], `${path} should use the light text token`).toBe('#1a2b4a');
      expect(values['--card-bg']).toBe('#ffffff');

      const dark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
      expect(dark, `${path} must not carry the dashboard's dark class`).toBe(false);
    });
  }

  test('a dashboard still gets its dark values, and hands them back on the way out', async ({ page }) => {
    await login(page, STUDENT, STUDENT_LOGIN, '/student-dashboard');

    const inDashboard = await page.evaluate(() => ({
      dark: document.documentElement.classList.contains('dark'),
      text: getComputedStyle(document.documentElement).getPropertyValue('--text').trim(),
    }));
    // Dark is this app's stored default, so an untouched account lands in it.
    expect(inDashboard.dark, 'the dashboard should set .dark').toBe(true);
    expect(inDashboard.text).toBe('#e8eaf0');

    // Leaving the dashboard must not leave the public pages themed.
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const after = await page.evaluate(() => ({
      dark: document.documentElement.classList.contains('dark'),
      text: getComputedStyle(document.documentElement).getPropertyValue('--text').trim(),
    }));
    expect(after.dark, '.dark survived the dashboard').toBe(false);
    expect(after.text).toBe('#1a2b4a');
  });
});

// Every text token against every surface token it can land on. The muted pair
// used to be inverted — the pale grey on light backgrounds at 2.56:1, the dark
// one on dark backgrounds at 2.38:1 — so each failed in its own theme.
test.describe('token contrast', () => {
  const TEXT = ['--text', '--text-muted', '--text-dim'];
  const SURFACE = ['--bg', '--card-bg', '--card2', '--sidebar-bg'];

  const MEASURE = `(text, surface) => {
    const v = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
    const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    const lum = (hex) => {
      const [r, g, b] = rgb(hex).map((c) => {
        c /= 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const out = [];
    for (const t of text) {
      for (const s of surface) {
        const a = lum(v(t)), b = lum(v(s));
        const [hi, lo] = a > b ? [a, b] : [b, a];
        out.push([t, s, (hi + 0.05) / (lo + 0.05)]);
      }
    }
    return out;
  }`;

  for (const [label, path, setDark] of [['light', '/', false], ['dark', '/', true]]) {
    test(`${label}: every text token clears 4.5:1 on every surface`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      if (setDark) await page.evaluate(() => document.documentElement.classList.add('dark'));

      const rows = await page.evaluate(
        ([t, s, fn]) => eval(fn)(t, s), [TEXT, SURFACE, MEASURE],
      );
      for (const [t, s, ratio] of rows) {
        expect(ratio, `${t} on ${s} (${label}) reads at ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
      }
    });
  }
});

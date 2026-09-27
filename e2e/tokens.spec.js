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

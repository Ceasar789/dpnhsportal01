// L1: the public About page and the hero Sign In chooser.
import { test, expect } from '@playwright/test';
import { appReady } from './helpers.js';

const SIZES = [[1280, 800], [768, 1024], [390, 844], [320, 640], [844, 390]];

test('/about renders with no console error, a way back and a Sign In chooser', async ({ page }) => {
  const errors = [];
  page.on('console', m => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', e => errors.push(String(e)));

  await page.goto('/about');
  await appReady(page);

  await expect(page).toHaveTitle('About us · Dela Paz National High School');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Dela Paz National High School');
  await expect(page.getByRole('link', { name: 'Back to home' })).toHaveAttribute('href', '/');
  await expect(page.locator('nav [aria-current="page"]')).toHaveText('About');
  await expect(page.locator('footer').getByRole('link', { name: 'About us' })).toHaveAttribute('href', '/about');
  expect(errors, errors.join('\n')).toEqual([]);
});

for (const [w, h] of SIZES) {
  test(`${w}x${h}: /about has no sideways scroll`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await page.goto('/about');
    await appReady(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(w + 1);
  });
}

test('the hero chooser works by keyboard: focus to Student, arrows, Escape back to the button', async ({ page }) => {
  await page.goto('/');
  await appReady(page);

  const button = page.getByRole('button', { name: 'Sign In' });
  await button.focus();
  await page.keyboard.press('Enter');
  await expect(button).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('link', { name: /^Student/ })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('link', { name: /^Faculty/ })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(button).toHaveAttribute('aria-expanded', 'false');
  await expect(button).toBeFocused();
});

test('the hero chooser: Faculty goes to /faculty-login', async ({ page }) => {
  await page.goto('/');
  await appReady(page);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await page.getByRole('link', { name: /^Faculty/ }).click();
  await expect(page).toHaveURL(/\/faculty-login$/);
});

test('reduced motion: every About section is visible at once', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/about');
  await appReady(page);
  expect(await page.evaluate(() => document.querySelector('.reveal-on'))).toBeNull();
  const hidden = await page.locator('[data-reveal]').evaluateAll(els => els.filter(e => getComputedStyle(e).opacity !== '1').length);
  expect(hidden).toBe(0);
});

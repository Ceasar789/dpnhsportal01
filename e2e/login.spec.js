// The portal chooser at /login.
//
// It used to be a two-panel split with the Student and Faculty buttons in a
// card on the right. On a 390px phone that put them at y=1067 against an
// 844px screen. The card is gone and the choice sits under "Welcome Back."
// in one full-width panel.
import { test, expect } from '@playwright/test';
import { appReady } from './helpers.js';

const SIZES = [[390, 844, 'phone'], [768, 1024, 'tablet'], [1000, 900, 'small laptop'], [1440, 900, 'desktop']];

test.describe('portal chooser', () => {
  for (const [w, h, label] of SIZES) {
    test(`${label} ${w}x${h}: both roles on screen, side by side`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await page.goto('/login');
      await appReady(page);

      const main = page.locator('main');
      const student = await main.getByRole('button', { name: 'Student' }).boundingBox();
      const faculty = await main.getByRole('button', { name: 'Faculty' }).boundingBox();

      expect(student, `Student missing at ${label}`).not.toBeNull();
      expect(faculty, `Faculty missing at ${label}`).not.toBeNull();
      expect(student.y + student.height, `Student below the fold at ${label}`).toBeLessThanOrEqual(h);
      expect(faculty.y + faculty.height, `Faculty below the fold at ${label}`).toBeLessThanOrEqual(h);
      expect(Math.abs(student.y - faculty.y), `the roles should sit on one row at ${label}`).toBeLessThan(5);

      const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(scrollW, `${label} scrolls sideways`).toBeLessThanOrEqual(w + 1);
    });
  }

  test('each role goes where it says', async ({ page }) => {
    await page.goto('/login');
    await appReady(page);
    await page.locator('main').getByRole('button', { name: 'Student' }).click();
    await expect(page).toHaveURL(/\/student-login/);

    await page.goBack();
    await appReady(page);
    await page.locator('main').getByRole('button', { name: 'Faculty' }).click();
    await expect(page).toHaveURL(/\/faculty-login/);
  });

  test('one heading, and the scrim carries the text', async ({ page }) => {
    await page.goto('/login');
    await appReady(page);

    // "Hi, DPNHSian!" competed with "Welcome Back." from the deleted card.
    await expect(page.locator('main h1, main h2')).toHaveCount(1);
    await expect(page.getByText('Hi, DPNHSian!')).toHaveCount(0);

    // Every word here is white on a photograph. The old 0.3-to-0.5 black
    // wash left the school name at 2.11:1 — legibility decided by whichever
    // picture loaded. Measure the guarantee, not the alpha: how does white
    // fare over the weakest end of the scrim when the frame behind it is
    // white? Pinning a number instead would only hold for one scrim colour.
    const worst = await page.evaluate(() => {
      const el = [...document.querySelectorAll('main div')]
        .find(d => getComputedStyle(d).backgroundImage.includes('linear-gradient'));
      if (!el) return null;
      const stops = [...getComputedStyle(el).backgroundImage.matchAll(/rgba?\(([^)]+)\)/g)]
        .map(m => m[1].split(',').map(Number));
      if (!stops.length) return null;

      const lum = ([r, g, b]) => {
        const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
      };
      const ratios = stops.map(([r, g, b, a = 1]) => {
        const over = [r, g, b].map(c => a * c + (1 - a) * 255); // white photo
        const L = lum(over);
        return 1.05 / (L + 0.05);
      });
      return Math.min(...ratios);
    });

    expect(worst, 'no scrim gradient found').not.toBeNull();
    expect(worst, 'white text could be unreadable over a bright photo').toBeGreaterThanOrEqual(4.5);
  });
});

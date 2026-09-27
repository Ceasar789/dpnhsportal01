// The portal chooser at /login.
//
// It used to be a two-panel split: a photo, a 380px flipping logo and a
// welcome on the left, the two buttons in a card on the right. On a 390px
// phone that put the Student button at y=1067 against an 844px screen — the
// page's entire purpose, 223px below the fold.
import { test, expect } from '@playwright/test';

const SIZES = [[390, 844, 'phone'], [768, 1024, 'tablet'], [1000, 900, 'small laptop'], [1440, 900, 'desktop']];

test.describe('portal chooser', () => {
  for (const [w, h, label] of SIZES) {
    test(`${label} ${w}x${h}: both roles are on screen without scrolling`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await page.goto('/login');
      await page.waitForLoadState('networkidle');

      const main = page.locator('main');
      for (const name of [/^Student/, /^Faculty and staff/]) {
        const box = await main.getByRole('button', { name }).boundingBox();
        expect(box, `${name} should render at ${label}`).not.toBeNull();
        expect(box.y + box.height, `${name} is below the fold at ${label}`).toBeLessThanOrEqual(h);
      }

      const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(scrollW, `${label} scrolls sideways`).toBeLessThanOrEqual(w + 1);
    });
  }

  test('each role says where it leads', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');
    const main = page.locator('main');

    await main.getByRole('button', { name: /^Student/ }).click();
    await expect(page).toHaveURL(/\/student-login/);

    await page.goBack();
    await page.waitForLoadState('networkidle');
    await main.getByRole('button', { name: /^Faculty and staff/ }).click();
    await expect(page).toHaveURL(/\/faculty-login/);
  });

  test('one heading, and one primary action', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    // There were two competing headings: "Welcome Back." and "Hi, DPNHSian!".
    await expect(page.locator('main h1, main h2')).toHaveCount(1);
    await expect(page.getByText('Hi, DPNHSian!')).toHaveCount(0);

    // Student and Faculty were both filled and equally weighted, so neither
    // read as the way in. Student is the primary; Faculty is not.
    const student = page.locator('main').getByRole('button', { name: /^Student/ });
    const faculty = page.locator('main').getByRole('button', { name: /^Faculty and staff/ });
    const bg = e => e.evaluate(x => getComputedStyle(x).backgroundColor);
    expect(await bg(student)).not.toBe(await bg(faculty));
  });
});

// The public home page.
//
// The hero was a hard 870px, taller than a 1366x768 laptop can show once the
// 90px header is off. At that size the carousel controls sat at y=816 — the
// pause control WCAG 2.2.2 asks for, off-screen — and the vision card was cut
// in half. These guard the fix without pinning the large-monitor layout.
import { test, expect } from '@playwright/test';

const below = (box, h) => box.y + box.height > h;

test.describe('home page', () => {
  test('the hero fits a 1366x768 laptop', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    for (const [name, locator] of [
      ['headline', page.locator('h2').first()],
      ['primary CTA', page.getByRole('button', { name: 'Student Portal' })],
      ['carousel controls', page.locator('[aria-label="Carousel controls"]')],
    ]) {
      const box = await locator.boundingBox();
      expect(box, `${name} should render`).not.toBeNull();
      expect(below(box, 768), `${name} should be above the fold`).toBe(false);
    }
  });

  test('the hero text never runs under the vision card', async ({ page }) => {
    for (const [w, h] of [[1200, 700], [1366, 768], [1920, 1080]]) {
      await page.setViewportSize({ width: w, height: h });
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // A block <h2> is full-width whatever its text measures, so compare the
      // glyph rectangles rather than the element box.
      const rects = await page.locator('h2').first().evaluate(el => {
        const r = document.createRange();
        r.selectNodeContents(el);
        return [...r.getClientRects()].map(b => ({ x: b.x, y: b.y, w: b.width, h: b.height }));
      });
      const card = await page.locator('#vision').boundingBox();
      if (!card) continue;

      const hit = rects.some(t => t.x < card.x + card.width && card.x < t.x + t.w
                               && t.y < card.y + card.height && card.y < t.y + t.h);
      expect(hit, `hero text collides with the vision card at ${w}x${h}`).toBe(false);
    }
  });

  test('the hero CTA names where it goes', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // It used to say "Apply for Admission" and navigate to /student-login.
    // There is no admission route in this app.
    await expect(page.getByRole('button', { name: 'Apply for Admission' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Student Portal' }).click();
    await expect(page).toHaveURL(/\/student-login/);
  });

  test('the brand is spelled the same as the logo', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const body = await page.locator('body').innerText();
    expect(body).not.toContain('Edu Scribe');
  });
});

// The public news page.
//
// The desktop branch used to cap the grid at rest.slice(0, 3) while mobile
// rendered every article, so a laptop showed four items and a phone showed
// all of them. The card also truncated at 160 characters with no control to
// reach the rest.
import { test, expect } from '@playwright/test';

test.describe('public news', () => {
  test('desktop shows every article, not the first three', async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto('/news');
    await page.waitForLoadState('networkidle');

    const wide = await page.locator('article').count();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);
    const narrow = await page.locator('article').count();

    console.log(`  articles — desktop: ${wide}  phone: ${narrow}`);
    expect(wide, 'desktop must not show fewer articles than a phone').toBe(narrow);
  });

  test('a truncated card can be opened', async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto('/news');
    await page.waitForLoadState('networkidle');

    const more = page.getByRole('button', { name: 'Read more' });
    const n = await more.count();
    console.log(`  cards offering "Read more": ${n}`);
    test.skip(n === 0, 'no article long enough to truncate');

    const card = more.first();
    await expect(card).toHaveAttribute('aria-expanded', 'false');
    await card.click();
    await expect(page.getByRole('button', { name: 'Show less' }).first())
      .toHaveAttribute('aria-expanded', 'true');
  });

  test('the newsletter field has a real label', async ({ page }) => {
    await page.goto('/news');
    await page.waitForLoadState('networkidle');
    await expect(page.getByLabel('Your academic email address')).toBeVisible();
  });
});

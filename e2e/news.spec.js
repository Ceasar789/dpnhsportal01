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

  test('no control on the page is a dead end', async ({ page }) => {
    await page.goto('/news');
    await page.waitForLoadState('networkidle');

    // The newsletter signup was removed: it had no submit handler and no
    // backend, so "Join Circular" did nothing at all.
    await expect(page.getByRole('button', { name: 'Join Circular' })).toHaveCount(0);
    await expect(page.getByText('STAY CONNECTED.')).toHaveCount(0);

    // Every remaining button must do something, so none may be bare.
    const labels = await page.getByRole('button').evaluateAll(
      els => els.map(e => (e.getAttribute('aria-label') || e.textContent || '').trim()));
    expect(labels.filter(l => l === ''), 'every button needs a name').toEqual([]);
  });

  test('each story is a separate card, and the newest is marked', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/news');
    await page.waitForLoadState('networkidle');

    // Bare text blocks on a tinted page ran together with nothing to say
    // where one story ended. Every card needs its own surface and edge.
    const surfaces = await page.locator('article').evaluateAll(els => els.map(e => {
      const s = getComputedStyle(e);
      return { bg: s.backgroundColor, border: parseFloat(s.borderTopWidth) };
    }));
    expect(surfaces.length).toBeGreaterThan(1);
    for (const s of surfaces) {
      expect(s.bg, 'a card needs a surface of its own').toBe('rgb(255, 255, 255)');
      expect(s.border, 'a card needs an edge').toBeGreaterThan(0);
    }

    await expect(page.getByText('LATEST', { exact: true })).toHaveCount(1);
  });

  test('a post with no publish date is not treated as the newest', async ({ page }) => {
    let rows = null;
    page.on('response', async r => {
      if (rows || !r.url().includes('/rest/v1/news') || r.status() !== 200) return;
      try { const j = await r.json(); if (Array.isArray(j)) rows = j; } catch { /* not json */ }
    });
    await page.goto('/news');
    await page.waitForLoadState('networkidle');
    test.skip(!rows || rows.length === 0, 'no news returned');

    // Postgres sorts NULLs first on DESC, so an undated post used to lead the
    // page and wear the LATEST badge ahead of genuinely recent news.
    const firstNull = rows.findIndex(r => !r.published_at);
    const lastDated = rows.map(r => !!r.published_at).lastIndexOf(true);
    if (firstNull !== -1 && lastDated !== -1) {
      expect(firstNull, 'undated posts must sort below dated ones').toBeGreaterThan(lastDated);
    }
  });

  test('prose is capped rather than stretching with the monitor', async ({ page }) => {
    await page.setViewportSize({ width: 2560, height: 1200 });
    await page.goto('/news');
    await page.waitForLoadState('networkidle');

    const widest = await page.locator('article p').evaluateAll(
      els => Math.max(0, ...els.map(e => e.getBoundingClientRect().width)));
    console.log(`  widest card paragraph at 2560px: ${Math.round(widest)}px`);
    expect(widest, 'card prose should not run the width of a wide monitor').toBeLessThan(600);
  });
});

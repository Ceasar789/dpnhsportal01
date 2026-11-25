// Phase 5: 4j security on the public News page (data only), in a real browser against the production
// build and isolated mocks. The response headers live in vercel.json (unit-tested: src/lib/securityHeaders.test.js);
// a static preview server does not send them.
import { test, expect } from '@playwright/test';

const ORIGIN = 'https://profile-e2e.supabase.invalid';
const NEWS = [
  { id: 'n-all', title: 'Brigada Eskwela schedule', content: 'For everyone.', status: 'Published', target_roles: 'all', category: 'Events', published_at: '2026-11-20T08:00:00Z', created_at: '2026-11-20T08:00:00Z', expires_at: null },
  { id: 'n-tea', title: 'Faculty meeting memo', content: 'Teachers only.', status: 'Published', target_roles: 'teacher', category: 'Memo', published_at: '2026-11-19T08:00:00Z', created_at: '2026-11-19T08:00:00Z', expires_at: null },
];

const guard = async (page, newsReply) => {
  const outside = [];
  const queries = [];
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1') return route.continue();
    if (url.origin === ORIGIN && url.pathname === '/rest/v1/news') { queries.push(decodeURIComponent(url.search)); return newsReply(route); }
    if (url.origin === ORIGIN) return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    outside.push(url.href);
    return route.abort();
  });
  return { outside, queries };
};

test('a guest asks only for posts addressed to all, and a teacher-only post that slips through stays hidden', async ({ page }) => {
  const { queries } = await guard(page, route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(NEWS) }));
  await page.goto('/news');
  await expect(page.getByText('Brigada Eskwela schedule').first()).toBeVisible();
  await expect(page.getByText('Faculty meeting memo')).toHaveCount(0);
  expect(queries.some(q => q.includes('target_roles.is.null,target_roles.ilike.*all*'))).toBe(true);
  expect(queries.every(q => !q.includes('ilike.*teacher*'))).toBe(true);
});

test('a refused read shows the app sentence, never the database text', async ({ page }) => {
  await guard(page, route => route.fulfill({ status: 403, contentType: 'application/json',
    body: JSON.stringify({ code: '42501', message: 'permission denied for table news' }) }));
  await page.goto('/news');
  await expect(page.getByText(/could not|try again|permission/i).first()).toBeVisible();
  await expect(page.getByText('permission denied for table news')).toHaveCount(0);
});

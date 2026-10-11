import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { ADMIN_FINAL_BASE_URL, assertLocalAdminFinalBaseURL, installAdminFinalMocks, openAdminPage } from './admin-final-mock-fixture.js';

test('refuses non-local targets and has no production Auth bypass', async () => {
  expect(assertLocalAdminFinalBaseURL(ADMIN_FINAL_BASE_URL)).toBe(true);
  expect(() => assertLocalAdminFinalBaseURL('https://eduscribe.example.test')).toThrow(/refuses non-local/);
  expect(readFileSync('frontend/src/context/AuthContext.jsx', 'utf8')).not.toContain('admin-final-e2e');
  expect(readFileSync('frontend/src/App.jsx', 'utf8')).not.toContain('admin-final-e2e');
});

test('blocks unexpected remote and local backend traffic', async ({ page }) => {
  const harness = await installAdminFinalMocks(page);
  await page.goto('/');
  const results = await page.evaluate(async () => Promise.all([
    fetch('https://unexpected.example.test/data').then(() => 'allowed').catch(() => 'blocked'),
    fetch('/api/unexpected-write', { method: 'POST' }).then(() => 'allowed').catch(() => 'blocked'),
  ]));
  expect(results).toEqual(['blocked', 'blocked']);
  harness.assertHealthy();
});

test('loads the Admin through synthetic Auth only', async ({ page }) => {
  const harness = await installAdminFinalMocks(page);
  await openAdminPage(page, 'Overview', 'Dashboard Overview');
  harness.assertHealthy();
});

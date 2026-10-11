import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { assertLocalSchedulesBaseURL, installSchedulesMocks, openSchedules, SCHEDULES_BASE_URL } from './schedules-mock-fixture.js';

test('refuses non-local targets and has no production authentication hook', async () => {
  expect(assertLocalSchedulesBaseURL(SCHEDULES_BASE_URL)).toBe(true);
  expect(() => assertLocalSchedulesBaseURL('https://eduscribe.example.test')).toThrow(/refuses non-local/);
  expect(readFileSync('frontend/src/context/AuthContext.jsx', 'utf8')).not.toContain('schedules-e2e');
  expect(readFileSync('frontend/src/App.jsx', 'utf8')).not.toContain('schedules-e2e');
});

test('blocks unexpected remote and local backend requests', async ({ page }) => {
  const harness = await installSchedulesMocks(page);
  await page.goto('/');
  const result = await page.evaluate(async () => Promise.all([
    fetch('https://unexpected.example.test/data').then(() => 'allowed').catch(() => 'blocked'),
    fetch('/api/unexpected-write', { method: 'POST' }).then(() => 'allowed').catch(() => 'blocked'),
  ]));
  expect(result).toEqual(['blocked', 'blocked']);
  harness.assertHealthy();
});

test('loads Schedules through synthetic auth without real credentials', async ({ page }) => {
  const harness = await installSchedulesMocks(page);
  await openSchedules(page);
  await expect(page.getByRole('button', { name: /7-Synthetic/ })).toBeVisible();
  harness.assertHealthy();
});

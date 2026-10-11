import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { assertLocalSectionsBaseURL, installSectionsMocks, openSections, SECTIONS_BASE_URL } from './sections-mock-fixture.js';

test('refuses non-local targets and has no production authentication hook', async () => {
  expect(assertLocalSectionsBaseURL(SECTIONS_BASE_URL)).toBe(true);
  expect(() => assertLocalSectionsBaseURL('https://eduscribe.example.test')).toThrow(/refuses non-local/);
  expect(readFileSync('frontend/src/context/AuthContext.jsx', 'utf8')).not.toContain('sections-e2e');
  expect(readFileSync('frontend/src/App.jsx', 'utf8')).not.toContain('sections-e2e');
});

test('blocks unexpected remote and local backend requests', async ({ page }) => {
  const harness = await installSectionsMocks(page);
  await page.goto('/');
  const result = await page.evaluate(async () => Promise.all([
    fetch('https://unexpected.example.test/data').then(() => 'allowed').catch(() => 'blocked'),
    fetch('/api/unexpected-write', { method: 'POST' }).then(() => 'allowed').catch(() => 'blocked'),
  ]));
  expect(result).toEqual(['blocked', 'blocked']);
  harness.assertHealthy();
});

test('loads Sections through synthetic auth without real credentials', async ({ page }) => {
  const harness = await installSectionsMocks(page);
  await openSections(page);
  await expect(page.getByText('7-Synthetic', { exact: true })).toBeVisible();
  harness.assertHealthy();
});

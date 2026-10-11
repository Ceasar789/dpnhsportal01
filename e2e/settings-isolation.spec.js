import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import {
  assertLocalSettingsBaseURL,
  installSettingsMocks,
  openSettings,
  SETTINGS_BASE_URL,
} from './settings-mock-fixture.js';

test('refuses non-local targets and keeps the harness out of production auth and routing', async () => {
  expect(assertLocalSettingsBaseURL(SETTINGS_BASE_URL)).toBe(true);
  expect(() => assertLocalSettingsBaseURL('https://eduscribe.example.test')).toThrow(/refuses non-local/);
  expect(readFileSync('frontend/src/context/AuthContext.jsx', 'utf8')).not.toContain('settings-e2e');
  expect(readFileSync('frontend/src/App.jsx', 'utf8')).not.toContain('settings-e2e');
});

test('blocks unexpected remote and local backend traffic', async ({ page }) => {
  const harness = await installSettingsMocks(page);
  await page.goto('/');
  const results = await page.evaluate(async () => Promise.all([
    fetch('https://unexpected.example.test/data').then(() => 'allowed').catch(() => 'blocked'),
    fetch('/api/unexpected-write', { method: 'POST' }).then(() => 'allowed').catch(() => 'blocked'),
  ]));
  expect(results).toEqual(['blocked', 'blocked']);
  harness.assertHealthy();
});

test('loads Settings through synthetic auth without credentials', async ({ page }) => {
  const harness = await installSettingsMocks(page);
  await openSettings(page);
  await expect(page.getByLabel('Academic Year')).toHaveValue('2026-2027');
  harness.assertHealthy();
});

for (const [name, options, expected] of [
  ['Settings read', { omitSettingsReadMock: true }, 'GET school_settings'],
  ['backup read', { omitBackupReadMock: true }, 'GET backup_history'],
]) {
  test(`a missing ${name} mock fails closed`, async ({ page }) => {
    const harness = await installSettingsMocks(page, options);
    await openSettings(page);
    await expect.poll(() => harness.state.missingMocks).toContain(expected);
    expect(() => harness.assertHealthy()).toThrow(/explicit isolated mock/);
  });
}

test('a missing Settings write mock fails closed', async ({ page }) => {
  const harness = await installSettingsMocks(page, { omitSettingsWriteMock: true });
  await openSettings(page);
  await page.getByLabel('Academic Year').fill('2027-2028');
  await page.getByRole('button', { name: 'Save Changes' }).click();
  await expect(page.getByText(/could not be saved/i)).toBeVisible();
  expect(harness.state.missingMocks).toContain('PATCH school_settings');
  expect(() => harness.assertHealthy()).toThrow(/explicit isolated mock/);
});

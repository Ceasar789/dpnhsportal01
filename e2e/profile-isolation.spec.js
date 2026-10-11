import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import {
  PROFILE_E2E_BASE_URL,
  assertLocalProfileBaseURL,
  installProfileMocks,
  openSyntheticProfile,
} from './profile-mock-fixture.js';

test('refuses non-local browser targets and keeps test hooks out of production auth', async () => {
  expect(assertLocalProfileBaseURL(PROFILE_E2E_BASE_URL)).toBe(true);
  expect(() => assertLocalProfileBaseURL('https://eduscribe.example.test')).toThrow(/refuses non-local/);

  const authSource = readFileSync('frontend/src/context/AuthContext.jsx', 'utf8');
  const appSource = readFileSync('frontend/src/App.jsx', 'utf8');
  expect(authSource).not.toContain('profile-e2e');
  expect(appSource).not.toContain('profile-e2e');
});

test('blocks unexpected remote and local backend requests', async ({ page }) => {
  const harness = await installProfileMocks(page);
  await page.goto('/');

  const results = await page.evaluate(async () => Promise.all([
    fetch('https://unexpected.example.test/data').then(() => 'allowed').catch(() => 'blocked'),
    fetch('/api/unexpected-write', { method: 'POST', body: '{}' }).then(() => 'allowed').catch(() => 'blocked'),
  ]));

  expect(results).toEqual(['blocked', 'blocked']);
  expect(harness.state.blockedRequests).toContain('GET https://unexpected.example.test/data');
  expect(harness.state.blockedRequests).toContain('POST /api/unexpected-write');
  expect(harness.state.backendWrites).toBe(1);
});

test('a missing Profile mock is recorded as a fail-closed violation', async ({ page }) => {
  const harness = await installProfileMocks(page, { omitProfileMock: true });
  await page.goto('/teacher-dashboard/profile');
  await expect.poll(() => harness.state.profileReads).toBeGreaterThan(0);
  expect(() => harness.assertHealthy()).toThrow(/explicit isolated mock/);
  expect(harness.state.missingMocks).toContain('profiles GET');
});

test('a missing Storage mock is recorded as a fail-closed violation', async ({ page }) => {
  const harness = await installProfileMocks(page, { omitStorageMock: true });
  await openSyntheticProfile(page, 'teacher');
  await expect.poll(() => harness.state.storageSigns).toBeGreaterThan(0);
  expect(() => harness.assertHealthy()).toThrow(/explicit isolated mock/);
  expect(harness.state.missingMocks).toContain('profile photo signed URL');
});

test('synthetic auth needs no credential environment variables and resets per browser page', async ({ page, context }) => {
  const harness = await installProfileMocks(page, { role: 'student', profile: { photo_url: '' } });
  await openSyntheticProfile(page, 'student');
  expect(await page.getByText('student.profile@example.test').textContent()).toBe('student.profile@example.test');
  harness.assertHealthy();

  const cleanPage = await context.newPage();
  await cleanPage.goto('/', { waitUntil: 'domcontentloaded' });
  const leakedSyntheticSession = await cleanPage.evaluate(() => Object.entries(sessionStorage)
    .some(([key, value]) => key.startsWith('smartedu-auth-') && value.includes('student.profile@example.test')));
  expect(leakedSyntheticSession).toBe(false);
  await cleanPage.close();
});

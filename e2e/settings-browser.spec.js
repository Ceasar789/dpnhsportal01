import { expect, test } from '@playwright/test';
import { installSettingsMocks, openSettings } from './settings-mock-fixture.js';

const save = page => page.getByRole('button', { name: 'Save Changes' });

test('loading is explicit and persisted controls unlock only after a verified row', async ({ page }) => {
  const harness = await installSettingsMocks(page, { settingsReadDelay: 600 });
  await openSettings(page);
  await expect(page.getByText('Loading system settings…')).toBeVisible();
  await expect(page.getByLabel('Academic Year')).toBeDisabled();
  await expect(page.getByLabel('Quarter')).toBeDisabled();
  await expect(page.getByLabel('Session Timeout')).toBeDisabled();
  await expect(page.getByLabel('Academic Year')).toHaveValue('2026-2027');
  await expect(page.getByLabel('Academic Year')).toBeEnabled();
  harness.assertHealthy();
});

test('missing row fails closed and Retry can recover', async ({ page }) => {
  const harness = await installSettingsMocks(page, { settingsReadOutcomes: ['missing'] });
  await openSettings(page);
  await expect(page.getByText(/have not been provisioned/i)).toBeVisible();
  await expect(page.getByLabel('Academic Year')).toBeDisabled();
  await expect(save(page)).toHaveCount(0);
  harness.state.settingsReadOutcomes = ['success'];
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.getByLabel('Academic Year')).toHaveValue('2026-2027');
  await expect(page.getByLabel('Academic Year')).toBeEnabled();
  expect(harness.state.updateRequests).toEqual([]);
  harness.assertHealthy();
});

for (const [kind, outcomes, message] of [
  ['server', ['server'], /temporarily unavailable/i],
  ['schema', ['schema'], /database configuration is incomplete/i],
  ['authorization', ['authorization'], /do not have permission/i],
]) {
  test(`${kind} read failure is truthful and Retry recovers`, async ({ page }) => {
    const harness = await installSettingsMocks(page, { settingsReadOutcomes: outcomes });
    await openSettings(page);
    await expect(page.getByText(message)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByLabel('Academic Year')).toBeDisabled();
    harness.state.settingsReadOutcomes = ['success'];
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await expect(page.getByLabel('Academic Year')).toHaveValue('2026-2027');
    harness.assertHealthy();
  });
}

test('validation, minimal verified save, Discard, and device-local Theme work together', async ({ page }) => {
  const harness = await installSettingsMocks(page);
  await openSettings(page);

  const year = page.getByLabel('Academic Year');
  await year.fill('2026-2028');
  await expect(year).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByText(/ending year must be exactly one year/i)).toBeVisible();
  await expect(save(page)).toBeDisabled();

  await year.fill('2027-2028');
  await page.getByLabel('Quarter').selectOption('3rd Quarter');
  await page.getByLabel('Session Timeout').selectOption('1 hour');
  await expect(save(page)).toBeEnabled();
  await save(page).click();
  await expect(page.getByText('Settings saved!')).toBeVisible();
  expect(harness.state.updateRequests).toHaveLength(1);
  expect(Object.keys(harness.state.updateRequests[0]).sort()).toEqual([
    'current_semester', 'school_year', 'session_timeout', 'updated_at',
  ]);
  expect(harness.state.updateRequests[0]).toMatchObject({ school_year: '2027-2028', current_semester: 3, session_timeout: '1 hour' });

  await year.fill('2028-2029');
  await page.getByRole('button', { name: 'Discard' }).click();
  await expect(year).toHaveValue('2027-2028');

  const beforeWrites = harness.state.updateRequests.length;
  await page.getByLabel('Theme').selectOption('dark');
  await expect(page.locator('html')).toHaveClass(/dark/);
  expect(harness.state.updateRequests).toHaveLength(beforeWrites);
  await page.reload();
  await openSettings(page);
  await expect(page.getByLabel('Theme')).toHaveValue('dark');
  await expect(page.locator('html')).toHaveClass(/dark/);
  expect(harness.state.updateRequests).toHaveLength(beforeWrites);
  harness.assertHealthy();
});

test('dirty navigation and beforeunload protection remain active', async ({ page }) => {
  const harness = await installSettingsMocks(page);
  await openSettings(page);
  await page.getByLabel('Academic Year').fill('2027-2028');

  const unloadWhileDirty = await page.evaluate(() => {
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(unloadWhileDirty).toBe(true);

  const dismissedDialog = page.waitForEvent('dialog');
  const dismissedNavigation = page.getByRole('button', { name: 'Overview', exact: true }).click();
  await (await dismissedDialog).dismiss();
  await dismissedNavigation;
  await expect(page.getByText('System Settings', { exact: true }).first()).toBeVisible();

  const acceptedDialog = page.waitForEvent('dialog');
  const acceptedNavigation = page.getByRole('button', { name: 'Overview', exact: true }).click();
  await (await acceptedDialog).accept();
  await acceptedNavigation;
  await expect(page.locator('.page-title')).toHaveText('Dashboard Overview');
  harness.assertHealthy();
});

test('Settings fields keep accessible validation and visible keyboard focus', async ({ page }) => {
  const harness = await installSettingsMocks(page);
  await openSettings(page);
  const year = page.getByLabel('Academic Year');
  await year.focus();
  const focusStyle = await year.evaluate(element => {
    const style = getComputedStyle(element);
    return { outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth, boxShadow: style.boxShadow };
  });
  expect(focusStyle.outlineStyle !== 'none' || focusStyle.outlineWidth !== '0px' || focusStyle.boxShadow !== 'none').toBe(true);
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Quarter')).toBeFocused();

  await year.fill('2026-2028');
  await expect(year).toHaveAttribute('aria-invalid', 'true');
  await expect(year).toHaveAttribute('aria-describedby', /settings-academic-year-error/);
  await expect(page.getByText(/ending year must be exactly one year/i)).toBeVisible();
  harness.assertHealthy();
});

test('Auto theme follows the browser color scheme without a Settings write', async ({ page }) => {
  const harness = await installSettingsMocks(page);
  await page.emulateMedia({ colorScheme: 'dark' });
  await openSettings(page);
  await page.getByLabel('Theme').selectOption('auto');
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).not.toHaveClass(/dark/);
  expect(harness.state.updateRequests).toEqual([]);
  harness.assertHealthy();
});

for (const outcome of ['zero', 'wrong', 'multiple', 'error']) {
  test(`${outcome} update response fails closed and keeps the edit`, async ({ page }) => {
    const harness = await installSettingsMocks(page, { updateOutcomes: [outcome] });
    await openSettings(page);
    await page.getByLabel('Academic Year').fill('2027-2028');
    await save(page).click();
    await expect(page.locator('.toast.error')).toBeVisible();
    await expect(page.getByLabel('Academic Year')).toHaveValue('2027-2028');
    await expect(page.locator('.settings-savebar')).toBeVisible();
    harness.assertHealthy();
  });
}

test('a slow update accepts only one Save submission', async ({ page }) => {
  const harness = await installSettingsMocks(page, { updateDelay: 500 });
  await openSettings(page);
  await page.getByLabel('Academic Year').fill('2027-2028');
  await save(page).dblclick();
  await expect(page.getByText('Settings saved!')).toBeVisible();
  expect(harness.state.updateRequests).toHaveLength(1);
  harness.assertHealthy();
});

test('backup failure is not empty history and Retry recovers', async ({ page }) => {
  const harness = await installSettingsMocks(page, { backupReadOutcomes: ['error'] });
  await openSettings(page);
  await expect(page.getByText(/Backup history is unavailable/i)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('No backup runs have been recorded.')).toHaveCount(0);
  harness.state.backupReadOutcomes = ['success'];
  await page.getByRole('button', { name: 'Retry backup history' }).click();
  await expect(page.getByRole('list', { name: 'Backup History' })).toBeVisible();
  harness.assertHealthy();
});

test('inactive Main Admin is denied before protected Settings content renders', async ({ page }) => {
  const harness = await installSettingsMocks(page, { role: 'main_admin', status: 'inactive' });
  await page.goto('/admin-dashboard');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByText('Admin Portal', { exact: true })).toHaveCount(0);
  expect(harness.state.updateRequests).toEqual([]);
  harness.assertHealthy();
});

test('active legacy Admin route remains consistent but cannot write Main Admin Settings', async ({ page }) => {
  const harness = await installSettingsMocks(page, { role: 'admin', status: 'active' });
  await openSettings(page);
  await expect(page.getByText(/Only an active Main Admin/i)).toBeVisible();
  await expect(page.getByLabel('Academic Year')).toBeDisabled();
  expect(harness.state.updateRequests).toEqual([]);
  harness.assertHealthy();
});

test('Settings remain responsive in light and dark at the release widths', async ({ page }) => {
  const harness = await installSettingsMocks(page);
  await openSettings(page);
  for (const theme of ['light', 'dark']) {
    await page.getByLabel('Theme').selectOption(theme);
    for (const width of [360, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await expect.poll(() => page.evaluate(() => innerWidth)).toBe(width);
      const metrics = await page.evaluate(() => ({
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: innerWidth,
        clippedControls: [...document.querySelectorAll('.settings-section input, .settings-section select, .settings-savebar button')]
          .filter(element => {
            const box = element.getBoundingClientRect();
            return box.left < -1 || box.right > innerWidth + 1;
          }).length,
      }));
      expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewportWidth + 1);
      expect(metrics.clippedControls).toBe(0);
      await expect(page.getByLabel('Academic Year')).toBeVisible();
      await expect(page.getByLabel('Session Timeout')).toBeVisible();
      await expect(page.getByLabel('Theme')).toBeVisible();
    }
  }
  harness.assertHealthy();
});

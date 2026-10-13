import { expect, test } from '@playwright/test';
import {
  installProfileMocks,
  openDashboardNavigation,
  openSyntheticProfile,
} from './profile-mock-fixture.js';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

const profileAvatar = (page) => page
  .getByRole('button', { name: 'Change profile photo' })
  .locator('..')
  .locator('img');

const stagePhoto = async (page, name = 'synthetic-profile.png') => {
  await page.getByLabel('Choose profile photo').setInputFiles({ name, mimeType: 'image/png', buffer: PNG });
  await expect(page.getByText('You have unsaved Profile changes.')).toBeVisible();
  const preview = profileAvatar(page);
  await expect(preview).toHaveAttribute('src', /^blob:/);
  return preview.getAttribute('src');
};

const makeDirty = async (page, value = 'Synthetic Unsaved Name') => {
  await page.getByLabel('FULL NAME').fill(value);
  await expect(page.getByText('You have unsaved Profile changes.')).toBeVisible();
};

const beforeUnloadPrevented = (page) => page.evaluate(() => {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
});

const openLeaveDialog = async (page, role = 'teacher') => {
  const destination = await openDashboardNavigation(page, role);
  await destination.click();
  await expect(page.getByRole('dialog', { name: 'Discard unsaved changes?' })).toBeVisible();
  return destination;
};

const rgb = (value) => (value.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
const luminance = (value) => {
  const channels = rgb(value).map((part) => {
    const n = part / 255;
    return n <= 0.03928 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
};
const contrast = (left, right) => {
  const a = luminance(left);
  const b = luminance(right);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
};

test.describe('isolated Profile responsive and theme rendering', () => {
  const widths = [360, 390, 768, 1024, 1440];
  const themes = ['light', 'dark'];

  for (const theme of themes) {
    for (const width of widths) {
      test(`${theme} ${width}px`, async ({ page }, testInfo) => {
        await page.setViewportSize({ width, height: width <= 390 ? 844 : 900 });
        const harness = await installProfileMocks(page, { role: 'teacher', theme });
        await openSyntheticProfile(page, 'teacher');

        expect(await page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(theme === 'dark');
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);

        for (const label of ['FULL NAME', 'PHONE NUMBER', 'DATE OF BIRTH', 'ADDRESS', 'ABOUT ME']) {
          const box = await page.getByLabel(label).boundingBox();
          expect(box, `${label} should render`).not.toBeNull();
          expect(box.x, `${label} begins outside the viewport`).toBeGreaterThanOrEqual(0);
          expect(box.x + box.width, `${label} is clipped`).toBeLessThanOrEqual(width + 1);
        }

        await expect(page.getByRole('button', { name: 'Save Changes' })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Change profile photo' })).toBeVisible();
        const avatarBox = await profileAvatar(page).boundingBox();
        expect(Math.round(avatarBox.width)).toBe(112);
        expect(Math.round(avatarBox.height)).toBe(112);

        const colors = await page.getByLabel('FULL NAME').evaluate((input) => {
          const inputStyle = getComputedStyle(input);
          const labelStyle = getComputedStyle(document.querySelector('label[for="profile-full-name"]'));
          const cardStyle = getComputedStyle(input.closest('div[style*="padding: 32px"]'));
          return {
            inputBackground: inputStyle.backgroundColor,
            inputText: inputStyle.color,
            labelText: labelStyle.color,
            cardBackground: cardStyle.backgroundColor,
          };
        });
        expect(contrast(colors.inputText, colors.inputBackground)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(colors.labelText, colors.cardBackground)).toBeGreaterThanOrEqual(4.5);

        await makeDirty(page);
        await openLeaveDialog(page);
        const dialog = page.getByRole('dialog', { name: 'Discard unsaved changes?' });
        const dialogBox = await dialog.boundingBox();
        expect(dialogBox.x).toBeGreaterThanOrEqual(0);
        expect(dialogBox.y).toBeGreaterThanOrEqual(0);
        expect(dialogBox.x + dialogBox.width).toBeLessThanOrEqual(width + 1);
        expect(dialogBox.y + dialogBox.height).toBeLessThanOrEqual(page.viewportSize().height + 1);
        await expect(page.getByRole('button', { name: 'Keep Editing' })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Discard and Leave' })).toBeVisible();

        await page.screenshot({ path: testInfo.outputPath(`profile-${theme}-${width}.png`), fullPage: true });
        harness.assertHealthy();
      });
    }
  }
});

test.describe('isolated Profile navigation and lifecycle', () => {
  test('text edits cancel and discard without a Profile write', async ({ page }) => {
    const harness = await installProfileMocks(page, { role: 'teacher' });
    await openSyntheticProfile(page, 'teacher');
    await makeDirty(page);

    const opener = await openLeaveDialog(page);
    await expect(page.getByRole('button', { name: 'Keep Editing' })).toBeFocused();
    await page.getByRole('button', { name: 'Keep Editing' }).click();
    await expect(page.getByLabel('FULL NAME')).toHaveValue('Synthetic Unsaved Name');
    await expect(opener).toBeFocused();

    await opener.click();
    await page.getByRole('button', { name: 'Discard and Leave' }).click();
    await expect(page).toHaveURL(/\/teacher-dashboard\/?$/);
    expect(harness.state.profileWrites).toBe(0);

    await page.getByRole('button', { name: 'Toggle profile menu' }).click();
    await page.getByRole('button', { name: 'Profile Settings' }).click();
    await expect(page.getByLabel('FULL NAME')).toHaveValue(harness.profile.name);
    harness.assertHealthy();
  });

  test('a staged photo survives cancel, is released on discard, and never calls Storage delete', async ({ page }) => {
    const harness = await installProfileMocks(page, { role: 'teacher' });
    await openSyntheticProfile(page, 'teacher');
    const blobUrl = await stagePhoto(page);

    const opener = await openLeaveDialog(page);
    await page.getByRole('button', { name: 'Keep Editing' }).click();
    await expect(profileAvatar(page)).toHaveAttribute('src', blobUrl);

    await opener.click();
    await page.getByRole('button', { name: 'Discard and Leave' }).click();
    await expect(page).toHaveURL(/\/teacher-dashboard\/?$/);
    expect(harness.state.storageUploads).toBe(0);
    expect(harness.state.storageDeletes).toBe(0);
    const blobStillReadable = await page.evaluate(async (url) => {
      try { await fetch(url); return true; } catch { return false; }
    }, blobUrl);
    expect(blobStillReadable).toBe(false);
    harness.assertHealthy();
  });

  test('clean, Back, Forward, Change Password, and dirty logout navigation remain coherent', async ({ page }) => {
    const harness = await installProfileMocks(page, { role: 'teacher' });
    await page.goto('/teacher-dashboard');
    await page.getByRole('button', { name: 'Toggle profile menu' }).click();
    await page.getByRole('button', { name: 'Profile Settings' }).click();
    await expect(page.getByLabel('FULL NAME')).toBeVisible();

    await makeDirty(page, 'History Draft');
    const firstBack = page.goBack().catch(() => null);
    await expect(page.getByRole('dialog', { name: 'Discard unsaved changes?' })).toBeVisible();
    await page.getByRole('button', { name: 'Keep Editing' }).click();
    await firstBack;
    await expect(page.getByLabel('FULL NAME')).toHaveValue('History Draft');

    const confirmedBack = page.goBack().catch(() => null);
    await expect(page.getByRole('dialog', { name: 'Discard unsaved changes?' })).toBeVisible();
    await page.getByRole('button', { name: 'Discard and Leave' }).click();
    await confirmedBack;
    await expect(page).toHaveURL(/\/teacher-dashboard\/?$/);

    await page.goForward();
    await expect(page).toHaveURL(/\/teacher-dashboard\/profile/);
    await makeDirty(page, 'Password Navigation Draft');
    await page.getByRole('button', { name: 'Change Password' }).click();
    await page.getByRole('button', { name: 'Discard and Leave' }).click();
    await expect(page).toHaveURL(/\/change-password/);

    await page.goBack();
    await expect(page.getByLabel('FULL NAME')).toBeVisible();
    await makeDirty(page, 'Logout Draft');
    const logout = page.getByRole('button', { name: 'Logout' });
    await logout.click();
    await page.getByRole('button', { name: 'Discard and Leave' }).click();
    await expect(page).toHaveURL(/\/login/);
    expect(harness.state.authLogouts).toBe(1);
    harness.assertHealthy();
  });

  test('Main Admin local page changes use the same Profile guard', async ({ page }) => {
    const harness = await installProfileMocks(page, { role: 'main_admin' });
    await openSyntheticProfile(page, 'main_admin');
    await makeDirty(page, 'Admin Draft');
    await openLeaveDialog(page, 'main_admin');
    await page.getByRole('button', { name: 'Keep Editing' }).click();
    await expect(page.getByLabel('FULL NAME')).toHaveValue('Admin Draft');
    const overview = await openDashboardNavigation(page, 'main_admin');
    await overview.click();
    await page.getByRole('button', { name: 'Discard and Leave' }).click();
    await expect(page.locator('.page-title').first()).toHaveText('Dashboard Overview');
    expect(harness.state.profileWrites).toBe(0);
    harness.assertHealthy();
  });
});

test.describe('isolated Profile saves and failures', () => {
  test('text and photo saves update through mocks and clear dirty state', async ({ page }) => {
    const harness = await installProfileMocks(page, { role: 'teacher' });
    await openSyntheticProfile(page, 'teacher');

    await page.getByLabel('FULL NAME').fill('Saved Synthetic Name');
    await page.getByRole('button', { name: 'Save Changes' }).click();
    await expect(page.getByRole('status')).toContainText('Profile updated successfully');
    await expect(page.getByText('You have unsaved Profile changes.')).toHaveCount(0);
    expect(harness.state.profileWrites).toBe(1);

    await stagePhoto(page, 'replacement.png');
    await page.getByRole('button', { name: 'Save Changes' }).click();
    await expect(page.getByRole('status')).toContainText('Profile updated successfully');
    expect(harness.state.storageUploads).toBe(1);
    expect(harness.state.profileWrites).toBe(2);
    expect(harness.state.storageDeletes).toBe(1);
    harness.assertHealthy();
  });

  for (const scenario of [
    ['Profile update failure', { profileWriteMode: 'failure' }, 'Your profile could not be updated'],
    ['photo-limit rejection', { profileWriteMode: 'photo-limit' }, 'Photo change limit reached'],
    ['expired session', { profileWriteMode: 'expired' }, 'Your session expired'],
  ]) {
    test(scenario[0], async ({ page }) => {
      const harness = await installProfileMocks(page, { role: 'teacher', ...scenario[1] });
      await openSyntheticProfile(page, 'teacher');
      await stagePhoto(page);
      await page.getByRole('button', { name: 'Save Changes' }).click();
      await expect(page.getByRole('alert')).toContainText(scenario[2]);
      await expect(page.getByText('You have unsaved Profile changes.')).toBeVisible();
      await expect(page.locator('form[aria-busy="true"]')).toHaveCount(0);
      expect(await beforeUnloadPrevented(page)).toBe(true);
      await expect(page.getByText(/Profile updated successfully/)).toHaveCount(0);
      expect(harness.state.storageUploads).toBe(1);
      expect(harness.state.storageDeletes).toBe(1);
      harness.assertHealthy();
    });
  }

  test('upload failure never reports success or attempts cleanup', async ({ page }) => {
    const harness = await installProfileMocks(page, { role: 'teacher', uploadMode: 'failure' });
    await openSyntheticProfile(page, 'teacher');
    await stagePhoto(page);
    await page.getByRole('button', { name: 'Save Changes' }).click();
    await expect(page.getByRole('alert')).toContainText('could not be uploaded');
    expect(harness.state.profileWrites).toBe(0);
    expect(harness.state.storageDeletes).toBe(0);
    harness.assertHealthy();
  });

  test('rollback cleanup failure is reported without hiding the Profile failure', async ({ page }) => {
    const harness = await installProfileMocks(page, {
      role: 'teacher', profileWriteMode: 'failure', deleteMode: 'failure',
    });
    await openSyntheticProfile(page, 'teacher');
    await stagePhoto(page);
    await page.getByRole('button', { name: 'Save Changes' }).click();
    await expect(page.getByRole('alert')).toContainText('could not be removed automatically');
    expect(harness.state.storageDeletes).toBe(1);
    harness.assertHealthy();
  });

  test('old-photo cleanup failure preserves the successful replacement', async ({ page }) => {
    const harness = await installProfileMocks(page, { role: 'teacher', deleteMode: 'failure' });
    await openSyntheticProfile(page, 'teacher');
    await stagePhoto(page, 'replacement-with-cleanup-warning.png');
    await page.getByRole('button', { name: 'Save Changes' }).click();

    await expect(page.getByRole('status')).toContainText('Profile updated successfully');
    await expect(page.getByRole('status')).toContainText('previous photo could not be removed automatically');
    await expect(page.getByText('You have unsaved Profile changes.')).toHaveCount(0);
    await expect(page.locator('form[aria-busy="true"]')).toHaveCount(0);
    expect(harness.state.storageUploads).toBe(1);
    expect(harness.state.profileWrites).toBe(1);
    expect(harness.state.storageDeletes).toBe(1);
    harness.assertHealthy();
  });

  test('slow save prevents duplicate writes and unsafe navigation', async ({ page }) => {
    const harness = await installProfileMocks(page, { role: 'teacher', profileWriteMode: 'slow' });
    await openSyntheticProfile(page, 'teacher');
    await makeDirty(page, 'Slow Save');
    const save = page.getByRole('button', { name: 'Save Changes' });
    await save.click();
    await page.locator('form[aria-busy="true"]').waitFor();
    await page.locator('form').evaluate((form) => form.requestSubmit());
    await expect.poll(() => harness.state.profileWrites).toBe(1);

    const destination = await openDashboardNavigation(page);
    await destination.click();
    await expect(page.getByRole('dialog', { name: 'Profile save in progress' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Discard and Leave' })).toHaveCount(0);
    harness.releaseSlowWrite();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page).toHaveURL(/\/teacher-dashboard\/profile/);
    harness.assertHealthy();
  });
});

test.describe('isolated Profile accessibility and unload behavior', () => {
  test('keyboard focus, trapping, Escape, restoration, and visible focus work in Chrome', async ({ page }) => {
    const harness = await installProfileMocks(page, { role: 'teacher' });
    await openSyntheticProfile(page, 'teacher');

    const photoButton = page.getByRole('button', { name: 'Change profile photo' });
    await photoButton.focus();
    const fileChooser = page.waitForEvent('filechooser');
    await page.keyboard.press('Enter');
    await (await fileChooser).setFiles({ name: 'keyboard-photo.png', mimeType: 'image/png', buffer: PNG });
    await expect(page.getByText('You have unsaved Profile changes.')).toBeVisible();

    const opener = await openDashboardNavigation(page);
    await opener.click();
    await expect(page.getByRole('button', { name: 'Keep Editing' })).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(page.getByRole('button', { name: 'Discard and Leave' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Keep Editing' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(opener).toBeFocused();
    const outline = await opener.evaluate((node) => getComputedStyle(node).outlineWidth);
    expect(parseFloat(outline)).toBeGreaterThanOrEqual(2);
    harness.assertHealthy();
  });

  test('beforeunload eligibility follows clean, dirty, restored, and saving state', async ({ page }) => {
    const harness = await installProfileMocks(page, { role: 'teacher', profileWriteMode: 'slow' });
    await openSyntheticProfile(page, 'teacher');
    expect(await beforeUnloadPrevented(page)).toBe(false);
    await makeDirty(page, 'Unload Draft');
    expect(await beforeUnloadPrevented(page)).toBe(true);
    await page.getByLabel('FULL NAME').fill(harness.profile.name);
    await expect(page.getByText('You have unsaved Profile changes.')).toHaveCount(0);
    expect(await beforeUnloadPrevented(page)).toBe(false);

    await page.getByRole('button', { name: 'Save Changes' }).click();
    await page.locator('form[aria-busy="true"]').waitFor();
    expect(await beforeUnloadPrevented(page)).toBe(true);
    harness.releaseSlowWrite();
    await expect(page.locator('form[aria-busy="true"]')).toHaveCount(0);
    expect(await beforeUnloadPrevented(page)).toBe(false);
    harness.assertHealthy();
  });
});

test.describe('isolated Profile fixture states and cross-role integration', () => {
  test('loading and Profile read failure states fail closed', async ({ page }) => {
    const slowHarness = await installProfileMocks(page, { role: 'teacher', profileReadMode: 'slow' });
    await page.goto('/teacher-dashboard/profile');
    await expect(page.locator('.animate-spin')).toBeVisible();
    await expect.poll(() => typeof slowHarness.state.releaseProfileRead).toBe('function');
    slowHarness.state.releaseProfileRead();
    await expect(page.getByText('Profile Settings', { exact: true })).toBeVisible();
    slowHarness.assertHealthy();

    const failedPage = await page.context().newPage();
    const failedHarness = await installProfileMocks(failedPage, { role: 'teacher', profileReadMode: 'failure' });
    await failedPage.goto('/teacher-dashboard/profile');
    await expect(failedPage).toHaveURL(/\/login$/);
    await expect(failedPage.getByText('Profile Settings', { exact: true })).toHaveCount(0);
    failedHarness.assertHealthy();
  });

  test('partial, no-photo, and photo-limit states are truthful', async ({ page }) => {
    const harness = await installProfileMocks(page, {
      role: 'student',
      profile: {
        phone: null, date_of_birth: null, address: null, bio: null, photo_url: '',
        photo_change_count: 3, photo_change_window_start: '2026-10-09T08:00:00.000Z',
      },
    });
    await openSyntheticProfile(page, 'student');
    await expect(page.getByLabel('PHONE NUMBER')).toHaveValue('');
    await expect(page.getByLabel('DATE OF BIRTH')).toHaveValue('');
    await expect(page.getByRole('button', { name: 'Change profile photo' })).toBeDisabled();
    await expect(page.getByText(/Photo change limit reached/)).toBeVisible();
    expect(harness.state.storageSigns).toBe(0);
    harness.assertHealthy();
  });

  for (const role of ['main_admin', 'teacher', 'student', 'registrar', 'faculty']) {
    test(`${role} renders the shared Profile and logs out through its existing shell`, async ({ page }) => {
      const harness = await installProfileMocks(page, { role, profile: { photo_url: '' } });
      await openSyntheticProfile(page, role);
      await expect(page.getByText(harness.profile.email)).toBeVisible();
      await expect(page.getByRole('button', { name: 'Save Changes' })).toBeVisible();

      const logout = page.getByRole('button', { name: 'Logout' });
      if (!(await logout.isVisible())) {
        const opener = page.getByRole('button', { name: /Open navigation/ });
        if (await opener.isVisible()) await opener.click();
      }
      await page.getByRole('button', { name: 'Logout' }).click();
      if (role === 'main_admin') {
        await page.getByRole('button', { name: 'Sign Out' }).click();
      }
      await expect(page).toHaveURL(/\/login/);
      expect(harness.state.authLogouts).toBe(1);
      harness.assertHealthy();
    });
  }
});

import { expect, test } from '@playwright/test';
import { ADMIN_FINAL_SUPABASE_ORIGIN, installAdminFinalMocks, openAdminPage } from './admin-final-mock-fixture.js';

const stageTeachingAddition = async (page) => {
  await page.getByRole('button', { name: /Synthetic Teacher/ }).click();
  await page.getByLabel('Add Subject').selectOption('subject-1');
  await page.getByRole('button', { name: 'Add Subject' }).click();
  await expect(page.getByText('Unsaved changes', { exact: true })).toBeVisible();
};

const fillNewsWithImage = async (page, title = 'Rollback Notice') => {
  await page.getByRole('button', { name: '+ New Post' }).click();
  await page.getByLabel('Title').fill(title);
  await page.getByLabel('Content').fill('Synthetic rollback verification content.');
  await page.getByLabel('Attach Image').setInputFiles({
    name: 'qa-image.png',
    mimeType: 'image/png',
    buffer: Buffer.from('synthetic-image'),
  });
};

test('Overview distinguishes partial failures and retries without replacing valid totals', async ({ page }) => {
  const harness = await installAdminFinalMocks(page, { readOutcomes: { activity_logs: 'error', profiles: 'error' } });
  await openAdminPage(page, 'Overview', 'Dashboard Overview');
  await expect(page.getByText('Recent activity is unavailable.')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Role distribution is unavailable.')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Some dashboard totals are unavailable.')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Open Total Users' })).toContainText('Unavailable');
  harness.state.readOutcomes.activity_logs = 'success';
  harness.state.readOutcomes.profiles = 'success';
  await page.getByRole('button', { name: 'Retry totals' }).click();
  await page.getByRole('button', { name: 'Retry', exact: true }).first().click();
  await page.getByRole('button', { name: 'Retry', exact: true }).last().click();
  await expect(page.getByText('Some dashboard totals are unavailable.')).toHaveCount(0);
  await expect(page.getByText('No recent activity')).toBeVisible();
  await expect(page.getByText('Role distribution is unavailable.')).toHaveCount(0);
  harness.assertHealthy();
});

test('News failure, Retry, verified delete, failed confirmation, and focus recovery are truthful', async ({ page }) => {
  const harness = await installAdminFinalMocks(page, { readOutcomes: { news: 'error' }, deleteOutcomes: { news: 'zero' } });
  await openAdminPage(page, 'News Management', 'News Management');
  await expect(page.getByText(/Could not load news/i)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('No posts found')).toHaveCount(0);
  harness.state.readOutcomes.news = 'success';
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.getByText('Synthetic Notice One')).toBeVisible();

  await page.getByRole('button', { name: 'Delete Synthetic Notice One' }).click();
  await page.getByRole('button', { name: 'Yes, Delete' }).click();
  await expect(page.getByRole('dialog', { name: 'Delete Post?' })).toBeVisible();
  await expect(page.locator('.toast.error')).toBeVisible();
  expect(harness.state.activityWrites).toHaveLength(0);

  harness.state.deleteOutcomes.news = 'success';
  await page.getByRole('button', { name: 'Yes, Delete' }).click();
  await expect(page.getByRole('dialog', { name: 'Delete Post?' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Delete Synthetic Notice Two' })).toBeFocused();
  expect(harness.state.activityWrites.some(rows => rows?.[0]?.action === 'Deleted news')).toBe(true);
  harness.assertHealthy();
});

test('Memo failure, Retry, zero-row delete, and verified delete preserve selection semantics', async ({ page }) => {
  const harness = await installAdminFinalMocks(page, { readOutcomes: { memos: 'error' }, deleteOutcomes: { memos: 'zero' } });
  await openAdminPage(page, 'Memos', 'Memo Management');
  await expect(page.getByText(/Could not load memos/i)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('No memos found')).toHaveCount(0);
  harness.state.readOutcomes.memos = 'success';
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.getByText('Synthetic Memo One').first()).toBeVisible();
  await page.getByRole('button', { name: /Synthetic Memo One/ }).click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('button', { name: 'Yes, Delete' }).click();
  await expect(page.getByRole('dialog', { name: 'Delete Memo?' })).toBeVisible();
  await expect(page.getByText('Synthetic Memo One').first()).toBeVisible();
  expect(harness.state.activityWrites).toHaveLength(0);

  harness.state.deleteOutcomes.memos = 'success';
  await page.getByRole('button', { name: 'Yes, Delete' }).click();
  await expect(page.getByRole('dialog', { name: 'Delete Memo?' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Synthetic Memo Two/ })).toBeFocused();
  expect(harness.state.activityWrites.some(rows => rows?.[0]?.action === 'Deleted memo')).toBe(true);
  harness.assertHealthy();
});

test('Teaching Load guards desktop navigation, Escape, focus, and Discard', async ({ page }) => {
  const harness = await installAdminFinalMocks(page);
  await openAdminPage(page, 'Teaching Load', 'Teaching Load');
  await stageTeachingAddition(page);

  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Leave Teaching Load?' });
  await expect(dialog).toBeVisible();
  await expect(page.getByRole('button', { name: 'Stay on Teaching Load' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Leave without saving' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('button', { name: 'Stay on Teaching Load' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText('Unsaved changes', { exact: true })).toBeVisible();

  const dirtyUnloadPrevented = await page.evaluate(() => {
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(dirtyUnloadPrevented).toBe(true);

  await page.getByRole('button', { name: 'Discard' }).click();
  await expect(page.getByText('All changes saved')).toBeVisible();
  const cleanUnloadPrevented = await page.evaluate(() => {
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(cleanUnloadPrevented).toBe(false);
  expect(harness.state.teachingWrites).toHaveLength(0);
  harness.assertHealthy();
});

test('Teaching Load guards mobile drawer navigation and then leaves once', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  const harness = await installAdminFinalMocks(page);
  await openAdminPage(page, 'Teaching Load', 'Teaching Load');
  await stageTeachingAddition(page);

  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Leave Teaching Load?' });
  await expect(dialog).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open navigation' })).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#admin-sidebar')).not.toHaveClass(/mobile-open/);
  await page.getByRole('button', { name: 'Stay on Teaching Load' }).click();
  await expect(page.getByText('Unsaved changes', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open navigation' })).toBeFocused();

  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await page.getByRole('button', { name: 'Leave without saving' }).click();
  await expect(page.locator('.page-title').filter({ hasText: 'Dashboard Overview' })).toBeVisible();
  expect(harness.state.teachingWrites).toHaveLength(0);
  harness.assertHealthy();
});

test('Teaching Load guards logout and resumes the existing sign-out workflow', async ({ page }) => {
  const harness = await installAdminFinalMocks(page);
  await openAdminPage(page, 'Teaching Load', 'Teaching Load');
  await stageTeachingAddition(page);

  await page.getByRole('button', { name: 'Logout' }).click();
  await page.getByRole('button', { name: 'Stay on Teaching Load' }).click();
  await expect(page).toHaveURL(/\/admin-dashboard$/);
  await expect(page.getByText('Unsaved changes', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Logout' }).click();
  await page.getByRole('button', { name: 'Leave without saving' }).click();
  await expect(page.getByRole('dialog', { name: 'Sign Out?' })).toBeVisible();
  await page.getByRole('button', { name: 'Sign Out' }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect(harness.state.remoteRequests.filter(entry => entry.startsWith('POST /auth/v1/logout'))).toHaveLength(1);
  harness.assertHealthy();
});

test('Teaching Load route Forward is blocked and a successful Save clears the guard', async ({ page }) => {
  const harness = await installAdminFinalMocks(page);
  await page.goto('/admin-dashboard');
  await expect(page.getByText('Admin Portal', { exact: true })).toBeVisible();
  await page.evaluate(() => {
    const current = window.history.state || {};
    window.history.pushState({ ...current, idx: (current.idx ?? 0) + 1, key: 'admin-final-forward' }, '', '/change-password');
    window.history.back();
  });
  await expect(page).toHaveURL(/\/admin-dashboard$/);
  await page.getByRole('button', { name: 'Teaching Load', exact: true }).click();
  await expect(page.locator('.page-title').filter({ hasText: 'Teaching Load' })).toBeVisible();
  await stageTeachingAddition(page);

  await page.evaluate(() => window.history.forward());
  await expect(page.getByRole('dialog', { name: 'Leave Teaching Load?' })).toBeVisible();
  await page.getByRole('button', { name: 'Stay on Teaching Load' }).click();
  await expect(page).toHaveURL(/\/admin-dashboard$/);
  await page.getByRole('button', { name: 'Save Assignment' }).click();
  await expect(page.getByText('All changes saved')).toBeVisible();
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Leave Teaching Load?' })).toHaveCount(0);
  expect(harness.state.teachingWrites).toHaveLength(1);
  harness.assertHealthy();
});

test('News confirmed create rejection removes only the new image and supports a fresh retry', async ({ page }) => {
  const harness = await installAdminFinalMocks(page, { writeOutcomes: { news: 'error' } });
  await openAdminPage(page, 'News Management', 'News Management');
  await fillNewsWithImage(page);
  await page.getByRole('button', { name: 'Publish', exact: true }).click();

  await expect(page.getByRole('dialog', { name: 'New Post' })).toBeVisible();
  await expect(page.locator('.toast.error')).toContainText('newly uploaded image was removed');
  expect(harness.state.storageUploads).toHaveLength(1);
  expect(harness.state.storageRemovals).toEqual([harness.state.storageUploads[0]]);
  expect(harness.state.storageRemovals[0]).toMatch(/^af000000-0000-4000-8000-000000000001\//);
  expect(harness.state.activityWrites).toHaveLength(0);

  harness.state.writeOutcomes.news = 'success';
  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'New Post' })).toHaveCount(0);
  expect(harness.state.storageUploads).toHaveLength(2);
  expect(harness.state.storageUploads[1]).not.toBe(harness.state.storageUploads[0]);
  expect(harness.state.storageRemovals).toHaveLength(1);
  expect(harness.state.activityWrites.some(rows => rows?.[0]?.action === 'Created news')).toBe(true);
  harness.assertHealthy();
});

test('News failed replacement preserves the old image and reports cleanup failure safely', async ({ page }) => {
  const harness = await installAdminFinalMocks(page, {
    writeOutcomes: { news: 'error' },
    storageOutcomes: { remove: 'error' },
  });
  await openAdminPage(page, 'News Management', 'News Management');
  await page.getByRole('button', { name: 'Edit Synthetic Notice One' }).click();
  await page.getByLabel('Attach Image').setInputFiles({
    name: 'replacement.png', mimeType: 'image/png', buffer: Buffer.from('replacement'),
  });
  await page.getByRole('button', { name: 'Update' }).click();

  await expect(page.getByRole('dialog', { name: 'Edit Post' })).toBeVisible();
  await expect(page.locator('.toast.error')).toContainText('could not be removed automatically');
  expect(harness.state.storageUploads).toHaveLength(1);
  expect(harness.state.storageRemovals).toEqual([harness.state.storageUploads[0]]);
  expect(harness.state.storageRemovals).not.toContain(`${ADMIN_FINAL_SUPABASE_ORIGIN}/storage/v1/object/public/news-images/af000000-0000-4000-8000-000000000001/existing.png`);
  expect(harness.state.activityWrites).toHaveLength(0);
  harness.assertHealthy();
});

for (const status of ['inactive', 'suspended', 'archived', 'unexpected']) {
  test(`${status} Main Admin cannot render a protected Admin route`, async ({ page }) => {
    const harness = await installAdminFinalMocks(page, { status });
    await page.goto('/admin-dashboard');
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByText('Admin Portal', { exact: true })).toHaveCount(0);
    harness.assertHealthy();
  });
}

test('affected screens have no viewport overflow in both themes at release widths', async ({ page }) => {
  const harness = await installAdminFinalMocks(page);
  await openAdminPage(page, 'Overview', 'Dashboard Overview');
  for (const theme of ['light', 'dark']) {
    await page.evaluate(value => {
      localStorage.setItem('smartedu-theme', value);
      document.documentElement.classList.toggle('dark', value === 'dark');
    }, theme);
    for (const width of [360, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const [navigation, heading] of [['Overview', 'Dashboard Overview'], ['Teaching Load', 'Teaching Load'], ['News Management', 'News Management'], ['Memos', 'Memo Management']]) {
        const drawer = page.getByRole('button', { name: /Open navigation/ });
        if (await drawer.isVisible()) await drawer.click();
        await page.getByRole('button', { name: navigation, exact: true }).click();
        await expect(page.locator('.page-title').filter({ hasText: heading })).toBeVisible();
        const sizes = await page.evaluate(() => ({ document: document.documentElement.scrollWidth, viewport: innerWidth }));
        expect(sizes.document).toBeLessThanOrEqual(sizes.viewport + 1);
      }
    }
  }
  harness.assertHealthy();
});

test('Change Password keeps the approved background, controls, and viewport fit at release widths', async ({ page }) => {
  const harness = await installAdminFinalMocks(page);
  await page.goto('/change-password');
  await expect(page.getByRole('heading', { name: 'Change Password' })).toBeVisible();

  const rootSurface = page.locator('div.min-h-screen').first();
  await expect(rootSurface).toHaveCSS('background-image', /capstonebackground\.jpg/);
  await expect(page.getByLabel('NEW PASSWORD', { exact: true })).toBeVisible();
  await expect(page.getByLabel('CONFIRM NEW PASSWORD', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Update Password' })).toBeVisible();

  for (const theme of ['light', 'dark']) {
    await page.evaluate(value => localStorage.setItem('smartedu-theme', value), theme);
    for (const width of [360, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      const sizes = await page.evaluate(() => ({
        document: document.documentElement.scrollWidth,
        viewport: innerWidth,
      }));
      expect(sizes.document).toBeLessThanOrEqual(sizes.viewport + 1);
    }
  }

  expect(harness.state.remoteRequests.every(request => request.startsWith('GET '))).toBe(true);
  harness.assertHealthy();
});

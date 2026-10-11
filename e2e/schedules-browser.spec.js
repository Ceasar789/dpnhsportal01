import { expect, test } from '@playwright/test';
import {
  installSchedulesMocks,
  openSchedules,
} from './schedules-mock-fixture.js';

const openSection = async (page) => {
  const section = page.getByRole('button', { name: /7-Synthetic/ });
  await section.click();
  await expect(section).toHaveAttribute('aria-pressed', 'true');
  return section;
};

const openMathForm = async (page) => {
  await openSection(page);
  await page.getByRole('button', { name: 'Add Mathematics schedule' }).click();
  return page.getByRole('dialog', { name: /Mathematics.*7-Synthetic/ });
};

test('renders active and inactive schedules with truthful accessible controls', async ({ page }) => {
  const harness = await installSchedulesMocks(page);
  await openSchedules(page);
  await expect(page.getByRole('button', { name: /^Grade 7/ })).toHaveAttribute('aria-pressed', 'true');
  await openSection(page);
  await expect(page.getByText('Mathematics', { exact: true })).toBeVisible();
  await expect(page.getByText('Legacy Arts', { exact: true })).toBeVisible();
  await expect(page.getByText(/Inactive.*existing periods only/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add Mathematics schedule' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add Legacy Arts schedule' })).toHaveCount(0);
  await expect(page.getByText('1/1 active subjects · 1 legacy period')).toBeVisible();
  harness.assertHealthy();
});

test('creates one valid period, blocks invalid time, and preserves the approved payload', async ({ page }) => {
  const harness = await installSchedulesMocks(page, { createDelay: 350 });
  await openSchedules(page);
  const dialog = await openMathForm(page);
  await dialog.getByLabel('Teacher').selectOption({ label: 'Synthetic Math Teacher' });
  await dialog.getByLabel('Start').fill('10:00');
  await dialog.getByLabel('End').fill('09:00');
  await dialog.getByRole('button', { name: 'Create' }).click();
  await expect(dialog.getByText(/End time must be after/)).toBeVisible();
  await expect(dialog.getByLabel('Start')).toHaveAttribute('aria-invalid', 'true');
  expect(harness.state.scheduleWrites).toHaveLength(0);

  await dialog.getByLabel('End').fill('11:00');
  await dialog.getByLabel('Room').fill('Room 301');
  await dialog.getByRole('button', { name: 'Create' }).dblclick();
  await expect(page.getByText('Schedule created')).toBeVisible();
  expect(harness.state.scheduleWrites).toHaveLength(1);
  expect(harness.state.scheduleWrites[0][0]).toMatchObject({
    day_of_week: 'Monday', start_time: '10:00', end_time: '11:00', room_number: 'Room 301', school_year: '2026-2027',
  });
  harness.assertHealthy();
});

test('shows safe create errors and keeps the form available', async ({ page }) => {
  const harness = await installSchedulesMocks(page, { createFailure: true });
  await openSchedules(page);
  const dialog = await openMathForm(page);
  await dialog.getByLabel('Teacher').selectOption({ label: 'Synthetic Math Teacher' });
  await dialog.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByText(/Could not create the schedule/)).toBeVisible();
  await expect(dialog).toBeVisible();
  await expect(page.getByText(/synthetic private create failure/)).toHaveCount(0);
  harness.assertHealthy();
});

test('keeps failed delete confirmation open, shows busy state, retries, and restores stable focus', async ({ page }) => {
  const harness = await installSchedulesMocks(page, { deleteOutcomes: ['zero', 'success'], deleteDelay: 350 });
  await openSchedules(page);
  await openSection(page);
  await page.getByRole('button', { name: /Delete Synthetic Math Teacher's Monday schedule/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Delete Schedule?' });
  const confirm = dialog.getByRole('button', { name: 'Yes, Delete' });
  await confirm.click();
  await expect(dialog.getByRole('button', { name: 'Deleting…' })).toHaveAttribute('aria-busy', 'true');
  await expect(page.getByText(/deletion could not be confirmed/)).toBeVisible();
  await expect(dialog).toBeVisible();

  await dialog.getByRole('button', { name: 'Yes, Delete' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('button', { name: /Delete Synthetic Math Teacher's Monday schedule/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add Mathematics schedule' })).toBeFocused();
  expect(harness.state.deleteRequests).toHaveLength(2);
  harness.assertHealthy();
});

test('keeps a Supabase delete error private and leaves confirmation retryable', async ({ page }) => {
  const harness = await installSchedulesMocks(page, { deleteOutcomes: ['error'] });
  await openSchedules(page);
  await openSection(page);
  await page.getByRole('button', { name: /Delete Synthetic Math Teacher's Monday schedule/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Delete Schedule?' });
  await dialog.getByRole('button', { name: 'Yes, Delete' }).click();
  await expect(page.getByText('Could not delete the schedule. Please try again.')).toBeVisible();
  await expect(page.getByText(/synthetic private delete failure/)).toHaveCount(0);
  await expect(dialog).toBeVisible();
  harness.assertHealthy();
});

test('distinguishes subject, teacher, and teaching-load failures from genuine empty eligibility', async ({ page }) => {
  let harness = await installSchedulesMocks(page, { subjectsFailure: true });
  await openSchedules(page);
  await openSection(page);
  await expect(page.getByText(/Could not load subjects/)).toBeVisible();
  await expect(page.getByText(/No active subjects yet/)).toHaveCount(0);
  harness.assertHealthy();

  await page.unroute('**/*');
  harness = await installSchedulesMocks(page, { teachersFailure: true });
  await page.reload();
  await openSchedules(page);
  let dialog = await openMathForm(page);
  await expect(dialog.getByText(/Teacher eligibility could not be loaded/)).toBeVisible();
  await expect(dialog.getByText(/Assign someone/)).toHaveCount(0);
  await page.keyboard.press('Escape');
  harness.assertHealthy();

  await page.unroute('**/*');
  harness = await installSchedulesMocks(page, { teachingLoadFailure: true });
  await page.reload();
  await openSchedules(page);
  dialog = await openMathForm(page);
  await expect(dialog.getByText(/Teacher eligibility could not be loaded/)).toBeVisible();
  await expect(dialog.getByText(/Assign someone/)).toHaveCount(0);
  await page.keyboard.press('Escape');
  harness.assertHealthy();

  await page.unroute('**/*');
  harness = await installSchedulesMocks(page, { teachingLoad: [] });
  await page.reload();
  await openSchedules(page);
  dialog = await openMathForm(page);
  await expect(dialog.getByText(/Assign someone this subject/)).toBeVisible();
  harness.assertHealthy();
});

for (const theme of ['light', 'dark']) {
  test(`${theme} theme remains usable across the required responsive matrix`, async ({ page }) => {
    const harness = await installSchedulesMocks(page, { theme });
    for (const width of [360, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.reload();
      await openSchedules(page);
      await openSection(page);
      await expect(page.getByText('Legacy Room', { exact: false })).toBeVisible();
      await expect(page.getByRole('button', { name: /Delete Synthetic Math Teacher's Monday schedule/ })).toBeVisible();
      const metrics = await page.evaluate(() => ({ body: document.body.scrollWidth, viewport: innerWidth }));
      expect(metrics.body).toBeLessThanOrEqual(metrics.viewport);

      const dialog = await page.getByRole('button', { name: 'Add Mathematics schedule' }).click()
        .then(() => page.getByRole('dialog', { name: /Mathematics.*7-Synthetic/ }));
      await expect(dialog.getByLabel('Teacher')).toBeVisible();
      await expect(dialog.getByLabel('Room')).toBeVisible();
      await page.keyboard.press('Escape');
    }
    harness.assertHealthy();
  });
}

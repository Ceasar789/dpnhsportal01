import { expect, test } from '@playwright/test';
import { installSectionsMocks, openSections, syntheticSection } from './sections-mock-fixture.js';

const openCreate = async (page) => {
  await page.getByRole('button', { name: /Add Section/ }).click();
  return page.getByRole('dialog', { name: 'Add Section' });
};

const fillRequiredCreateFields = async (dialog, capacity) => {
  await dialog.getByLabel(/Section Name/).fill('8-Synthetic');
  await dialog.getByLabel(/Grade Level/).selectOption('Grade 8');
  await dialog.getByLabel(/Capacity/).fill(String(capacity));
};

test('create validation rejects blank and out-of-range capacities without a write', async ({ page }) => {
  const harness = await installSectionsMocks(page);
  await openSections(page);
  const dialog = await openCreate(page);
  await dialog.getByLabel(/Section Name/).fill('8-Synthetic');
  await dialog.getByLabel(/Grade Level/).selectOption('Grade 8');

  for (const [value, message] of [['', 'Capacity is required.'], ['-1', /whole number from 1 to 60/], ['1.5', /whole number from 1 to 60/], ['61', /whole number from 1 to 60/]]) {
    await dialog.getByLabel(/Capacity/).fill(value);
    await dialog.getByRole('button', { name: 'Create' }).click();
    await expect(dialog.getByText(message)).toBeVisible();
    expect(harness.state.sectionWrites).toHaveLength(0);
  }
  harness.assertHealthy();
});

for (const capacity of [1, 60]) {
  test(`create stores exact boundary capacity ${capacity} and the calculated school year`, async ({ page }) => {
    const harness = await installSectionsMocks(page);
    await openSections(page);
    const dialog = await openCreate(page);
    await fillRequiredCreateFields(dialog, capacity);
    await dialog.getByLabel('Adviser').selectOption({ label: 'Synthetic Active Teacher' });
    await dialog.getByRole('button', { name: 'Create' }).click();
    await expect(page.getByText('Section created')).toBeVisible();
    expect(harness.state.sectionWrites).toHaveLength(1);
    expect(harness.state.sectionWrites[0].payload[0]).toMatchObject({
      name: '8-Synthetic', grade_level: 'Grade 8', capacity, school_year: '2026-2027',
    });
    harness.assertHealthy();
  });
}

test('new assignments expose only active advisers; an existing inactive adviser stays visible and preserved', async ({ page }) => {
  const harness = await installSectionsMocks(page);
  await openSections(page);
  let dialog = await openCreate(page);
  const createAdviser = dialog.getByLabel('Adviser');
  await expect(createAdviser.getByRole('option', { name: 'Synthetic Active Teacher' })).toHaveCount(1);
  await expect(createAdviser.getByRole('option', { name: /Synthetic Inactive Teacher/ })).toHaveCount(0);
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Edit 7-Synthetic' }).click();
  dialog = page.getByRole('dialog', { name: 'Edit Section' });
  const legacy = dialog.getByLabel('Adviser').getByRole('option', { name: /Synthetic Inactive Teacher.*existing adviser/ });
  await expect(legacy).toBeAttached();
  await expect(legacy).toBeDisabled();
  await expect(dialog.getByText(/existing assignment will be preserved/i)).toBeVisible();
  await dialog.getByLabel(/Section Name/).fill('7-Synthetic Updated');
  await dialog.getByRole('button', { name: 'Update' }).click();
  await expect(page.getByText('Section updated')).toBeVisible();
  expect(harness.state.sectionWrites[0].payload).toMatchObject({ adviser_id: harness.state.teachers[1].id, capacity: 40 });
  harness.assertHealthy();
});

test('changed capacity fails closed below enrollment', async ({ page }) => {
  const harness = await installSectionsMocks(page, { enrollmentCount: 35 });
  await openSections(page);
  await page.getByRole('button', { name: 'Edit 7-Synthetic' }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit Section' });
  await dialog.getByLabel(/Capacity/).fill('30');
  await dialog.getByRole('button', { name: 'Update' }).click();
  await expect(dialog.getByText(/current enrollment of 35/)).toBeVisible();
  expect(harness.state.sectionWrites).toHaveLength(0);
  harness.assertHealthy();
});

test('changed capacity fails closed when the count is unavailable', async ({ page }) => {
  const failed = await installSectionsMocks(page, { countFailure: true });
  await openSections(page);
  await page.getByRole('button', { name: 'Edit 7-Synthetic' }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit Section' });
  await dialog.getByLabel(/Capacity/).fill('35');
  await dialog.getByRole('button', { name: 'Update' }).click();
  await expect(dialog.getByText(/Could not verify current enrollment/)).toBeVisible();
  expect(failed.state.sectionWrites).toHaveLength(0);
  failed.assertHealthy();
});

test('duplicate create remains open and reports the per-year conflict', async ({ page }) => {
  const harness = await installSectionsMocks(page, { sectionWriteError: { code: '23505', message: 'synthetic unique violation' } });
  await openSections(page);
  const dialog = await openCreate(page);
  await fillRequiredCreateFields(dialog, 40);
  await dialog.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByText(/already exists for 2026-2027/)).toBeVisible();
  await expect(dialog).toBeVisible();
  harness.assertHealthy();
});

test('full and over-capacity sections block enrollment before student writes', async ({ page }) => {
  for (const [capacity, count, label] of [[1, 1, 'full'], [1, 2, 'over capacity']]) {
    const memberships = Array.from({ length: count }, (_, index) => ({ id: `membership-${index}`, student_id: `existing-${index}` }));
    const harness = await installSectionsMocks(page, { sections: [syntheticSection({ capacity })], memberships, enrollmentCount: count });
    await page.reload();
    await openSections(page);
    await page.getByRole('button', { name: 'Class list for 7-Synthetic' }).click();
    const dialog = page.getByRole('dialog', { name: /7-Synthetic.*Class List/ });
    await expect(dialog.getByRole('status')).toContainText(label);
    await dialog.getByLabel('Add a student').selectOption({ index: 1 });
    await dialog.getByRole('button', { name: 'Add' }).click();
    await expect(page.locator('.toast.error')).toContainText(`section is ${label}`);
    expect(harness.state.studentUpserts).toHaveLength(0);
    expect(harness.state.membershipWrites).toHaveLength(0);
    harness.assertHealthy();
    await page.keyboard.press('Escape');
  }
});

test('one remaining slot permits exactly one synthetic enrollment and refreshes the class list', async ({ page }) => {
  const harness = await installSectionsMocks(page, { sections: [syntheticSection({ capacity: 40 })], enrollmentCount: 39 });
  await openSections(page);
  await page.getByRole('button', { name: 'Class list for 7-Synthetic' }).click();
  const dialog = page.getByRole('dialog', { name: /7-Synthetic.*Class List/ });
  await dialog.getByLabel('Add a student').selectOption({ index: 1 });
  await dialog.getByRole('button', { name: 'Add' }).click();
  await expect.poll(() => harness.state.studentUpserts.length).toBe(1);
  await expect.poll(() => harness.state.membershipWrites.length).toBe(1);
  harness.assertHealthy();
});

test('count failure blocks enrollment and removal remains available for a full section', async ({ page }) => {
  const membership = { id: 'membership-one', student_id: '20000000-0000-4000-8000-000000000004' };
  const harness = await installSectionsMocks(page, { memberships: [membership], enrollmentCount: 1, countFailure: true, sections: [syntheticSection({ capacity: 1 })] });
  await openSections(page);
  await page.getByRole('button', { name: 'Class list for 7-Synthetic' }).click();
  const dialog = page.getByRole('dialog', { name: /7-Synthetic.*Class List/ });
  await dialog.getByLabel('Add a student').selectOption({ index: 1 });
  await dialog.getByRole('button', { name: 'Add' }).click();
  await expect(page.getByText(/Could not verify current enrollment/)).toBeVisible();
  expect(harness.state.studentUpserts).toHaveLength(0);
  await dialog.getByRole('button', { name: /Remove Synthetic Student/ }).click();
  await expect.poll(() => harness.state.membershipDeletes.length).toBe(1);
  harness.assertHealthy();
});

test('create dialog remains usable across the required responsive widths', async ({ page }) => {
  const harness = await installSectionsMocks(page);
  for (const width of [360, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.reload();
    await openSections(page);
    const dialog = await openCreate(page);
    await expect(dialog.getByLabel(/Capacity/)).toBeVisible();
    await expect(dialog.getByLabel('Adviser')).toBeVisible();
    const metrics = await page.evaluate(() => ({ body: document.body.scrollWidth, viewport: innerWidth }));
    expect(metrics.body).toBeLessThanOrEqual(metrics.viewport);
    await page.keyboard.press('Escape');
  }
  harness.assertHealthy();
});

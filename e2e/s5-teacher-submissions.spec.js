// S5: polish of the teacher's file/link review, in a real browser against the
// same isolated mocks as teacher-submissions.spec.js (picked up by its config:
// npx playwright test --config playwright.teacher-submissions.config.js).
// WRITTEN, NOT RUN in the autorun (e2e is not run there).
import { test, expect } from '@playwright/test';
import { installProfileMocks } from './profile-mock-fixture.js';
import { installTeacherSubmissionMocks } from './teacher-submissions-mock-fixture.js';

const setup = async (page, { width = 1280, height = 800, ...options } = {}) => {
  await page.setViewportSize({ width, height });
  const harness = await installProfileMocks(page, { role: 'teacher', theme: 'light', worksheetScenario: true });
  const review = await installTeacherSubmissionMocks(page, options);
  await page.goto('/teacher-dashboard/worksheets');
  await expect(page.getByRole('heading', { name: 'Water cycle poster' })).toBeVisible();
  const card = page.locator('.rounded-xl', { has: page.getByRole('heading', { name: 'Water cycle poster' }) });
  await card.getByRole('button', { name: 'More actions for Water cycle poster' }).click();
  await page.getByRole('menuitem', { name: /^Check submissions/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Submissions — Water cycle poster' });
  await expect(dialog.getByRole('list', { name: 'Students' })).toBeVisible();
  return { harness, review, dialog };
};
const firstTurnedIn = dialog => dialog.getByRole('list', { name: 'Students' }).getByRole('button', { name: /Turned in|Late/ }).first();

test('Return to student: focus stays in the detail (on the student heading) once the button is gone', async ({ page }) => {
  const { harness, dialog } = await setup(page);
  await firstTurnedIn(dialog).click();
  await dialog.getByLabel(/^Score/).fill('8');
  await dialog.getByRole('button', { name: 'Return to student' }).click();
  await expect(dialog.getByRole('status')).toContainText('Returned to');
  await expect(dialog.getByRole('button', { name: 'Return to student' })).toHaveCount(0);
  await expect(dialog.locator('h3[tabindex="-1"]')).toBeFocused();
  harness.assertHealthy();
});

test('Esc closes the review dialog when nothing is unsaved', async ({ page }) => {
  const { dialog } = await setup(page);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

for (const [width, height] of [[320, 640], [390, 844], [844, 390]]) {
  test(`phone ${width}x${height}: no sideways scroll, 44px buttons, 16px inputs`, async ({ page }) => {
    const { dialog } = await setup(page, { width, height });
    await firstTurnedIn(dialog).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    for (const button of await dialog.getByRole('button').all()) {
      if (!(await button.isVisible())) continue;
      const box = await button.boundingBox();
      expect(box.height, await button.textContent()).toBeGreaterThanOrEqual(44);
    }
    expect(await dialog.getByLabel(/^Score/).evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
  });
}

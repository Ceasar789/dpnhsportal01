// S5: polish of the student's "Your work" panel, in a real browser against the
// same isolated mocks as student-submissions.spec.js (picked up by its config:
// npx playwright test --config playwright.submissions.config.js).
// WRITTEN, NOT RUN in the autorun (e2e is not run there).
import { test, expect } from '@playwright/test';
import { installProfileMocks } from './profile-mock-fixture.js';
import { installSubmissionMocks } from './task-submissions-mock-fixture.js';

const setup = async (page, { width = 1280, height = 800, ...options } = {}) => {
  await page.setViewportSize({ width, height });
  const harness = await installProfileMocks(page, { role: 'student', theme: options.theme || 'light' });
  const submissions = await installSubmissionMocks(page, options);
  await page.goto('/student-dashboard/tasks?view=all');
  await expect(page.getByText('Water cycle poster')).toBeVisible();
  await page.locator('.rounded-xl', { hasText: 'Water cycle poster' }).getByRole('button', { name: 'Open' }).click();
  return { harness, submissions, panel: page.getByRole('region', { name: 'Your work' }) };
};

test('after Turn in, focus moves to the "Your work" heading (the pressed button is gone)', async ({ page }) => {
  const { harness, panel } = await setup(page);
  await panel.getByRole('radio', { name: 'Link', exact: true }).check();
  await panel.getByLabel('Link address').fill('https://example.org/poster');
  await panel.getByRole('button', { name: 'Add link' }).click();
  await expect(panel.getByRole('heading', { name: 'Your work' })).toBeFocused();
  await panel.getByRole('button', { name: 'Turn in' }).click();
  const dialog = page.getByRole('dialog', { name: 'Turn in your work?' });
  await dialog.getByRole('button', { name: 'Turn in' }).click();
  await expect(panel.getByText('Turned in', { exact: true })).toBeVisible();
  await expect(panel.getByRole('heading', { name: 'Your work' })).toBeFocused();
  harness.assertHealthy();
});

test('Esc closes the confirm dialog and nothing is sent', async ({ page }) => {
  const { submissions, panel } = await setup(page);
  await panel.getByRole('radio', { name: 'Link', exact: true }).check();
  await panel.getByLabel('Link address').fill('https://example.org/poster');
  await panel.getByRole('button', { name: 'Add link' }).click();
  const writesBefore = submissions.state.writes.length;
  await panel.getByRole('button', { name: 'Turn in' }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Turn in your work?' })).toHaveCount(0);
  expect(submissions.state.writes.length).toBe(writesBefore);
});

for (const [width, height] of [[320, 640], [390, 844], [844, 390]]) {
  test(`phone ${width}x${height}: no sideways scroll, 44px buttons, 16px inputs`, async ({ page }) => {
    const { panel } = await setup(page, { width, height });
    await expect(panel).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    for (const button of await panel.getByRole('button').all()) {
      if (!(await button.isVisible())) continue;
      const box = await button.boundingBox();
      expect(box.height, await button.textContent()).toBeGreaterThanOrEqual(44);
    }
    await panel.getByRole('radio', { name: 'Link', exact: true }).check();
    expect(await panel.getByLabel('Link address').evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
  });
}

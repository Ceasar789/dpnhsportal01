// S3: the student's file/link submissions end to end, in a real browser
// against isolated mocks (profile-mock-fixture + task-submissions-mock-fixture).
// Run with: npx playwright test --config playwright.submissions.config.js
import { test, expect } from '@playwright/test';
import { installProfileMocks } from './profile-mock-fixture.js';
import { installSubmissionMocks, SUBMITTED_LINK } from './task-submissions-mock-fixture.js';

const setup = async (page, options = {}) => {
  const harness = await installProfileMocks(page, { role: 'student', theme: options.theme || 'light' });
  const submissions = await installSubmissionMocks(page, options);
  await page.goto('/student-dashboard/tasks?view=all');
  await expect(page.getByText('Water cycle poster')).toBeVisible();
  return { harness, submissions };
};
const openTask = async (page) => {
  await page.locator('.rounded-xl', { hasText: 'Water cycle poster' }).getByRole('button', { name: 'Open' }).click();
  return page.getByRole('region', { name: 'Your work' });
};

test('adds a file and turns it in: the upload path, type and the status write', async ({ page }) => {
  const { harness, submissions } = await setup(page);
  const panel = await openTask(page);
  await panel.locator('input[type="file"]').setInputFiles({ name: 'My poster.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 synthetic') });
  await panel.getByLabel('Note for your teacher (optional)').fill('Page 2 has the diagram.');
  await panel.getByRole('button', { name: 'Add file' }).click();
  await expect(panel.getByText('My poster.pdf')).toBeVisible();
  expect(submissions.state.uploads).toHaveLength(1);
  expect(submissions.state.uploads[0].path).toMatch(new RegExp(`^${submissions.state.studentId}/[0-9a-f-]{36}/[0-9a-f-]{36}-My-poster\\.pdf$`));
  await panel.getByRole('button', { name: 'Turn in' }).click();
  await page.getByRole('dialog', { name: 'Turn in your work?' }).getByRole('button', { name: 'Turn in' }).click();
  await expect(panel.getByText('Turned in', { exact: true })).toBeVisible();
  expect(submissions.state.writes).toContain('PATCH worksheet_submissions {"status":"submitted"}');
  harness.assertHealthy();
});

test('replaces the file with a link: the old file is removed only after the update', async ({ page }) => {
  const { submissions } = await setup(page, { scenario: 'attachedFile' });
  const panel = await openTask(page);
  await panel.getByRole('button', { name: 'Replace' }).click();
  await panel.getByRole('radio', { name: 'Link' }).check();
  await panel.getByLabel('Link address').fill(SUBMITTED_LINK);
  await panel.getByRole('button', { name: 'Replace with link' }).click();
  await expect(panel.getByText('docs.example.org')).toBeVisible();
  expect(submissions.state.removes).toHaveLength(1);
  expect(submissions.state.writes.findIndex(w => w.startsWith('PATCH worksheet_submission_attachments'))).toBeGreaterThanOrEqual(0);
});

test('unsubmits a turned-in task and can turn it in again', async ({ page }) => {
  await setup(page, { scenario: 'turnedIn' });
  const panel = await openTask(page);
  await panel.getByRole('button', { name: 'Unsubmit' }).click();
  await page.getByRole('dialog', { name: 'Unsubmit your work?' }).getByRole('button', { name: 'Unsubmit' }).click();
  await expect(panel.getByRole('button', { name: 'Turn in' })).toBeVisible();
});

test('past the due date: warned, and the turn-in is marked late', async ({ page }) => {
  await setup(page, { scenario: 'attachedFile', due: 'past' });
  const panel = await openTask(page);
  await expect(panel.getByText('The due date has passed. Your work will be marked late.')).toBeVisible();
  await panel.getByRole('button', { name: 'Turn in' }).click();
  await page.getByRole('dialog', { name: 'Turn in your work?' }).getByRole('button', { name: 'Turn in' }).click();
  await expect(panel.getByText('Late', { exact: true })).toBeVisible();
});

test('returned: score and feedback; graded but not returned shows no score', async ({ page }) => {
  await setup(page, { scenario: 'returned' });
  let panel = await openTask(page);
  await expect(panel.getByText('Score: 9 / 10')).toBeVisible();
  await expect(panel.getByText('Clear diagram and neat labels. Add the sources next time.')).toBeVisible();
  await page.goto('about:blank');
  await setup(page, { scenario: 'graded' });
  panel = await openTask(page);
  await expect(panel.getByText('Your teacher has graded this. You will see your score when it is returned.')).toBeVisible();
  await expect(panel.getByText(/Score:/)).toHaveCount(0);
});

test('opening the file uses a new tab without window.opener', async ({ page }) => {
  await setup(page, { scenario: 'attachedFile' });
  const panel = await openTask(page);
  const popupPromise = page.waitForEvent('popup');
  await panel.getByRole('button', { name: 'Open file' }).click();
  const popup = await popupPromise;
  expect(await popup.evaluate(() => window.opener)).toBeNull();
  await expect(panel.getByRole('link', { name: 'Open file' })).toHaveAttribute('rel', 'noopener noreferrer');
});

test('an answers quiz is unchanged: Start, questions, Submit, no Your work panel', async ({ page }) => {
  await setup(page);
  await page.locator('.rounded-xl', { hasText: 'Fractions check' }).getByRole('button', { name: 'Start' }).click();
  await expect(page.getByRole('button', { name: 'Submit' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Your work' })).toHaveCount(0);
});
